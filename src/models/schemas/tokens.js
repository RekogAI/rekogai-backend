import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import { TABLE_NAME } from "../../utility/constants.js";

const Token = sequelize.define(
  TABLE_NAME.TOKENS,
  {
    tokenId: {
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
    token: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    tokenType: {
      type: DataTypes.ENUM("ACCESS", "REFRESH", "ID"),
      allowNull: false,
    },
    authMethod: {
      type: DataTypes.ENUM("EMAIL", "FACE_ID"),
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    isRevoked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: TABLE_NAME.TOKENS,
    timestamps: true,
    freezeTableName: true,
    paranoid: true,
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci",
  }
);

export default Token;
