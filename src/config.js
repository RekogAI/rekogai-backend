import dotenv from "dotenv";
dotenv.config();

const ENVIRONMENT = process.env.ENVIRONMENT;
const AWS_REGION = process.env.AWS_REGION;

const corsOptions = {
  origin: "http://localhost:3000",
  credentials: true,
};

const config = {
  development: {
    POSTGRES_CONFIG: {
      DB_NAME: process.env.DB_NAME,
      DB_USER: process.env.DB_USER,
      DB_PASSWORD: process.env.DB_PASSWORD,
      DB_HOST: process.env.DB_HOST,
      DB_PORT: process.env.DB_PORT,
      dialect: "postgres",
      pool: {
        max: 5,
        min: 0,
        idle: 10000,
      },
      ssl: {
        rejectUnauthorized: false,
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
    REKOGNITION_AUTH_COLLECTION_ID: process.env.REKOGNITION_AUTH_COLLECTION_ID,
    REKOGNITION_AUTH_BUCKET_NAME: process.env.REKOGNITION_AUTH_BUCKET_NAME,
    PASSWORD_PEPPER: process.env.PASSWORD_PEPPER,
    SALT_ROUNDS: process.env.SALT_ROUNDS,
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
  },
  production: {
    POSTGRES_CONFIG: {
      DB_NAME: process.env.DB_NAME,
      DB_USER: process.env.DB_USER,
      DB_PASSWORD: process.env.DB_PASSWORD,
      DB_HOST: process.env.DB_HOST,
      DB_PORT: process.env.DB_PORT,
      dialect: "postgres",
      pool: {
        max: 5,
        min: 0,
        idle: 10000,
      },
      ssl: {
        rejectUnauthorized: false,
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
    REKOGNITION_AUTH_COLLECTION_ID: process.env.REKOGNITION_AUTH_COLLECTION_ID,
    REKOGNITION_AUTH_BUCKET_NAME: process.env.REKOGNITION_AUTH_BUCKET_NAME,
    PASSWORD_PEPPER: process.env.PASSWORD_PEPPER,
    SALT_ROUNDS: process.env.SALT_ROUNDS,
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
  },
};

export default { config, ENVIRONMENT, AWS_REGION, corsOptions };
