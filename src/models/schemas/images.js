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
      type: DataTypes.STRING(50),
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
    },
    // Simplified face detection data
    hasDetectedFaces: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    faceCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    imageQuality: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    // JSON columns for complex data
    faceData: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Contains face detection info, matches and indexing results",
    },
    imageMetadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Contains general image metadata, URLs, processing dates",
    },
    processingResults: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Contains AWS API response data and processing results",
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
