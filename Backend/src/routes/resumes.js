const express = require("express");
const { z } = require("zod");
const mongoose = require("mongoose");
const { GoogleGenAI, Type } = require("@google/genai");

const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");

const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { uploadPdf } = require("../middleware/upload");
const { analyzeLimiter } = require("../middleware/rateLimit");

const env = require("../config/env");

const Resume = require("../models/Resume");
const ResumeVersion = require("../models/ResumeVersion");
const Analysis = require("../models/Analysis");

const { analyzeResume } = require("../services/geminiService");

const { diffText, summarize } = require("../services/diffService");

const {
    extractText,
    generateResumePdf
} = require("../services/pdfService");

const {
    parseResume: parseStructured,
} = require("../services/structuredParser");

const router = express.Router();

router.use(requireAuth);


// =========================================================
// GEMINI CLIENT
// =========================================================

const ai = env.geminiApiKey
    ? new GoogleGenAI({
        apiKey: env.geminiApiKey,
    })
    : null;


// =========================================================
// OBJECT ID VALIDATION
// =========================================================

const objectIdSchema = z
    .string()
    .refine(
        (v) => mongoose.isValidObjectId(v),
        {
            message: "Invalid id",
        }
    );

const idParam = z.object({
    id: objectIdSchema,
});


// =========================================================
// LOAD USER'S RESUME
// =========================================================

async function loadOwnedResume(req) {

    const resume = await Resume.findOne({
        _id: req.params.id,
        userId: req.user._id,
    });

    if (!resume) {
        throw ApiError.notFound(
            "Resume not found"
        );
    }

    return resume;
}


// =========================================================
// LOAD RESUME VERSION
// =========================================================

async function loadVersion(
    resumeId,
    versionId
) {

    console.log(
        "\n========== VERSION DEBUG =========="
    );

    console.log(
        "Resume ID:",
        resumeId
    );

    console.log(
        "Version ID:",
        versionId
    );

    const version =
        await ResumeVersion.findById(
            versionId
        );

    console.log(
        "Version found:",
        version
    );

    if (!version) {
        throw ApiError.notFound(
            "Version does not exist"
        );
    }

    console.log(
        "Version resumeId:",
        version.resumeId
    );

    console.log(
        "Expected resumeId:",
        resumeId
    );

    if (
        version.resumeId.toString() !==
        resumeId.toString()
    ) {
        throw ApiError.notFound(
            "Version belongs to a different resume"
        );
    }

    return version;
}


// =========================================================
// UPLOAD NEW RESUME
// =========================================================

router.post(
    "/",
    uploadPdf("file"),

    asyncHandler(
        async (req, res) => {

            const {
                text,
                meta,
            } = await extractText(
                req.file.buffer
            );

            const parsedSections =
                await parseStructured(text);

            const title =
                (req.body.title || "").trim() ||
                req.file.originalname.replace(
                    /\.pdf$/i,
                    ""
                ) ||
                "Untitled Resume";

            const resume =
                await Resume.create({

                    userId:
                        req.user._id,

                    title,

                    latestVersionNumber:
                        1,
                });

            const version =
                await ResumeVersion.create({

                    resumeId:
                        resume._id,

                    versionNumber:
                        1,

                    label:
                        "V1",

                    rawText:
                        text,

                    parsedSections,

                    sourceType:
                        "upload",

                    parentVersionId:
                        null,
                });

            resume.currentVersionId =
                version._id;

            await resume.save();

            res.status(201).json({
                resume,
                version,
                meta,
            });
        }
    )
);


// =========================================================
// DOWNLOAD RESUME VERSION AS PDF
// =========================================================

router.get(
    "/:id/versions/:versionId/pdf",

    validate(
        z.object({
            id: objectIdSchema,
            versionId: objectIdSchema,
        }),
        "params"
    ),

    asyncHandler(
        async (req, res) => {

            const resume =
                await loadOwnedResume(req);

            const version =
                await loadVersion(
                    resume._id,
                    req.params.versionId
                );

            const pdfBuffer =
                await generateResumePdf(
                    version.parsedSections
                );

            const safeFilename =
                (
                    version.label ||
                    "AI-Rewritten-Resume"
                )
                    .replace(
                        /[^a-z0-9-_]+/gi,
                        "-"
                    )
                    .replace(
                        /-+/g,
                        "-"
                    )
                    .replace(
                        /^-|-$/g,
                        ""
                    );

            res.setHeader(
                "Content-Type",
                "application/pdf"
            );

            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${safeFilename || "Resume"}.pdf"`
            );

            res.setHeader(
                "Content-Length",
                pdfBuffer.length
            );

            res.end(pdfBuffer);
        }
    )
);


