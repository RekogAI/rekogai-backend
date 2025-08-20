import {
  RekognitionClient,
  DetectFacesCommand,
  SearchFacesCommand,
  IndexFacesCommand,
  CreateCollectionCommand,
  SearchFacesByImageCommand,
  CompareFacesCommand,
} from "@aws-sdk/client-rekognition";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsCommand,
} from "@aws-sdk/client-s3";
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  ResendConfirmationCodeCommand,
  GlobalSignOutCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import configObj from "../config.js";

const { config, ENVIRONMENT } = configObj;

// Initialize AWS clients
const rekognitionClient = new RekognitionClient(
  config[ENVIRONMENT].AWS_SDK_CONFIG
);

const s3Client = new S3Client(config[ENVIRONMENT].AWS_SDK_CONFIG);

const cognitoClient = new CognitoIdentityProviderClient(
  config[ENVIRONMENT].AWS_SDK_CONFIG
);

// Export clients and commands
export {
  // Clients
  rekognitionClient,
  s3Client,
  cognitoClient,

  // Rekognition Commands
  DetectFacesCommand,
  SearchFacesCommand,
  IndexFacesCommand,
  CreateCollectionCommand,
  SearchFacesByImageCommand,
  CompareFacesCommand,

  // S3 Commands
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsCommand,

  // Cognito Commands
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  ResendConfirmationCodeCommand,
  GlobalSignOutCommand,
};
