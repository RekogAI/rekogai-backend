import Logger from "../lib/Logger.js";
import { performance } from "perf_hooks";

export const commonMiddleware = (req, res, next) => {
  console.log("Do some middleware thing");
  next();
};


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

  // Otherwise, return the success response with the data
  return res.status(200).json({
    success: true,
    status: 200,
    message: successMessage,
    data: result,
    error: null,
  });
};

export const logRequest = (req, res, next) => {
  const start = performance.now(); // Start the timer

  // Capture the response status code after the response is finished
  res.on("finish", () => {
    const duration = performance.now() - start; // Calculate the duration
    Logger.info(
      `Request ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration.toFixed(2)}ms`
    );
  });

  // Proceed to the next middleware/route handler
  next();
};
