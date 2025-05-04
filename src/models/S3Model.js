import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import configObj from "../config.js";
import { generateUUID } from "../utility/index.js";
import {
  PRESIGNED_URL_EXPIRES_IN,
  IMAGE_STATUS,
} from "../utility/constants.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import Logger from "../lib/Logger.js";
import crypto from "crypto";
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
      console.log("Image already uploaded with same name:", existingImage);
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

    console.log("Image details saved to PostgreSQL:", createdImageDetails);
    return createdImageDetails;
  } catch (error) {
    console.error("Error saving image details to PostgreSQL ", error);
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

    console.log("Signed URL:", signedUrl);

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
    console.error(
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
    console.log("Image details saved to PostgreSQL:", {
      imageId,
      fileLocationInS3,
    });

    return {
      fileStatus: IMAGE_STATUS.UPLOADED,
      uploadedAt: new Date(),
    };
  } catch (error) {
    console.error(" savePostUploadImageDetails error", error);
    return {
      fileStatus: IMAGE_STATUS.FAILED_TO_UPLOAD_TO_S3,
      uploadedAt: null,
    };
  }
};

const uploadFaceImage = async (faceImage, username) => {
  try {
    console.log(`Uploading face image for user: ${username}`);

    // Remove data:image prefix if exists
    let imageData = faceImage;
    if (faceImage.includes("base64,")) {
      imageData = faceImage.split("base64,")[1];
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(imageData, "base64");

    // Generate a unique filename
    const randomId = crypto.randomBytes(8).toString("hex");
    const timestamp = Date.now();
    const extension = "png";
    const key = `${username.replace("@", "_at_")}_${timestamp}_${randomId}.${extension}`;

    // Set up S3 upload parameters
    const params = {
      Bucket: configObj.config[ENVIRONMENT].REKOGNITION_AUTH_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: `image/${extension}`,
      ContentEncoding: "base64",
    };
    console.log(" uploadFaceImage params", params);

    // Upload to S3
    const command = new PutObjectCommand(params);
    const uploadResult = await s3Client.send(command);
    console.log(" uploadFaceImage uploadResult", uploadResult);

    // Generate a pre-signed URL for the uploaded image (valid for 1 hour)
    const getObjectCommand = new PutObjectCommand(params);
    const signedUrl = await getSignedUrl(s3Client, getObjectCommand, {
      expiresIn: 3600,
    });

    console.log(`Face image uploaded successfully to ${key}`);

    return {
      key,
      signedUrl,
      imageUrl: `https://${configObj.config[ENVIRONMENT].REKOGNITION_AUTH_BUCKET_NAME}.s3.${configObj.AWS_REGION}.amazonaws.com/${key}`,
    };
  } catch (error) {
    console.error("Error uploading face image to S3:", error);
    throw new Error(`Failed to upload face image: ${error.message}`);
  }
};

const getPresignedUrl = async (imageId) => {
  const command = new GetObjectCommand({
    Bucket: configObj.config[ENVIRONMENT].REKOGNITION_AUTH_BUCKET_NAME,
    Key: imageId,
  });

  try {
    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: PRESIGNED_URL_EXPIRES_IN.AN_HOUR,
    });
    return signedUrl;
  } catch (error) {
    console.error("Error generating pre-signed URL:", error);
    throw error;
  }
};

const S3Model = {
  generatePreSignedURL,
  savePostUploadImageDetails,
  uploadFaceImage,
  getPresignedUrl,
};

export default S3Model;