// =========================================================
// GET ALL USER RESUMES
// =========================================================

router.get(
    "/",

    asyncHandler(
        async (req, res) => {

            // -------------------------------------------------
            // 1. GET ALL USER RESUMES
            // -------------------------------------------------

            const resumes =
                await Resume.find({
                    userId:
                        req.user._id,
                })
                    .sort({
                        updatedAt: -1,
                    })
                    .lean();


            // -------------------------------------------------
            // 2. GET ANALYSIS FOR EACH RESUME
            // -------------------------------------------------

            const resumesWithAnalysis =
                await Promise.all(

                    resumes.map(
                        async (resume) => {

                            let analysis = null;


                            // -------------------------------------------------
                            // FIRST: Try the current version
                            // -------------------------------------------------

                            if (
                                resume.currentVersionId
                            ) {

                                analysis =
                                    await Analysis.findOne({

                                        resumeId:
                                            resume._id,

                                        versionId:
                                            resume.currentVersionId,

                                    })
                                        .sort({
                                            createdAt: -1,
                                        })
                                        .lean();
                            }


                            // -------------------------------------------------
                            // SECOND: If current version has no analysis,
                            // find the latest analysis belonging to this resume
                            // -------------------------------------------------

                            if (!analysis) {

                                analysis =
                                    await Analysis.findOne({

                                        resumeId:
                                            resume._id,

                                    })
                                        .sort({
                                            createdAt: -1,
                                        })
                                        .lean();
                            }


                            // -------------------------------------------------
                            // THIRD: Return resume + analysis
                            // -------------------------------------------------

                            return {

                                ...resume,

                                analysis:
                                    analysis || null,

                            };
                        }
                    )
                );


            // -------------------------------------------------
            // DEBUG
            // -------------------------------------------------

            console.log(
                "\n========== DASHBOARD RESUME SCORES =========="
            );

            resumesWithAnalysis.forEach(
                (resume) => {

                    console.log(
                        "Resume:",
                        resume.title
                    );

                    console.log(
                        "Current Version:",
                        resume.currentVersionId
                    );

                    console.log(
                        "ATS Score:",
                        resume.analysis?.atsScore ?? "NO SCORE"
                    );

                    console.log(
                        "Analysis Version:",
                        resume.analysis?.versionId ?? "NONE"
                    );

                    console.log(
                        "--------------------------------------------"
                    );
                }
            );


            // -------------------------------------------------
            // 4. SEND RESPONSE
            // -------------------------------------------------

            res.json({

                resumes:
                    resumesWithAnalysis,

            });
        }
    )
);

// =========================================================
// GET SINGLE RESUME
// =========================================================

router.get(
    "/:id",

    validate(
        idParam,
        "params"
    ),

    asyncHandler(
        async (req, res) => {

            const resume =
                await loadOwnedResume(req);

            const versions =
                await ResumeVersion.find({
                    resumeId:
                        resume._id,
                })
                    .sort({
                        versionNumber: 1,
                    })
                    .select("-rawText")
                    .lean();

            res.json({
                resume,
                versions,
            });
        }
    )
);


// =========================================================
// GET SPECIFIC VERSION
// =========================================================

router.get(
    "/:id/versions/:versionId",

    validate(
        z.object({
            id:
                objectIdSchema,

            versionId:
                objectIdSchema,
        }),
        "params"
    ),

    asyncHandler(
        async (req, res) => {

            const resume =
                await loadOwnedResume(req);

            const version =
                await loadVersion(
                    resume._id,
                    req.params.versionId
                );

            res.json({
                version,
            });
        }
    )
);


// =========================================================
// DELETE RESUME
// =========================================================

router.delete(
    "/:id",

    validate(
        idParam,
        "params"
    ),

    asyncHandler(
        async (req, res) => {

            const resume =
                await loadOwnedResume(req);

            await ResumeVersion.deleteMany({
                resumeId:
                    resume._id,
            });

            await Analysis.deleteMany({
                resumeId:
                    resume._id,
            });

            await resume.deleteOne();

            res.json({
                ok: true,
            });
        }
    )
);


// =========================================================
// ANALYZE RESUME
// =========================================================

