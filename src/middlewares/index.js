import Logger from "../lib/Logger.js";
import { performance } from "perf_hooks";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import configObj from "../config.js";
const { config, ENVIRONMENT } = configObj;
import jwtDecode from "jwt-decode";

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
  if (result instanceof Error) {
    Logger.error("Error Occurred", result);
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

export const authFailed = (res, message, details) => {
  return res.status(403).json({
    success: false,
    status: 403,
    message: message,
    data: null,
    error: {
      details: details,
    },
  });
};

export const sessionMiddleware = async (req, res, next) => {
  try {
    const JWT_TOKEN = req.cookies?.accessToken;
    if (!JWT_TOKEN) {
      return authFailed(res, "Auth token is missing", "Auth token is missing");
    }

    const decoded = jwtDecode(JWT_TOKEN);
    req.body.userId = decoded.userId;

    await verifier.verify(JWT_TOKEN);
    next();
  } catch (error) {
    return authFailed(res, "Auth token is invalid", error);
  }
};
