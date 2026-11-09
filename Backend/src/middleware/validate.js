const ApiError = require("../utils/ApiError");

const validate =
    (schema, source = "body") =>
    (req, res, next) => {
        const result = schema.safeParse(req[source])
        if (!result.success) {

            console.log("========== VALIDATION ERROR ==========");
            console.log("SOURCE:", source);
            console.log("RECEIVED DATA:", req[source]);
            console.log("ZOD ISSUES:", result.error.issues);
            console.log("======================================");

            console.log("VALIDATION ERRORS:", result.error.issues);

            return next(
                ApiError.badRequest(
                    "Validation failed",
                    result.error.issues
                )
            );
        }
        req[source] = result.data;
        next();

};

module.exports = { validate };