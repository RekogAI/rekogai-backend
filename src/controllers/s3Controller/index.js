import { asyncHandler, handleApiResponse } from "../../middlewares/index.js";
import S3Model from "../../models/S3Model.js";

const s3ModelInstance = new S3Model();

export const generatePreSignedURLRoute = asyncHandler(async (req, res) => {
  const apiResponse = await s3ModelInstance.generatePreSignedURL(req.body);
  return handleApiResponse(res, apiResponse);
});