const analyzeBody = z.object({

    versionId:
        objectIdSchema.optional(),

    targetRole:
        z
            .string()
            .trim()
            .min(2, "Target job role is required")
            .max(120),

});


router.post(
    "/:id/analyze",

    analyzeLimiter,

    validate(
        idParam,
        "params"
    ),

    validate(
        analyzeBody,
          "body"
    ),

    asyncHandler(
        async (req, res) => {

            const resume =
                await loadOwnedResume(req);


            const versionId =
                req.body.versionId ||
                resume.currentVersionId;


            if (!versionId) {

                throw ApiError.badRequest(
                    "No version to analyze"
                );

            }


            const version =
                await loadVersion(
                    resume._id,
                    versionId
                );


            const {
                analysis,
                model,
                promptTokens,
                responseTokens,
            } =
                await analyzeResume({

                    rawText:
                        version.rawText,

                    targetRole:
                        req.body.targetRole,

                });


            const saved =
                await Analysis.create({

                    userId:
                        req.user._id,

                    resumeId:
                        resume._id,

                    versionId:
                        version._id,

                    atsScore:
                        analysis.atsScore,

                    scoreBreakdown:
                        analysis.scoreBreakdown,

                    issues:
                        analysis.issues,

                    strengths:
                        analysis.strengths,

                    bulletRewrites:
                        analysis.bulletRewrites,

                    keywordsPresent:
                        analysis.keywordsPresent,

                    keywordsMissing:
                        analysis.keywordsMissing,

                    summary:
                        analysis.summary,

                    model,

                    promptTokens,

                    responseTokens,

                });


            version.latestAnalysisId =
                saved._id;


            await version.save();


            res.status(201).json({

                analysis:
                    saved,

            });

        }
    )
);


// =========================================================
// GET ALL ANALYSES
// =========================================================

router.get(
    "/:id/analyses",

    validate(
        idParam,
        "params"
    ),

    asyncHandler(
        async (req, res) => {

            const resume =
                await loadOwnedResume(req);

            const analyses =
                await Analysis.find({
                    resumeId:
                        resume._id,
                })
                    .sort({
                        createdAt: -1,
                    })
                    .lean();

            res.json({
                analyses,
            });
        }
    )
);


// =========================================================
// GET VERSION ANALYSIS
// =========================================================

router.get(
    "/:id/versions/:versionId/analysis",

    validate(
        z.object({

            id:
                objectIdSchema,

            versionId:
                objectIdSchema,

        }),
        "params"
    ),

    asyncHandler(
        async (req, res) => {

            const resume =
                await loadOwnedResume(req);

            const version =
                await loadVersion(
                    resume._id,
                    req.params.versionId
                );

            const analysis =
                await Analysis.findOne({

                    resumeId:
                        resume._id,

                    versionId:
                        version._id,

                })
                    .sort({
                        createdAt: -1,
                    })
                    .lean();

            res.json({
                analysis:
                    analysis ||
                    null,
            });
        }
    )
);


// =========================================================
// AI REWRITE RESPONSE SCHEMA
// =========================================================

