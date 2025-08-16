import { Queue } from "bullmq";
import { redis } from "../config/redis.js";
import Logger from "../lib/Logger.js";

const queueConfig = {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 20,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  },
};

// Define queue names
export const QUEUE_NAMES = {
  IMAGE_PROCESSING: "image-processing",
  THUMBNAIL_GENERATION: "thumbnail-generation",
  FACE_THUMBNAIL_GENERATION: "face-thumbnail-generation",
};

// Create queues
export const imageProcessingQueue = new Queue(
  QUEUE_NAMES.IMAGE_PROCESSING,
  queueConfig
);

export const thumbnailGenerationQueue = new Queue(
  QUEUE_NAMES.THUMBNAIL_GENERATION,
  queueConfig
);

export const faceThumbnailGenerationQueue = new Queue(
  QUEUE_NAMES.FACE_THUMBNAIL_GENERATION,
  queueConfig
);

// Job types
export const JOB_TYPES = {
  PROCESS_IMAGES_BATCH: "process-images-batch",
  GENERATE_THUMBNAILS: "generate-thumbnails",
  GENERATE_FACE_THUMBNAILS: "generate-face-thumbnails",
};

class QueueService {
  constructor() {
    this.queues = {
      [QUEUE_NAMES.IMAGE_PROCESSING]: imageProcessingQueue,
      [QUEUE_NAMES.THUMBNAIL_GENERATION]: thumbnailGenerationQueue,
      [QUEUE_NAMES.FACE_THUMBNAIL_GENERATION]: faceThumbnailGenerationQueue,
    };
  }

  /**
   * Add a job to the image processing queue
   */
  async addImageProcessingJob(jobData, options = {}) {
    try {
      const job = await imageProcessingQueue.add(
        JOB_TYPES.PROCESS_IMAGES_BATCH,
        jobData,
        {
          ...options,
          jobId: `${jobData.userId}-${jobData.folderId}-${Date.now()}`,
        }
      );

      Logger.info(`Added image processing job: ${job.id}`);
      return job;
    } catch (error) {
      Logger.error("Error adding image processing job:", error);
      throw error;
    }
  }

  async addThumbnailGenerationJob(jobData, options = {}) {
    try {
      const job = await thumbnailGenerationQueue.add(
        JOB_TYPES.GENERATE_THUMBNAILS,
        jobData,
        {
          ...options,
          jobId: `${jobData.userId}-${jobData.folderId}-${Date.now()}`,
        }
      );
      Logger.info(`Added thumbnail generation job: ${job.id}`);
      return job;
    } catch (error) {
      Logger.error("Error adding thumbnail generation job:", error);
      throw error;
    }
  }

  async addFaceThumbnailGenerationJob(jobData, options = {}) {
    try {
      const job = await faceThumbnailGenerationQueue.add(
        JOB_TYPES.GENERATE_FACE_THUMBNAILS,
        jobData,
        {
          ...options,
          jobId: `face-${jobData.faceId}-${Date.now()}`,
        }
      );
      Logger.info(`Added face thumbnail generation job: ${job.id}`);
      return job;
    } catch (error) {
      Logger.error("Error adding face thumbnail generation job:", error);
      throw error;
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(queueName, jobId) {
    try {
      const queue = this.queues[queueName];
      if (!queue) {
        throw new Error(`Queue ${queueName} not found`);
      }

      const job = await queue.getJob(jobId);
      if (!job) {
        return null;
      }

      return {
        id: job.id,
        name: job.name,
        data: job.data,
        progress: job.progress,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        failedReason: job.failedReason,
        state: await job.getState(),
      };
    } catch (error) {
      Logger.error("Error getting job status:", error);
      throw error;
    }
  }

  /**
   * Clean up completed and failed jobs
   */
  async cleanupJobs() {
    try {
      for (const queue of Object.values(this.queues)) {
        await queue.clean(24 * 60 * 60 * 1000, 100, "completed");
        await queue.clean(24 * 60 * 60 * 1000, 50, "failed");
      }
      Logger.info("Queue cleanup completed");
    } catch (error) {
      Logger.error("Error during queue cleanup:", error);
    }
  }
}

export default new QueueService();
