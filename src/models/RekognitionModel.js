import {
  RekognitionClient,
  CreateCollectionCommand,
  IndexFacesCommand,
  SearchFacesByImageCommand,
} from "@aws-sdk/client-rekognition";
import { generateUUID } from "../utility/index.js";

import { S3Client, ListObjectsCommand } from "@aws-sdk/client-s3";

import configObj from "../config.js";
import Logger from "../lib/Logger.js";
import { TABLE_NAME } from "../utility/constants.js";
import {
  DynamoDBClient,
  QueryCommand,
  BatchWriteItemCommand,
} from "@aws-sdk/client-dynamodb";
import moment from "moment/moment.js";

const { config, ENVIRONMENT } = configObj;

class RekognitionModel {
  constructor() {
    this.rekognitionClient = new RekognitionClient(
      config[ENVIRONMENT].AWS_SDK_CONFIG
    );
    this.s3Client = new S3Client(config[ENVIRONMENT].AWS_SDK_CONFIG);
    this.dynamoClient = new DynamoDBClient(config[ENVIRONMENT].AWS_SDK_CONFIG);
  }

  /**
   * Creates a face collection.
   */
  async createCollection() {
    try {
      const collectionId = generateUUID();
      const command = new CreateCollectionCommand({
        CollectionId: collectionId,
      });
      const response = await this.rekognitionClient.send(command);
      Logger.info("Face collection created:", response);
      return { collectionId };
    } catch (error) {
      if (error.name === "ResourceAlreadyExistsException") {
        return "Collection already exists.";
      } else {
        Logger.error("Error creating collection:", error);
        throw error;
      }
    }
  }

  async getFacesByCollectionId(collectionId) {
    const params = {
      TableName: TABLE_NAME.FACES,
      IndexName: "collectionIdIndex",
      KeyConditionExpression: "collectionId = :collectionId",
      ExpressionAttributeValues: {
        ":collectionId": collectionId,
      },
    };

    try {
      const command = new QueryCommand(params);
      const data = await this.dynamoClient.send(command);
      Logger.info("Faces retrieved:", data.Items);

      return data.Items.map((item) => ({
        ...item,
        FaceAttributes: JSON.parse(item.FaceAttributes), // Parse JSON string back to an object
      }));
    } catch (error) {
      Logger.error("Error querying faces by CollectionId:", error);
      throw error;
    }
  }

  async searchIndexedFaces({ bucketName, key }) {
    console.log(
      "RekognitionModel  searchIndexedFaces  bucketName",
      bucketName,
      key
    );
    const params = {
      TableName: TABLE_NAME.FACES,
      IndexName: "bucketName-imageKey-index",
      KeyConditionExpression:
        "bucketName = :bucketName AND imageKey = :imageKey",
      ExpressionAttributeValues: {
        ":bucketName": bucketName,
        ":imageKey": key,
      },
    };

    try {
      const command = new QueryCommand(params);
      const data = await this.dynamoClient.send(command);
      console.log("RekognitionModel  searchIndexedFaces  data", data);
      if (data?.Items?.length > 0) {
        Logger.info("Face found in DynamoDB:", data.Items);
        return data.Items[0]; // Return the first matching item.
      } else {
        Logger.info("Face not found in DynamoDB.");
        return null; // No match.
      }
    } catch (error) {
      Logger.error("Error searching for face in DynamoDB:", error);
      return null;
    }
  }

  async storeIndexedFaces({ faceRecords, bucketName, key, collectionId }) {
    console.log(
      "RekognitionModel  storeIndexedFaces  { faceRecords, bucketName, key, collectionId }",
      { faceRecords, bucketName, key, collectionId }
    );
    console.log(
      "RekognitionModel  storeIndexedFaces  faceRecords",
      faceRecords[0]?.Face,
      faceRecords[0]?.FaceDetail
    );
    Logger.info(
      "RekognitionModel  storeIndexedFaces  faceRecords",
      faceRecords[0]?.Face,
      faceRecords[0]?.FaceDetail
    );
    console.log(
      "RekognitionModel  storeIndexedFaces  faceRecords",
      JSON.stringify(faceRecords)
    );

    const tableName = TABLE_NAME.FACES;
    const putRequests = faceRecords.map((faceRecord) => ({
      PutRequest: {
        Item: {
          faceId: { S: faceRecord?.Face?.FaceId },
          imageKey: { S: key },
          bucketName: { S: bucketName },
          collectionId: { S: collectionId },
          faceAttributes: { S: JSON.stringify(faceRecord) },
          // createdAt: { S: moment().format("DD/MM/YYYY HH:mm:ss") },
        },
      },
    }));

    const params = {
      RequestItems: {
        [tableName]: putRequests,
      },
    };

    console.log(
      "RekognitionModel  putRequests  putRequests",
      JSON.stringify(params)
    );

    try {
      const command = new BatchWriteItemCommand(params);
      const data = await this.dynamoClient.send(command);
      Logger.info("Indexed faces stored successfully in DynamoDB.", data);
    } catch (error) {
      Logger.error("Error storing indexed faces in DynamoDB:", error);
      throw error;
    }
  }

