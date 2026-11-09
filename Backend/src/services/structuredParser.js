// =========================================================
// STRUCTURED RESUME PARSER
// =========================================================
// IMPORTANT:
// This parser does NOT use Gemini.
// It extracts basic resume structure from the already
// extracted PDF text.
//
// Gemini is reserved for the actual ATS analysis.
// =========================================================

const EMPTY = {
    basics: {
        name: "",
        title: "",
        location: "",
        email: "",
        phone: "",
        links: [],
    },

    summary: "",

    experience: [],

    education: [],

    skills: [],

    projects: [],

    certifications: [],

    languages: [],

    interests: [],
};


// =========================================================
// HELPERS
// =========================================================

function cleanText(text = "") {
    return text
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .trim();
}


function cleanLine(line = "") {
    return line
        .replace(/\r/g, "")
        .replace(/\s+/g, " ")
        .trim();
}


function isSeparator(line) {
    return (
        !line ||
        /^[-_=|•]+$/.test(line.trim()) ||
        /^--\s*\d+\s+of\s+\d+\s*--$/i.test(line.trim())
    );
}


function isSectionHeading(line) {
    const normalized = line
        .trim()
        .toUpperCase()
        .replace(/[:\-]+$/, "");

    const headings = [
        "SUMMARY",
        "SUMMARY STATEMENT",
        "PROFESSIONAL SUMMARY",
        "PROFILE",

        "CORE QUALIFICATIONS",
        "QUALIFICATIONS",
        "SKILLS",
        "TECHNICAL SKILLS",
        "CORE SKILLS",

        "EXPERIENCE",
        "WORK EXPERIENCE",
        "PROFESSIONAL EXPERIENCE",
        "EMPLOYMENT HISTORY",

        "EDUCATION",
        "ACADEMIC BACKGROUND",

        "PROJECTS",
        "PERSONAL PROJECTS",

        "CERTIFICATIONS",
        "CERTIFICATES",

        "LANGUAGES",

        "INTERESTS",
        "HOBBIES",
    ];

    return headings.includes(normalized);
}


function normalizeHeading(line) {
    return line
        .trim()
        .toUpperCase()
        .replace(/[:\-]+$/, "");
}


function isBullet(line) {
    return /^[•●▪◦*-]\s*/.test(line.trim());
}


function removeBullet(line) {
    return line
        .replace(/^[•●▪◦*-]\s*/, "")
        .trim();
}


function extractEmail(rawText) {
    const match = rawText.match(
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
    );

    return match ? match[0] : "";
}


function extractPhone(rawText) {
    const match = rawText.match(
        /(?:\+?\d[\d\s().-]{7,}\d)/
    );

    return match ? match[0].trim() : "";
}


function extractLinks(rawText) {
    const links = [];

    const urlRegex =
        /https?:\/\/[^\s]+/gi;

    const matches =
        rawText.match(urlRegex) || [];

    for (const url of matches) {
        const cleanUrl = url.replace(
            /[),.;]+$/,
            ""
        );

        links.push({
            label: cleanUrl
                .replace(/^https?:\/\//i, "")
                .split("/")[0],

            url: cleanUrl,
        });
    }

    return links;
}


// =========================================================
// NAME DETECTION
// =========================================================

