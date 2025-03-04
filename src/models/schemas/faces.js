import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import { TABLE_NAME } from "../../utility/constants.js";

const Face = sequelize.define(
  TABLE_NAME.FACES,
  {
    faceId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    imageId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: TABLE_NAME.IMAGES,
        key: "imageId",
      },
      onUpdate: "cascade",
      onDelete: "cascade",
    },
    collectionId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: TABLE_NAME.COLLECTIONS,
        key: "collectionId",
      },
      onUpdate: "cascade",
      onDelete: "cascade",
    },
    facePopularityScore: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Face popularity count",
    },
    externalImageId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "External Image Id",
    },

    // Face Detail's
    ageRange: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Age range of the face",
    },
    gender: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "",
    },
    confidence: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Confidence of the face",
    },
    emotions: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Emotions of the face",
    },
    beard: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Beard of the face",
    },
    mustache: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Mustache of the face",
    },
    occluded: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Occluded of the face",
    },
    imageQuality: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Image quality of the face",
    },
    smile: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Smile of the face",
    },
    sunglasses: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Sunglasses of the face",
    },
    pose: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Pose of the face",
    },

    faceRecordDetails: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: "Face details from AWS Rekognition",
    },
  },
  {
    tableName: TABLE_NAME.FACES,
    timestamps: true,
    freezeTableName: true,
    paranoid: true,
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci",
  }
);

export default Face;
