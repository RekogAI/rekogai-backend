import {
  DynamoDBClient,
  CreateTableCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import Logger from "../lib/Logger.js";
import configObj from "../config.js";
const { config, ENVIRONMENT, AWS_REGION } = configObj;
import S3Model from "./S3Model.js";
import { TABLE_NAME } from "../utility/constants.js";
import { generateUUID } from "../utility/index.js";
import moment from "moment";

class DynamoDBModel {
  constructor() {
    this.client = new DynamoDBClient(config[ENVIRONMENT].AWS_SDK_CONFIG);
    this.s3Model = new S3Model();
  }

  async createUsersTable() {
    const params = {
      TableName: TABLE_NAME.USERS,
      KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
      AttributeDefinitions: [
        { AttributeName: "userId", AttributeType: "S" },
        { AttributeName: "email", AttributeType: "S" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "emailIndex",
          KeySchema: [{ AttributeName: "email", KeyType: "HASH" }],
          Projection: {
            ProjectionType: "ALL",
          },
        },
      ],
      BillingMode: "PAY_PER_REQUEST",
    };

    try {
      const result = await this.client.send(new CreateTableCommand(params));
      Logger.info("Users table with GSI created successfully.", result);
      return result;
    } catch (error) {
      Logger.error("Error creating Users table:", error.message);
      throw error;
    }
  }

  async createBucketsTable() {
    const params = {
      TableName: TABLE_NAME.BUCKETS,
      KeySchema: [{ AttributeName: "bucketId", KeyType: "HASH" }],
      AttributeDefinitions: [
        { AttributeName: "bucketId", AttributeType: "S" },
        { AttributeName: "userId", AttributeType: "S" },
      ],
      BillingMode: "PAY_PER_REQUEST",
      GlobalSecondaryIndexes: [
        {
          IndexName: "userIdIndex",
          KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    };

    try {
      const result = await this.client.send(new CreateTableCommand(params));
      Logger.info("Buckets table created successfully.", result);
      return result;
    } catch (error) {
      Logger.error("Error creating Buckets table:", error.message);
      throw error;
    }
  }

  async createPhotosTable() {
    const params = {
      TableName: TABLE_NAME.PHOTOS,
      KeySchema: [{ AttributeName: "photoId", KeyType: "HASH" }],
      AttributeDefinitions: [
        { AttributeName: "photoId", AttributeType: "S" },
        { AttributeName: "bucketId", AttributeType: "S" },
      ],
      BillingMode: "PAY_PER_REQUEST",
      GlobalSecondaryIndexes: [
        {
          IndexName: "bucketIdIndex",
          KeySchema: [{ AttributeName: "bucketId", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    };

    try {
      const result = await this.client.send(new CreateTableCommand(params));
      Logger.info("Photos table created successfully.", result);
      return result;
    } catch (error) {
      Logger.error("Error creating Photos table:", error.message);
      throw error;
    }
  }

  /**
   * Initialize all tables
   */
  async initializeTables() {
    try {
      await this.createUsersTable();
      await this.createBucketsTable();
      await this.createPhotosTable();
      Logger.info("All tables initialized successfully.");
    } catch (error) {
      Logger.error("Error initializing tables:", error.message);
      throw error;
    }
  }

  /**
   * Create a bucket and store it in the Buckets table.
   * @param {string} userID - ID of the user creating the bucket.
   * @param {string} bucketName - Name of the bucket.
   * @returns {Promise<object>} - DynamoDB PutItem response.
   */
  async createBucket({ userId, bucketName }) {
    try {
      const { location } = await this.s3Model.createBucket({
        bucketName,
      });

      const isBucketCreated = !!location;
      if (isBucketCreated) {
        const bucketId = generateUUID();
        const params = {
          TableName: TABLE_NAME.BUCKETS,
          Item: {
            bucketId: { S: bucketId },
            userId: { S: userId },
            bucketName: { S: bucketName },
            CreatedAt: { S: moment().format("DD/MM/YYYY HH:mm:ss") },
          },
        };
        const result = await this.client.send(new PutItemCommand(params));
        Logger.info("Bucket created successfully.", result);
        return { bucketId, bucketLocation: location, bucketName };
      }

      return bucketLocation;
    } catch (error) {
      Logger.error("Error creating bucket:", error.message);
      throw error;
    }
  }
}

export default DynamoDBModel;
