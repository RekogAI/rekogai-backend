import dotenv from "dotenv";
dotenv.config();

const ENVIRONMENT = process.env.ENVIRONMENT;
const AWS_REGION = process.env.AWS_REGION;

const config = {
  development: {
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
