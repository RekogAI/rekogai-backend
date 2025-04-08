import Logger from "../lib/Logger.js";

class CognitoError extends Error {
  constructor(message, statusCode, errorType) {
    super(message);
    this.name = "CognitoError";
    this.statusCode = statusCode;
    this.errorType = errorType;
  }
}

export const handleCognitoError = (error) => {
  Logger.error("Cognito Error:", error);

  // Extract error name
  const errorName = error.name || "UnknownError";

  // Client-side errors (400 range)
  const clientErrors = {
    // General Errors
    CodeDeliveryFailureException: {
      message: "Code delivery failed",
      statusCode: 400,
    },
    ForbiddenException: {
      message: "Access denied by WAF rules",
      statusCode: 403,
    },
    InvalidParameterException: {
      message: "One or more parameters are invalid",
      statusCode: 400,
    },
    NotAuthorizedException: {
      message: "Invalid username or password",
      statusCode: 401,
    },
    ResourceNotFoundException: {
      message: "The requested resource was not found",
      statusCode: 404,
    },
    TooManyRequestsException: {
      message: "Too many requests, please try again later",
      statusCode: 429,
    },
    UserNotFoundException: {
      message: "User does not exist",
      statusCode: 404,
    },

    // Sign-in specific errors
    PasswordResetRequiredException: {
      message: "Password reset is required",
      statusCode: 400,
    },
    UserNotConfirmedException: {
      message: "User is not confirmed",
      statusCode: 400,
    },

    // Email/SMS related errors
    InvalidEmailRoleAccessPolicyException: {
      message: "Email identity access issue",
      statusCode: 400,
    },
    InvalidSmsRoleAccessPolicyException: {
      message: "SMS configuration access issue",
      statusCode: 400,
    },
    InvalidSmsRoleTrustRelationshipException: {
      message: "SMS role trust issue",
      statusCode: 400,
    },
    InvalidUserPoolConfigurationException: {
      message: "User pool configuration is invalid",
      statusCode: 400,
    },

    // Lambda related errors
    InvalidLambdaResponseException: {
      message: "Invalid Lambda response",
      statusCode: 400,
    },
    UnexpectedLambdaException: {
      message: "Unexpected Lambda error",
      statusCode: 400,
    },
    UserLambdaValidationException: {
      message: "Lambda validation failed",
      statusCode: 400,
    },

    // Confirmation code specific errors
    CodeMismatchException: {
      message: "The verification code is incorrect",
      statusCode: 400,
    },
    ExpiredCodeException: {
      message: "The verification code has expired",
      statusCode: 400,
    },

    // User registration specific errors
    AliasExistsException: {
      message: "An account with this email or phone number already exists",
      statusCode: 409,
    },
    LimitExceededException: {
      message: "Limit exceeded for the requested resource",
      statusCode: 400,
    },
    TooManyFailedAttemptsException: {
      message: "Too many failed attempts, please try again later",
      statusCode: 400,
    },
    UsernameExistsException: {
      message: "Username already exists",
      statusCode: 409,
    },
  };

  // Server-side errors (500 range)
  const serverErrors = {
    InternalErrorException: {
      message: "An internal server error occurred",
      statusCode: 500,
    },
  };

  // Find the specific error or use default
  const errorDetails = clientErrors[errorName] ||
    serverErrors[errorName] || {
      message: `An error occurred: ${error.message || "Unknown error"}`,
      statusCode: error.statusCode || 500,
    };

  return new CognitoError(
    errorDetails.message,
    errorDetails.statusCode,
    errorName
  );
};
