import Logger from "../lib/Logger.js";
import { performance } from "perf_hooks";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import configObj from "../config.js";
import TokenModel from "../models/TokenModel.js";
import { throwApiError } from "../utility/ErrorHandler.js";

const { config, ENVIRONMENT } = configObj;
const tokenModel = new TokenModel();

// Verifier that expects valid access tokens:
const verifier = CognitoJwtVerifier.create({
  userPoolId: config[ENVIRONMENT].COGNITO_USER_POOL_ID,
  tokenUse: "access",
  clientId: config[ENVIRONMENT].COGNITO_CLIENT_ID,
});

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const handleApiResponse = (
  res,
  result,
  successMessage = "Request was successful"
) => {
  Logger.info(" result instanceof Error", result instanceof Error, result);

  if (result instanceof Error) {
    Logger.error("Error Occurred", result);

    // Check for CognitoError specifically to use its statusCode
    if (result.name === "CognitoError") {
      return res.status(result.statusCode || 500).json({
        success: false,
        status: result.statusCode || 500,
        message: result.message || "An authentication error occurred",
        data: null,
        error: {
          details: result.errorType || result.toString(),
          errorType: result.errorType,
        },
      });
    }

    // Default error handling
    return res.status(500).json({
      success: false,
      status: 500,
      message: result.message || "An unexpected error occurred",
      data: null,
      error: {
        details: result.toString(),
      },
    });
  }

  let sortedResult = result;

  // If the result is an object, sort its keys
  if (result && typeof result === "object" && !Array.isArray(result)) {
    sortedResult = Object.keys(result)
      .sort()
      .reduce((acc, key) => {
        acc[key] = result[key];
        return acc;
      }, {});
  }

  // Otherwise, return the success response with the data
  return res.status(200).json({
    success: true,
    status: 200,
    message: successMessage,
    data: sortedResult,
    error: null,
  });
};

export const logRequest = (req, res, next) => {
  const start = performance.now();

  // Capture the response status code after the response is finished
  res.on("finish", () => {
    const duration = performance.now() - start;
    Logger.info(
      `Request ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration.toFixed(2)}ms`
    );
  });

  next();
};

export const sessionMiddleware = async (req, res, next) => {
  try {
    const JWT_TOKEN = req.cookies.access_token;

    // Check if the token exists
    if (!JWT_TOKEN) {
      throwApiError(403, "Access forbidden invalid token", "INVALID_TOKEN");
    }

    const tokenRecord = await verifyFaceAuthToken(JWT_TOKEN);

    if (!tokenRecord) {
      throw new Error("Invalid face authentication token");
    }

    req.user = {
      userId: tokenRecord.user.userId,
      email: tokenRecord.user.email,
    };

    next();
  } catch (error) {
    Logger.error("Session middleware error:", error);
    res.status(403).json({
      success: false,
      status: 403,
      message: "Access forbidden invalid token",
      data: null,
      error: {
        details: error.message || "Access forbidden invalid token",
      },
    });
  }
};

// Helper function to verify face auth tokens against the database
async function verifyFaceAuthToken(token) {
  try {
    const tokenRecord = await tokenModel.verifyToken(token, "ACCESS");
    return tokenRecord;
  } catch (error) {
    Logger.error("Face auth token verification error:", error);
    return null;
  }
}
