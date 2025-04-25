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
    Logger.info(
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

export {
  APIError,
  ErrorTypes,
  handleError,
  formatSuccessResponse,
  formatErrorResponse,
} from "./ErrorHandler.js";
