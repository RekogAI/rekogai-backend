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
import { v4 as uuid4 } from "uuid";
import models from "../models/schemas/associations.js";
import { FaceExceptions } from "../models/exceptions.js";

const { Face } = models;
const { config, ENVIRONMENT } = configObj;

class FaceThumbnailGeneratorWorker {
  constructor() {
    this.s3Client = new S3Client(config[ENVIRONMENT].AWS_SDK_CONFIG);
    try {
      this.worker = new Worker(
        QUEUE_NAMES.FACE_THUMBNAIL_GENERATION,
        async (job) => {
          Logger.info("Face thumbnail worker received job:", job.id);
          return this.processJob(job);
        },
        {
          connection: redis,
          concurrency: 5,
          removeOnComplete: 10,
          removeOnFail: 5,
        }
      );

      this.setupEventHandlers();
    } catch (error) {
      Logger.error("Error initializing FaceThumbnailGeneratorWorker:", error);
    }
  }

  setupEventHandlers() {
    Logger.info("Setting up face thumbnail worker event handlers");

    this.worker.on("waiting", (jobId) => {
      Logger.info(`Face thumbnail job waiting: ${jobId}`);
    });

    this.worker.on("active", (job) => {
      Logger.info(`Face thumbnail job started: ${job.id}`);
    });

    this.worker.on("completed", (job) => {
      Logger.info(`Face thumbnail job completed: ${job.id}`);
    });

    this.worker.on("failed", (job, err) => {
      Logger.error(`Face thumbnail job failed: ${job.id}`, err);
    });

    this.worker.on("error", (err) => {
      Logger.error("Face thumbnail worker error:", err);
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
    const { faceId, imageId, userId, s3Key, boundingBox } = job.data;

    try {
      const face = await Face.findOne({ where: { faceId } });
      if (!face) {
        FaceExceptions.throwFaceNotFoundError();
      }

      // Get the original image from S3
      const s3Params = {
        Bucket: config[ENVIRONMENT].S3_BUCKET_NAME,
        Key: s3Key,
      };

      const s3Object = await this.s3Client.send(new GetObjectCommand(s3Params));
      const imageBuffer = await this.streamToBuffer(s3Object.Body);

      // Get image metadata
      const metadata = await sharp(imageBuffer).metadata();
      const { width, height } = metadata;

      // Calculate crop dimensions from bounding box
      const left = Math.floor(boundingBox.Left * width);
      const top = Math.floor(boundingBox.Top * height);
      const cropWidth = Math.floor(boundingBox.Width * width);
      const cropHeight = Math.floor(boundingBox.Height * height);

      // Create face thumbnail
      const faceThumbnailBuffer = await sharp(imageBuffer)
        .extract({
          left: Math.max(0, left),
          top: Math.max(0, top),
          width: Math.min(cropWidth, width - left),
          height: Math.min(cropHeight, height - top),
        })
        .resize(200, 200, { fit: "cover" })
        .jpeg({ quality: 90 })
        .toBuffer();

      // Generate unique thumbnail key
      const thumbnailUuid = uuid4();
      const faceThumbnailKey = `faces/${userId}/${faceId}/${thumbnailUuid}`;

      // Upload to S3
      const uploadParams = {
        Bucket: config[ENVIRONMENT].S3_BUCKET_NAME,
        Key: faceThumbnailKey,
        Body: faceThumbnailBuffer,
        ContentType: "image/jpeg",
      };

      await this.s3Client.send(new PutObjectCommand(uploadParams));

      // Update Face model with thumbnail information
      await face.update({
        faceThumbnailS3Key: faceThumbnailKey,
        faceThumbnailId: thumbnailUuid,
        faceThumbnailGeneratedAt: new Date(),
      });

      Logger.info(`Face thumbnail generated successfully for face: ${faceId}`);
      return {
        success: true,
        message: "Face thumbnail generated successfully",
      };
    } catch (error) {
      Logger.error(`Error processing face thumbnail job ${job.id}:`, error);
      throw error;
    }
  }
}

Logger.info("FaceThumbnailGeneratorWorker initialized successfully");

export default FaceThumbnailGeneratorWorker;
