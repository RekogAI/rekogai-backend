import { asyncHandler, handleApiResponse } from "../../middlewares/index.js";
import rekognitionInstance from "../../models/RekognitionModel.js";
import S3Model from "../../models/S3Model.js";
import QueueService, { QUEUE_NAMES } from "../../services/QueueService.js";

export const generatePreSignedURLRoute = asyncHandler(async (req, res) => {
  const apiResponse = await S3Model.generatePreSignedURL(req.body);
  return handleApiResponse(res, apiResponse);
});

export const savePostUploadImageDetailsRoute = asyncHandler(
  async (req, res) => {
    const apiResponse = await S3Model.savePostUploadImageDetails(req.body);
    return handleApiResponse(
      res,
      apiResponse,
      "Image details saved successfully"
    );
  }
);

export const createAlbumsRoute = asyncHandler(async (req, res) => {
  const apiResponse = await rekognitionInstance.groupFacesIntoAlbums(req.body);
  return handleApiResponse(res, apiResponse);
});

export const startImageProcessingJobRoute = asyncHandler(async (req, res) => {
  const apiResponse = await rekognitionInstance.startImageProcessingJob(
    req.body
  );
  return handleApiResponse(res, apiResponse, {
    message: "Image processing job started",
  });
});

export const getJobStatusRoute = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const apiResponse = await QueueService.getJobStatus(
    QUEUE_NAMES.IMAGE_PROCESSING,
    jobId
  );
  return handleApiResponse(
    res,
    apiResponse,
    "Job status retrieved successfully"
  );
});
