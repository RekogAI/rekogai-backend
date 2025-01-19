import express from "express";
import { commonMiddleware } from "../middlewares/index.js"; // Ensure the path and file extension are correct
// import { userController } from "../src/controllers/index.js";
import {
  confirmForgotPasswordRoute,
  createBucketRoute,
  forgotPasswordRoute,
  refreshSessionRoute,
  signInRoute,
  signUpRoute,
  verifySignupRoute,
} from "../controllers/userController/index.js";
import { getIndexPageRoute } from "../controllers/index.js";
import bodyParser from "body-parser";

const createRouter = () => {
  const router = express.Router();

  router.use(bodyParser.json({ limit: "50mb" }));

  // get-started
  router.post("/signup", signUpRoute);
  router.post("/verify", verifySignupRoute);
  router.post("/signin", signInRoute);
  router.post("/forgotPassword", forgotPasswordRoute);
  router.post("/confirmForgotPassword", confirmForgotPasswordRoute);
  router.post("/refreshSession", refreshSessionRoute);

  

  router.post("/createBucket", createBucketRoute);

  return router;
};

export default createRouter;
