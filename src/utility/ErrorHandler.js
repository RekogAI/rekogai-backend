export class ApiError extends Error {
  constructor(
    statusCode,
    message,
    errorCode = "GENERAL_ERROR",
    details = null
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  // Convert to a standardized response format
  toResponse() {
    return {
      success: false,
      error: {
        status: this.statusCode,
        code: this.errorCode,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

// Helper function to create and throw API errors
export const throwApiError = (
  statusCode,
  message,
  errorCode,
  details = null
) => {
  throw new ApiError(statusCode, message, errorCode, details);
};

// Helper function to create but NOT throw API errors (for more explicit control)
export const createApiError = (
  statusCode,
  message,
  errorCode,
  details = null
) => {
  return new ApiError(statusCode, message, errorCode, details);
};
