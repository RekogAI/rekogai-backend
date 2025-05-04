import crypto from "crypto";
import Logger from "../lib/Logger.js";

export const generateUUID = () => {
  return crypto.randomBytes(16).toString("hex");
};

export const formatAPIResponse = (data) => {
  const toCamelCase = (key) =>
    key
      .replace(/_([a-z])/g, (_, char) => char.toUpperCase())
      .replace(/^\$?./, (char) => char.toLowerCase());

  const processItem = (item) => {
    if (Array.isArray(item)) {
      return item.map(processItem);
    }

    if (typeof item === "object" && item !== null) {
      return Object.entries(item).reduce((acc, [key, value]) => {
        if (key === "$metadata") return acc; // Skip $metadata
        acc[toCamelCase(key)] =
          Array.isArray(value) || typeof value === "object"
            ? processItem(value)
            : value;
        return acc;
      }, {});
    }

    return item; // Return non-object, non-array values as is
  };

  return processItem(data);
};

export const setCookies = (res, cookies, ExpiresIn) => {
  if (cookies && typeof cookies === "object") {
    const isProduction = process.env.NODE_ENV === "production";
    console.log(
      `Setting cookies in ${isProduction ? "production" : "development"} mode`
    );

    const cookieDefaults = {
      httpOnly: true,
      secure: isProduction,
      path: "/",
    };

    Object.entries(cookies).forEach(([key, value]) => {
      if (!value) {
        Logger.warn(`Attempted to set cookie '${key}' with empty value`);
        return;
      }

      let cookieOptions = { ...cookieDefaults };

      // Set access_token with specific expiry time
      if (key === "access_token") {
        cookieOptions.maxAge = (ExpiresIn || 3600) * 1000; // Convert seconds to milliseconds
      }
      // Set refresh_token with longer expiry (30 days)
      else if (key === "refresh_token") {
        cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
      }

      Logger.debug(
        `Setting cookie: ${key} (expiry: ${cookieOptions.maxAge ? cookieOptions.maxAge / 1000 + "s" : "session"})`
      );
      res.cookie(key, value, cookieOptions);
    });
  } else {
    Logger.warn("Invalid cookies object provided to setCookies");
  }
};

export const errorResponse = (
  statusCode = 500,
  message = "Internal Server Error",
  details = null
) => {
  // Log the error for server-side tracking
  console.error(`Error ${statusCode}: ${message}`, details ? details : "");

  // Return standardized error object
  return {
    success: false,
    statusCode,
    timestamp: new Date().toISOString(),
    error: {
      message,
      ...(details && { details }),
    },
  };
};

export const handleCommonErrors = (error) => {
  if (error.statusCode && error.error) {
    // If error is already formatted, return as is
    return error;
  }

  // Default error response
  let statusCode = 500;
  let message = "An unexpected error occurred";

  // Map common error types to appropriate responses
  if (error.name === "ValidationError") {
    statusCode = 400;
    message = "Validation error: " + error.message;
  } else if (
    error.name === "UnauthorizedError" ||
    error.message.includes("unauthorized")
  ) {
    statusCode = 401;
    message = "Authentication required";
  } else if (error.name === "ForbiddenError") {
    statusCode = 403;
    message = "Access denied";
  } else if (error.name === "NotFoundError") {
    statusCode = 404;
    message = "Resource not found";
  }

  return errorResponse(
    statusCode,
    message,
    process.env.NODE_ENV === "development" ? error : null
  );
};
