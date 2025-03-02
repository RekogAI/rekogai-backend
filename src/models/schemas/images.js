import { Sequelize, DataTypes } from "sequelize";
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
