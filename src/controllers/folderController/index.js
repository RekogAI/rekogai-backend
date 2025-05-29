import { asyncHandler, handleApiResponse } from "../../middlewares/index.js";
import FolderModel from "../../models/FolderModel.js";

const folderModel = new FolderModel();

export const createFolderRoute = asyncHandler(async (req, res) => {
  const apiResponse = await folderModel.createFolder(req.body);
  return handleApiResponse(res, apiResponse);
});

export const deleteFolderRoute = asyncHandler(async (req, res) => {
  const apiResponse = await folderModel.deleteFolder(req.body);
  return handleApiResponse(res, apiResponse);
});

export const renameFolderRoute = asyncHandler(async (req, res) => {
  const apiResponse = await folderModel.updateFolderName(req.body);
  return handleApiResponse(res, apiResponse);
});

export const getFolderContentsRoute = asyncHandler(async (req, res) => {
  const apiResponse = await folderModel.getAllFolders(req.query);
  return handleApiResponse(res, apiResponse);
});

export const getFolderRoute = asyncHandler(async (req, res) => {
  const apiResponse = await folderModel.getFolderById(req.query);
  return handleApiResponse(res, apiResponse);
});

export const restoreFolderRoute = asyncHandler(async (req, res) => {
  const apiResponse = await folderModel.restoreFolder(req.body);
  return handleApiResponse(res, apiResponse);
});
