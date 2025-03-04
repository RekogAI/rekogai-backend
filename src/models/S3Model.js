import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import configObj from "../config.js";
const { config, ENVIRONMENT, AWS_REGION } = configObj;
import { generateUUID } from "../utility/index.js";
import {
  PRESIGNED_URL_EXPIRES_IN,
  IMAGE_STATUS,
} from "../utility/constants.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import Logger from "../lib/Logger.js";
import Image from "./index.js";

const s3Client = new S3Client(config[ENVIRONMENT].AWS_SDK_CONFIG);

const savePreUploadImageDetails = async ({
  signedUrl,
  fileDetails,
  userId,
  imageId,
}) => {
  // check if the image is already uploaded with same name then return the details
  const existingImage = await Image.findOne({
    where: {
      fileName: fileDetails.fileName,
      userId,
    },
  });
  if (existingImage) {
    Logger.info("Image already uploaded with same name:", existingImage);
    return existingImage;
  }
  // Save the photo details to PostgreSQL
  try {
    const createdImageDetails = await Image.create({
      imageId,
      userId,
      fileName: fileDetails.fileName,
      fileMIMEtype: fileDetails.fileType,
      fileSizeInKiloBytes: fileDetails.fileSize,
      fileStatus: IMAGE_STATUS.PRESIGNED_URL_GENERATED,
      signedUrl,
      signedUrlGenerationTimestamp: new Date(),
      signedUrlExpirationTimestamp: new Date(
        Date.now() + PRESIGNED_URL_EXPIRES_IN.AN_HOUR * 1000 // in milliseconds
      ),
    });
    Logger.info("Image details saved to PostgreSQL:", createdImageDetails);

    return createdImageDetails;
  } catch (error) {
    Logger.error("Error saving image details to PostgreSQL ", error);
    throw error;
  }
};

const generatePreSignedURL = async ({ bucketName, fileDetails, userId }) => {
  const imageId = generateUUID();
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: imageId,
  });

  const signedUrl = await getSignedUrl(s3Client, command, {
    expiresIn: PRESIGNED_URL_EXPIRES_IN.AN_HOUR, // in seconds
  });

  Logger.info("Signed URL:", signedUrl);

  // Save the photo details to PostgreSQL
  try {
    const savedImageDetails = await savePreUploadImageDetails({
      signedUrl,
      fileDetails,
      userId,
      imageId,
    });

    return {
      ...savedImageDetails,
      preSignedURL: signedUrl,
    };
  } catch (error) {
    Logger.error(
      "Error generating pre-signed URL or saving to DynamoDB:",
      error
    );
    return {
      preSignedURL: null,
      photoId: null,
      fileStatus: IMAGE_STATUS.FAILED_TO_GENERATE_PRESIGNED_URL,
    };
  }
};

export { generatePreSignedURL };
