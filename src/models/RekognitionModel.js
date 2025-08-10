import {
  RekognitionClient,
  CreateCollectionCommand,
  IndexFacesCommand,
  SearchFacesByImageCommand,
  CompareFacesCommand,
} from "@aws-sdk/client-rekognition";
import { generateUUID } from "../utility/index.js";
import { S3Client, ListObjectsCommand } from "@aws-sdk/client-s3";
import { DetectLabelsCommand } from "@aws-sdk/client-rekognition";
import configObj from "../config.js";
import Logger from "../lib/Logger.js";
import models from "../models/schemas/associations.js";
import { API_TYPES, IMAGE_STATUS } from "../utility/constants.js";
import sharp from "sharp";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import Thumbnail from "./schemas/thumbnails.js";
import { throwApiError } from "../utility/ErrorHandler.js";
import {
  API_ERROR_CODES,
  API_ERROR_MESSAGES,
  API_ERROR_STATUS_CODES,
} from "../utility/constants.error.js";
import { RekognitionExceptions } from "./exceptions.js";
import QueueService from "../services/QueueService.js";

const { Face, Album, Image, APIResponse, User } = models;

const { config, ENVIRONMENT } = configObj;

const rekognitionClient = new RekognitionClient(
  config[ENVIRONMENT].AWS_SDK_CONFIG
);
const s3Client = new S3Client(config[ENVIRONMENT].AWS_SDK_CONFIG);
/* TODO: Refactor this file and modify the functions as per FolderModel structure */

const createCollection = async () => {
  try {
    const collectionId = generateUUID();
    const command = new CreateCollectionCommand({
      CollectionId: collectionId,
    });
    const response = await rekognitionClient.send(command);
    console.log("Face collection created:", response);
    return collectionId;
  } catch (error) {
    if (error.name === "ResourceAlreadyExistsException") {
      return "Collection already exists.";
    } else {
      console.error("Error creating collection:", error);
      throw error;
    }
  }
};

const getFacesByCollectionId = async (collectionId) => {
  try {
    const faces = await Face.findAll({
      where: { collection_id: collectionId },
    });
    console.log("Faces retrieved:", faces);

    return faces.map((item) => ({
      ...item.dataValues,
      face_attributes: JSON.parse(item.face_attributes),
    }));
  } catch (error) {
    console.error("Error querying faces by CollectionId:", error);
    throw error;
  }
};

const searchIndexedFaces = async ({ bucketName, key }) => {
  try {
    const face = await Face.findOne({
      where: { bucket_name: bucketName, image_key: key },
    });
    if (face) {
      console.log("Face found in PostgreSQL:", face);
      return face.dataValues;
    } else {
      console.log("Face not found in PostgreSQL.");
      return null;
    }
  } catch (error) {
    console.error("Error searching for face in PostgreSQL:", error);
    return null;
  }
};

const storeIndexedFaces = async ({ response, collectionId, imageId }) => {
  try {
    const faceRecordsToCreate = response.FaceRecords.map((faceRecord) => ({
      faceId: faceRecord.Face.FaceId,
      imageId,
      collectionId: collectionId,
      faceRecordDetails: faceRecord,
    }));

    const createdFaceRecords = await Face.bulkCreate(faceRecordsToCreate);
    console.log("Face records created in Face table:", faceRecordsToCreate);

    return createdFaceRecords;
  } catch (error) {
    console.error("Error storing indexed faces in PostgreSQL:", error);
    throw error;
  }
};

const indexFaces = async ({ bucketName, key, collectionId, imageId }) => {
  try {
    const command = new IndexFacesCommand({
      CollectionId: collectionId,
      Image: { S3Object: { Bucket: bucketName, Name: key } },
      // MaxFaces: 1,
      QualityFilter: "MEDIUM",
      DetectionAttributes: ["DEFAULT"],
    });
    const response = await rekognitionClient.send(command);
    console.log(`Faces indexed for ${key}:`, response.FaceRecords);

    const savedFaces = await storeIndexedFaces({
      response,
      collectionId,
      imageId,
    });
    console.log("Store indexed faces response:", savedFaces);

    return response;
  } catch (error) {
    console.error("Error indexing faces:", error);
    throw error;
  }
};

const searchFacesByImage = async ({ bucketName, key, collectionId }) => {
  try {
    const command = new SearchFacesByImageCommand({
      CollectionId: collectionId,
      Image: {
        S3Object: { Bucket: bucketName, Name: key },
      },
      // MaxFaces: 5,
      QualityFilter: "AUTO",
      FaceMatchThreshold: 90, // face match threshold
    });
    const response = await rekognitionClient.send(command);
    console.log(`Found similar faces for ${key}:`, response.FaceMatches);
    return response;
  } catch (error) {
    console.error("Error searching faces by image:", error);
    throw error;
  }
};

