import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import { TABLE_NAME } from "../../utility/constants.js";

const Image = sequelize.define(
  TABLE_NAME.API_RESPONSES,
  {
    id: {
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
    type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: "Type of the API",
    },
    response: {
      type: DataTypes.JSON,
      allowNull: false,
    },
  },
  {
    tableName: TABLE_NAME.API_RESPONSES,
    timestamps: true,
    freezeTableName: true,
    paranoid: true,
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci",
  }
);

export default Image;
