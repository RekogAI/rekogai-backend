import { asyncHandler, handleApiResponse } from "../../middlewares/index.js";
import ImageModel from "../../models/ImageModel.js";

const imageModel = new ImageModel();

export const initiateImageUploadRoute = asyncHandler(async (req, res) => {
  const apiResponse = await imageModel.initiateImageUpload(req.body);
  return handleApiResponse(res, apiResponse);
});

export const confirmImageUploadRoute = asyncHandler(async (req, res) => {
  const apiResponse = await imageModel.confirmImageUpload(req.body);
  return handleApiResponse(res, apiResponse);
});
