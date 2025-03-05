import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import configObj from "../config.js";
import { generateUUID } from "../utility/index.js";
import {
  PRESIGNED_URL_EXPIRES_IN,
  IMAGE_STATUS,
} from "../utility/constants.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import Logger from "../lib/Logger.js";
import { Image } from "./index.js";

const { config, ENVIRONMENT } = configObj;
const s3Client = new S3Client(config[ENVIRONMENT].AWS_SDK_CONFIG);

const savePreUploadImageDetails = async ({
  signedUrl,
  fileDetails,
  userId,
  imageId,
  folderId,
}) => {
  try {
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

    const createdImageDetails = await Image.create({
      userId,
      folderId,
      imageId,
      fileName: fileDetails.fileName,
      fileMIMEtype: fileDetails.fileType,
      fileSizeInKiloBytes: fileDetails.fileSize,
      fileStatus: IMAGE_STATUS.PRESIGNED_URL_GENERATED,
      signedUrl,
      signedUrlGenerationTimestamp: new Date(),
      signedUrlExpirationTimestamp: new Date(
        Date.now() + PRESIGNED_URL_EXPIRES_IN.AN_HOUR * 1000
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

  try {
    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: PRESIGNED_URL_EXPIRES_IN.AN_HOUR,
    });

    Logger.info("Signed URL:", signedUrl);

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
      "Error generating pre-signed URL or saving to PostgreSQL:",
      error
    );
    return {
      preSignedURL: null,
      photoId: null,
      fileStatus: IMAGE_STATUS.FAILED_TO_GENERATE_PRESIGNED_URL,
    };
  }
};

const savePostUploadImageDetails = async ({ imageId, fileLocationInS3 }) => {
  // Save image details to PostgreSQL
  try {
    await Image.update(
      {
        fileLocationInS3,
        fileStatus: IMAGE_STATUS.UPLOADED,
        uploadedAt: new Date(),
      },
      {
        where: { imageId },
      }
    );
    Logger.info("Image details saved to PostgreSQL:", {
      imageId,
      fileLocationInS3,
    });

    return {
      fileStatus: IMAGE_STATUS.UPLOADED,
      uploadedAt: new Date(),
    };
  } catch (error) {
    Logger.error(" savePostUploadImageDetails error", error);
    return {
      fileStatus: IMAGE_STATUS.FAILED_TO_UPLOAD_TO_S3,
      uploadedAt: null,
    };
  }
};

const S3Model = {
  generatePreSignedURL,
  savePostUploadImageDetails,
};

export default S3Model;