const rewriteResponseSchema = {

    type: Type.OBJECT,

    required: [
        "basics",
        "summary",
        "experience",
        "education",
        "skills",
        "projects",
        "certifications",
        "languages",
        "interests",
    ],

    properties: {

        basics: {

            type: Type.OBJECT,

            properties: {

                name: {
                    type: Type.STRING,
                },

                title: {
                    type: Type.STRING,
                },

                location: {
                    type: Type.STRING,
                },

                email: {
                    type: Type.STRING,
                },

                phone: {
                    type: Type.STRING,
                },

                links: {

                    type: Type.ARRAY,

                    items: {

                        type: Type.OBJECT,

                        properties: {

                            label: {
                                type: Type.STRING,
                            },

                            url: {
                                type: Type.STRING,
                            },

                        },
                    },
                },
            },
        },


        summary: {
            type: Type.STRING,
        },


        experience: {

            type: Type.ARRAY,

            items: {

                type: Type.OBJECT,

                properties: {

                    company: {
                        type: Type.STRING,
                    },

                    role: {
                        type: Type.STRING,
                    },

                    location: {
                        type: Type.STRING,
                    },

                    period: {
                        type: Type.STRING,
                    },

                    bullets: {

                        type: Type.ARRAY,

                        items: {
                            type: Type.STRING,
                        },
                    },
                },
            },
        },


        education: {

            type: Type.ARRAY,

            items: {

                type: Type.OBJECT,

                properties: {

                    degree: {
                        type: Type.STRING,
                    },

                    school: {
                        type: Type.STRING,
                    },

                    location: {
                        type: Type.STRING,
                    },

                    period: {
                        type: Type.STRING,
                    },

                    details: {
                        type: Type.STRING,
                    },
                },
            },
        },


        skills: {

            type: Type.ARRAY,

            items: {
                type: Type.STRING,
            },
        },


        projects: {

            type: Type.ARRAY,

            items: {

                type: Type.OBJECT,

                properties: {

                    name: {
                        type: Type.STRING,
                    },

                    description: {
                        type: Type.STRING,
                    },

                    tech: {

                        type: Type.ARRAY,

                        items: {
                            type: Type.STRING,
                        },
                    },

                    links: {

                        type: Type.ARRAY,

                        items: {

                            type: Type.OBJECT,

                            properties: {

                                label: {
                                    type: Type.STRING,
                                },

                                url: {
                                    type: Type.STRING,
                                },

                            },
                        },
                    },
                },
            },
        },


        certifications: {

            type: Type.ARRAY,

            items: {

                type: Type.OBJECT,

                properties: {

                    name: {
                        type: Type.STRING,
                    },

                    issuer: {
                        type: Type.STRING,
                    },

                    year: {
                        type: Type.STRING,
                    },
                },
            },
        },


        languages: {

            type: Type.ARRAY,

            items: {
                type: Type.STRING,
            },
        },


        interests: {

            type: Type.ARRAY,

            items: {
                type: Type.STRING,
            },
        },
    },
};


// =========================================================
// BUILD GEMINI REWRITE PROMPT
// =========================================================

function buildRewritePrompt({
    rawText,
    parsedSections,
    analysis,
}) {

    return [

        "You are an expert professional resume writer and ATS optimization specialist.",

        "",

        "Your task is to improve the candidate's resume while preserving the candidate's real information.",

        "",

        "CRITICAL RULES:",

        "1. The ORIGINAL RESUME TEXT is the primary source of truth.",
        "2. Preserve the candidate's name, email, phone, location, links, companies, job titles, dates, degrees, schools, technologies, certifications, projects, and other factual information.",
        "3. NEVER invent employers, job titles, responsibilities, technologies, achievements, metrics, awards, certifications, education, dates, or projects.",
        "4. NEVER create fake numbers or percentages.",
        "5. Only use metrics that already exist in the original resume.",
        "6. Do not remove important factual information.",
        "7. Do not add generic filler content just to make the resume longer.",
        "8. Improve grammar, spelling, clarity, professionalism, and ATS readability.",
        "9. Rewrite weak experience bullets using strong action verbs.",
        "10. Keep each bullet concise and meaningful.",
        "11. Prefer specific technical and business impact already supported by the original resume.",
        "12. Preserve the meaning of the original experience.",
        "13. Keep existing technical keywords that are relevant.",
        "14. Do not keyword-stuff the resume.",
        "15. Do not repeat the same achievement in multiple sections.",
        "16. Create a professional summary only from information actually present in the original resume.",
        "17. If the original resume has no projects, certifications, languages, or interests, return empty arrays for those sections.",
        "18. Do not invent missing sections.",
        "19. Return the COMPLETE resume.",
        "20. Return ONLY valid JSON matching the provided response schema.",

        "",

        "QUALITY REQUIREMENTS:",

        "- Every experience bullet should clearly describe an action and its result when the result is known.",
        "- Use strong verbs such as developed, implemented, migrated, optimized, architected, automated, improved, collaborated, designed, and delivered when appropriate.",
        "- Do not use meaningless phrases such as 'hard-working professional' or 'passionate team player'.",
        "- Avoid unnecessary adjectives.",
        "- Avoid repeating the same information.",
        "- Keep the writing natural and human.",
        "- Do not make the resume sound exaggerated or unrealistic.",

        "",

        "ATS ANALYSIS:",

        analysis
            ? JSON.stringify(
                  {
                      atsScore: analysis.atsScore,
                      scoreBreakdown: analysis.scoreBreakdown,
                      issues: analysis.issues,
                      strengths: analysis.strengths,
                      bulletRewrites: analysis.bulletRewrites,
                      keywordsPresent: analysis.keywordsPresent,
                      keywordsMissing: analysis.keywordsMissing,
                      summary: analysis.summary,
                  },
                  null,
                  2
              )
            : "No ATS analysis is available.",

        "",

        "STRUCTURED RESUME DATA:",
        "--------------------------------",

        JSON.stringify(
            parsedSections || {},
            null,
            2
        ),

        "--------------------------------",

        "",

        "ORIGINAL RESUME TEXT:",
        "================================",

        rawText,

        "================================",

        "",

        "FINAL INSTRUCTION:",

        "Rewrite the resume using the original resume text as the source of truth.",

        "Use the ATS analysis only to identify areas that need improvement.",

        "Do not invent information.",

        "Return the complete improved resume as structured JSON.",

        "Return ONLY the JSON object. Do not include markdown, explanations, comments, or introductory text.",

    ].join("\n");
}


