import { Sequelize } from "sequelize";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();
import configObj from "../config.js";
const { config, ENVIRONMENT } = configObj;

const sequelize = new Sequelize(
  config[ENVIRONMENT].POSTGRES_CONFIG.DB_NAME,
  config[ENVIRONMENT].POSTGRES_CONFIG.DB_USER,
  config[ENVIRONMENT].POSTGRES_CONFIG.DB_PASSWORD,
  {
    dialect: "postgres",
    host: config[ENVIRONMENT].POSTGRES_CONFIG.DB_HOST,
    port: config[ENVIRONMENT].POSTGRES_CONFIG.DB_PORT,
    logging: ENVIRONMENT === "development" ? false : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: true,
        ca: [fs.readFileSync("src/config/ap-south-1-bundle.pem").toString()],
      },
    },
  }
);

sequelize
  .authenticate()
  .then(() => {
    console.log("Connection has been established successfully.");
  })
  .catch((error) => {
    console.error("Unable to connect to the database:", error);
  });

// (async () => {
//   try {
//     console.log(config[ENVIRONMENT].POSTGRES_CONFIG, "[DB]");
//     await sequelize.authenticate();
//     console.log("Database connection established successfully.");
//   } catch (error) {
//     console.error("Unable to connect to the database:", error);
//   }
// })();

// sequelize.on("error", (err) => {
//   console.error("Unexpected error on Sequelize connection:", err);
//   process.exit(-1);
// });

export default sequelize;
