import { Worker } from "bullmq";
import { redis } from "../config/redis.js";
import { QUEUE_NAMES, JOB_TYPES } from "../services/QueueService.js";
import NotificationService from "../services/NotificationService.js";
import models from "../models/schemas/associations.js";
import Logger from "../lib/Logger.js";
import { IMAGE_STATUS, API_TYPES } from "../utility/constants.js";
import {
  rekognitionClient,
  s3Client,
  DetectFacesCommand,
  SearchFacesCommand,
  IndexFacesCommand,
  GetObjectCommand,
  SearchFacesByImageCommand,
} from "../providers/aws-client-provider.js";
import configObj from "../config.js";
import QueueService from "../services/QueueService.js";
import { Op } from "sequelize";
import sharp from "sharp";
import ImageQualityScorer from "../models/ImageQualityScorer.js";

const { Image, User, Face, Album, APIResponse } = models;
const { config, ENVIRONMENT } = configObj;

class ImageProcessingWorker {
  constructor() {
    console.log("ImageProcessingWorker constructor called");

    try {
      this.worker = new Worker(
        QUEUE_NAMES.IMAGE_PROCESSING,
        async (job) => {
          console.log("Arrow function worker received job:", job.id);
          return this.processJob(job);
        },
        {
          connection: redis,
          concurrency: 3,
          removeOnComplete: 10,
          removeOnFail: 5,
        }
      );
      console.log("Worker instance created successfully");

      this.imageQualityScorer = new ImageQualityScorer({
        baseScore: 100,
        minScore: 1,
        penalties: {
          faceOccluded: 40,
          sunglasses: 25,
          eyesClosed: 20,
          lowBrightness: 15,
          lowSharpness: 30,
          noSmile: 5,
          mouthOpen: 8,
          badPose: 15,
        },
        thresholds: {
          brightness: { min: 60, max: 100 },
          sharpness: { min: 25, max: 100 },
          pose: { pitch: 10, roll: 10, yaw: 10 },
        },
        confidenceThreshold: 98,
      });

      this.setupEventHandlers();
    } catch (error) {
      console.error("Error creating worker instance:", error);
    }
  }

  setupEventHandlers() {
    console.log("Setting up worker event handlers");

    this.worker.on("waiting", (jobId) => {
      console.log(`Job waiting to be processed: ${jobId}`);
    });

    this.worker.on("active", (job) => {
      console.log(`Job started processing: ${job.id}`);
    });

    this.worker.on("completed", (job) => {
      console.log(`Job completed: ${job.id}`);
      console.log(`Job completed: ${job.id}`);
    });

    this.worker.on("failed", (job, err) => {
      console.error(`Job failed: ${job.id}`, err);
      Logger.error(`Job failed: ${job.id}`, err);
      NotificationService.publishJobFailed({
        jobId: job.id,
        userId: job.data.userId,
        error: err.message,
      });
    });

    this.worker.on("error", (err) => {
      console.error("Worker encountered an error:", err);
    });

    this.worker.on("progress", (job, progress) => {
      console.log(`Job progress: ${job.id} - ${progress}%`);
    });
  }