// =========================================================
// AI FULL RESUME REWRITE
// =========================================================

async function rewriteResumeWithAI({
    rawText,
    parsedSections,
    analysis,
}) {

    if (!ai) {

        throw ApiError.internal(
            "GEMINI_API_KEY is not configured on the server."
        );
    }

    const prompt =
        buildRewritePrompt({

            rawText,
            parsedSections,
            analysis,

        });

    let lastError;

    for (
        let attempt = 1;
        attempt <= 1;
        attempt++
    ) {

        try {

            const result =
                await ai.models.generateContent({

                    model:
                        env.geminiModel,

                    contents: [

                        {
                            role: "user",

                            parts: [

                                {
                                    text:
                                        prompt,
                                },

                            ],
                        },

                    ],

                    config: {

                        responseMimeType:
                            "application/json",

                        responseSchema:
                            rewriteResponseSchema,

                        temperature:
                            0.3,

                    },

                });

            const text =
                typeof result.text === "function"
                    ? result.text()
                    : result.text;

            if (!text) {

                throw new Error(
                    "Empty response from Gemini"
                );
            }

            const rewritten =
                JSON.parse(text);

            return {

                rewrittenResume:
                    rewritten,

                model:
                    env.geminiModel,

                usage:
                    result.usageMetadata ||
                    {},

            };

        } catch (error) {

            lastError =
                error;

            console.error(
                `Gemini rewrite attempt ${attempt} failed:`,
                error
            );

            console.error(
                "ERROR NAME:",
                error?.name
            );

            console.error(
                "ERROR MESSAGE:",
                error?.message
            );

            console.error(
                "ERROR CAUSE:",
                error?.cause
            );

            console.error(
                "ERROR STACK:",
                error?.stack
            );

            if (
                attempt === 2
            ) {
                break;
            }
        }
    }

    throw ApiError.internal(
        `Gemini resume rewrite failed: ${
            lastError?.message ||
            "unknown error"
        }`
    );
}


// =========================================================
// BUILD RAW TEXT FROM STRUCTURED RESUME
// =========================================================

