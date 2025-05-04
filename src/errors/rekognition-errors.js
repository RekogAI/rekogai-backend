import Logger from "../lib/Logger.js";

class RekognitionError extends Error {
  constructor(message, statusCode, errorType) {
    super(message);
    this.name = "RekognitionError";
    this.statusCode = statusCode;
    this.errorType = errorType;
  }
}

export const handleRekognitionError = (error) => {
  console.error("Rekognition Error:", error);

  // Extract error name
  const errorName = error.name || "UnknownError";

  // Client-side errors (400 range)
  const clientErrors = {
    InvalidParameterException: {
      message: "The face image provided is invalid or unsupported",
      statusCode: 400,
    },
    ProvisionedThroughputExceededException: {
      message:
        "Face recognition service is currently busy, please try again later",
      statusCode: 429,
    },
    InvalidImageFormatException: {
      message: "The face image format is not supported",
      statusCode: 400,
    },
    ImageTooLargeException: {
      message: "The face image is too large, maximum size is 5MB",
      statusCode: 400,
    },
    AccessDeniedException: {
      message: "Access denied to face recognition service",
      statusCode: 403,
    },
    ThrottlingException: {
      message: "Request rate limit exceeded, please try again later",
      statusCode: 429,
    },
    LimitExceededException: {
      message: "Service limit has been exceeded",
      statusCode: 400,
    },
    ResourceNotFoundException: {
      message: "The specified collection does not exist",
      statusCode: 404,
    },
    InvalidS3ObjectException: {
      message: "The image in S3 cannot be accessed or is invalid",
      statusCode: 400,
    },
    VideoTooLargeException: {
      message: "The video size is too large",
      statusCode: 400,
    },
    InvalidPaginationTokenException: {
      message: "Invalid pagination token",
      statusCode: 400,
    },
    FaceDetectionModelPerformanceExceededException: {
      message: "Face detection model performance limit exceeded",
      statusCode: 400,
    },
    ResourceAlreadyExistsException: {
      message: "The resource already exists",
      statusCode: 409,
    },
  };

  // Server-side errors (500 range)
  const serverErrors = {
    InternalServerError: {
      message: "An internal error occurred in the face recognition service",
      statusCode: 500,
    },
    ServiceQuotaExceededException: {
      message: "Service quota has been exceeded",
      statusCode: 500,
    },
  };

  // Find the specific error or use default
  const errorDetails = clientErrors[errorName] ||
    serverErrors[errorName] || {
      message: `An error occurred with face recognition: ${error.message || "Unknown error"}`,
      statusCode: error.statusCode || 500,
    };

  return new RekognitionError(
    errorDetails.message,
    errorDetails.statusCode,
    errorName
  );
};