const groupFacesIntoAlbums = async ({ bucketName, collectionId }) => {
  try {
    const command = new ListObjectsCommand({ Bucket: bucketName });
    const listResponse = await s3Client.send(command);
    const objectKeys = listResponse.Contents.map((item) => item.Key);

    const albums = {};

    for (const key of objectKeys) {
      console.log(`Processing: ${key}`);
      const faceMatches = await searchFacesByImage({
        bucketName,
        key,
        collectionId,
      });
      if (faceMatches.length > 0) {
        const bestMatchId = faceMatches[0].Face.FaceId;
        if (!albums[bestMatchId]) albums[bestMatchId] = [];
        albums[bestMatchId].push(key);
      } else {
        const indexedFaces = await indexFaces({
          bucketName,
          key,
          collectionId,
        });
        const newFaceId = indexedFaces[0]?.FaceId;
        if (newFaceId) albums[newFaceId] = [key];
      }
    }

    console.log("Albums created:", albums);
    return albums;
  } catch (error) {
    console.error("Error grouping faces into albums:", error);
    throw error;
  }
};

const getCollectionId = async (userId) => {
  try {
    const faceCollectionId = await User.findOne({
      where: { userId },
      attributes: ["collectionId"],
    });

    if (!faceCollectionId) {
      RekognitionExceptions.throwCollectionNotFoundError();
    }
    console.log("Face collection ID retrieved:", faceCollectionId);
    return faceCollectionId.collectionId;
  } catch (error) {
    console.error("Error retrieving face collection ID:", error);
    RekognitionExceptions.throwInvalidParametersError();
  }
};

const startImageProcessingJob = async ({ userId, folderId }) => {
  if (!userId || !folderId) {
    RekognitionExceptions.throwInvalidParametersError();
  }

  try {
    // Add job to queue instead of processing directly
    const job = await QueueService.addImageProcessingJob({
      userId,
      folderId,
      startedAt: new Date().toISOString(),
    });

    Logger.info(`Queued image processing job: ${job.id} for user: ${userId}`);

    return {
      jobId: job.id,
      status: "queued",
      message: "Image processing job has been queued and will start shortly",
    };
  } catch (error) {
    Logger.error("Error starting image processing job:", error);
    throw error;
  }
};

const registerFaceAuth = async (faceIDImageBase64) => {
  if (!faceIDImageBase64) {
    throwApiError(
      API_ERROR_STATUS_CODES.BAD_REQUEST,
      API_ERROR_MESSAGES.INVALID_PARAMETERS,
      API_ERROR_CODES.INVALID_PARAMETERS
    );
  }

  const collectionId = config[ENVIRONMENT].REKOGNITION_AUTH_COLLECTION_ID;

  try {
    // Step 1: Try to find if the face already exists in the collection
    console.log(`Searching for existing face in collection: ${collectionId}`);

    const faceIDImageBuffer = Buffer.from(faceIDImageBase64, "base64");

    const searchCommand = new SearchFacesByImageCommand({
      CollectionId: collectionId,
      Image: { Bytes: faceIDImageBuffer },
      MaxFaces: 1,
      QualityFilter: "MEDIUM",
      FaceMatchThreshold: 80,
    });
    console.log(" registerFace searchCommand", searchCommand);

    const searchResponse = await rekognitionClient.send(searchCommand);

    // If face already exists, return the matched face
    if (searchResponse.FaceMatches && searchResponse.FaceMatches.length > 0) {
      const faceMatch = searchResponse.FaceMatches[0];
      console.log("Face already exists in collection:", {
        faceId: faceMatch.Face.FaceId,
        similarity: faceMatch.Similarity,
      });

      return {
        isNewFace: false,
        faceId: faceMatch.Face.FaceId,
        similarity: faceMatch.Similarity,
      };
    }

    // Step 2: Face not found, so index it
    console.log("Face not found in collection, indexing new face");

    const indexCommand = new IndexFacesCommand({
      CollectionId: collectionId,
      Image: { Bytes: faceIDImageBuffer },
      MaxFaces: 1,
      QualityFilter: "MEDIUM",
      DetectionAttributes: ["DEFAULT"],
    });

    const indexResponse = await rekognitionClient.send(indexCommand);
    console.log(" registerFace indexResponse", indexResponse);

    // Check if indexing was successful
    if (!indexResponse.FaceRecords || indexResponse.FaceRecords.length === 0) {
      throwApiError(
        API_ERROR_STATUS_CODES.BAD_REQUEST,
        API_ERROR_MESSAGES.NO_FACE_FOUND,
        API_ERROR_CODES.NO_FACE_FOUND
      );
    }

    // check for multiple faces
    if (indexResponse.FaceRecords.length > 1) {
      throwApiError(
        API_ERROR_STATUS_CODES.BAD_REQUEST,
        API_ERROR_MESSAGES.MULTIPLE_FACES_FOUND,
        API_ERROR_CODES.MULTIPLE_FACES_FOUND
      );
    }

    const indexedFace = indexResponse.FaceRecords[0];
    console.log("Face indexed successfully:", {
      faceId: indexedFace.Face.FaceId,
    });

    // Return newly indexed face
    return {
      isNewFace: true,
      faceId: indexedFace.Face.FaceId,
    };
  } catch (error) {
    throw error;
  }
};

