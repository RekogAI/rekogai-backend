import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import { TABLE_NAME } from "../../utility/constants.js";

const User = sequelize.define(
  TABLE_NAME.USERS,
  {
    userId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    registrationMethod: {
      type: DataTypes.ENUM("EMAIL", "FACE_ID"),
      defaultValue: "EMAIL",
      allowNull: false,
    },
    lastLoginMethod: {
      type: DataTypes.ENUM("EMAIL", "FACE_ID"),
      allowNull: true,
    },
    faceImageUrl: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    isEmailVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: TABLE_NAME.USERS, // Specifies the exact table name, preventing Sequelize from modifying it
    timestamps: true, // Enables createdAt and updatedAt columns for tracking record changes
    freezeTableName: true, // Prevents Sequelize from pluralizing or altering the table name
    paranoid: true, // Enables soft deletion with a deletedAt timestamp instead of permanent deletion
    charset: "utf8mb4", // Sets UTF-8 MB4 character set for full Unicode support, including emojis
    collate: "utf8mb4_unicode_ci", // Sets case-insensitive Unicode collation for consistent string handling
  }
);

export default User;
