import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import { TABLE_NAME } from "../../utility/constants.js";

const Folder = sequelize.define(
  TABLE_NAME.FOLDERS,
  {
    folderId: {
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
    folderName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    folderPath: {
      type: DataTypes.STRING(1024),
      allowNull: false,
    },
    parentFolderId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: TABLE_NAME.FOLDERS,
        key: "folderId",
      },
      onUpdate: "cascade",
      onDelete: "set null",
    },
    isRoot: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    totalItems: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    totalSize: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "in bytes",
    },
  },
  {
    tableName: TABLE_NAME.FOLDERS,
    timestamps: true,
    freezeTableName: true,
    paranoid: true,
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci",
  }
);

export default Folder;
