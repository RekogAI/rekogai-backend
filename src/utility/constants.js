export const TABLE_NAME = {
  USERS: "users",
  IMAGES: "images",
  FACES: "faces",
  ALBUMS: "albums",
  COLLECTIONS: "collections",
  FOLDERS: "folders",
  THUMBNAILS: "thumbnails",
  API_RESPONSES: "api_responses",
};

export const S3_OBJECT_UPLOAD_STATUS = {
  PRESIGNED_URL_GENERATED: "PRESIGNED_URL_GENERATED",
  FAILED_TO_GENERATE_PRESIGNED_URL: "FAILED_TO_GENERATE_PRESIGNED_URL",
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
