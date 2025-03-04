import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import { TABLE_NAME } from "../../utility/constants.js";

const Album = sequelize.define(
  TABLE_NAME.ALBUMS,
  {
    albumId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      references: {
        model: TABLE_NAME.USERS,
        key: "userId",
      },
      onUpdate: "cascade",
      onDelete: "cascade",
      allowNull: false,
    },
    faceId: {
      type: DataTypes.UUID,
      references: {
        model: TABLE_NAME.FACES,
        key: "faceId",
      },
      onUpdate: "cascade",
      onDelete: "cascade",
      allowNull: false,
    },
    imageId: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      defaultValue: [],
      allowNull: true,
    },
  },
  {
    tableName: TABLE_NAME.ALBUMS,
    timestamps: true,
    freezeTableName: true,
    paranoid: true,
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci",
  }
);

export default Album;
