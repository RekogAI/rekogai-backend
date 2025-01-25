import express from "express";
import { sessionMiddleware } from "../middlewares/index.js";
import {
  confirmForgotPasswordRoute,
  createBucketRoute,
  forgotPasswordRoute,
  listBucketsRoute,
  refreshSessionRoute,
  signInRoute,
  signUpRoute,
  verifySignupRoute,
} from "../controllers/userController/index.js";
import bodyParser from "body-parser";
import { generatePreSignedURLRoute } from "../controllers/s3Controller/index.js";

const createRouter = () => {
  const router = express.Router();

  router.use(bodyParser.json({ limit: "50mb" }));

  // get-started
  router.post("/signup", signUpRoute);
  router.post("/verify", verifySignupRoute);
  router.post("/signin", signInRoute);
  router.post("/forgotPassword", forgotPasswordRoute);
  router.post("/confirmForgotPassword", confirmForgotPasswordRoute);
  router.post("/refreshSession", sessionMiddleware, refreshSessionRoute);

  // User actions
  router.post("/createBucket", sessionMiddleware, createBucketRoute);
  router.get("/listBuckets", sessionMiddleware, listBucketsRoute);

  // Add photos to a bucket
  router.post(
    "/generatePreSignedURL",
    sessionMiddleware,
    generatePreSignedURLRoute
  );

  return router;
};

export default createRouter;