function buildResumeText(
    resume
) {

    const lines = [];

    const basics =
        resume.basics || {};


    // -----------------------------------------------------
    // BASICS
    // -----------------------------------------------------

    if (basics.name) {
        lines.push(
            basics.name
        );
    }

    if (basics.title) {
        lines.push(
            basics.title
        );
    }

    if (basics.location) {
        lines.push(
            basics.location
        );
    }

    if (basics.email) {
        lines.push(
            basics.email
        );
    }

    if (basics.phone) {
        lines.push(
            basics.phone
        );
    }

    if (
        Array.isArray(
            basics.links
        )
    ) {

        basics.links.forEach(
            (link) => {

                if (
                    !link ||
                    !link.url
                ) {
                    return;
                }

                lines.push(
                    link.label
                        ? `${link.label}: ${link.url}`
                        : link.url
                );
            }
        );
    }

    lines.push("");


    // -----------------------------------------------------
    // SUMMARY
    // -----------------------------------------------------

    if (resume.summary) {

        lines.push(
            "SUMMARY"
        );

        lines.push(
            resume.summary
        );

        lines.push("");
    }


    // -----------------------------------------------------
    // EXPERIENCE
    // -----------------------------------------------------

    if (
        Array.isArray(
            resume.experience
        ) &&
        resume.experience.length
    ) {

        lines.push(
            "EXPERIENCE"
        );

        resume.experience.forEach(
            (item) => {

                if (item.role) {
                    lines.push(
                        item.role
                    );
                }

                if (item.company) {
                    lines.push(
                        item.company
                    );
                }

                if (item.location) {
                    lines.push(
                        item.location
                    );
                }

                if (item.period) {
                    lines.push(
                        item.period
                    );
                }

                if (
                    Array.isArray(
                        item.bullets
                    )
                ) {

                    item.bullets.forEach(
                        (bullet) => {

                            if (bullet) {

                                lines.push(
                                    `• ${bullet}`
                                );
                            }
                        }
                    );
                }

                lines.push("");
            }
        );
    }


    // -----------------------------------------------------
    // EDUCATION
    // -----------------------------------------------------

    if (
        Array.isArray(
            resume.education
        ) &&
        resume.education.length
    ) {

        lines.push(
            "EDUCATION"
        );

        resume.education.forEach(
            (item) => {

                if (item.degree) {
                    lines.push(
                        item.degree
                    );
                }

                if (item.school) {
                    lines.push(
                        item.school
                    );
                }

                if (item.location) {
                    lines.push(
                        item.location
                    );
                }

                if (item.period) {
                    lines.push(
                        item.period
                    );
                }

                if (item.details) {
                    lines.push(
                        item.details
                    );
                }

                lines.push("");
            }
        );
    }


    // -----------------------------------------------------
    // SKILLS
    // -----------------------------------------------------

    if (
        Array.isArray(
            resume.skills
        ) &&
        resume.skills.length
    ) {

        lines.push(
            "SKILLS"
        );

        lines.push(
            resume.skills.join(", ")
        );

        lines.push("");
    }


    // -----------------------------------------------------
    // PROJECTS
    // -----------------------------------------------------

    if (
        Array.isArray(
            resume.projects
        ) &&
        resume.projects.length
    ) {

        lines.push(
            "PROJECTS"
        );

        resume.projects.forEach(
            (project) => {

                if (project.name) {
                    lines.push(
                        project.name
                    );
                }

                if (project.description) {
                    lines.push(
                        project.description
                    );
                }

                if (
                    Array.isArray(
                        project.tech
                    ) &&
                    project.tech.length
                ) {

                    lines.push(
                        `Technologies: ${project.tech.join(", ")}`
                    );
                }

                if (
                    Array.isArray(
                        project.links
                    )
                ) {

                    project.links.forEach(
                        (link) => {

                            if (
                                link &&
                                link.url
                            ) {

                                lines.push(
                                    link.label
                                        ? `${link.label}: ${link.url}`
                                        : link.url
                                );
                            }
                        }
                    );
                }

                lines.push("");
            }
        );
    }


    // -----------------------------------------------------
    // CERTIFICATIONS
    // -----------------------------------------------------

    if (
        Array.isArray(
            resume.certifications
        ) &&
        resume.certifications.length
    ) {

        lines.push(
            "CERTIFICATIONS"
        );

        resume.certifications.forEach(
            (item) => {

                const parts = [

                    item.name,
                    item.issuer,
                    item.year,

                ].filter(Boolean);

                if (parts.length) {

                    lines.push(
                        parts.join(" — ")
                    );
                }
            }
        );

        lines.push("");
    }


    // -----------------------------------------------------
    // LANGUAGES
    // -----------------------------------------------------

    if (
        Array.isArray(
            resume.languages
        ) &&
        resume.languages.length
    ) {

        lines.push(
            "LANGUAGES"
        );

        lines.push(
            resume.languages.join(", ")
        );

        lines.push("");
    }


    // -----------------------------------------------------
    // INTERESTS
    // -----------------------------------------------------

    if (
        Array.isArray(
            resume.interests
        ) &&
        resume.interests.length
    ) {

        lines.push(
            "INTERESTS"
        );

        lines.push(
            resume.interests.join(", ")
        );

        lines.push("");
    }


    return lines
        .join("\n")
        .trim();
}


// =========================================================
// COUNT AI IMPROVEMENTS
// =========================================================

