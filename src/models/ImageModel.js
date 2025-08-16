import models from "../models/schemas/associations.js";
import Logger from "../lib/Logger.js";
import { ImageExceptions } from "./exceptions.js";
import { generateUUID } from "../utility/index.js";
import { generatePresignedUrl } from "../utility/s3.js";
import { Op } from "sequelize";
import QueueService from "../services/QueueService.js";

class ImageModel {
  constructor() {
    this.Image = models.Image;
    this.Folder = models.Folder;
  }

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

      const s3ObjectKey = `${userId}/${folderId}/${imageId}`;

      const presignedUrl = await generatePresignedUrl({
        operation: "put",
        key: s3ObjectKey,
        contentType: fileType,
        expiresIn: 3600,
      });
      console.log("🚀 ~ ImageModel ~ presignedUrl:", presignedUrl);

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

  _validateConfirmUploadParams({ imageId, status }) {
    const errors = [];

    if (!imageId || typeof imageId !== "string") {
      errors.push("imageId is required and must be a string");
    }

    if (!status || !["UPLOAD_FAILED", "UPLOAD_COMPLETED"].includes(status)) {
      errors.push("status must be either UPLOAD_FAILED or UPLOAD_COMPLETED");
    }

    if (errors.length > 0) {
      ImageExceptions.throwInvalidParametersError(errors.join(", "));
    }
  }

  async _generateImageAccessUrl(s3Key) {
    try {
      return await generatePresignedUrl({
        operation: "get",
        key: s3Key,
        expiresIn: 86400, // 24 hours
      });
    } catch (error) {
      Logger.error("Failed to generate presigned URL:", error);
      return null;
    }
  }

  async _updateImageStatus(image, status) {
    try {
      await image.update({ fileStatus: status });
      return image;
    } catch (error) {
      Logger.error("Failed to update image status:", error);
      throw error;
    }
  }

  async _pushImageToThumbnailQueue(image) {
    try {
      await QueueService.addThumbnailGenerationJob({
        imageId: image.imageId,
        userId: image.userId,
        folderId: image.folderId,
        fileLocationInS3: image.fileLocationInS3,
        fileName: image.fileName,
        fileMIMEtype: image.fileMIMEtype,
      });
      Logger.info(`Queued thumbnail generation for image ${image.imageId}`);
    } catch (error) {
      Logger.error(
        `Failed to queue thumbnail generation for image ${image.imageId}:`,
        error
      );
    }
  }

  async confirmImageUpload({ imageId, status }) {
    try {
      this._validateConfirmUploadParams({ imageId, status });

      const image = await this.Image.findOne({
        where: { imageId },
        attributes: [
          "imageId",
          "fileName",
          "fileMIMEtype",
          "fileSizeInKiloBytes",
          "folderId",
          "userId",
          "fileStatus",
          "fileLocationInS3",
          "createdAt",
          "updatedAt",
        ],
      });

      if (!image) {
        ImageExceptions.throwImageNotFoundError();
      }

      const updatedImage = await this._updateImageStatus(image, status);

      let presignedUrl = null;
      if (status === "UPLOAD_COMPLETED") {
        presignedUrl = await this._generateImageAccessUrl(
          image.fileLocationInS3
        );

        await this._pushImageToThumbnailQueue(updatedImage);
      }

      Logger.info(`Image upload ${status} for image ${imageId}`, {
        imageId,
        status,
        hasPresignedUrl: !!presignedUrl,
      });

      return {
        presignedUrl,
        ...updatedImage.get({ plain: true }),
      };
    } catch (error) {
      Logger.error("Error confirming image upload:", {
        error: error.message,
        imageId,
        status,
      });
      throw error;
    }
  }

