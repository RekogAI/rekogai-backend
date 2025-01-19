import {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  ListBucketsCommand,
  waitUntilBucketExists,
  waitUntilBucketNotExists,
  BucketAlreadyExists,
  BucketAlreadyOwnedByYou,
} from "@aws-sdk/client-s3";
import configObj from "../config.js";
const { config, ENVIRONMENT } = configObj;
import Logger from "../lib/Logger.js";

// Initialize S3 Client Configuration
const s3Config = {
  region: "ap-south-1",
  credentials: {
    accessKeyId: config[ENVIRONMENT].AWS_ACCESS_KEY_ID,
    secretAccessKey: config[ENVIRONMENT].AWS_SECRET_ACCESS_KEY,
  },
};

/**
 * S3 Model - Contains methods for S3 operations.
 */
class S3Model {
  constructor() {
    this.client = new S3Client(s3Config);
  }

  /**
   * Create an Amazon S3 bucket.
   * @param {string} bucketName - The name of the bucket to create.
   */
  async createBucket(reqParams) {
    const { bucketName } = reqParams;
    try {
      const { Location } = await this.client.send(
        new CreateBucketCommand({ Bucket: bucketName })
      );
      Logger.info("S3Model  createBucket  Location", Location);

      await waitUntilBucketExists(
        { client: this.client },
        { Bucket: bucketName }
      );
      Logger.info(`Bucket created successfully with location: ${Location}`);
      return Location;
    } catch (error) {
      Logger.info("S3Model  createBucket  error", error);
      if (error instanceof BucketAlreadyExists) {
        Logger.error(
          `The bucket "${bucketName}" already exists in another AWS account.`
        );
      } else if (error instanceof BucketAlreadyOwnedByYou) {
        Logger.error(
          `The bucket "${bucketName}" already exists in this AWS account.`
        );
      } else {
        Logger.error("Error creating bucket:", error);
      }
      throw error;
    }
  }

  /**
   * Delete an Amazon S3 bucket.
   * @param {string} bucketName - The name of the bucket to delete.
   */
  async deleteBucket(bucketName) {
    try {
      await this.client.send(new DeleteBucketCommand({ Bucket: bucketName }));
      await waitUntilBucketNotExists(
        { client: this.client },
        { Bucket: bucketName }
      );
      Logger.info(`Bucket "${bucketName}" deleted successfully.`);
    } catch (error) {
      Logger.error("Error deleting bucket:", error);
      throw error;
    }
  }

  /**
   * List all Amazon S3 buckets in the account.
   */
  async listBuckets() {
    try {
      const { Buckets } = await this.client.send(new ListBucketsCommand());
      Logger.info("Buckets:", Buckets);
      return Buckets;
    } catch (error) {
      Logger.error("Error listing buckets:", error);
      throw error;
    }
  }
}

export default S3Model;