  /**
   * Indexes faces from an image in S3 into the collection.
   * @param {string} bucketName - The name of the S3 bucket.
   * @param {string} objectKey - The key of the S3 object.
   * @returns {Promise<Object[]>} - Indexed face metadata.
   */
  async indexFaces({ bucketName, key, collectionId }) {
    const existingFace = await this.searchIndexedFaces({ bucketName, key });

    if (existingFace) {
      Logger.info(`Face already indexed for ${key}:`, existingFace);
      return existingFace;
    }

    try {
      const command = new IndexFacesCommand({
        CollectionId: collectionId,
        Image: { S3Object: { Bucket: bucketName, Name: key } },
        MaxFaces: 1,
        QualityFilter: "AUTO",
        DetectionAttributes: ["DEFAULT"],
      });
      const response = await this.rekognitionClient.send(command);
      Logger.info("RekognitionModel  indexFaces  response", response);
      Logger.info(`Faces indexed for ${key}:`, response.FaceRecords);

      // 3. Store indexed faces in DynamoDB.
      await this.storeIndexedFaces({
        faceRecords: response.FaceRecords,
        bucketName,
        key,
        collectionId,
      });

      return response.FaceRecords.map((record) => record.Face);
    } catch (error) {
      Logger.error("Error indexing faces:", error);
      throw error;
    }
  }

  /**
   * Searches for similar faces in the collection by image.
   * @param {string} bucketName - The S3 bucket name.
   * @param {string} objectKey - The object key in the S3 bucket.
   * @returns {Promise<Object[]>} - Matching faces metadata.
   */
  async searchFacesByImage({ bucketName, key, collectionId }) {
    try {
      const command = new SearchFacesByImageCommand({
        CollectionId: collectionId,
        Image: {
          S3Object: { Bucket: bucketName, Name: key },
        },
        MaxFaces: 5,
        QualityFilter: "AUTO",
        FaceMatchThreshold: 95,
      });
      const response = await this.rekognitionClient.send(command);
      Logger.info(`Found similar faces for ${key}:`, response.FaceMatches);
      return response.FaceMatches;
    } catch (error) {
      Logger.error("Error searching faces by image:", error);
      throw error;
    }
  }

  /**
   * Groups faces into albums based on similarity.
   * @param {string} bucketName - The name of the S3 bucket.
   */
  async groupFacesIntoAlbums({ bucketName, collectionId }) {
    try {
      const command = new ListObjectsCommand({ Bucket: bucketName });
      const listResponse = await this.s3Client.send(command);
      const objectKeys = listResponse.Contents.map((item) => item.Key);

      const albums = {};

      for (const key of objectKeys) {
        Logger.info(`Processing: ${key}`);
        const faceMatches = await this.searchFacesByImage({
          bucketName,
          key,
          collectionId,
        });
        if (faceMatches.length > 0) {
          // Assign image to the album of the best match
          const bestMatchId = faceMatches[0].Face.FaceId;
          if (!albums[bestMatchId]) albums[bestMatchId] = [];
          albums[bestMatchId].push(key);
        } else {
          // If no match, treat as a new album
          const indexedFaces = await this.indexFaces({
            bucketName,
            key,
            collectionId,
          });
          const newFaceId = indexedFaces[0]?.FaceId;
          if (newFaceId) albums[newFaceId] = [key];
        }
      }

      Logger.info("Albums created:", albums);
      return albums;
    } catch (error) {
      Logger.error("Error grouping faces into albums:", error);
      throw error;
    }
  }
}

export default RekognitionModel;
