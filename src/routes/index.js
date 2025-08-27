import express from "express";
import { sessionMiddleware } from "../middlewares/index.js";
import {
  confirmForgotPasswordRoute,
  forgotPasswordRoute,
  logoutRoute,
  refreshSessionRoute,
  resendConfirmationCodeRoute,
  signInRoute,
  signUpRoute,
  verifySignupRoute,
} from "../controllers/userController/index.js";
import bodyParser from "body-parser";
import {
  createAlbumsRoute,
  generatePreSignedURLRoute,
  startImageProcessingJobRoute,
  getJobStatusRoute,
} from "../controllers/s3Controller/index.js";

import {
  createFolderRoute,
  deleteFolderRoute,
  fetchAlbumsRoute,
  fetchFolderContentRoute,
  getAlbumByIdRoute,
  getFolderContentsRoute,
  getFolderRoute,
  renameFolderRoute,
  restoreFolderRoute,
} from "../controllers/folderController/index.js";

import {
  initiateImageUploadRoute,
  confirmImageUploadRoute,
  fetchUploadedImagesRoute,
} from "../controllers/imageController/index.js";

const createRouter = () => {
  const router = express.Router();

  router.use(bodyParser.json({ limit: "100mb", extended: true }));
  router.use(bodyParser.urlencoded({ limit: "100mb", extended: true }));

  router.get("/health", (req, res) => {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version || "1.0.0",
      database: "connected",
    });
  });

  router.post("/auth/signup", signUpRoute);
  router.post("/auth/verify", verifySignupRoute);
  router.post("/auth/resend-verification-code", resendConfirmationCodeRoute);
  router.post("/auth/signin", signInRoute);
  router.post("/auth/forgot-password", forgotPasswordRoute);
  router.post("/auth/confirm-forgot-password", confirmForgotPasswordRoute);
  router.post("/auth/refresh-session", refreshSessionRoute);
  router.get("/auth/logout", sessionMiddleware, logoutRoute);

  // folder routes
  router.post("/folder/create", sessionMiddleware, createFolderRoute);
  router.get("/folder/all", getFolderContentsRoute);
  router.put("/folder/rename", renameFolderRoute);
  router.delete("/folder/delete", deleteFolderRoute);
  router.put("/folder/restore", restoreFolderRoute);
  router.get("/folder/:folderId", fetchFolderContentRoute);

  // image routes
  router.post("/image/initiate-upload", initiateImageUploadRoute);
  router.put("/image/confirm-upload", confirmImageUploadRoute);
  router.post(
    "/image/generate-presignedurl",
    sessionMiddleware,
    generatePreSignedURLRoute
  );
  router.get("/images", fetchUploadedImagesRoute);

  // Job routes
  router.post(
    "/job/feature/facial-rekognition/start",
    sessionMiddleware,
    startImageProcessingJobRoute
  );
  router.get("/job/job-status/:jobId", sessionMiddleware, getJobStatusRoute);

  // Albums routes
  router.get("/albums", fetchAlbumsRoute);
  router.get("/album/:id", getAlbumByIdRoute);

  return router;
};

export default createRouter;
