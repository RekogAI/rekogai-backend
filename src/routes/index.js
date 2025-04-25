import express from "express";
import { sessionMiddleware } from "../middlewares/index.js";
import {
  confirmForgotPasswordRoute,
  forgotPasswordRoute,
  refreshSessionRoute,
  registerFaceRoute,
  resendConfirmationCodeRoute,
  signInRoute,
  signUpRoute,
  verifyFaceRoute,
  verifySignupRoute,
} from "../controllers/userController/index.js";
import bodyParser from "body-parser";
import {
  createAlbumsRoute,
  generatePreSignedURLRoute,
} from "../controllers/s3Controller/index.js";

const createRouter = () => {
  const router = express.Router();

  router.use(bodyParser.json({ limit: "50mb" }));

  // get-started
  router.post("/signup", signUpRoute);
  router.post("/verify", verifySignupRoute);
  router.post("/resend-verification-code", resendConfirmationCodeRoute);
  router.post("/signin", signInRoute);
  router.post("/forgot-password", forgotPasswordRoute);
  router.post("/confirm-forgot-password", confirmForgotPasswordRoute);
  router.post("/refresh-session", refreshSessionRoute);
  router.post("/register-face", registerFaceRoute);
  router.post("/verify-face", verifyFaceRoute);

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