  async processJob(job) {
    console.log("🚀 ~ ImageProcessingWorker ~ processJob ~ job:", job);
    const { userId, folderId } = job.data;

    try {
      await NotificationService.publishJobProgress({
        jobId: job.id,
        userId,
        folderId,
        status: "started",
        progress: 0,
        message: "Starting image processing...",
      });

      const collectionId = await this.getCollectionId(userId);
      console.log(
        "🚀 ~ ImageProcessingWorker ~ processJob ~ collectionId:",
        collectionId
      );

      let pageNumber = 0;
      const pageSize = 50;
      let totalProcessed = 0;
      let totalImages = 0;

      const totalCount = await Image.count({
        where: {
          userId,
          folderId,
          fileStatus: {
            [Op.notIn]: [
              IMAGE_STATUS.FACES_DETECTED,
              IMAGE_STATUS.NO_FACES_DETECTED,
            ],
          },
        },
      });
      console.log(
        "🚀 ~ ImageProcessingWorker ~ processJob ~ totalCount:",
        totalCount
      );

      while (true) {
        const images = await this.fetchImagesFromDatabase({
          userId,
          folderId,
          pageSize,
          pageNumber,
        });
        console.log(
          "🚀 ~ ImageProcessingWorker ~ processJob ~ images:",
          images
        );

        if (images.length === 0) {
          break;
        }

        totalImages += images.length;

        const progress = Math.round((totalProcessed / totalCount) * 100);
        await job.updateProgress(progress);

        await this.processBatch(images, collectionId, userId, job);

        totalProcessed += images.length;
        pageNumber++;

        await NotificationService.publishJobProgress({
          jobId: job.id,
          userId,
          folderId,
          status: "processing",
          progress,
          processedCount: totalProcessed,
          totalCount,
          message: `Processed ${totalProcessed} of ${totalCount} images...`,
        });
      }

      await NotificationService.publishJobCompleted({
        jobId: job.id,
        userId,
        folderId,
        status: "completed",
        progress: 100,
        processedCount: totalProcessed,
        totalCount,
        message: "Image processing completed successfully!",
      });

      return { success: true, processedCount: totalProcessed };
    } catch (error) {
      Logger.error("Error in image processing job:", error);
      throw error;
    }
  }

  async processBatch(images, collectionId, userId, job) {
    const imagesWithFaces = await this.detectFacesInImages(images, userId);
    console.log(
      "🚀 ~ ImageProcessingWorker ~ processBatch ~ imagesWithFaces:",
      imagesWithFaces
    );

    if (imagesWithFaces.length === 0) {
      return;
    }

    const faceIdToImageIdsMap = await this.processFacesInImages(
      imagesWithFaces,
      collectionId,
      userId
    );
    console.log(
      "🚀 ~ ImageProcessingWorker ~ processBatch ~ faceIdToImageIdsMap:",
      faceIdToImageIdsMap
    );

    await this.createAlbums(faceIdToImageIdsMap, userId);
  }

  async getCollectionId(userId) {
    const user = await User.findOne({
      where: { userId },
      attributes: ["collectionId"],
    });

    if (!user?.collectionId) {
      throw new Error("Collection not found for user");
    }

    return user.collectionId;
  }

  async fetchImagesFromDatabase({
    userId,
    limit = 50,
    pageNumber = 0,
    folderId,
  }) {
    const offset = pageNumber * limit;
    const images = await Image.findAll({
      attributes: ["fileLocationInS3", "imageId"],
      where: {
        userId,
        folderId,
        fileStatus: {
          [Op.notIn]: [
            IMAGE_STATUS.FACES_DETECTED,
            IMAGE_STATUS.NO_FACES_DETECTED,
          ],
        },
      },
      limit,
      offset,
      raw: true,
    });
    return images;
  }

  async detectFacesInImages(images, userId) {
    const imagesWithFaces = [];
    const updatePromises = [];

    for (const image of images) {
      try {
        const detectFacesCommand = new DetectFacesCommand({
          Image: {
            S3Object: {
              Bucket: config[ENVIRONMENT].S3_BUCKET_NAME,
              Name: image.fileLocationInS3,
            },
          },
          Attributes: ["DEFAULT", "ALL"],
        });

        const response = await rekognitionClient.send(detectFacesCommand);

        await APIResponse.create({
          userId,
          imageId: image.imageId,
          response: JSON.stringify(response),
          type: API_TYPES.DETECT_FACES?.key || "DetectFaces",
        });

        const bestFaces = this.imageQualityScorer.getBestFaces(
          response.FaceDetails || [],
          80
        );

        if (bestFaces && bestFaces.length > 0) {
          imagesWithFaces.push({
            ...image,
            faceDetails: bestFaces,
          });

          updatePromises.push(
            Image.update(
              {
                fileStatus: IMAGE_STATUS.FACES_DETECTED,
                facesDetected: true,
              },
              { where: { imageId: image.imageId } }
            ),
            QueueService.addThumbnailGenerationJob({
              userId,
              imageId: image.imageId,
              folderId: image.folderId,
            })
          );
        } else {
          updatePromises.push(
            Image.update(
              {
                fileStatus: IMAGE_STATUS.NO_FACES_DETECTED,
                facesDetected: false,
              },
              { where: { imageId: image.imageId } }
            ),
            QueueService.addThumbnailGenerationJob({
              userId,
              imageId: image.imageId,
              folderId: image.folderId,
            })
          );
        }
      } catch (error) {
        Logger.error(
          `Error detecting faces for image ${image.imageId}:`,
          error
        );
        updatePromises.push(
          Image.update(
            {
              fileStatus: IMAGE_STATUS.NO_FACES_DETECTED,
              facesDetected: false,
            },
            { where: { imageId: image.imageId } }
          )
        );
      }
    }

    await Promise.all(updatePromises);
    return imagesWithFaces;
  }

