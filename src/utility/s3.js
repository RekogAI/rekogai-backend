import Logger from "../lib/Logger.js";
import configObj from "../config.js";
import { S3Client } from "@aws-sdk/client-s3";
const { config, ENVIRONMENT } = configObj;
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client(config[ENVIRONMENT].AWS_SDK_CONFIG);

/**
 * Generate a presigned URL for S3 operations (PUT or GET)
 * @param {Object} params - Parameters for generating presigned URL
 * @param {string} params.operation - S3 operation ('get' or 'put')
 * @param {string} params.key - S3 object key (path in bucket)
 * @param {string} params.contentType - Content type for PUT operations
 * @param {number} params.expiresIn - URL expiration time in seconds (default: 3600)
 * @returns {Promise<string>} Presigned URL
 * @throws {Error} If parameters are invalid or operation fails
 */
export const generatePresignedUrl = async ({
  operation,
  key,
  contentType,
  expiresIn = 3600,
}) => {
  try {
    // Validate required parameters
    if (!operation || !key) {
      throw new Error("Operation and key are required parameters");
    }

    // Validate operation type
    if (!["get", "put"].includes(operation)) {
      throw new Error('Operation must be either "get" or "put"');
    }

    // If PUT operation, contentType is required
    if (operation === "put" && !contentType) {
      throw new Error("Content type is required for PUT operations");
    }

    // S3 parameters
    const params = {
      Bucket: config[ENVIRONMENT].S3_BUCKET_NAME,
      Key: key,
    };

    // Add ContentType for PUT operations
    if (operation === "put" && contentType) {
      params.ContentType = contentType;
    }

    const s3Command =
      operation === "get"
        ? new GetObjectCommand(params)
        : new PutObjectCommand(params);

    // Generate the presigned URL
    const url = await getSignedUrl(s3Client, s3Command, {
      expiresIn,
    });

    Logger.info(
      `Generated presigned URL for ${operation} operation on key ${key}`
    );
    return url;
  } catch (error) {
    Logger.error(`Error generating presigned URL: ${error.message}`, error);
    throw error;
  }
};

// Export other S3-related utility functions as needed
