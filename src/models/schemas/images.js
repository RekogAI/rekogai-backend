import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import { TABLE_NAME } from "../../utility/constants.js";

const Image = sequelize.define(
  TABLE_NAME.IMAGES,
  {
    imageId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: TABLE_NAME.USERS,
        key: "userId",
      },
      onUpdate: "cascade",
      onDelete: "cascade",
    },
    folderId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: TABLE_NAME.FOLDERS,
        key: "folderId",
      },
      onUpdate: "cascade",
      onDelete: "set null",
      comment: "The folder in which the image is stored",
    },
    rekognitionAPICallCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      comment: "The number of times the API was called for this image",
    },
    fileName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    fileSizeInKiloBytes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "The size of the image file in kilobytes",
    },
    fileMIMEtype: {
      type: DataTypes.ENUM("JPEG", "PNG"),
      allowNull: false,
      comment: "The MIME type of the image file",
    },
    fileStatus: {
      type: DataTypes.ENUM(
        "PRESIGNED_URL_GENERATED",
        "FAILED_TO_GENERATE_PRESIGNED_URL",
        "UPLOADED_TO_S3",
        "FAILED_TO_UPLOAD_TO_S3",
        "FACES_DETECTED",
        "NO_FACES_DETECTED",
        "FACES_INDEXED"
      ),
      allowNull: false,
      comment: "The status of the image file",
    },
    fileLocationInS3: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "The location of the image file in S3",
    },
    signedUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "The pre-signed URL for uploading the image to S3",
    },
    signedUrlGenerationTimestamp: {
      type: DataTypes.DATE,
      allowNull: true,
      get() {
        const value = this.getDataValue("signedUrlGenerationTimestamp");
        return value
          ? value.toISOString().replace("T", " ").substring(0, 19)
          : null;
      },
      set(value) {
        this.setDataValue("signedUrlGenerationTimestamp", new Date(value));
      },
      comment: "The time when the signed URL was generated",
    },
    signedUrlExpirationTimestamp: {
      type: DataTypes.DATE,
      allowNull: true,
      get() {
        const value = this.getDataValue("signedUrlExpirationTimestamp");
        return value
          ? value.toISOString().replace("T", " ").substring(0, 19)
          : null;
      },
      set(value) {
        this.setDataValue("signedUrlExpirationTimestamp", new Date(value));
      },
      comment: "The time when the signed URL expires",
    },
    uploadedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      get() {
        const value = this.getDataValue("uploadedAt");
        return value
          ? value.toISOString().replace("T", " ").substring(0, 19)
          : null;
      },
      set(value) {
        this.setDataValue("uploadedAt", new Date(value));
      },
      comment: "The time when the image was uploaded to S3",
    },

    facesDetected: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: true,
    },
    facesDetectedCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: true,
    },
    SearchFacesByImageResponse: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    facesMatchedInCollectionCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: true,
    },
    matchedFaceIds: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      allowNull: true,
      defaultValue: [],
    },
    skippedFacesIndexing: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: true,
    },
    facesIndexedCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    facesIndexingFailedCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    facesIndexingFailedReasons: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: [],
    },
    IndexFacesResponse: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    tableName: TABLE_NAME.IMAGES,
    timestamps: true,
    freezeTableName: true,
    paranoid: true,
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci",
  }
);

export default Image;
