import models from "../models/schemas/associations.js";
import Logger from "../lib/Logger.js";
import { ImageExceptions } from "./exceptions.js";
import { generateUUID } from "../utility/index.js";
import { generatePresignedUrl } from "../utility/s3.js";

class ImageModel {
  constructor() {
    this.Image = models.Image;
  }

  /**
   * Initiate image upload process by creating an image record and generating a presigned URL
   * @param {Object} imageData - Image data
   * @param {string} imageData.folderId - Folder ID
   * @param {string} imageData.fileName - File name
   * @param {string} imageData.fileType - File type/MIME type
   * @param {number} imageData.fileSize - File size in bytes
   * @param {string} imageData.userId - User ID
   * @returns {Promise<Object>} Image details with presigned URL
   */
  async initiateImageUpload({
    folderId,
    fileName,
    fileType,
    fileSize,
    userId,
  }) {
    try {
      const FILE_SIZE_LIMIT = {
        "50_MB": 52428800,
        "1_MB": 1048576,
      };
      // Validate input parameters
      if (!folderId || !fileName || !fileType || !fileSize || !userId) {
        ImageExceptions.throwInvalidParametersError();
      }

      if (fileType !== "image/jpeg" && fileType !== "image/png") {
        ImageExceptions.throwInvalidFileTypeError();
      }

      if (fileSize > FILE_SIZE_LIMIT["50_MB"]) {
        ImageExceptions.throwFileSizeExceededError();
      }
      if (fileSize < FILE_SIZE_LIMIT["1_MB"]) {
        ImageExceptions.throwFileSizeTooSmallError();
      }

      // Generate a unique image ID
      const imageId = generateUUID();

      // Generate S3 object key (path in S3 bucket)
      const s3ObjectKey = `${userId}/images/${folderId}/${imageId}/${fileName}`;

      // Generate presigned URL for uploading to S3
      const presignedUrl = await generatePresignedUrl({
        operation: "put",
        key: s3ObjectKey,
        contentType: fileType,
        expiresIn: 3600,
      });

      // Create image record in database with UPLOADING status
      const image = await this.Image.create({
        userId,
        folderId,
        imageId,
        fileName,
        fileMIMEtype: fileType.split("/")[1].toUpperCase(),
        fileSizeInKiloBytes: Number(fileSize / 1024),
        fileLocationInS3: s3ObjectKey,
        fileStatus: "UPLOAD_INTIATED",
      });

      Logger.info(`Initiated upload for image ${imageId} by user ${userId}`);

      // Return image details with presigned URL
      return {
        presignedUrl,
        imageId: image.imageId,
        fileName: image.fileName,
        fileType: image.fileType,
        fileSize: image.fileSize,
        folderId: image.folderId,
        userId: image.userId,
      };
    } catch (error) {
      Logger.error("Error initiating image upload:", error);
      throw error;
    }
  }

  /**
   * Confirm image upload completion and generate a download URL
   * @param {Object} confirmData - Confirmation data
   * @param {string} confirmData.imageId - Image ID
   * @param {boolean} confirmData.isUploadComplete - Whether upload completed successfully
   * @param {string} confirmData.status - New status (UPLOADED, FAILED)
   * @returns {Promise<Object>} Updated image details with presigned URL for GET
   */
  async confirmImageUpload({ imageId, isUploadComplete, status }) {
    try {
      // Validate input parameters
      if (!imageId || isUploadComplete === undefined || !status) {
        ImageExceptions.throwInvalidParametersError();
      }

      // Validate status
      const validStatuses = ["UPLOAD_FAILED", "UPLOAD_COMPLETED"];
      if (!validStatuses.includes(status)) {
        ImageExceptions.throwInvalidImageStatusError();
      }

      // Find the image record
      const image = await this.Image.findOne({
        where: {
          imageId,
        },
      });

      if (!image) {
        ImageExceptions.throwImageNotFoundError();
      }

      if (!isUploadComplete && status === "UPLOAD_FAILED") {
        Logger.warn(
          `Upload failed for image ${imageId} - S3 cleanup may be needed`
        );
      }

      // Update image status
      await image.update({
        status,
      });

      let presignedUrl = null;

      // Generate presigned URL for downloading if upload was successful
      if (isUploadComplete && status === "UPLOAD_COMPLETED") {
        presignedUrl = await generatePresignedUrl({
          operation: "get",
          key: image.fileLocationInS3,
          expiresIn: 86400, // 24 hours
        });
      }

      Logger.info(`Image upload ${status} for image ${imageId}`);

      // Return updated image details with presigned URL
      return {
        presignedUrl,
        imageId: image.imageId,
        fileName: image.fileName,
        fileType: image.fileType,
        fileSize: image.fileSize,
        folderId: image.folderId,
        userId: image.userId,
        status: image.status,
      };
    } catch (error) {
      Logger.error("Error confirming image upload:", error);
      throw error;
    }
  }
}

export default ImageModel;
