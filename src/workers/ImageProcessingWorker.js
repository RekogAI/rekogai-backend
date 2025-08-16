import { Worker } from "bullmq";
import { redis } from "../config/redis.js";
import { QUEUE_NAMES, JOB_TYPES } from "../services/QueueService.js";
import NotificationService from "../services/NotificationService.js";
import models from "../models/schemas/associations.js";
import Logger from "../lib/Logger.js";
import { IMAGE_STATUS, API_TYPES } from "../utility/constants.js";
import {
  RekognitionClient,
  DetectLabelsCommand,
  SearchFacesByImageCommand,
  IndexFacesCommand,
} from "@aws-sdk/client-rekognition";
import configObj from "../config.js";
import QueueService from "../services/QueueService.js";
import { Op } from "sequelize";

const { Image, User, Face, Album, APIResponse } = models;
const { config, ENVIRONMENT } = configObj;

const rekognitionClient = new RekognitionClient(
  config[ENVIRONMENT].AWS_SDK_CONFIG
);

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
    const imagesWithFaces = await this.filterImagesWithFaces(images, userId);
    console.log(
      "🚀 ~ ImageProcessingWorker ~ processBatch ~ imagesWithFaces:",
      imagesWithFaces
    );

    if (imagesWithFaces.length === 0) {
      return;
    }

    const faceIdToImageIdsMap = await this.sendImageBatchToRekognition(
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

  async filterImagesWithFaces(images, userId) {
    const filteredImages = [];
    const updatePromises = [];

    for (const image of images) {
      const { hasFaces } = await this.detectLabelsForAnnotation(image, userId);
      if (hasFaces) {
        filteredImages.push(image);
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
    }

    await Promise.all(updatePromises);
    return filteredImages;
  }

  async detectLabelsForAnnotation(image, userId) {
    try {
      const detectLabelsCommand = new DetectLabelsCommand({
        Image: {
          S3Object: {
            Bucket: config[ENVIRONMENT].S3_BUCKET_NAME,
            Name: image.fileLocationInS3,
          },
        },
        MaxLabels: 50,
        MinConfidence: 85,
        IncludeCategories: ["Person Description", "Expressions and Emotions"],
        ExcludeCategories: [
          "Animals and Pets",
          "Apparel and Accessories",
          "Beauty and Personal Care",
          "Buildings and Architecture",
          "Colors and Visual Composition",
          "Damage Detection",
          "Education",
          "Everyday Objects",
          "Food and Beverage",
          "Furniture and Furnishings",
          "Health and Fitness",
          "Home and Indoors",
          "Home Appliances",
          "Hobbies and Interests",
          "Kitchen and Dining",
          "Materials",
          "Medical",
          "Nature and Outdoors",
          "Offices and Workspaces",
          "Patterns and Shapes",
          "Plants and Flowers",
          "Popular Landmarks",
          "Public Safety",
          "Religion",
          "Sports",
          "Symbols and Flags",
          "Technology and Computing",
          "Text and Documents",
          "Tools and Machinery",
          "Toys and Gaming",
          "Transport and Logistics",
          "Travel and Adventure",
          "Vehicles and Automotive",
          "Weapons and Military",
        ],
      });

      const response = await rekognitionClient.send(detectLabelsCommand);

      await APIResponse.create({
        userId,
        imageId: image.imageId,
        response: JSON.stringify(response),
        type: API_TYPES.DETECT_LABELS.key,
      });

      const hasLabelsInIncludeCategories = response.Labels.some((label) =>
        label.Categories.some((category) =>
          ["Person Description", "Expressions and Emotions"].includes(
            category.Name
          )
        )
      );

      return { hasFaces: hasLabelsInIncludeCategories };
    } catch (error) {
      Logger.error("Error detecting faces:", error);
      return { hasFaces: false };
    }
  }

  async sendImageBatchToRekognition(imageBatch, collectionId, userId) {
    const faceIdToImageIdsMap = {};

    for (const image of imageBatch) {
      const { fileLocationInS3, imageId } = image;

      const searchResponse = await this.searchFacesByImage({
        bucketName: config[ENVIRONMENT].S3_BUCKET_NAME,
        key: fileLocationInS3,
        collectionId,
      });

      await APIResponse.create({
        userId,
        imageId,
        response: JSON.stringify(searchResponse),
        type: API_TYPES.SEARCH_FACES_BY_IMAGE.key,
      });

      if (searchResponse?.FaceMatches?.length > 0) {
        searchResponse.FaceMatches.forEach((match) => {
          const faceId = match.Face.FaceId;
          if (!faceIdToImageIdsMap[faceId]) {
            faceIdToImageIdsMap[faceId] = [];
          }
          faceIdToImageIdsMap[faceId].push(imageId);
        });
      } else {
        const indexResponse = await this.indexFaces({
          bucketName: config[ENVIRONMENT].S3_BUCKET_NAME,
          key: fileLocationInS3,
          collectionId,
          imageId,
          userId,
        });

        await APIResponse.create({
          userId,
          imageId,
          response: JSON.stringify(indexResponse),
          type: API_TYPES.INDEX_FACES.key,
        });

        indexResponse.FaceRecords.forEach((record) => {
          const faceId = record.Face.FaceId;
          if (!faceIdToImageIdsMap[faceId]) {
            faceIdToImageIdsMap[faceId] = [];
          }
          faceIdToImageIdsMap[faceId].push(imageId);
        });
      }
    }

    return faceIdToImageIdsMap;
  }

  async searchFacesByImage({ bucketName, key, collectionId }) {
    try {
      const command = new SearchFacesByImageCommand({
        CollectionId: collectionId,
        Image: {
          S3Object: { Bucket: bucketName, Name: key },
        },
        QualityFilter: "AUTO",
        FaceMatchThreshold: 90,
      });
      const response = await rekognitionClient.send(command);
      return response;
    } catch (error) {
      Logger.error("Error searching faces by image:", error);
      throw error;
    }
  }

  async indexFaces({ bucketName, key, collectionId, imageId, userId }) {
    try {
      const command = new IndexFacesCommand({
        CollectionId: collectionId,
        Image: { S3Object: { Bucket: bucketName, Name: key } },
        QualityFilter: "MEDIUM",
        DetectionAttributes: ["DEFAULT"],
      });
      const response = await rekognitionClient.send(command);

      const faceRecordsToCreate = response.FaceRecords.map((faceRecord) => ({
        faceId: faceRecord.Face.FaceId,
        imageId,
        collectionId: collectionId,
        faceRecordDetails: faceRecord,
      }));

      await Face.bulkCreate(faceRecordsToCreate);

      // Queue face thumbnail generation for each detected face
      const faceThumbnailJobs = response.FaceRecords.map((faceRecord) => {
        const boundingBox = faceRecord.Face.BoundingBox;
        return QueueService.addFaceThumbnailGenerationJob({
          faceId: faceRecord.Face.FaceId,
          imageId,
          userId,
          s3Key: key,
          boundingBox,
        });
      });

      await Promise.all(faceThumbnailJobs);

      return response;
    } catch (error) {
      Logger.error("Error indexing faces:", error);
      throw error;
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
