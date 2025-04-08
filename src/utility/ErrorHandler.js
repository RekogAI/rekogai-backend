import Logger from "../lib/Logger.js";

/**
 * Custom API error class with status code and additional details
 */
export class APIError extends Error {
  constructor(message, statusCode, errorCode = null, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true; // Flag to distinguish operational from programming errors

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error types with standard status codes and messages
 */
export const ErrorTypes = {
  BAD_REQUEST: (message = "Bad request") =>
    new APIError(message, 400, "BAD_REQUEST"),

  UNAUTHORIZED: (message = "Unauthorized access") =>
    new APIError(message, 401, "UNAUTHORIZED"),

  FORBIDDEN: (message = "Access forbidden") =>
    new APIError(message, 403, "FORBIDDEN"),

  NOT_FOUND: (message = "Resource not found") =>
    new APIError(message, 404, "NOT_FOUND"),

  CONFLICT: (message = "Resource conflict") =>
    new APIError(message, 409, "CONFLICT"),

  VALIDATION_ERROR: (message = "Validation failed", details = null) =>
    new APIError(message, 422, "VALIDATION_ERROR", details),

  INTERNAL_ERROR: (message = "Internal server error") =>
    new APIError(message, 500, "INTERNAL_ERROR"),

  SERVICE_UNAVAILABLE: (message = "Service unavailable") =>
    new APIError(message, 503, "SERVICE_UNAVAILABLE"),

  // Authentication specific errors
  AUTH_USER_NOT_FOUND: () =>
    new APIError(
      "User not found. Please check your credentials and try again.",
      404,
      "AUTH_USER_NOT_FOUND"
    ),

  AUTH_INVALID_CREDENTIALS: () =>
    new APIError(
      "Invalid username or password.",
      401,
      "AUTH_INVALID_CREDENTIALS"
    ),

  AUTH_USER_NOT_CONFIRMED: () =>
    new APIError(
      "User is not confirmed. Please verify your account first.",
      403,
      "AUTH_USER_NOT_CONFIRMED"
    ),

  AUTH_LIMIT_EXCEEDED: () =>
    new APIError(
      "Too many attempts. Please try again later.",
      429,
      "AUTH_LIMIT_EXCEEDED"
    ),
};

/**
 * Error handler for standardizing error responses
 */
export const handleError = (error, req = null) => {
  // Log the error
  Logger.error(error.message, {
    errorName: error.name,
    statusCode: error.statusCode || 500,
    errorCode: error.errorCode,
    stack: error.stack,
    requestDetails: req
      ? {
          path: req.path,
          method: req.method,
          query: req.query,
          body: req.body
            ? JSON.stringify(req.body).substring(0, 200)
            : undefined,
        }
      : null,
  });

  // Map AWS Cognito errors to our custom error types
  if (error.name === "UserNotFoundException") {
    return ErrorTypes.AUTH_USER_NOT_FOUND();
  } else if (error.name === "NotAuthorizedException") {
    return ErrorTypes.AUTH_INVALID_CREDENTIALS();
  } else if (error.name === "UserNotConfirmedException") {
    return ErrorTypes.AUTH_USER_NOT_CONFIRMED();
  } else if (error.name === "LimitExceededException") {
    return ErrorTypes.AUTH_LIMIT_EXCEEDED();
  }

  // If it's already an APIError, return it
  if (error instanceof APIError) {
    return error;
  }

  // Otherwise, wrap it in an INTERNAL_ERROR
  return ErrorTypes.INTERNAL_ERROR(error.message);
};

/**
 * Response formatter for successful operations
 */
export const formatSuccessResponse = (
  data = null,
  message = "Operation successful"
) => {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
};

/**
 * Response formatter for failed operations
 */
export const formatErrorResponse = (error) => {
  const apiError = error instanceof APIError ? error : handleError(error);

  return {
    success: false,
    message: apiError.message,
    statusCode: apiError.statusCode,
    errorCode: apiError.errorCode,
    details: apiError.details,
    timestamp: new Date().toISOString(),
  };
};