  async fetchUploadedImages({
    userId,
    folderId = null,
    filterBy = null,
    searchParam = null,
    sortBy = "newest",
    sortOrder = "desc",
    page = 1,
  }) {
    try {
      const PAGE_LIMIT = 20;

      this._validateFetchParams({ userId, filterBy, sortBy, sortOrder, page });

      const { images, count } = await this._fetchImages({
        userId,
        folderId,
        filterBy,
        searchParam,
        sortBy,
        sortOrder,
        page,
        limit: PAGE_LIMIT,
      });

      console.log("🚀 ~ ImageModel ~ fetchUploadedImages ~ images:", images);
      const folderDetails = folderId
        ? await this._getFolderDetails(folderId)
        : null;

      const imagesWithUrls = await this._generateImageUrls(images);

      const pagination = this._calculatePagination(count, page, PAGE_LIMIT);

      Logger.info(
        `Fetched ${images.length} images for user ${userId}, page ${page}`
      );

      return {
        images: imagesWithUrls,
        folderDetails,
        pagination,
      };
    } catch (error) {
      Logger.error("Error fetching uploaded images:", error);
      throw error;
    }
  }

  _validateFetchParams({ userId, filterBy, sortBy, sortOrder, page }) {
    if (!userId) {
      ImageExceptions.throwInvalidParametersError();
    }

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

    if (page < 1) {
      throw new Error("Invalid page parameter. Must be greater than 0");
    }
  }

  async _fetchImages({
    userId,
    folderId,
    filterBy,
    searchParam,
    sortBy,
    sortOrder,
    page,
    limit,
  }) {
    const whereClause = this._buildWhereClause(
      userId,
      folderId,
      filterBy,
      searchParam
    );
    const orderClause = this._buildOrderClause(sortBy, sortOrder);
    const offset = (page - 1) * limit;

    return await this.Image.findAndCountAll({
      where: whereClause,
      order: orderClause,
      limit,
      offset,
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
        "thumbnailS3Key",
      ],
    });
  }

  _buildWhereClause(userId, folderId, filterBy, searchParam) {
    const whereClause = {
      userId,
      fileStatus: "UPLOAD_COMPLETED",
    };

    if (folderId) {
      whereClause.folderId = folderId;
    }

    if (filterBy && searchParam) {
      if (filterBy === "name") {
        whereClause.fileName = { [Op.like]: `%${searchParam}%` };
      } else if (filterBy === "tag") {
        whereClause.tags = { [Op.like]: `%${searchParam}%` };
      }
    }

    return whereClause;
  }

  _buildOrderClause(sortBy, sortOrder) {
    switch (sortBy) {
      case "alphabetical":
        return [["fileName", sortOrder.toUpperCase()]];
      case "newest":
        return [["createdAt", sortOrder.toUpperCase()]];
      case "size":
        return [["fileSizeInKiloBytes", sortOrder.toUpperCase()]];
      default:
        return [["createdAt", "DESC"]];
    }
  }

  async _getFolderDetails(folderId) {
    if (!folderId) return null;

    return await this.Folder.findOne({
      where: { folderId },
      raw: true,
    });
  }

  async _generateImageUrls(images) {
    const imagePromises = images.map(async (image) => {
      try {
        const [presignedUrl, thumbnailPresignedUrl] = await Promise.all([
          this._generatePresignedUrl(image.fileLocationInS3),
          image.thumbnailS3Key
            ? this._generatePresignedUrl(image.thumbnailS3Key)
            : null,
        ]);

        return {
          imageId: image.imageId,
          fileName: image.fileName,
          fileType: image.fileMIMEtype,
          fileSize: image.fileSizeInKiloBytes,
          folderId: image.folderId,
          userId: image.userId,
          status: image.fileStatus,
          createdAt: image.createdAt,
          updatedAt: image.updatedAt,
          presignedUrl,
          thumbnailPresignedUrl,
        };
      } catch (error) {
        Logger.error(
          `Error generating URLs for image ${image.imageId}:`,
          error
        );
        return {
          imageId: image.imageId,
          fileName: image.fileName,
          fileType: image.fileMIMEtype,
          fileSize: image.fileSizeInKiloBytes,
          folderId: image.folderId,
          userId: image.userId,
          status: image.fileStatus,
          createdAt: image.createdAt,
        };
      }
    });
    return Promise.all(imagePromises);
  }
}

export default ImageModel;
