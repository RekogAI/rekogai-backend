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
  FACE_DETECTION: "face-detection",
  FACE_INDEXING: "face-indexing",
  ALBUM_CREATION: "album-creation",
};

// Create queues
export const imageProcessingQueue = new Queue(
  QUEUE_NAMES.IMAGE_PROCESSING,
  queueConfig
);
export const faceDetectionQueue = new Queue(
  QUEUE_NAMES.FACE_DETECTION,
  queueConfig
);
export const faceIndexingQueue = new Queue(
  QUEUE_NAMES.FACE_INDEXING,
  queueConfig
);
export const albumCreationQueue = new Queue(
  QUEUE_NAMES.ALBUM_CREATION,
  queueConfig
);

// Job types
export const JOB_TYPES = {
  PROCESS_IMAGES_BATCH: "process-images-batch",
  DETECT_FACES: "detect-faces",
  INDEX_FACES: "index-faces",
  CREATE_ALBUMS: "create-albums",
};

class QueueService {
  constructor() {
    this.queues = {
      [QUEUE_NAMES.IMAGE_PROCESSING]: imageProcessingQueue,
      [QUEUE_NAMES.FACE_DETECTION]: faceDetectionQueue,
      [QUEUE_NAMES.FACE_INDEXING]: faceIndexingQueue,
      [QUEUE_NAMES.ALBUM_CREATION]: albumCreationQueue,
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

  /**
   * Add face detection job
   */
  async addFaceDetectionJob(jobData, options = {}) {
    try {
      const job = await faceDetectionQueue.add(
        JOB_TYPES.DETECT_FACES,
        jobData,
        options
      );

      Logger.info(`Added face detection job: ${job.id}`);
      return job;
    } catch (error) {
      Logger.error("Error adding face detection job:", error);
      throw error;
    }
  }

  /**
   * Add face indexing job
   */
  async addFaceIndexingJob(jobData, options = {}) {
    try {
      const job = await faceIndexingQueue.add(
        JOB_TYPES.INDEX_FACES,
        jobData,
        options
      );

      Logger.info(`Added face indexing job: ${job.id}`);
      return job;
    } catch (error) {
      Logger.error("Error adding face indexing job:", error);
      throw error;
    }
  }

  /**
   * Add album creation job
   */
  async addAlbumCreationJob(jobData, options = {}) {
    try {
      const job = await albumCreationQueue.add(
        JOB_TYPES.CREATE_ALBUMS,
        jobData,
        options
      );

      Logger.info(`Added album creation job: ${job.id}`);
      return job;
    } catch (error) {
      Logger.error("Error adding album creation job:", error);
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