function extractName(lines) {
    for (let i = 0; i < Math.min(lines.length, 12); i++) {
        const line = cleanLine(lines[i]);

        if (!line) continue;

        // Skip obvious headings
        if (isSectionHeading(line)) continue;

        // Skip email
        if (line.includes("@")) continue;

        // Skip phone
        if (/\d{5,}/.test(line)) continue;

        // Skip URLs
        if (/https?:\/\//i.test(line)) continue;

        // A likely name is 2-4 alphabetic words
        const words = line.split(" ");

        if (
            words.length >= 2 &&
            words.length <= 4 &&
            words.every((word) =>
                /^[A-Za-z.'-]+$/.test(word)
            )
        ) {
            return line;
        }
    }

    return "";
}


// =========================================================
// TITLE DETECTION
// =========================================================

function extractTitle(lines, name) {
    const commonTitles = [
        "software engineer",
        "software developer",
        "frontend developer",
        "backend developer",
        "full stack developer",
        "full-stack developer",
        "web developer",
        "data scientist",
        "data analyst",
        "business analyst",
        "project manager",
        "product manager",
        "business operations manager",
        "operations manager",
        "marketing manager",
        "designer",
        "ui designer",
        "ux designer",
        "graphic designer",
        "student",
        "intern",
    ];

    for (const line of lines.slice(0, 15)) {
        const cleaned = cleanLine(line);

        if (!cleaned) continue;

        if (
            cleaned === name ||
            cleaned.includes("@") ||
            /\d{5,}/.test(cleaned) ||
            /https?:\/\//i.test(cleaned)
        ) {
            continue;
        }

        const lower =
            cleaned.toLowerCase();

        if (
            commonTitles.some((title) =>
                lower.includes(title)
            )
        ) {
            return cleaned;
        }
    }

    return "";
}


// =========================================================
// SECTION EXTRACTION
// =========================================================

function getSections(lines) {
    const sections = {};

    let currentSection = "header";

    sections.header = [];

    for (const originalLine of lines) {
        const line = cleanLine(originalLine);

        if (isSeparator(line)) {
            continue;
        }

        if (isSectionHeading(line)) {
            currentSection =
                normalizeHeading(line);

            if (!sections[currentSection]) {
                sections[currentSection] = [];
            }

            continue;
        }

        if (!sections[currentSection]) {
            sections[currentSection] = [];
        }

        if (line) {
            sections[currentSection].push(line);
        }
    }

    return sections;
}


// =========================================================
// SUMMARY
// =========================================================

function parseSummary(sections) {
    const possible =
        sections["SUMMARY STATEMENT"] ||
        sections["PROFESSIONAL SUMMARY"] ||
        sections["SUMMARY"] ||
        sections["PROFILE"] ||
        [];

    return possible
        .join(" ")
        .trim();
}


// =========================================================
// SKILLS
// =========================================================

function parseSkills(sections) {
    const possible =
        sections["CORE QUALIFICATIONS"] ||
        sections["TECHNICAL SKILLS"] ||
        sections["CORE SKILLS"] ||
        sections["SKILLS"] ||
        [];

    const skills = [];

    for (const line of possible) {
        const parts = line
            .split(/[•|,;]/)
            .map((item) => item.trim())
            .filter(Boolean);

        skills.push(...parts);
    }

    return [...new Set(skills)];
}


// =========================================================
// EXPERIENCE
// =========================================================

function parseExperience(sections) {
    const lines =
        sections["WORK EXPERIENCE"] ||
        sections["PROFESSIONAL EXPERIENCE"] ||
        sections["EXPERIENCE"] ||
        sections["EMPLOYMENT HISTORY"] ||
        [];

    const experience = [];

    let current = null;

    for (const line of lines) {
        if (isBullet(line)) {
            if (current) {
                current.bullets.push(
                    removeBullet(line)
                );
            }

            continue;
        }

        // Detect date/period line
        const hasDate =
            /\b(19|20)\d{2}\b/.test(line) ||
            /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(
                line
            ) ||
            /\b(Current|Present)\b/i.test(line);

        // A new company/role usually appears before a date
        if (
            !current ||
            (
                !hasDate &&
                current.company &&
                current.role
            )
        ) {
            if (current) {
                experience.push(current);
            }

            current = {
                company: line,
                role: "",
                location: "",
                period: "",
                bullets: [],
            };

            continue;
        }

        if (
            hasDate &&
            current &&
            !current.period
        ) {
            current.period = line;
            continue;
        }

        if (
            current &&
            !current.role
        ) {
            current.role = line;
            continue;
        }

        if (
            current &&
            !current.location &&
            (
                line.includes(",") ||
                /PA|CA|NY|TX|FL|USA|India|United States/i.test(
                    line
                )
            )
        ) {
            current.location = line;
            continue;
        }

        if (current) {
            current.bullets.push(line);
        }
    }

    if (current) {
        experience.push(current);
    }

    return experience;
}


// =========================================================
// EDUCATION
// =========================================================

function parseEducation(sections) {
    const lines =
        sections["EDUCATION"] ||
        sections["ACADEMIC BACKGROUND"] ||
        [];

    const education = [];

    let current = null;

    for (const line of lines) {
        const looksLikeDegree =
            /\b(BBA|MBA|BS|B\.S\.|BA|B\.A\.|MS|M\.S\.|MA|M\.A\.|PhD|Ph\.D|Bachelor|Master|Associate|Diploma)\b/i.test(
                line
            );

        if (
            !current ||
            looksLikeDegree
        ) {
            if (current) {
                education.push(current);
            }

            current = {
                degree: "",
                school: "",
                location: "",
                period: "",
                details: "",
            };
        }

        if (
            looksLikeDegree &&
            !current.degree
        ) {
            current.degree = line;
            continue;
        }

        if (
            !current.school
        ) {
            current.school = line;
            continue;
        }

        if (
            !current.period &&
            (
                /\b(19|20)\d{2}\b/.test(line) ||
                /Current|Present/i.test(line)
            )
        ) {
            current.period = line;
            continue;
        }

        if (
            !current.location &&
            line.includes(",")
        ) {
            current.location = line;
            continue;
        }

        if (line) {
            current.details =
                current.details
                    ? `${current.details} ${line}`
                    : line;
        }
    }

    if (current) {
        education.push(current);
    }

    return education;
}


// =========================================================
// PROJECTS
// =========================================================

function parseProjects(sections) {
    const lines =
        sections["PROJECTS"] ||
        sections["PERSONAL PROJECTS"] ||
        [];

    const projects = [];

    let current = null;

    for (const line of lines) {
        if (
            !current
        ) {
            current = {
                name: line,
                description: "",
                tech: [],
                links: [],
            };

            continue;
        }

        if (
            isBullet(line)
        ) {
            current.description +=
                `${current.description ? " " : ""}${removeBullet(line)}`;

            continue;
        }

        if (
            /https?:\/\//i.test(line)
        ) {
            current.links.push({
                label: line
                    .replace(/^https?:\/\//i, "")
                    .split("/")[0],

                url: line,
            });

            continue;
        }

        if (
            /^(tech|technologies|tools|stack)\s*:/i.test(
                line
            )
        ) {
            const techText =
                line.split(":").slice(1).join(":");

            current.tech =
                techText
                    .split(/[|,;]/)
                    .map((item) =>
                        item.trim()
                    )
                    .filter(Boolean);

            continue;
        }

        current.description +=
            `${current.description ? " " : ""}${line}`;
    }

    if (current) {
        projects.push(current);
    }

    return projects;
}


// =========================================================
// CERTIFICATIONS
// =========================================================

function parseCertifications(sections) {
    const lines =
        sections["CERTIFICATIONS"] ||
        sections["CERTIFICATES"] ||
        [];

    return lines.map((line) => ({
        name: line,
        issuer: "",
        year:
            line.match(/\b(19|20)\d{2}\b/)?.[0] ||
            "",
    }));
}


// =========================================================
// LANGUAGES
// =========================================================

function parseLanguages(sections) {
    const lines =
        sections["LANGUAGES"] ||
        [];

    return lines
        .flatMap((line) =>
            line
                .split(/[•|,;]/)
                .map((item) =>
                    item.trim()
                )
                .filter(Boolean)
        );
}


// =========================================================
// INTERESTS
// =========================================================

function parseInterests(sections) {
    const lines =
        sections["INTERESTS"] ||
        sections["HOBBIES"] ||
        [];

    return lines
        .flatMap((line) =>
            line
                .split(/[•|,;]/)
                .map((item) =>
                    item.trim()
                )
                .filter(Boolean)
        );
}


// =========================================================
// MAIN PARSER
// =========================================================

async function parseResume(rawText) {
    if (!rawText?.trim()) {
        return EMPTY;
    }

    try {
        console.log(
            "Parsing resume locally (no Gemini request)..."
        );

        const cleanedText =
            cleanText(rawText);

        const lines =
            cleanedText
                .split("\n")
                .map(cleanLine)
                .filter(Boolean);

        const sections =
            getSections(lines);

        const name =
            extractName(lines);

        const title =
            extractTitle(lines, name);

        const email =
            extractEmail(rawText);

        const phone =
            extractPhone(rawText);

        const links =
            extractLinks(rawText);

        const parsed = {
            basics: {
                name,
                title,
                location: "",
                email,
                phone,
                links,
            },

            summary:
                parseSummary(sections),

            experience:
                parseExperience(sections),

            education:
                parseEducation(sections),

            skills:
                parseSkills(sections),

            projects:
                parseProjects(sections),

            certifications:
                parseCertifications(sections),

            languages:
                parseLanguages(sections),

            interests:
                parseInterests(sections),
        };

        console.log(
            "Local resume parsing successful."
        );

        return parsed;

    } catch (error) {
        console.error(
            "Local resume parsing failed:",
            error.message
        );

        // Never stop resume upload because
        // structured parsing failed.
        return EMPTY;
    }
}


// =========================================================
// EXPORT
// =========================================================

module.exports = {
    parseResume,
};