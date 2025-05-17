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
} from "../controllers/s3Controller/index.js";

import {
  createFolderRoute,
  deleteFolderRoute,
  getFolderContentsRoute,
  getFolderRoute,
  renameFolderRoute,
  restoreFolderRoute,
} from "../controllers/folderController/index.js";

const createRouter = () => {
  const router = express.Router();

  // Update body-parser limits to handle large files
  router.use(bodyParser.json({ limit: "100mb", extended: true }));
  router.use(bodyParser.urlencoded({ limit: "100mb", extended: true }));

  // get-started
  router.post("/signup", signUpRoute);
  router.post("/verify", verifySignupRoute);
  router.post("/resend-verification-code", resendConfirmationCodeRoute);
  router.post("/signin", signInRoute);
  router.post("/forgot-password", forgotPasswordRoute);
  router.post("/confirm-forgot-password", confirmForgotPasswordRoute);
  router.post("/refresh-session", refreshSessionRoute);
  // router.post("/register-face", registerFaceRoute);
  // router.post("/verify-face", verifyFaceRoute);
  router.get("/logout", sessionMiddleware, logoutRoute);

  // folder routes
  router.post("/create-folder", createFolderRoute);
  router.get("/get-all-folders", getFolderContentsRoute);
  router.get("/get-folder", getFolderRoute);
  router.put("/rename-folder", renameFolderRoute);
  router.delete("/delete-folder", deleteFolderRoute);
  router.put("/restore-folder", restoreFolderRoute);

  // Add photos to a bucket
  router.post(
    "/generate-presignedurl",
    sessionMiddleware,
    generatePreSignedURLRoute
  );

  // Rekognition
  router.post("/create-albums", sessionMiddleware, createAlbumsRoute);

  return router;
};

export default createRouter;
