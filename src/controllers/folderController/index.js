import { asyncHandler, handleApiResponse } from "../../middlewares/index.js";
import FolderModel from "../../models/FolderModel.js";
import AlbumModel from "../../models/AlbumModel.js";

const folderModel = new FolderModel();
const albumModel = new AlbumModel();

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
  const apiResponse = await folderModel.getFolderContent({
    folderId: req.params.folderId,
    userId: req.query.userId,
  });
  return handleApiResponse(res, apiResponse);
});

export const restoreFolderRoute = asyncHandler(async (req, res) => {
  const apiResponse = await folderModel.restoreFolder(req.body);
  return handleApiResponse(res, apiResponse);
});

export const fetchFolderContentRoute = asyncHandler(async (req, res) => {
  const apiResponse = await folderModel.fetchFolderContent({
    folderId: req.params.folderId,
    userId: req.query.userId,
  });
  return handleApiResponse(res, apiResponse);
});

export const fetchAlbumsRoute = asyncHandler(async (req, res) => {
  const apiResponse = await albumModel.fetchAlbums(req.query);
  return handleApiResponse(res, apiResponse);
});

export const getAlbumByIdRoute = asyncHandler(async (req, res) => {
  const apiResponse = await albumModel.getAlbumById({
    albumId: req.params.id,
    userId: req.query.userId,
  });
  return handleApiResponse(res, apiResponse);
});
