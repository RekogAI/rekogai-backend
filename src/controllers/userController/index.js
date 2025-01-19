import { asyncHandler, handleApiResponse } from "../../middlewares/index.js";
import CognitoModel from "../../models/CognitoModel.js";
import S3Model from "../../models/S3Model.js";
const s3ModelInstance = new S3Model();
const cognitoModelInstance = new CognitoModel();

export const createBucketRoute = asyncHandler(async (req, res) => {
  const apiResponse = await s3ModelInstance.createBucket(req.body);
  return handleApiResponse(res, apiResponse);
});

export const signUpRoute = asyncHandler(async (req, res) => {
  const apiResponse = await cognitoModelInstance.signUp(req.body);
  return handleApiResponse(res, apiResponse);
});

export const verifySignupRoute = asyncHandler(async (req, res) => {
  const apiResponse = await cognitoModelInstance.confirmSignUp(req.body);
  return handleApiResponse(res, apiResponse);
});

export const signInRoute = asyncHandler(async (req, res) => {
  const apiResponse = await cognitoModelInstance.signIn(req.body);
  return handleApiResponse(res, apiResponse);
});

export const forgotPasswordRoute = asyncHandler(async (req, res) => {
  const apiResponse = await cognitoModelInstance.forgotPassword(req.body);
  return handleApiResponse(res, apiResponse);
});

export const confirmForgotPasswordRoute = asyncHandler(async (req, res) => {
  const apiResponse = await cognitoModelInstance.confirmForgotPassword(
    req.body
  );
  return handleApiResponse(res, apiResponse);
});

export const refreshSessionRoute = asyncHandler(async (req, res) => {
  const apiResponse = await cognitoModelInstance.refreshSession(req.body);
  return handleApiResponse(res, apiResponse);
});
