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
const { config, ENVIRONMENT, AWS_REGION } = configObj;
import Logger from "../lib/Logger.js";
import { changeCasing } from "../utility/index.js";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { TABLE_NAME } from "../utility/constants.js";

const s3Config = {
  region: AWS_REGION,
  credentials: {
    accessKeyId: config[ENVIRONMENT].AWS_ACCESS_KEY_ID,
    secretAccessKey: config[ENVIRONMENT].AWS_SECRET_ACCESS_KEY,
  },
};

class S3Model {
  constructor() {
    this.client = new S3Client(s3Config);
    this.dynamoClient = new DynamoDBClient(s3Config);
  }

  async createBucket({ bucketName }) {
    try {
      const bucketCreationResponse = await this.client.send(
        new CreateBucketCommand({ Bucket: bucketName })
      );
      Logger.info("S3Model  createBucket  Location", bucketCreationResponse);

      await waitUntilBucketExists(
        { client: this.client },
        { Bucket: bucketName }
      );
      const { Location } = bucketCreationResponse || {};
      Logger.info(`Bucket created successfully with location: ${Location}`);

      return changeCasing({ location: Location });
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

      const response = {
        successMessage: "Bucket deleted successfully",
        statusCode: 200,
      };
      return changeCasing(response);
    } catch (error) {
      Logger.error("Error deleting bucket:", error);
      throw error;
    }
  }

  async listBuckets() {
    try {
      const listBucketsResponse = await this.client.send(
        new ListBucketsCommand()
      );

      Logger.info("Buckets:", listBucketsResponse.Buckets);

      return changeCasing(listBucketsResponse);
    } catch (error) {
      Logger.error("Error listing buckets:", error);
      throw error;
    }
  }

  async listUserBuckets({ userId }) {
    try {
      const queryCommand = new QueryCommand({
        TableName: TABLE_NAME.BUCKETS,
        IndexName: "userIdIndex",
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":userId": { S: userId },
        },
      });

      const dynamoResponse = await this.dynamoClient.send(queryCommand);
      console.log("S3Model  listUserBuckets  dynamoResponse", dynamoResponse);

      const buckets = dynamoResponse?.Items || [];

      if (buckets.length === 0) {
        Logger.info(`No buckets found for user with ID: ${userId}`);
        return {
          message: "No buckets found for user",
          buckets: [],
        };
      }

      Logger.info(`Buckets fetched from DynamoDB for user ${userId}:`, buckets);

      const formattedBuckets = buckets.map((bucket) => ({
        bucketId: bucket.bucketId.S,
        bucketName: bucket.bucketName.S,
        createdDate: bucket.createdDate?.S,
      }));

      return changeCasing({ buckets: formattedBuckets });
    } catch (error) {
      Logger.error(
        `Error listing buckets for user ${userId} from DynamoDB:`,
        error
      );
      throw error;
    }
  }
}

export default S3Model;
