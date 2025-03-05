import {
  RekognitionClient,
  CreateCollectionCommand,
  IndexFacesCommand,
  SearchFacesByImageCommand,
  DetectFacesCommand,
} from "@aws-sdk/client-rekognition";
import { generateUUID } from "../utility/index.js";
import { S3Client, ListObjectsCommand } from "@aws-sdk/client-s3";
import configObj from "../config.js";
import Logger from "../lib/Logger.js";
import { Face, Album } from "../models/schemas/associations.js";
import { IMAGE_STATUS } from "../utility/constants.js";

const { config, ENVIRONMENT } = configObj;

const rekognitionClient = new RekognitionClient(
  config[ENVIRONMENT].AWS_SDK_CONFIG
);
const s3Client = new S3Client(config[ENVIRONMENT].AWS_SDK_CONFIG);

const createCollection = async () => {
  try {
    const collectionId = generateUUID();
    const command = new CreateCollectionCommand({
      CollectionId: collectionId,
    });
    const response = await rekognitionClient.send(command);
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
};

const getFacesByCollectionId = async (collectionId) => {
  try {
    const faces = await Face.findAll({
      where: { collection_id: collectionId },
    });
    Logger.info("Faces retrieved:", faces);

    return faces.map((item) => ({
      ...item.dataValues,
      face_attributes: JSON.parse(item.face_attributes),
    }));
  } catch (error) {
    Logger.error("Error querying faces by CollectionId:", error);
    throw error;
  }
};

const searchIndexedFaces = async ({ bucketName, key }) => {
  try {
    const face = await Face.findOne({
      where: { bucket_name: bucketName, image_key: key },
    });
    if (face) {
      Logger.info("Face found in PostgreSQL:", face);
      return face.dataValues;
    } else {
      Logger.info("Face not found in PostgreSQL.");
      return null;
    }
  } catch (error) {
    Logger.error("Error searching for face in PostgreSQL:", error);
    return null;
  }
};

const storeIndexedFaces = async ({
  faceRecords,
  bucketName,
  key,
  collectionId,
}) => {
  try {
    for (const faceRecord of faceRecords) {
      await Face.create({
        face_id: faceRecord?.Face?.FaceId,
        image_key: key,
        bucket_name: bucketName,
        collection_id: collectionId,
        face_attributes: JSON.stringify(faceRecord),
      });
    }
    Logger.info("Indexed faces stored successfully in PostgreSQL.");
  } catch (error) {
    Logger.error("Error storing indexed faces in PostgreSQL:", error);
    throw error;
  }
};

const indexFaces = async ({ bucketName, key, collectionId }) => {
  const existingFace = await searchIndexedFaces({ bucketName, key });

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
    const response = await rekognitionClient.send(command);
    Logger.info(`Faces indexed for ${key}:`, response.FaceRecords);

    await storeIndexedFaces({
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
};

const searchFacesByImage = async ({ bucketName, key, collectionId }) => {
  try {
    const command = new SearchFacesByImageCommand({
      CollectionId: collectionId,
      Image: {
        S3Object: { Bucket: bucketName, Name: key },
      },
      MaxFaces: 5,
      QualityFilter: "AUTO",
      FaceMatchThreshold: 95, // face match threshold
    });
    const response = await rekognitionClient.send(command);
    Logger.info(`Found similar faces for ${key}:`, response.FaceMatches);
    return response;
  } catch (error) {
    Logger.error("Error searching faces by image:", error);
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
      Logger.info(`Processing: ${key}`);
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

    Logger.info("Albums created:", albums);
    return albums;
  } catch (error) {
    Logger.error("Error grouping faces into albums:", error);
    throw error;
  }
};

const startImageProcessingJob = async ({ userId, folderId, collectionId }) => {
  const fetchImagesFromDatabase = async ({
    userId,
    limit = 50,
    pageNumber = 0,
    folderId,
  }) => {
    const offset = pageNumber * limit;
    try {
      const images = await Image.findAll({
        attributes: ["fileLocationInS3", "imageId"],
        where: {
          userId: userId,
          folderId,
          fileStatus: IMAGE_STATUS.UPLOADED_TO_S3,
        },
        limit,
        offset,
        raw: true,
      });
      Logger.info("Images fetched from database:", images);
      return images;
    } catch (error) {
      Logger.error("Error fetching images from database:", error);
      throw error;
    }
  };

  const createImageBatch = (images) => {
    if (images.length === 0) return [];

    return images.map((image) => ({
      S3Object: {
        Bucket: config[ENVIRONMENT].S3_BUCKET_NAME,
        Name: image.fileLocationInS3,
      },
    }));
  };

  const detectFaces = async (image) => {
    try {
      const command = new DetectFacesCommand({
        Image: image,
        Attributes: ["ALL"],
      });
      const response = await rekognitionClient.send(command);
      Logger.info(" DetectFaces response", response);
      return {
        hasFaces: response.FaceDetails.length > 0,
        facesCount: response.FaceDetails.length,
      };
    } catch (error) {
      Logger.error("Error detecting faces:", error);
      return false;
    }
  };

  const filterImagesWithFaces = async (images) => {
    const filteredImages = [];
    for (const image of images) {
      const { hasFaces, facesCount } = await detectFaces(image);
      if (hasFaces) {
        filteredImages.push(image);
        await Image.update(
          {
            fileStatus: IMAGE_STATUS.FACES_DETECTED,
            facesDetected: true,
            facesDetectedCount: facesCount,
            rekognitionAPICallCount: 1,
          },
          { where: { fileLocationInS3: image.S3Object.Name } }
        );
      } else {
        await Image.update(
          {
            fileStatus: IMAGE_STATUS.NO_FACES_DETECTED,
            facesDetected: false,
            rekognitionAPICallCount: 1,
          },
          { where: { fileLocationInS3: image.S3Object.Name } }
        );
      }
    }
    return filteredImages;
  };

  const sendImageBatchToRekognition = async (imageBatch, collectionId) => {
    const faces = [];
    for (const image of imageBatch) {
      const searchFacesByImageResponse = await searchFacesByImage({
        bucketName: image.S3Object.Bucket,
        key: image.S3Object.Name,
        collectionId,
      });

      const faceMatches = searchFacesByImageResponse.FaceMatches;
      await Image.update(
        {
          rekognitionAPICallCount: 2,
          SearchFacesByImageResponse: JSON.stringify(
            searchFacesByImageResponse
          ),
          facesMatchedInCollectionCount: faceMatches.length,
          matchedFaceIds: faceMatches.length
            ? faceMatches.map((match) => match.Face.FaceId)
            : [],
          skippedFacesIndexing: faceMatches.length > 0,
        },
        { where: { fileLocationInS3: image.S3Object.Name } }
      );

      if (faceMatches.length > 0) {
        faces.push(...faceMatches.map((match) => match.Face));
      } else {
        const indexedFaces = await indexFaces({
          bucketName: image.S3Object.Bucket,
          key: image.S3Object.Name,
          collectionId,
        });
        // add image Id in each photo
        faces.push(...indexedFaces);
      }
    }
    return faces;
  };

  const createAlbums = async (faces) => {
    const albums = {};
    for (const face of faces) {
      if (!albums[face.FaceId]) albums[face.FaceId] = [];
      albums[face.FaceId].push(face);
    }

    for (const faceId in albums) {
      const face = albums[faceId][0];
      const imageKeys = albums[faceId].map((face) => face.ImageId);
      await Album.create({
        userId,
        faceId,
        imageIds: imageKeys,
      });
    }
  };

  let pageNumber = 0;
  const pageSize = 50;

  let images = await fetchImagesFromDatabase({
    userId,
    folderId,
    pageSize,
    pageNumber,
  });
  while (images.length > 0) {
    const s3KeysArray = createImageBatch(images);
    const filteredImages = await filterImagesWithFaces(s3KeysArray);
    const faces = await sendImageBatchToRekognition(
      filteredImages,
      collectionId
    );
    await createAlbums(faces);
    pageNumber++;
    images = await fetchImagesFromDatabase({
      userId,
      folderId,
      pageSize,
      pageNumber,
    });
  }
};

export default {
  createCollection,
  getFacesByCollectionId,
  groupFacesIntoAlbums,
  startImageProcessingJob,
};
