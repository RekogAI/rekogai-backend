export const TABLE_NAME = {
  USERS: "users",
  IMAGES: "images",
  FACES: "faces",
  ALBUMS: "albums",
  FOLDERS: "folders",
  THUMBNAILS: "thumbnails",
  API_RESPONSES: "api_responses",
  TOKENS: "tokens",
};

export const IMAGE_STATUS = {
  PRESIGNED_URL_GENERATED: "PRESIGNED_URL_GENERATED",
  FAILED_TO_GENERATE_PRESIGNED_URL: "FAILED_TO_GENERATE_PRESIGNED_URL",
  UPLOAD_COMPLETED: "UPLOAD_COMPLETED",
  FACES_DETECTED: "FACES_DETECTED",
  NO_FACES_DETECTED: "NO_FACES_DETECTED",
  THUMBNAIL_GENERATED: "THUMBNAIL_GENERATED",
  FAILED_TO_GENERATE_THUMBNAIL: "FAILED_TO_GENERATE_THUMBNAIL",
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

export const getSeconds = (days, hours, minutes, seconds) => {
  return days * 24 * 60 * 60 + hours * 60 * 60 + minutes * 60 + seconds;
};

export const getMinutes = (days, hours, minutes) => {
  return days * 24 * 60 + hours * 60 + minutes;
};

export const getMilliseconds = (days, hours, minutes, seconds) => {
  return (
    (days * 24 * 60 * 60 + hours * 60 * 60 + minutes * 60 + seconds) * 1000
  );
};

export const TOKEN_TYPE = {
  REFRESH: "REFRESH",
  ACCESS: "ACCESS",
  ID: "ID",
};
