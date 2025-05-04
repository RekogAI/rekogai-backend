export const API_ERROR_CODES = {
  FACE_ALREADY_EXISTS: "FACE_ALREADY_EXISTS",
  INVALID_METHOD: "INVALID_METHOD",
  USER_EXISTS_WITH_DIFFERENT_METHOD: "USER_EXISTS_WITH_DIFFERENT_METHOD",
  USER_ALREADY_EXISTS: "USER_ALREADY_EXISTS",
  FACE_ALREADY_REGISTERED: "FACE_ALREADY_REGISTERED",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  INVALID_TOKEN: "INVALID_TOKEN",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  FACE_MISMATCH: "FACE_MISMATCH",
  INVALID_PARAMETERS: "INVALID_PARAMETERS",
  NO_FACE_FOUND: "NO_FACE_FOUND",
  MULTIPLE_FACES_FOUND: "MULTIPLE_FACES_FOUND",
  INVALID_IMAGE: "INVALID_IMAGE",
};

export const API_ERROR_MESSAGES = {
  FACE_ALREADY_EXISTS: "Face already exists in the collection",
  INVALID_METHOD: "Invalid registration method",
  USER_EXISTS_WITH_DIFFERENT_METHOD:
    "User already exists with face ID registration method",
  INVALID_IMAGE: "Invalid image provided",
  USER_ALREADY_EXISTS: "User already exists",
  FACE_ALREADY_REGISTERED: "Face already registered, try another face",
  USER_NOT_FOUND: "User not found",
  INVALID_TOKEN: "Invalid token",
  INVALID_TOKEN_PROVIDED: "No refresh token provided",
  TOKEN_EXPIRED: "Refresh token expired",
  FACE_MISMATCH: "Face verification failed",
  INVALID_PARAMETERS: "Invalid parameters provided",
  NO_FACE_FOUND: "No face found in the image",
  MULTIPLE_FACES_FOUND: "Multiple faces found in the image",
};

export const API_ERROR_STATUS_CODES = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
};
