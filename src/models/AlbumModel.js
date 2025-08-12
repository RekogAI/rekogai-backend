import models from "./schemas/associations.js";
import Logger from "../lib/Logger.js";
import { Op } from "sequelize";
import { AlbumExceptions, FolderExceptions } from "./exceptions.js";
import { generatePresignedUrl } from "../utility/s3.js";

class AlbumModel {
  constructor() {
    this.Album = models.Album;
  }

  /**
   * Fetch all albums for a user
   * @param {Object} params - Query parameters
   * @param {string} params.userId - User ID
   * @returns {Promise<Array>} List of user albums
   */
  async fetchAlbums({ userId }) {
    try {
      // Validate inputs
      if (!userId) {
        FolderExceptions.throwInvalidParametersError();
      }

      // Fetch all albums for the user
      const albums = await this.Album.findAll({
        where: {
          userId,
        },
        include: [
          {
            model: models.Face,
            as: "faces",
            attributes: [
              "faceId",
              "imageId",
              "faceRecordDetails",
              "faceThumbnail",
            ],
            required: true,
          },
        ],
        order: [["createdAt", "DESC"]],
        nest: true,
      });

      Logger.info(`Retrieved ${albums.length} albums for user ${userId}`);

      return albums;
    } catch (error) {
      Logger.error("Error fetching albums:", error);
      throw error;
    }
  }

  async getAlbumById({ albumId, userId }) {
    try {
      // Validate inputs
      if (!albumId || !userId) {
        AlbumExceptions.throwInvalidParametersError();
      }

      // Fetch the album by ID
      const album = await this.Album.findOne({
        where: {
          albumId,
          userId,
        },
        include: [
          {
            model: models.Face,
            as: "faces",
            attributes: [
              "faceId",
              "imageId",
              "faceRecordDetails",
              "faceThumbnail",
            ],
            required: true,
          },
        ],
        nest: true,
      });

      if (!album) {
        AlbumExceptions.throwAlbumNotFoundError();
      }

      // Fetch images using imageIds array
      let imagesWithPresignedUrls = [];
      if (album.imageIds && album.imageIds.length > 0) {
        const images = await models.Image.findAll({
          where: {
            imageId: {
              [Op.in]: album.imageIds,
            },
            userId,
          },
          attributes: [
            "imageId",
            "fileName",
            "fileLocationInS3",
            "fileMIMEtype",
            "fileSizeInKiloBytes",
            "createdAt",
          ],
        });

        // Generate presigned URLs for each image
        imagesWithPresignedUrls = await Promise.all(
          images.map(async (image) => {
            const imageData = image.toJSON();
            if (imageData.fileLocationInS3) {
              const presignedUrl = await generatePresignedUrl({
                operation: "get",
                key: imageData.fileLocationInS3,
                expiresIn: 86400, // 24 hours
              });
              imageData.presignedUrl = presignedUrl;
            }
            return imageData;
          })
        );
      }

      const albumWithPresignedUrls = {
        ...album.toJSON(),
        images: imagesWithPresignedUrls,
      };

      Logger.info(
        `Retrieved album ${albumId} with ${album.faces.length} faces and ${imagesWithPresignedUrls.length} images for user ${userId}`
      );

      return albumWithPresignedUrls;
    } catch (error) {
      Logger.error("Error fetching album by ID:", error);
      throw error;
    }
  }
}

export default AlbumModel;
