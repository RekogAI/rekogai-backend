import { asyncHandler, handleApiResponse } from "../../middlewares/index.js";
import RekognitionModel from "../../models/RekognitionModel.js";
import S3Model from "../../models/S3Model.js";
const rekognitionInstance = new RekognitionModel();

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

export const startImageProcessingJob = asyncHandler(async (req, res) => {
  const apiResponse = await RekognitionModel.startImageProcessingJob(req.body);
  return handleApiResponse(res, apiResponse, {
    message: "Image processing job completed",
  });
});
