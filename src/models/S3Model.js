import {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  ListBucketsCommand,
  waitUntilBucketExists,
  waitUntilBucketNotExists,
  BucketAlreadyExists,
  BucketAlreadyOwnedByYou,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import configObj from "../config.js";
const { config, ENVIRONMENT, AWS_REGION } = configObj;
import Logger from "../lib/Logger.js";
import { changeCasing, generateUUID } from "../utility/index.js";
import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  PRESIGNED_URL_EXPIRES_IN,
  S3_OBJECT_UPLOAD_STATUS,
  TABLE_NAME,
} from "../utility/constants.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import moment from "moment";

class S3Model {
  constructor() {
    this.client = new S3Client(config[ENVIRONMENT].AWS_SDK_CONFIG);
    this.dynamoClient = new DynamoDBClient(config[ENVIRONMENT].AWS_SDK_CONFIG);
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

  async addPhotoToBucket({ bucketId, fileDetails, userId }) {}

  /**
   * Generates a pre-signed URL to upload a file to S3, along with a photo ID stored in DynamoDB.
   * The URL expires in 1 hour.
   *
   * @param {String} bucketId - The ID of the S3 bucket to upload the file to.
   * @param {Object} fileDetails - Details of the file being uploaded:
   *   - {String} fileDetails.name - The name of the file.
   *   - {Number} fileDetails.size - The size of the file in bytes.
   *   - {String} fileDetails.type - The MIME type of the file.
   * @param {String} userId - The user requesting to generate the pre-signed URL.
   * @return {Object} An object containing:
   *   - {String} preSignedURL - The pre-signed URL returned from the S3 response, valid for 1 hour.
   *   - {String} photoId - A UUID to identify the photo stored in DynamoDB.
   *   - {String} fileStatus - Status of the URL generation, either 'PRESIGNED_URL_GENERATED' or 'FAILED_TO_GENERATE_PRESIGNED_URL'.
   */
  async generatePreSignedURL({ bucketName, fileDetails, userId, bucketId }) {
    const photoId = generateUUID();

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: photoId,
    });

    const signedUrl = await getSignedUrl(this.client, command, {
      expiresIn: PRESIGNED_URL_EXPIRES_IN.AN_HOUR,
    });

    console.log("Signed URL:", signedUrl);

    try {
      const dynamoParams = {
        TableName: TABLE_NAME.PHOTOS,
        Item: {
          photoId: { S: photoId },
          userId: { S: userId },
          preSignedURL: { S: signedUrl },
          fileName: { S: fileDetails.name },
          fileSize: { N: fileDetails.size.toString() },
          fileMIMEType: { S: fileDetails.type },
          createdAt: { S: moment().format("DD/MM/YYYY HH:mm:ss") },
          bucketId: { S: bucketId },
          preSignedURLTTL: {
            N: PRESIGNED_URL_EXPIRES_IN.AN_HOUR.toString(),
          },
        },
      };
      console.log("S3Model  generatePreSignedURL  dynamoParams", dynamoParams);
      const dynamoResponse = await this.dynamoClient.send(
        new PutItemCommand(dynamoParams)
      );
      console.log(
        "S3Model  generatePreSignedURL  dynamoResponse",
        dynamoResponse
      );

      return {
        photoId,
        preSignedURL: signedUrl,
        fileStatus: S3_OBJECT_UPLOAD_STATUS.PRESIGNED_URL_GENERATED,
        preSignedURLTTL: PRESIGNED_URL_EXPIRES_IN.AN_HOUR,
      };
    } catch (error) {
      console.error(
        "Error generating pre-signed URL or saving to DynamoDB:",
        error
      );
      return {
        preSignedURL: null,
        photoId: null,
        fileStatus: S3_OBJECT_UPLOAD_STATUS.FAILED_TO_GENERATE_PRESIGNED_URL,
      };
    }
  }
}

export default S3Model;
