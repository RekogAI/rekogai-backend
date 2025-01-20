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

// Initialize Cognito Client Configuration
const dynamoDBConfig = {
  region: AWS_REGION,
  credentials: {
    accessKeyId: config[ENVIRONMENT].AWS_ACCESS_KEY_ID,
    secretAccessKey: config[ENVIRONMENT].AWS_SECRET_ACCESS_KEY,
  },
};

class DynamoDBModel {
  constructor() {
    this.client = new DynamoDBClient(dynamoDBConfig);
    this.s3Model = new S3Model();
  }

  /**
   * Create Users Table with GSI for email
   */
  async createUsersTable() {
    const params = {
      TableName: TABLE_NAME.USERS,
      KeySchema: [{ AttributeName: "UserID", KeyType: "HASH" }], // Partition Key
      AttributeDefinitions: [
        { AttributeName: "UserID", AttributeType: "S" }, // Primary key
        { AttributeName: "Email", AttributeType: "S" }, // GSI attribute
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "EmailIndex", // GSI name
          KeySchema: [{ AttributeName: "Email", KeyType: "HASH" }], // Partition Key for GSI
          Projection: {
            ProjectionType: "ALL", // Include all attributes in the index
          },
        },
      ],
      BillingMode: "PAY_PER_REQUEST", // Use on-demand pricing
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

  /**
   * Create Buckets Table
   */
  async createBucketsTable() {
    const params = {
      TableName: TABLE_NAME.BUCKETS,
      KeySchema: [{ AttributeName: "BucketID", KeyType: "HASH" }], // Partition Key
      AttributeDefinitions: [
        { AttributeName: "BucketID", AttributeType: "S" },
        { AttributeName: "UserID", AttributeType: "S" },
      ],
      BillingMode: "PAY_PER_REQUEST",
      GlobalSecondaryIndexes: [
        {
          IndexName: "UserIDIndex",
          KeySchema: [{ AttributeName: "UserID", KeyType: "HASH" }],
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

  /**
   * Create Photos Table
   */
  async createPhotosTable() {
    const params = {
      TableName: TABLE_NAME.PHOTOS,
      KeySchema: [{ AttributeName: "PhotoID", KeyType: "HASH" }], // Partition Key
      AttributeDefinitions: [
        { AttributeName: "PhotoID", AttributeType: "S" },
        { AttributeName: "BucketID", AttributeType: "S" },
      ],
      BillingMode: "PAY_PER_REQUEST",
      GlobalSecondaryIndexes: [
        {
          IndexName: "BucketIDIndex",
          KeySchema: [{ AttributeName: "BucketID", KeyType: "HASH" }],
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
  async createBucket({ userID, bucketName }) {
    try {
      const bucketLocation = await this.s3Model.createBucket({
        bucketName,
      });

      const isBucketCreated = !!bucketLocation;
      if (isBucketCreated) {
        const bucketID = generateUUID();
        const params = {
          TableName: TABLE_NAME.BUCKETS,
          Item: {
            BucketID: { S: bucketID },
            UserID: { S: userID },
            BucketName: { S: bucketName },
            CreatedAt: { S: moment().format("DD/MM/YYYY HH:mm:ss") },
          },
        };
        const result = await this.client.send(new PutItemCommand(params));
        Logger.info("Bucket created successfully.", result);
        return { bucketLocation, bucketId: bucketID };
      }

      return bucketLocation;
    } catch (error) {
      Logger.error("Error creating bucket:", error.message);
      throw error;
    }
  }
}

export default DynamoDBModel;
