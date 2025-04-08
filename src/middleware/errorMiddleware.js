import { formatErrorResponse, APIError } from "../utility/ErrorHandler.js";

/**
 * Global error handler middleware for Express
 */
export const errorHandler = (err, req, res, next) => {
  // If the error is not an APIError, convert it
  const error =
    err instanceof APIError
      ? err
      : new APIError(
          err.message || "Internal Server Error",
          err.statusCode || 500,
          err.code || "INTERNAL_ERROR"
        );

  // Format the error response
  const errorResponse = formatErrorResponse(error);

  // Send the response
  res.status(error.statusCode).json(errorResponse);
};

/**
 * Middleware to handle 404 Not Found errors
 */
export const notFoundHandler = (req, res, next) => {
  const error = new APIError(
    `Not Found - ${req.originalUrl}`,
    404,
    "NOT_FOUND"
  );
  next(error);
};
