import models from "../models/schemas/associations.js";
import Logger from "../lib/Logger.js";
import { ImageExceptions } from "./exceptions.js";
import { generateUUID } from "../utility/index.js";
import { generatePresignedUrl } from "../utility/s3.js";
import { Op } from "sequelize";

class ImageModel {
  constructor() {
    this.Image = models.Image;
    this.Folder = models.Folder;
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
    imageId,
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

      // Generate S3 object key (path in S3 bucket)
      const s3ObjectKey = `${userId}/${folderId}/${imageId}`;

      // Generate presigned URL for uploading to S3
      const presignedUrl = await generatePresignedUrl({
        operation: "put",
        key: s3ObjectKey,
        contentType: fileType,
        expiresIn: 3600,
      });
      console.log("🚀 ~ ImageModel ~ presignedUrl:", presignedUrl);

      // Create image record in database with UPLOADING status
      const image = await this.Image.create({
        userId,
        folderId,
        imageId,
        fileName,
        fileMIMEtype: fileType.split("/")[1].toUpperCase(),
        fileSizeInKiloBytes: fileSize,
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
      Logger.info("🚀 ~ ImageModel ~ confirmImageUpload ~ image:", image);

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
        fileStatus: status,
      });
      console.log("🚀 ~ ImageModel ~ confirmImageUpload ~ image:", image);

      let presignedUrl = null;

      // Generate presigned URL for downloading if upload was successful
      if (isUploadComplete && status === "UPLOAD_COMPLETED") {
        presignedUrl = await generatePresignedUrl({
          operation: "get",
          key: image.dataValues.fileLocationInS3,
          expiresIn: 86400, // 24 hours
        });
      }

      Logger.info(`Image upload ${status} for image ${imageId}`);

      // Return updated image details with presigned URL
      return {
        presignedUrl,
        ...image.get({ plain: true }),
      };
    } catch (error) {
      Logger.error("Error confirming image upload:", error);
      throw error;
    }
  }

  /**
   * Fetch uploaded images with filtering, searching, sorting, and pagination
   * @param {Object} params - Query parameters
   * @param {string} params.userId - User ID (required)
   * @param {string} params.folderId - Folder ID (optional)
   * @param {string} params.filterBy - Filter by 'name' or 'tag' (optional)
   * @param {string} params.searchParam - Search string value (optional)
   * @param {string} params.sortBy - Sort by 'alphabetical', 'newest', or 'size' (optional, default: 'newest')
   * @param {string} params.sortOrder - Sort order 'asc' or 'desc' (optional, default: 'desc')
   * @param {number} params.page - Page number (optional, default: 1)
   * @returns {Promise<Object>} Paginated images with metadata
   */
  async fetchUploadedImages({
    userId,
    folderId = null,
    filterBy = null,
    searchParam = null,
    sortBy = "newest",
    sortOrder = "desc",
    page = 1,
  }) {
    console.log(`🚀 ~ ImageModel ~ userId,`, {
      userId,
      folderId,
      filterBy,
      searchParam,
      sortBy,
      sortOrder,
      page,
    });
    try {
      const PAGE_LIMIT = 20;

      // Validate required parameters
      if (!userId) {
        ImageExceptions.throwInvalidParametersError();
      }

      // Validate optional parameters
      const validFilterBy = ["name", "tag"];
      const validSortBy = ["alphabetical", "newest", "size"];
      const validSortOrder = ["asc", "desc"];

      if (filterBy && !validFilterBy.includes(filterBy)) {
        throw new Error('Invalid filterBy parameter. Must be "name" or "tag"');
      }

      if (!validSortBy.includes(sortBy)) {
        throw new Error(
          'Invalid sortBy parameter. Must be "alphabetical", "newest", or "size"'
        );
      }

      if (!validSortOrder.includes(sortOrder)) {
        throw new Error('Invalid sortOrder parameter. Must be "asc" or "desc"');
      }

      // Build where clause
      const whereClause = {
        userId,
        fileStatus: "UPLOAD_COMPLETED", // Only fetch successfully uploaded images
      };

      // Add folder filter if provided
      if (folderId) {
        whereClause.folderId = folderId;
      }

      // Add search filter if provided
      if (filterBy && searchParam) {
        if (filterBy === "name") {
          whereClause.fileName = {
            [Op.like]: `%${searchParam}%`,
          };
        } else if (filterBy === "tag") {
          // Assuming tags are stored in a tags field or related table
          whereClause.tags = {
            [Op.like]: `%${searchParam}%`,
          };
        }
      }

      // Build order clause
      let orderClause = [];
      switch (sortBy) {
        case "alphabetical":
          orderClause = [["fileName", sortOrder.toUpperCase()]];
          break;
        case "newest":
          orderClause = [["createdAt", sortOrder.toUpperCase()]];
          break;
        case "size":
          orderClause = [["fileSizeInKiloBytes", sortOrder.toUpperCase()]];
          break;
      }

      // Calculate offset for pagination
      const offset = (page - 1) * PAGE_LIMIT;

      // Fetch images with pagination
      const { count, rows: images } = await this.Image.findAndCountAll({
        where: whereClause,
        order: orderClause,
        limit: PAGE_LIMIT,
        offset: offset,
        attributes: [
          "imageId",
          "fileName",
          "fileMIMEtype",
          "fileSizeInKiloBytes",
          "folderId",
          "userId",
          "fileStatus",
          "createdAt",
          "updatedAt",
          "fileLocationInS3",
        ],
      });

      // fetch folder details if needed
      const folderDetails = await this.Folder.findOne({
        where: { folderId },
        raw: true,
      });

      // Generate presigned URLs for each image
      const imagesWithUrls = await Promise.allSettled(
        images.map(async (image) => {
          const presignedUrl = await generatePresignedUrl({
            operation: "get",
            key: image.getDataValue("fileLocationInS3"),
            expiresIn: 86400, // 24 hours
          });

          return {
            imageId: image.imageId,
            fileName: image.fileName,
            fileType: image.fileMIMEtype,
            fileSize: image.fileSizeInKiloBytes,
            folderId: image.folderId,
            userId: image.userId,
            status: image.status,
            createdAt: image.createdAt,
            updatedAt: image.updatedAt,
            presignedUrl,
          };
        })
      );

      const imagesWithUrlsResolved = imagesWithUrls
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value);

      // Calculate pagination metadata
      const totalPages = Math.ceil(count / PAGE_LIMIT);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      Logger.info(
        `Fetched ${images.length} images for user ${userId}, page ${page}`
      );

      return {
        images: imagesWithUrlsResolved,
        folderDetails,
        pagination: {
          currentPage: Number(page),
          totalPages,
          totalItems: count,
          itemsPerPage: PAGE_LIMIT,
          hasNextPage,
          hasPreviousPage,
        },
      };
    } catch (error) {
      Logger.error("Error fetching uploaded images:", error);
      throw error;
    }
  }
}

export default ImageModel;