const verifyFace = async ({ faceImage }) => {
  if (!faceImage) {
    throw new Error("Face image is required");
  }

  const collectionId = config[ENVIRONMENT].REKOGNITION_AUTH_COLLECTION_ID;

  try {
    const searchCommand = new SearchFacesByImageCommand({
      CollectionId: collectionId,
      Image: { Bytes: Buffer.from(faceImage, "base64") },
      MaxFaces: 1,
      QualityFilter: "MEDIUM",
      FaceMatchThreshold: 80,
    });

    const searchResponse = await rekognitionClient.send(searchCommand);

    if (searchResponse.FaceMatches && searchResponse.FaceMatches.length > 0) {
      const faceMatch = searchResponse.FaceMatches[0];
      console.log("Face found in collection:", {
        faceId: faceMatch.Face.FaceId,
        similarity: faceMatch.Similarity,
      });

      return {
        faceId: faceMatch.Face.FaceId,
        similarity: faceMatch.Similarity,
      };
    } else {
      console.log("No matching faces found in collection");
      return null;
    }
  } catch (error) {
    console.error("Error searching for face:", error);
    throw new Error("Failed to search for face: " + error.message);
  }
};

const streamToBuffer = async (stream) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
};

const authenticateFaceAuth = async (s3ImageKey, faceImageBase64) => {
  console.log(` authenticateFace `, {
    s3ImageKey,
    faceImageBase64: faceImageBase64
      ? `${faceImageBase64.substring(0, 50)}...`
      : null,
  });

  if (!s3ImageKey || !faceImageBase64) {
    throwApiError(
      API_ERROR_STATUS_CODES.BAD_REQUEST,
      API_ERROR_MESSAGES.INVALID_PARAMETERS,
      API_ERROR_CODES.INVALID_PARAMETERS
    );
  }

  try {
    const getObjectCommand = new GetObjectCommand({
      Bucket: config[ENVIRONMENT].REKOGNITION_AUTH_BUCKET_NAME,
      Key: s3ImageKey,
    });
    const imageStream = await s3Client.send(getObjectCommand);
    const imageBuffer = await streamToBuffer(imageStream.Body);

    let faceImageBuffer;

    let cleanBase64 = faceImageBase64;
    if (faceImageBase64.includes("base64,")) {
      cleanBase64 = faceImageBase64.split("base64,")[1];
    }

    faceImageBuffer = Buffer.from(cleanBase64, "base64");
    if (faceImageBuffer.length < 100) {
      throwApiError(
        API_ERROR_STATUS_CODES.BAD_REQUEST,
        API_ERROR_MESSAGES.INVALID_IMAGE,
        API_ERROR_CODES.INVALID_IMAGE
      );
    }

    const compareFacesCommand = new CompareFacesCommand({
      SourceImage: {
        Bytes: faceImageBuffer,
      },
      TargetImage: {
        Bytes: imageBuffer,
      },
      SimilarityThreshold: 80,
    });

    const compareFacesResponse =
      await rekognitionClient.send(compareFacesCommand);
    console.log("Compare faces response:", compareFacesResponse);

    // Check if the face matches
    if (
      compareFacesResponse.FaceMatches &&
      compareFacesResponse.FaceMatches.length > 0
    ) {
      const faceMatch = compareFacesResponse.FaceMatches[0];
      console.log("Face matched successfully:", {
        similarity: faceMatch.Similarity,
        isAuthenticated: true,
      });
      return {
        isAuthenticated: true,
        similarity: faceMatch.Similarity,
      };
    } else {
      console.log("No matching faces found");
      return { isAuthenticated: false };
    }
  } catch (error) {
    console.error("authenticateFace error", error);
    throw error;
  }
};

export default {
  createCollection,
  getFacesByCollectionId,
  groupFacesIntoAlbums,
  startImageProcessingJob,
  registerFaceAuth,
  verifyFace,
  authenticateFaceAuth,
};
