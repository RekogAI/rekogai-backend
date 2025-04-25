import {
  RekognitionClient,
  CreateCollectionCommand,
  IndexFacesCommand,
  SearchFacesByImageCommand,
  DetectFacesCommand,
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
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import axios from "axios";
import Thumbnail from "./schemas/thumbnails.js";

const { Face, Album, Image, APIResponse } = models;

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

const storeIndexedFaces = async ({ response, collectionId, imageId }) => {
  try {
    const faceRecordsToCreate = response.FaceRecords.map((faceRecord) => ({
      faceId: faceRecord.Face.FaceId,
      imageId,
      collectionId: collectionId,
      facePopularityScore: 1,
      ageRange: faceRecord.FaceDetail.AgeRange,
      gender: faceRecord.FaceDetail.Gender.Value,
      confidence: faceRecord.FaceDetail.Confidence,
      emotions: faceRecord.FaceDetail.Emotions,
      beard: faceRecord.FaceDetail.Beard,
      mustache: faceRecord.FaceDetail.Mustache,
      occluded: faceRecord.FaceDetail.Occluded,
      imageQuality: faceRecord.FaceDetail.Quality,
      smile: faceRecord.FaceDetail.Smile,
      sunglasses: faceRecord.FaceDetail.Sunglasses,
      pose: faceRecord.FaceDetail.Pose,
      faceRecordDetails: faceRecord,
    }));

    const createdFaceRecords = await Face.bulkCreate(faceRecordsToCreate);
    Logger.info("Face records created in Face table:", faceRecordsToCreate);

    return createdFaceRecords;
  } catch (error) {
    Logger.error("Error storing indexed faces in PostgreSQL:", error);
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
    Logger.info(`Faces indexed for ${key}:`, response.FaceRecords);

    const savedFaces = await storeIndexedFaces({
      response,
      collectionId,
      imageId,
    });
    Logger.info("Store indexed faces response:", savedFaces);

    return response;
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
      // MaxFaces: 5,
      QualityFilter: "AUTO",
      FaceMatchThreshold: 90, // face match threshold
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
  // Fetch images from database with size limit = 50
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
          userId,
          folderId,
          fileStatus: IMAGE_STATUS.UPLOADED_TO_S3,
        },
        limit,
        offset,
        raw: true,
      });
      Logger.info("Images fetched from database:", {
        images,
        length: images.length,
      });
      return images;
    } catch (error) {
      Logger.error("Error fetching images from database:", error);
      throw error;
    }
  };

  // create image batch for Rekognition
  const createImageBatch = (images) => {
    const _images = images.map((image) => ({
      S3Object: {
        Bucket: config[ENVIRONMENT].S3_BUCKET_NAME,
        Name: image.fileLocationInS3,
      },
      imageId: image.imageId,
    }));

    return _images;
  };

  // detect labels(objects,people) in image for annotation
  const detectLabelsForAnnotation = async (image) => {
    try {
      const detectLabelsCommand = new DetectLabelsCommand({
        Image: image,
        MaxLabels: 50,
        MinConfidence: 85,
        IncludeCategories: ["Person Description", "Expressions and Emotions"],
        ExcludeCategories: [
          "Animals and Pets",
          "Apparel and Accessories",
          "Beauty and Personal Care",
          "Buildings and Architecture",
          "Colors and Visual Composition",
          "Damage Detection",
          "Education",
          "Everyday Objects",
          "Food and Beverage",
          "Furniture and Furnishings",
          "Health and Fitness",
          "Home and Indoors",
          "Home Appliances",
          "Hobbies and Interests",
          "Kitchen and Dining",
          "Materials",
          "Medical",
          "Nature and Outdoors",
          "Offices and Workspaces",
          "Patterns and Shapes",
          "Plants and Flowers",
          "Popular Landmarks",
          "Public Safety",
          "Religion",
          "Sports",
          "Symbols and Flags",
          "Technology and Computing",
          "Text and Documents",
          "Tools and Machinery",
          "Toys and Gaming",
          "Transport and Logistics",
          "Travel and Adventure",
          "Vehicles and Automotive",
          "Weapons and Military",
        ],
      });
      const response = await rekognitionClient.send(detectLabelsCommand);
      Logger.info("DetectLabels response", response);

      const apiResponse = await APIResponse.create({
        userId,
        imageId: image.imageId,
        response: JSON.stringify(response),
        type: API_TYPES.DETECT_LABELS.key,
      });

      Logger.info("API response stored in database for type:", {
        type: API_TYPES.DETECT_LABELS.value,
        apiResponse,
      });

      const hasLabelsInIncludeCategories = response.Labels.some((label) =>
        label.Categories.some((category) =>
          ["Person Description", "Expressions and Emotions"].includes(
            category.Name
          )
        )
      );

      const numberOfLabelsInIncludeCategories = response.Labels.filter(
        (label) =>
          label.Categories.some((category) =>
            ["Person Description", "Expressions and Emotions"].includes(
              category.Name
            )
          )
      ).length;

      Logger.info(
        `Number of labels in include categories: ${numberOfLabelsInIncludeCategories}`
      );

      Logger.info(
        hasLabelsInIncludeCategories
          ? "Labels detected in include categories."
          : "No labels detected in include categories."
      );

      // Function to check if image quality is sufficient for facial recognition
      const isImageQualitySufficient = (response) => {
        const imageProperties = response.ImageProperties;

        // Check overall image quality
        const overallQuality = imageProperties.Quality;
        if (
          !isQualityInRange(overallQuality, {
            brightnessMin: 40,
            brightnessMax: 80,
            contrastMin: 30,
            contrastMax: 70,
            sharpnessMin: 50,
          })
        ) {
          return false;
        }

        // Check foreground quality (stricter for faces)
        const foregroundQuality = imageProperties.Foreground.Quality;
        if (
          !isQualityInRange(foregroundQuality, {
            brightnessMin: 45,
            brightnessMax: 75,
            contrastMin: 35,
            contrastMax: 65,
            sharpnessMin: 60,
          })
        ) {
          return false;
        }
        return true;
      };

      const isQualityInRange = (quality, thresholds) => {
        const {
          brightnessMin,
          brightnessMax,
          contrastMin,
          contrastMax,
          sharpnessMin,
        } = thresholds;
        return (
          quality.Brightness >= brightnessMin &&
          quality.Brightness <= brightnessMax &&
          quality.Contrast >= contrastMin &&
          quality.Contrast <= contrastMax &&
          quality.Sharpness >= sharpnessMin
        );
      };

      const isSuitable = isImageQualitySufficient(response);
      Logger.info(
        isSuitable
          ? "Image quality is sufficient for facial recognition."
          : "Image quality is insufficient."
      );

      return {
        isImageQualityOk: isSuitable,
        hasFaces: hasLabelsInIncludeCategories,
        facesCount: numberOfLabelsInIncludeCategories,
      };
    } catch (error) {
      Logger.error("Error detecting faces:", error);
      return false;
    }
  };

  const filterImagesWithFaces = async (images) => {
    const filteredImages = [];
    let updatePromises = [];
    for (const image of images) {
      const { hasFaces, facesCount, isImageQualityOk } =
        await detectLabelsForAnnotation(image);
      if (hasFaces && facesCount > 0 && isImageQualityOk) {
        filteredImages.push(image);
        updatePromises.push(
          Image.update(
            {
              fileStatus: IMAGE_STATUS.FACES_DETECTED,
              facesDetected: true,
              facesDetectedCount: facesCount,
              isImageQualityOk,
            },
            { where: { imageId: image.imageId } }
          )
        );
      } else {
        updatePromises.push(
          Image.update(
            {
              fileStatus: IMAGE_STATUS.NO_FACES_DETECTED,
              facesDetected: false,
              isImageQualityOk,
            },
            { where: { imageId: image.imageId } }
          )
        );
      }
    }
    await Promise.all(updatePromises);

    return filteredImages;
  };

  const sendImageBatchToRekognition = async (imageBatch, collectionId) => {
    const faceIdToImageIdsMap = {};

    for (const image of imageBatch) {
      const { S3Object, imageId } = image;
      const { Bucket, Name } = S3Object;

      // Search for faces by image
      const searchResponse = await searchFacesByImage({
        bucketName: Bucket,
        key: Name,
        collectionId,
      });

      // Store search response in APIResponse table
      await APIResponse.create({
        userId,
        imageId,
        response: JSON.stringify(searchResponse),
        type: API_TYPES.SEARCH_FACES_BY_IMAGE.key,
      });

      if (searchResponse?.FaceMatches?.length > 0) {
        searchResponse.FaceMatches.forEach((match) => {
          const faceId = match.Face.FaceId;
          if (!faceIdToImageIdsMap[faceId]) {
            faceIdToImageIdsMap[faceId] = [];
          }
          faceIdToImageIdsMap[faceId].push(imageId);
        });
      } else {
        // If no match, index the faces
        const indexResponse = await indexFaces({
          bucketName: Bucket,
          key: Name,
          collectionId,
          imageId,
        });

        // Store index response in APIResponse table
        await APIResponse.create({
          userId,
          imageId,
          response: JSON.stringify(indexResponse),
          type: API_TYPES.INDEX_FACES.key,
        });

        indexResponse.FaceRecords.forEach((record) => {
          const faceId = record.Face.FaceId;
          if (!faceIdToImageIdsMap[faceId]) {
            faceIdToImageIdsMap[faceId] = [];
          }
          faceIdToImageIdsMap[faceId].push(imageId);
        });
      }
    }
    Logger.info(
      "sendImageBatchToRekognition faceIdToImageIdsMap",
      faceIdToImageIdsMap
    );

    return faceIdToImageIdsMap;
  };

  const createAlbums = async (faceIdToImageIdsMap) => {
    try {
      const albumsToCreate = Object.keys(faceIdToImageIdsMap).map((faceId) => ({
        userId,
        faceId,
        imageIds: JSON.stringify(faceIdToImageIdsMap[faceId]),
      }));
      await Album.bulkCreate(albumsToCreate);
      Logger.info("All albums created successfully.");
    } catch (error) {
      Logger.error("Error creating albums:", error);
      throw error;
    }
  };

  let images = await fetchImagesFromDatabase({
    userId,
    folderId,
    pageSize,
    pageNumber,
  });

  let pageNumber = 0;
  const pageSize = 50;
  while (images.length > 0) {
    Logger.info(" startImageProcessingJob pageNumber", pageNumber);
    const s3KeysArray = createImageBatch(images);
    const filteredImages = await filterImagesWithFaces(s3KeysArray);
    const faceIdToImageIdsMap = await sendImageBatchToRekognition(
      filteredImages,
      collectionId
    );
    await createAlbums(faceIdToImageIdsMap);
    pageNumber++;
    images = await fetchImagesFromDatabase({
      userId,
      folderId,
      pageSize,
      pageNumber,
    });
  }

  const streamToBuffer = async (stream) => {
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  };

  const createThumbnailsForFaces = async () => {
    try {
      const faces = await Face.findAll({
        attributes: ["imageId", "faceId", "collectionId"],
        include: [
          {
            model: Image,
            attributes: ["fileLocationInS3"],
            as: "Image",
            required: true,
          },
        ],
        nest: true,
      });

      const thumbnailPromises = faces.map(async (face) => {
        const { Image } = face;
        const { fileLocationInS3 } = Image;
        const { imageId, faceId } = face;

        if (!fileLocationInS3) {
          Logger.warn(`Image not found for imageId: ${imageId}`);
          return null;
        }

        const getObjectCommand = new GetObjectCommand({
          Bucket: config[ENVIRONMENT].S3_BUCKET_NAME,
          Key: fileLocationInS3,
        });

        const imageStream = await s3Client.send(getObjectCommand);
        const imageBuffer = await streamToBuffer(imageStream.Body);

        const thumbnailBuffer = await sharp(imageBuffer)
          .resize(100, 100)
          .toBuffer();

        const thumnailId = generateUUID();
        const thumbnailKey = `${userId}/thumbnails/${thumnailId}.jpeg`;
        const putObjectCommand = new PutObjectCommand({
          Bucket: config[ENVIRONMENT].S3_BUCKET_NAME,
          Key: thumbnailKey,
          Body: thumbnailBuffer,
          ContentType: "image/jpeg",
        });

        await s3Client.send(putObjectCommand);

        return {
          faceId,
          thumbnailKey,
        };
      });

      await Promise.all(thumbnailPromises);
      Logger.info("Thumbnails created for all faces.");

      const thumbnails = thumbnailPromises.map((thumbnail) => ({
        faceId: thumbnail.faceId,
        s3ThumbnailURL: thumbnail.thumbnailKey,
      }));

      await Thumbnail.bulkCreate(thumbnails);
      Logger.info("Thumbnails entries created in Thumbnails table.");
      return { successMessage: "Thumbnails created successfully." };
    } catch (error) {
      Logger.error("Error creating thumbnails for faces:", error);
      throw error;
    }
  };

  await createThumbnailsForFaces();
  return { message: "Image processing job completed" };
};

export default {
  createCollection,
  getFacesByCollectionId,
  groupFacesIntoAlbums,
  startImageProcessingJob,
};
