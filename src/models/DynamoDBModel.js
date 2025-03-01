import { Sequelize, DataTypes } from "sequelize";
import Logger from "../lib/Logger.js";
import configObj from "../config.js";
const { config, ENVIRONMENT } = configObj;
import S3Model from "./S3Model.js";
import { TABLE_NAME } from "../utility/constants.js";
import { generateUUID } from "../utility/index.js";
import moment from "moment";
import RekognitionModel from "./RekognitionModel.js";

// Sequelize setup
const sequelize = new Sequelize({
  ...config[ENVIRONMENT].POSTGRES_CONFIG,
  dialect: "postgres",
  logging: false,
});

// Define Sequelize Models
const User = sequelize.define(
  TABLE_NAME.USERS,
  {
    userId: {
      type: DataTypes.STRING(36),
      primaryKey: true,
      defaultValue: generateUUID,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.fn("NOW"),
    },
  },
  {
    timestamps: false,
    indexes: [{ unique: true, fields: ["email"] }],
  }
);

const Photo = sequelize.define(
  TABLE_NAME.IMAGES,
  {
    imageId: {
      type: DataTypes.STRING(36),
      primaryKey: true,
      defaultValue: generateUUID,
    },
    bucketKey: {
      type: DataTypes.STRING(36),
      allowNull: false,
    },
  },
  {
    timestamps: true,
    // indexes: [{ fields: ["bucketId"] }],
  }
);

const Face = sequelize.define(
  TABLE_NAME.FACES,
  {
    faceId: {
      type: DataTypes.STRING(36),
      primaryKey: true,
      defaultValue: generateUUID,
    },
    collectionId: {
      type: DataTypes.STRING(36),
      allowNull: false,
    },
  },
  {
    timestamps: false,
    indexes: [{ fields: ["collectionId"] }],
  }
);

class SequelizeModel {
  constructor() {
    this.sequelize = sequelize;
    this.s3Model = new S3Model();
    this.rekognitionClient = new RekognitionModel();
  }

  async createUsersTable() {
    try {
      await User.sync({ force: false }); // force: false ensures it doesn't drop the table if it exists
      Logger.info("Users table created or already exists.");
    } catch (error) {
      Logger.error("Error creating Users table:", error.message);
      throw error;
    }
  }

  async createPhotosTable() {
    try {
      await Photo.sync({ force: false });
      Logger.info("Photos table created or already exists.");
    } catch (error) {
      Logger.error("Error creating Photos table:", error.message);
      throw error;
    }
  }

  async createFacesTable() {
    try {
      await Face.sync({ force: false });
      Logger.info("Faces table created or already exists.");
    } catch (error) {
      Logger.error("Error creating Faces table:", error.message);
      throw error;
    }
  }

  /**
   * Initialize all tables
   */
  async initializeTables() {
    try {
      await this.createUsersTable();
      await this.createPhotosTable();
      await this.createFacesTable();
      Logger.info("All tables initialized successfully.");
    } catch (error) {
      Logger.error("Error initializing tables:", error.message);
      throw error;
    }
  }

  // Close the Sequelize connection when done
  async close() {
    await this.sequelize.close();
    Logger.info("Sequelize connection closed.");
  }
}

export default SequelizeModel;
