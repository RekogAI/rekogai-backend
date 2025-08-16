import { redisPubSub, redis } from "../config/redis.js";
import Logger from "../lib/Logger.js";

export const CHANNELS = {
  JOB_PROGRESS: "job:progress",
  JOB_COMPLETED: "job:completed",
  JOB_FAILED: "job:failed",
  USER_NOTIFICATIONS: "user:notifications",
};

export const EVENT_TYPES = {
  JOB_STARTED: "job_started",
  JOB_PROGRESS: "job_progress",
  JOB_COMPLETED: "job_completed",
  JOB_FAILED: "job_failed",
};

class NotificationService {
  constructor() {
    this.subscribers = new Map();
  }

  /**
   * Publish job progress update
   */
  async publishJobProgress(jobData) {
    try {
      const message = {
        type: EVENT_TYPES.JOB_PROGRESS,
        timestamp: new Date().toISOString(),
        ...jobData,
      };

      await redis.publish(CHANNELS.JOB_PROGRESS, JSON.stringify(message));

      // Also publish to user-specific channel
      if (jobData.userId) {
        await redis.publish(
          `${CHANNELS.USER_NOTIFICATIONS}:${jobData.userId}`,
          JSON.stringify(message)
        );
      }

      Logger.info(`Published job progress: ${jobData.jobId}`);
    } catch (error) {
      Logger.error("Error publishing job progress:", error);
    }
  }

  /**
   * Publish job completion
   */
  async publishJobCompleted(jobData) {
    try {
      const message = {
        type: EVENT_TYPES.JOB_COMPLETED,
        timestamp: new Date().toISOString(),
        ...jobData,
      };

      await redis.publish(CHANNELS.JOB_COMPLETED, JSON.stringify(message));

      if (jobData.userId) {
        await redis.publish(
          `${CHANNELS.USER_NOTIFICATIONS}:${jobData.userId}`,
          JSON.stringify(message)
        );
      }

      Logger.info(`Published job completion: ${jobData.jobId}`);
    } catch (error) {
      Logger.error("Error publishing job completion:", error);
    }
  }

  /**
   * Publish job failure
   */
  async publishJobFailed(jobData) {
    try {
      const message = {
        type: EVENT_TYPES.JOB_FAILED,
        timestamp: new Date().toISOString(),
        ...jobData,
      };

      await redis.publish(CHANNELS.JOB_FAILED, JSON.stringify(message));

      if (jobData.userId) {
        await redis.publish(
          `${CHANNELS.USER_NOTIFICATIONS}:${jobData.userId}`,
          JSON.stringify(message)
        );
      }

      Logger.error(`Published job failure: ${jobData.jobId}`);
    } catch (error) {
      Logger.error("Error publishing job failure:", error);
    }
  }

  /**
   * Subscribe to a channel
   */
  async subscribe(channel, callback) {
    try {
      if (!this.subscribers.has(channel)) {
        this.subscribers.set(channel, new Set());
        await redisPubSub.subscribe(channel);
      }

      this.subscribers.get(channel).add(callback);

      redisPubSub.on("message", (receivedChannel, message) => {
        if (receivedChannel === channel) {
          try {
            const data = JSON.parse(message);
            callback(data);
          } catch (error) {
            Logger.error("Error parsing notification message:", error);
          }
        }
      });

      Logger.info(`Subscribed to channel: ${channel}`);
    } catch (error) {
      Logger.error("Error subscribing to channel:", error);
      throw error;
    }
  }

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(channel, callback) {
    try {
      if (this.subscribers.has(channel)) {
        this.subscribers.get(channel).delete(callback);

        if (this.subscribers.get(channel).size === 0) {
          await redisPubSub.unsubscribe(channel);
          this.subscribers.delete(channel);
        }
      }

      Logger.info(`Unsubscribed from channel: ${channel}`);
    } catch (error) {
      Logger.error("Error unsubscribing from channel:", error);
    }
  }
}

export default new NotificationService();
