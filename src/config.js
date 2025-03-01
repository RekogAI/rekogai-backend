import dotenv from "dotenv";
dotenv.config();

const ENVIRONMENT = process.env.ENVIRONMENT;
const AWS_REGION = process.env.AWS_REGION;

const config = {
  development: {
    POSTGRES_CONFIG: {
      database: "myapp_db", // Replace with your database name
      username: "admin", // Replace with your RDS username
      password: "your_secure_password", // Replace with your RDS password
      host: "myapp-rds-instance.abc123xyz456.us-east-1.rds.amazonaws.com", // Replace with your RDS endpoint
      port: 5432, // Default PostgreSQL port
      dialect: "postgres", // Required for Sequelize
      pool: {
        max: 5, // Maximum number of connections in pool
        min: 0, // Minimum number of connections in pool
        idle: 10000, // Time (ms) before a connection is closed if idle
      },
      ssl: {
        rejectUnauthorized: false, // Set to true if you have a valid CA certificate
      },
    },
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID,
    COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
    AWS_SDK_CONFIG: {
      region: AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    },
  },
};

export default { config, ENVIRONMENT, AWS_REGION };