function countResumeImprovements(
    original,
    rewritten
) {

    let count = 0;


    // Summary changed
    if (
        (original.summary || "").trim() !==
        (rewritten.summary || "").trim()
    ) {

        count++;
    }


    // Experience bullet changes
    const originalExperience =
        Array.isArray(
            original.experience
        )
            ? original.experience
            : [];

    const rewrittenExperience =
        Array.isArray(
            rewritten.experience
        )
            ? rewritten.experience
            : [];

    const experienceCount =
        Math.max(
            originalExperience.length,
            rewrittenExperience.length
        );

    for (
        let i = 0;
        i < experienceCount;
        i++
    ) {

        const oldBullets =
            Array.isArray(
                originalExperience[i]?.bullets
            )
                ? originalExperience[i].bullets
                : [];

        const newBullets =
            Array.isArray(
                rewrittenExperience[i]?.bullets
            )
                ? rewrittenExperience[i].bullets
                : [];

        const bulletCount =
            Math.max(
                oldBullets.length,
                newBullets.length
            );

        for (
            let j = 0;
            j < bulletCount;
            j++
        ) {

            const oldBullet =
                (oldBullets[j] || "").trim();

            const newBullet =
                (newBullets[j] || "").trim();

            if (
                oldBullet !==
                newBullet
            ) {

                count++;
            }
        }
    }


    // Project descriptions changed
    const originalProjects =
        Array.isArray(
            original.projects
        )
            ? original.projects
            : [];

    const rewrittenProjects =
        Array.isArray(
            rewritten.projects
        )
            ? rewritten.projects
            : [];

    const projectCount =
        Math.max(
            originalProjects.length,
            rewrittenProjects.length
        );

    for (
        let i = 0;
        i < projectCount;
        i++
    ) {

        const oldDescription =
            (
                originalProjects[i]?.description ||
                ""
            ).trim();

        const newDescription =
            (
                rewrittenProjects[i]?.description ||
                ""
            ).trim();

        if (
            oldDescription !==
            newDescription
        ) {

            count++;
        }
    }

    return count;
}


// =========================================================
// AI REWRITE RESUME
// =========================================================

const rewriteBody = z.object({
    versionId:
        objectIdSchema.optional(),

    analysisId:
        objectIdSchema.optional(),

    targetRole:
    z
        .string()
        .trim()
        .min(2)
        .max(120)
        .optional(),

    label:
        z
            .string()
            .trim()
            .max(80)
            .optional(),
});


