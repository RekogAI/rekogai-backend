import { DataTypes } from "sequelize";
import { TABLE_NAME } from "../../utility/constants.js";
import sequelize from "../../config/database.js";

const Thumbnail = sequelize.define(
  TABLE_NAME.THUMBNAILS,
  {
    thumbnailId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    faceId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: TABLE_NAME.FACES,
        key: "faceId",
      },
      onUpdate: "cascade",
      onDelete: "cascade",
      comment: "Face ID",
    },
    s3ThumbnailURL: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: "S3 URL of the thumbnail",
    },
  },
  {
    tableName: TABLE_NAME.THUMBNAILS,
    timestamps: true,
    freezeTableName: true,
    paranoid: true,
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci",
  }
);

export default Thumbnail;
