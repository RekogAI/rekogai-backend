import { asyncHandler, handleApiResponse } from "../../middlewares/index.js";
import RekognitionModel from "../../models/RekognitionModel.js";
import S3Model from "../../models/S3Model.js";

const s3ModelInstance = new S3Model();
const rekognitionInstance = new RekognitionModel();

export const generatePreSignedURLRoute = asyncHandler(async (req, res) => {
  const apiResponse = await s3ModelInstance.generatePreSignedURL(req.body);
  return handleApiResponse(res, apiResponse);
});

export const createAlbumsRoute = asyncHandler(async (req, res) => {
  const apiResponse = await rekognitionInstance.groupFacesIntoAlbums(req.body);
  return handleApiResponse(res, apiResponse);
});
