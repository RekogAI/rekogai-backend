import express from "express";
import { sessionMiddleware } from "../middlewares/index.js";
import {
  confirmForgotPasswordRoute,
  forgotPasswordRoute,
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

const createRouter = () => {
  const router = express.Router();

  router.use(bodyParser.json({ limit: "50mb" }));

  // get-started
  router.post("/signup", signUpRoute);
  router.post("/verify", verifySignupRoute);
  router.post("/resend-verification-code", resendConfirmationCodeRoute);
  router.post("/signin", signInRoute);
  router.post("/forgotPassword", forgotPasswordRoute);
  router.post("/confirmForgotPassword", confirmForgotPasswordRoute);
  router.post("/refreshSession", sessionMiddleware, refreshSessionRoute);

  // Add photos to a bucket
  router.post(
    "/generatePreSignedURL",
    sessionMiddleware,
    generatePreSignedURLRoute
  );

  // Rekognition
  router.post("/createAlbums", sessionMiddleware, createAlbumsRoute);

  return router;
};

export default createRouter;
