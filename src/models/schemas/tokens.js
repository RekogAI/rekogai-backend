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
    },
    tokenType: {
      type: DataTypes.ENUM("ACCESS", "REFRESH", "ID"),
      allowNull: false,
    },
    generatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    expiredAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    isRevoked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    status: {
      type: DataTypes.ENUM("VALID", "INVALID"),
      allowNull: false,
      defaultValue: "VALID",
    },
    validityInMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment:
        "ACCESS_TOKEN validity is 30 minutes by default, REFRESH_TOKEN 24 hours, ID_TOKEN till user logs out or REFRESH_TOKEN expires",
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
