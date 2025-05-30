export const TABLE_NAME = {
  USERS: "users",
  IMAGES: "images",
  FACES: "faces",
  ALBUMS: "albums",
  COLLECTIONS: "collections",
  FOLDERS: "folders",
  THUMBNAILS: "thumbnails",
  API_RESPONSES: "api_responses",
  TOKENS: "tokens",
};

export const IMAGE_STATUS = {
  PRESIGNED_URL_GENERATED: "PRESIGNED_URL_GENERATED",
  FAILED_TO_GENERATE_PRESIGNED_URL: "FAILED_TO_GENERATE_PRESIGNED_URL",
  UPLOADED_TO_S3: "UPLOADED_TO_S3",
  FAILED_TO_UPLOAD_TO_S3: "FAILED_TO_UPLOAD_TO_S3",
  FACES_DETECTED: "FACES_DETECTED",
  NO_FACES_DETECTED: "NO_FACES_DETECTED",
  FACES_INDEXED: "FACES_INDEXED",
};

export const PRESIGNED_URL_EXPIRES_IN = {
  AN_HOUR: 60 * 60,
  HALF_AN_HOUR: 60 * 30,
  FIFTEEN_MINUTES: 60 * 15,
};

export const API_TYPES = {
  DETECT_LABELS: { key: "DETECT_LABELS", value: "DetectLabels" },
  SEARCH_FACES_BY_IMAGE: {
    key: "SEARCH_FACES_BY_IMAGE",
    value: "SearchFacesByImage",
  },
  INDEX_FACES: { key: "INDEX_FACES", value: "IndexFaces" },
};

export const SIGN_UP_METHODS = {
  FACE_ID: "FACE_ID",
  EMAIL: "EMAIL",
};

export const TOKEN_VALIDITY_IN_MINUTES = {
  "30_MINUTES": 30,
  "24_HOURS": 60 * 24,
  "30_DAYS": 60 * 24 * 30,
  "1_YEAR": 60 * 24 * 365,
};

export const TOKEN_VALIDITY_IN_MILLISECONDS = {
  "30_MINUTES": 3600 * 30,
  "24_HOURS": 3600 * 60 * 24,
  "30_DAYS": 3600 * 60 * 24 * 30,
  "1_YEAR": 3600 * 60 * 24 * 365,
};

export const TOKEN_TYPE = {
  REFRESH: "REFRESH",
  ACCESS: "ACCESS",
  ID: "ID",
};