router.post(
    "/:id/rewrite",

    validate(
        idParam,
        "params"
    ),

    validate(
        rewriteBody
    ),

    asyncHandler(
        async (req, res) => {

            // -------------------------------------------------
            // 1. VERIFY OWNERSHIP
            // -------------------------------------------------

            const resume =
                await loadOwnedResume(req);


            // -------------------------------------------------
            // 2. DETERMINE SOURCE VERSION
            // -------------------------------------------------

            const versionId =
                req.body.versionId ||
                resume.currentVersionId;

            if (!versionId) {

                throw ApiError.badRequest(
                    "No resume version available to rewrite"
                );
            }


            const baseVersion =
                await loadVersion(
                    resume._id,
                    versionId
                );


            // -------------------------------------------------
            // 3. GET EXISTING ANALYSIS
            // -------------------------------------------------

            let analysis = null;


            if (
                req.body.analysisId
            ) {

                analysis =
                    await Analysis.findOne({

                        _id:
                            req.body.analysisId,

                        resumeId:
                            resume._id,

                        versionId:
                            baseVersion._id,

                    }).lean();

            } else {

                analysis =
                    await Analysis.findOne({

                        resumeId:
                            resume._id,

                        versionId:
                            baseVersion._id,

                    })
                        .sort({
                            createdAt: -1,
                        })
                        .lean();
            }


            // -------------------------------------------------
            // 4. AI REWRITE
            // -------------------------------------------------

            const {
                rewrittenResume,
                model,
                usage,
            } = await rewriteResumeWithAI({
                rawText:
                    baseVersion.rawText,

                parsedSections:
                    baseVersion.parsedSections,

                analysis,

                targetRole:
                    req.body.targetRole,
            });

            // -------------------------------------------------
            // 5. BUILD NEW RAW TEXT
            // -------------------------------------------------

            const newRawText =
                buildResumeText(
                    rewrittenResume
                );


            const appliedCount =
                countResumeImprovements(
                    baseVersion.parsedSections || {},
                    rewrittenResume
                );


            console.log(
                "AI improvements applied:",
                appliedCount
            );


            if (
                !newRawText.trim()
            ) {

                throw ApiError.internal(
                    "AI returned an empty rewritten resume"
                );
            }


            // -------------------------------------------------
            // 6. DETERMINE NEW VERSION NUMBER
            // -------------------------------------------------

            const nextVersionNumber =
                resume.latestVersionNumber + 1;


            // -------------------------------------------------
            // 7. CREATE NEW VERSION
            // -------------------------------------------------

            const newVersion =
                await ResumeVersion.create({

                    resumeId:
                        resume._id,

                    versionNumber:
                        nextVersionNumber,

                    label:
                        req.body.label?.trim() ||
                        `AI Rewrite V${nextVersionNumber}`,

                    rawText:
                        newRawText,

                    parsedSections:
                        rewrittenResume,

                    sourceType:
                        "rewrite",

                    parentVersionId:
                        baseVersion._id,
                });


            console.log(
                "New rewritten version created:",
                newVersion._id.toString()
            );


            // -------------------------------------------------
            // 8. AUTOMATICALLY ANALYZE NEW REWRITTEN RESUME
            // -------------------------------------------------

            console.log(
                "Analyzing newly rewritten resume..."
            );


            const {

                analysis:
                    rewrittenAnalysis,

                model:
                    analysisModel,

                promptTokens:
                    analysisPromptTokens,

                responseTokens:
                    analysisResponseTokens,

            } =
                await analyzeResume({

                    rawText:
                        newVersion.rawText,

                    targetRole:
                           req.body.targetRole,
                });


            console.log(
                "New rewritten resume ATS score:",
                rewrittenAnalysis.atsScore
            );


            // -------------------------------------------------
            // 9. SAVE ANALYSIS FOR NEW VERSION
            // -------------------------------------------------

            const savedAnalysis =
                await Analysis.create({

                    userId:
                        req.user._id,

                    resumeId:
                        resume._id,

                    versionId:
                        newVersion._id,

                    atsScore:
                        rewrittenAnalysis.atsScore,

                    scoreBreakdown:
                        rewrittenAnalysis.scoreBreakdown,

                    issues:
                        rewrittenAnalysis.issues,

                    strengths:
                        rewrittenAnalysis.strengths,

                    bulletRewrites:
                        rewrittenAnalysis.bulletRewrites,

                    keywordsPresent:
                        rewrittenAnalysis.keywordsPresent,

                    keywordsMissing:
                        rewrittenAnalysis.keywordsMissing,

                    summary:
                        rewrittenAnalysis.summary,

                    model:
                        analysisModel,

                    promptTokens:
                        analysisPromptTokens,

                    responseTokens:
                        analysisResponseTokens,
                });


            console.log(
                "Analysis saved:",
                savedAnalysis._id.toString()
            );


            // -------------------------------------------------
            // 10. LINK ANALYSIS TO NEW VERSION
            // -------------------------------------------------

            newVersion.latestAnalysisId =
                savedAnalysis._id;

            await newVersion.save();


            // -------------------------------------------------
            // 11. MAKE NEW VERSION CURRENT
            // -------------------------------------------------

            resume.latestVersionNumber =
                nextVersionNumber;

            resume.currentVersionId =
                newVersion._id;

            await resume.save();


            // -------------------------------------------------
            // 12. RETURN RESULT
            // -------------------------------------------------

            res.status(201).json({

                message:
                    "Resume successfully rewritten and analyzed by AI.",

                appliedCount,

                atsScore:
                    savedAnalysis.atsScore,

                analysis:
                    savedAnalysis,

                version:
                    newVersion,

                parentVersionId:
                    baseVersion._id,

                model,

                usage,

            });
        }
    )
);

// =========================================================
// DIFF BETWEEN TWO VERSIONS
// =========================================================

const diffQuery = z.object({

    from:
        objectIdSchema,

    to:
        objectIdSchema,

    mode:
        z
            .enum([
                "words",
                "lines",
            ])
            .optional(),
});


router.get(
    "/:id/diff",

    validate(
        idParam,
        "params"
    ),

    validate(
        diffQuery,
        "query"
    ),

    asyncHandler(
        async (req, res) => {

            const resume =
                await loadOwnedResume(req);

            const [
                fromV,
                toV,
            ] =
                await Promise.all([

                    loadVersion(
                        resume._id,
                        req.query.from
                    ),

                    loadVersion(
                        resume._id,
                        req.query.to
                    ),

                ]);


            const parts =
                diffText(

                    fromV.rawText,

                    toV.rawText,

                    req.query.mode

                );


            res.json({

                from: {

                    id:
                        fromV._id,

                    label:
                        fromV.label,

                    versionNumber:
                        fromV.versionNumber,

                },

                to: {

                    id:
                        toV._id,

                    label:
                        toV.label,

                    versionNumber:
                        toV.versionNumber,

                },

                parts,

                stats:
                    summarize(parts),

            });
        }
    )
);


// =========================================================
// EXPORT
// =========================================================

module.exports = router;