  async cropFaceFromImage(s3Key, boundingBox) {
    try {
      // Download image from S3
      const getObjectCommand = new GetObjectCommand({
        Bucket: config[ENVIRONMENT].S3_BUCKET_NAME,
        Key: s3Key,
      });

      const s3Object = await s3Client.send(getObjectCommand);

      // Convert stream to buffer
      const chunks = [];
      for await (const chunk of s3Object.Body) {
        chunks.push(chunk);
      }
      const imageBuffer = Buffer.concat(chunks);

      const image = sharp(imageBuffer);
      const metadata = await image.metadata();

      // Calculate bounding box for face cropping
      const expandedBox = {
        Left: boundingBox.Left,
        Top: boundingBox.Top,
        Width: boundingBox.Width,
        Height: boundingBox.Height,
      };

      // Ensure expanded box doesn't exceed image boundaries
      expandedBox.Left = Math.max(
        0,
        Math.min(1 - expandedBox.Width, expandedBox.Left)
      );
      expandedBox.Top = Math.max(
        0,
        Math.min(1 - expandedBox.Height, expandedBox.Top)
      );

      // Calculate crop dimensions with padding
      const left = Math.floor(expandedBox.Left * metadata.width);
      const top = Math.floor(expandedBox.Top * metadata.height);
      const width = Math.min(
        metadata.width - left,
        Math.floor(expandedBox.Width * metadata.width)
      );
      const height = Math.min(
        metadata.height - top,
        Math.floor(expandedBox.Height * metadata.height)
      );

      // Crop the face
      const croppedBuffer = await image
        .extract({ left, top, width, height })
        .jpeg({ quality: 90 })
        .toBuffer();

      const base64CroppedImage = croppedBuffer.toString("base64");
      console.log(
        "🚀 ~ ImageProcessingWorker ~ cropFaceFromImage ~ base64CroppedImage:",
        base64CroppedImage
      );

      return croppedBuffer;
    } catch (error) {
      Logger.error("Error cropping face from image:", error);
      throw error;
    }
  }

