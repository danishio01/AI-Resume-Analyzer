const { PDFParse } = require("pdf-parse");
const PDFDocument = require("pdfkit");
const ApiError = require("../utils/ApiError");


// =========================================================
// EXTRACT TEXT FROM PDF
// =========================================================

async function extractText(buffer) {
    let parser;

    try {
        parser = new PDFParse({ data: buffer });

        const result = await parser.getText();

        const text = (result.text || "").trim();

        if (!text || text.length < 50) {
            throw ApiError.badRequest(
                "Could not extract readable text - is this a scanned/image-only PDF?"
            );
        }

        return {
            text,
            meta: {
                numPages:
                    result.pages?.length ??
                    result.numpages ??
                    null,
            },
        };

    } catch (err) {

        if (err.isOperational) {
            throw err;
        }

        throw ApiError.badRequest(
            "Failed to parse PDF: " + err.message
        );

    } finally {

        try {
            await parser?.destroy?.();
        } catch {
            /* noop */
        }
    }
}


// =========================================================
// GENERATE PDF FROM REWRITTEN RESUME
// =========================================================

function generateResumePdf(resume) {

    return new Promise((resolve, reject) => {

        try {

            const doc = new PDFDocument({
                size: "A4",
                margins: {
                    top: 45,
                    bottom: 45,
                    left: 50,
                    right: 50,
                },
            });

            const chunks = [];

            doc.on("data", (chunk) => {
                chunks.push(chunk);
            });

            doc.on("end", () => {
                resolve(Buffer.concat(chunks));
            });

            doc.on("error", reject);


            // =================================================
            // HELPERS
            // =================================================

            function addSectionTitle(title) {

                if (!title) return;

                doc
                    .moveDown(0.7)
                    .font("Helvetica-Bold")
                    .fontSize(11)
                    .text(title.toUpperCase(), {
                        underline: false,
                    });

                doc
                    .moveDown(0.15);

                doc
                    .moveTo(
                        doc.page.margins.left,
                        doc.y
                    )
                    .lineTo(
                        doc.page.width -
                            doc.page.margins.right,
                        doc.y
                    )
                    .stroke();

                doc.moveDown(0.25);
            }


            function addBullet(text) {

                if (!text) return;

                doc
                    .font("Helvetica")
                    .fontSize(9.5)
                    .text(
                        `• ${text}`,
                        {
                            indent: 10,
                            hanging: 5,
                            lineGap: 2,
                        }
                    );

                doc.moveDown(0.12);
            }


            function addBody(text) {

                if (!text) return;

                doc
                    .font("Helvetica")
                    .fontSize(9.5)
                    .text(text, {
                        lineGap: 2,
                    });
            }


            // =================================================
            // BASICS
            // =================================================

            const basics =
                resume.basics || {};


            if (basics.name) {

                doc
                    .font("Helvetica-Bold")
                    .fontSize(20)
                    .text(
                        basics.name,
                        {
                            align: "center",
                        }
                    );
            }


            if (basics.title) {

                doc
                    .moveDown(0.15)
                    .font("Helvetica")
                    .fontSize(11)
                    .text(
                        basics.title,
                        {
                            align: "center",
                        }
                    );
            }


            const contactInfo = [];

            if (basics.location) {
                contactInfo.push(
                    basics.location
                );
            }

            if (basics.email) {
                contactInfo.push(
                    basics.email
                );
            }

            if (basics.phone) {
                contactInfo.push(
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
                            link &&
                            link.url
                        ) {

                            contactInfo.push(
                                link.url
                            );
                        }
                    }
                );
            }


            if (contactInfo.length) {

                doc
                    .moveDown(0.2)
                    .font("Helvetica")
                    .fontSize(8.5)
                    .text(
                        contactInfo.join("  |  "),
                        {
                            align: "center",
                        }
                    );
            }


            // =================================================
            // SUMMARY
            // =================================================

            if (resume.summary) {

                addSectionTitle(
                    "Professional Summary"
                );

                addBody(
                    resume.summary
                );
            }


            // =================================================
            // EXPERIENCE
            // =================================================

            if (
                Array.isArray(
                    resume.experience
                ) &&
                resume.experience.length
            ) {

                addSectionTitle(
                    "Experience"
                );


                resume.experience.forEach(
                    (item) => {

                        if (
                            item.role ||
                            item.company
                        ) {

                            const heading =
                                [
                                    item.role,
                                    item.company,
                                ]
                                    .filter(Boolean)
                                    .join(" — ");

                            doc
                                .font("Helvetica-Bold")
                                .fontSize(10)
                                .text(
                                    heading
                                );
                        }


                        const details =
                            [
                                item.location,
                                item.period,
                            ]
                                .filter(Boolean)
                                .join(" | ");


                        if (details) {

                            doc
                                .font("Helvetica-Oblique")
                                .fontSize(8.5)
                                .text(
                                    details
                                );
                        }


                        if (
                            Array.isArray(
                                item.bullets
                            )
                        ) {

                            doc.moveDown(0.15);

                            item.bullets.forEach(
                                (bullet) => {

                                    addBullet(
                                        bullet
                                    );
                                }
                            );
                        }

                        doc.moveDown(0.3);
                    }
                );
            }


            // =================================================
            // EDUCATION
            // =================================================

            if (
                Array.isArray(
                    resume.education
                ) &&
                resume.education.length
            ) {

                addSectionTitle(
                    "Education"
                );


                resume.education.forEach(
                    (item) => {

                        const heading =
                            [
                                item.degree,
                                item.school,
                            ]
                                .filter(Boolean)
                                .join(" — ");


                        if (heading) {

                            doc
                                .font("Helvetica-Bold")
                                .fontSize(10)
                                .text(
                                    heading
                                );
                        }


                        const details =
                            [
                                item.location,
                                item.period,
                            ]
                                .filter(Boolean)
                                .join(" | ");


                        if (details) {

                            doc
                                .font("Helvetica-Oblique")
                                .fontSize(8.5)
                                .text(
                                    details
                                );
                        }


                        if (item.details) {

                            doc
                                .moveDown(0.1)
                                .font("Helvetica")
                                .fontSize(9.5)
                                .text(
                                    item.details,
                                    {
                                        lineGap: 2,
                                    }
                                );
                        }

                        doc.moveDown(0.3);
                    }
                );
            }


            // =================================================
            // SKILLS
            // =================================================

            if (
                Array.isArray(
                    resume.skills
                ) &&
                resume.skills.length
            ) {

                addSectionTitle(
                    "Skills"
                );

                addBody(
                    resume.skills.join(
                        " • "
                    )
                );
            }


            // =================================================
            // PROJECTS
            // =================================================

            if (
                Array.isArray(
                    resume.projects
                ) &&
                resume.projects.length
            ) {

                addSectionTitle(
                    "Projects"
                );


                resume.projects.forEach(
                    (project) => {

                        if (project.name) {

                            doc
                                .font("Helvetica-Bold")
                                .fontSize(10)
                                .text(
                                    project.name
                                );
                        }


                        if (
                            project.description
                        ) {

                            doc
                                .font("Helvetica")
                                .fontSize(9.5)
                                .text(
                                    project.description,
                                    {
                                        lineGap: 2,
                                    }
                                );
                        }


                        if (
                            Array.isArray(
                                project.tech
                            ) &&
                            project.tech.length
                        ) {

                            doc
                                .moveDown(0.1)
                                .font("Helvetica")
                                .fontSize(8.5)
                                .text(
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

                                        doc
                                            .font("Helvetica")
                                            .fontSize(8.5)
                                            .text(
                                                link.label
                                                    ? `${link.label}: ${link.url}`
                                                    : link.url
                                            );
                                    }
                                }
                            );
                        }

                        doc.moveDown(0.3);
                    }
                );
            }


            // =================================================
            // CERTIFICATIONS
            // =================================================

            if (
                Array.isArray(
                    resume.certifications
                ) &&
                resume.certifications.length
            ) {

                addSectionTitle(
                    "Certifications"
                );


                resume.certifications.forEach(
                    (item) => {

                        const parts = [
                            item.name,
                            item.issuer,
                            item.year,
                        ].filter(Boolean);


                        if (parts.length) {

                            addBullet(
                                parts.join(
                                    " — "
                                )
                            );
                        }
                    }
                );
            }


            // =================================================
            // LANGUAGES
            // =================================================

            if (
                Array.isArray(
                    resume.languages
                ) &&
                resume.languages.length
            ) {

                addSectionTitle(
                    "Languages"
                );

                addBody(
                    resume.languages.join(
                        " • "
                    )
                );
            }


            // =================================================
            // INTERESTS
            // =================================================

            if (
                Array.isArray(
                    resume.interests
                ) &&
                resume.interests.length
            ) {

                addSectionTitle(
                    "Interests"
                );

                addBody(
                    resume.interests.join(
                        " • "
                    )
                );
            }


            doc.end();

        } catch (error) {

            reject(error);
        }
    });
}


module.exports = {
    extractText,
    generateResumePdf,
};