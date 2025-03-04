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
    fileName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    fileSizeInKiloBytes: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    fileMIMEtype: {
      type: DataTypes.ENUM("JPEG", "PNG"),
      allowNull: false,
    },
    fileStatus: {
      type: DataTypes.ENUM(
        "PRESIGNED_URL_GENERATED",
        "FAILED_TO_GENERATE_PRESIGNED_URL",
        "UPLOADED_TO_S3",
        "FAILED_TO_UPLOAD_TO_S3",
        "FACES_DETECTED",
        "FACES_INDEXED"
      ),
      allowNull: false,
    },
    fileLocationInS3: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    signedUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    signedUrlGenerationTimestamp: {
      type: DataTypes.DATE,
      allowNull: true,
      get() {
        const value = this.getDataValue("signedUrlGenerationTimestamp");
        return value ? value.toISOString().replace('T', ' ').substring(0, 19) : null;
      },
      set(value) {
        this.setDataValue(
          "signedUrlGenerationTimestamp",
          new Date(value)
        );
      },
    },
    signedUrlExpirationTimestamp: {
      type: DataTypes.DATE,
      allowNull: true,
      get() {
        const value = this.getDataValue("signedUrlExpirationTimestamp");
        return value ? value.toISOString().replace('T', ' ').substring(0, 19) : null;
      },
      set(value) {
        this.setDataValue(
          "signedUrlExpirationTimestamp",
          new Date(value)
        );
      },
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
