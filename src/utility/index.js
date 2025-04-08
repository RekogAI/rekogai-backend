import crypto from "crypto";

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

export {
  APIError,
  ErrorTypes,
  handleError,
  formatSuccessResponse,
  formatErrorResponse,
} from "./ErrorHandler.js";
