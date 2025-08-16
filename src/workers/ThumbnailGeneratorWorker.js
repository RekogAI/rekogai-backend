import { Worker } from "bullmq";
import { redis } from "../config/redis.js";
import { QUEUE_NAMES } from "../services/QueueService.js";
import Logger from "../lib/Logger.js";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import configObj from "../config.js";
import { ImageExceptions } from "../models/exceptions.js";
import { v4 as uuid4 } from "uuid";
import models from "../models/schemas/associations.js";
import NotificationService from "../services/NotificationService.js";
import { IMAGE_STATUS } from "../utility/constants.js";

const { Image } = models;
const { config, ENVIRONMENT } = configObj;

class ThumbnailGeneratorWorker {
  constructor() {
    this.s3Client = new S3Client(config[ENVIRONMENT].AWS_SDK_CONFIG);
    try {
      this.worker = new Worker(
        QUEUE_NAMES.THUMBNAIL_GENERATION,
        async (job) => {
          Logger.info("Arrow function worker received job:", job.id);
          return this.processJob(job);
        },
        {
          connection: redis,
          concurrency: 3,
          removeOnComplete: 10,
          removeOnFail: 5,
        }
      );

      this.setupEventHandlers();
    } catch (error) {
      Logger.error("Error initializing ThumbnailGeneratorWorker:", error);
    }
  }

  setupEventHandlers() {
    Logger.info("Setting up worker event handlers");

    this.worker.on("waiting", (jobId) => {
      Logger.info(`Job waiting to be processed: ${jobId}`);
    });

    this.worker.on("active", (job) => {
      Logger.info(`Job started processing: ${job.id}`);
    });

    this.worker.on("completed", (job) => {
      Logger.info(`Job completed: ${job.id}`);
      NotificationService.publishJobCompleted({
        jobId: job.id,
        userId: job.data.userId,
        folderId: job.data.folderId,
        status: "completed",
      });
    });

    this.worker.on("failed", (job, err) => {
      Logger.error(`Job failed: ${job.id}`, err);
      NotificationService.publishJobFailed({
        jobId: job.id,
        userId: job.data.userId,
        error: err.message,
      });
    });

    this.worker.on("error", (err) => {
      NotificationService.publishJobFailed({
        jobId: job.id,
        userId: job.data.userId,
        error: err.message,
      });
    });

    this.worker.on("progress", (job, progress) => {
      NotificationService.publishJobProgress({
        jobId: job.id,
        userId: job.data.userId,
        folderId: job.data.folderId,
        status: "processing",
        progress,
      });
    });
  }

  streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", (err) => reject(err));
    });
  }

  async processJob(job) {
    const { imageId, userId, folderId } = job.data;

    try {
      const image = await Image.findByPk(imageId);
      Logger.info("🚀 ~ ThumbnailGeneratorWorker ~ processJob ~ image:", image);

      if (!image) {
        ImageExceptions.throwImageNotFoundError();
      }

      const s3Params = {
        Bucket: config[ENVIRONMENT].S3_BUCKET_NAME,
        Key: image.fileLocationInS3,
      };

      Logger.info("🚀 ~ ThumbnailGeneratorWorker ~ processJob ~ a:", s3Params);

      const s3Object = await this.s3Client.send(new GetObjectCommand(s3Params));
      const imageBuffer = await this.streamToBuffer(s3Object.Body);

      Logger.info(
        "🚀 ~ ThumbnailGeneratorWorker ~ processJob ~ imageBuffer:",
        imageBuffer?.toString()?.slice(0, 50)
      );

      const thumbnailBuffer = await sharp(imageBuffer)
        .resize(300, 300)
        .toBuffer();

      Logger.info(
        "🚀 ~ ThumbnailGeneratorWorker ~ processJob ~ thumbnailBuffer:",
        thumbnailBuffer?.toString()?.slice(0, 50)
      );

      const uuid = uuid4();

      const thumbnailKey = `${image.fileLocationInS3}/${uuid}`;
      const uploadParams = {
        Bucket: config[ENVIRONMENT].S3_BUCKET_NAME,
        Key: thumbnailKey,
        Body: thumbnailBuffer,
        ContentType: "image/jpeg",
      };

      await this.s3Client.send(new PutObjectCommand(uploadParams));

      image.thumbnailS3Key = thumbnailKey;
      image.thumbnailId = uuid;
      image.fileStatus = IMAGE_STATUS.THUMBNAIL_GENERATED;
      image.thumbnailGeneratedAt = new Date();
      await image.save();

      NotificationService.publishJobCompleted({
        jobId: job.id,
        userId,
        folderId,
        status: "completed",
      });

      return { success: true, message: "Thumbnail generated successfully" };
    } catch (error) {
      Logger.error(`Error processing job ${job.id}:`, error);
      throw error;
    }
  }
}
Logger.info("ThumbnailGeneratorWorker initialized successfully");

export default ThumbnailGeneratorWorker;
