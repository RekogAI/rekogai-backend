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

const { config, ENVIRONMENT } = configObj;

class RekognitionModel {
  constructor() {
    this.rekognitionClient = new RekognitionClient(
      config[ENVIRONMENT].AWS_SDK_CONFIG
    );
    this.s3Client = new S3Client(config[ENVIRONMENT].AWS_SDK_CONFIG);
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

  /**
   * Indexes faces from an image in S3 into the collection.
   * @param {string} bucketName - The name of the S3 bucket.
   * @param {string} objectKey - The key of the S3 object.
   * @returns {Promise<Object[]>} - Indexed face metadata.
   */
  async indexFaces({ bucketName, key, collectionId }) {
    try {
      const command = new IndexFacesCommand({
        CollectionId: collectionId,
        Image: { S3Object: { Bucket: bucketName, Name: key } },
        MaxFaces: 1,
        QualityFilter: "AUTO",
        DetectionAttributes: ["DEFAULT"],
      });
      const response = await this.rekognitionClient.send(command);
      Logger.info(`Faces indexed for ${key}:`, response.FaceRecords);
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