  async processFacesInImages(imagesWithFaces, collectionId, userId) {
    const faceIdToImageIdsMap = {};

    for (const imageData of imagesWithFaces) {
      const { imageId, fileLocationInS3, faceDetails } = imageData;

      for (const faceDetail of faceDetails) {
        try {
          // Crop the face from the image
          const croppedFaceBuffer = await this.cropFaceFromImage(
            fileLocationInS3,
            faceDetail.BoundingBox
          );

          // Search for the cropped face
          const searchResponse = await this.searchFacesByCroppedImage(
            croppedFaceBuffer,
            collectionId
          );

          await APIResponse.create({
            userId,
            imageId,
            response: JSON.stringify(searchResponse),
            type:
              API_TYPES.SEARCH_FACES_BY_IMAGE?.key || "SEARCH_FACES_BY_IMAGE",
          });

          if (searchResponse?.FaceMatches?.length > 0) {
            // Face found, add to existing album
            searchResponse.FaceMatches.forEach((match) => {
              const faceId = match.Face.FaceId;
              if (!faceIdToImageIdsMap[faceId]) {
                faceIdToImageIdsMap[faceId] = [];
              }
              if (!faceIdToImageIdsMap[faceId].includes(imageId)) {
                faceIdToImageIdsMap[faceId].push(imageId);
              }
            });
          } else {
            // Face not found, index it
            const indexResponse = await this.indexCroppedFace(
              croppedFaceBuffer,
              collectionId,
              imageId,
              userId,
              faceDetail.BoundingBox
            );

            await APIResponse.create({
              userId,
              imageId,
              response: JSON.stringify(indexResponse),
              type: API_TYPES.INDEX_FACES?.key || "INDEX_FACES",
            });

            if (indexResponse?.FaceRecords?.length > 0) {
              indexResponse.FaceRecords.forEach((record) => {
                const faceId = record.Face.FaceId;
                if (!faceIdToImageIdsMap[faceId]) {
                  faceIdToImageIdsMap[faceId] = [];
                }
                if (!faceIdToImageIdsMap[faceId].includes(imageId)) {
                  faceIdToImageIdsMap[faceId].push(imageId);
                }
              });
            }
          }
        } catch (error) {
          Logger.error(`Error processing face in image ${imageId}:`, error);
        }
      }
    }

    return faceIdToImageIdsMap;
  }

  async searchFacesByCroppedImage(croppedFaceBuffer, collectionId) {
    try {
      const command = new SearchFacesByImageCommand({
        CollectionId: collectionId,
        Image: {
          Bytes: croppedFaceBuffer,
        },
        QualityFilter: "NONE",
        MaxFaces: 1,
        FaceMatchThreshold: 70,
      });
      const response = await rekognitionClient.send(command);
      return response;
    } catch (error) {
      Logger.error("Error searching faces by cropped image:", error);
      return { FaceMatches: [] };
    }
  }

  async indexCroppedFace(
    croppedFaceBuffer,
    collectionId,
    imageId,
    userId,
    boundingBox
  ) {
    try {
      const command = new IndexFacesCommand({
        CollectionId: collectionId,
        Image: { Bytes: croppedFaceBuffer },
        QualityFilter: "HIGH", // Use HIGH quality filter instead of NONE
        MaxFaces: 1,
        DetectionAttributes: ["DEFAULT"],
      });
      const response = await rekognitionClient.send(command);

      if (response?.FaceRecords?.length > 0) {
        const faceRecordsToCreate = response.FaceRecords.map((faceRecord) => ({
          faceId: faceRecord.Face.FaceId,
          imageId,
          collectionId: collectionId,
          faceRecordDetails: faceRecord,
        }));

        await Face.bulkCreate(faceRecordsToCreate);

        // Queue face thumbnail generation for each detected face
        const faceThumbnailJobs = response.FaceRecords.map((faceRecord) => {
          return QueueService.addFaceThumbnailGenerationJob({
            faceId: faceRecord.Face.FaceId,
            imageId,
            userId,
            croppedFaceBuffer,
            boundingBox,
          });
        });

        await Promise.all(faceThumbnailJobs);
      }

      return response;
    } catch (error) {
      Logger.error("Error indexing cropped face:", error);
      return { FaceRecords: [] };
    }
  }

  async createAlbums(faceIdToImageIdsMap, userId) {
    console.log(
      "🚀 ~ ImageProcessingWorker ~ createAlbums ~ faceIdToImageIdsMap:",
      faceIdToImageIdsMap
    );
    try {
      const albumsToCreate = Object.keys(faceIdToImageIdsMap).map((faceId) => ({
        userId,
        faceId,
        imageIds: faceIdToImageIdsMap[faceId],
      }));
      await Album.bulkCreate(albumsToCreate);
      console.log("Albums created successfully");
    } catch (error) {
      Logger.error("Error creating albums:", error);
      throw error;
    }
  }
}

console.log("ImageProcessingWorker module loaded");

export default ImageProcessingWorker;
