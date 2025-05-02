import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  ResendConfirmationCodeCommand,
  GlobalSignOutCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import Logger from "../lib/Logger.js";
import UserModel from "./UserModel.js";
import { setCookies } from "../utility/index.js";
import { handleCognitoError } from "../errors/cognito-errors.js";

import configObj from "../config.js";
import RekognitionModel from "./RekognitionModel.js";
const { config, ENVIRONMENT, AWS_REGION } = configObj;
import models from "../models/schemas/associations.js";
import S3Model from "./S3Model.js";
import { throwApiError } from "../utility/ErrorHandler.js";
const { User } = models;
import TokenModel from "./TokenModel.js";
import bcrypt from "bcrypt";
/**
 * Class for handling authentication operations using AWS Cognito
 */
class CognitoModel {
  constructor() {
    this.client = new CognitoIdentityProviderClient(
      config[ENVIRONMENT].AWS_SDK_CONFIG
    );
    this.userPoolId = config[ENVIRONMENT].COGNITO_USER_POOL_ID;
    this.clientId = config[ENVIRONMENT].COGNITO_CLIENT_ID;
    this.userModel = new UserModel();
    this.tokenModel = new TokenModel();
  }

  /**
   * Creates base parameters for Cognito operations
   * @returns {Object} Base parameters with client ID
   */
  _getBaseParams() {
    return {
      ClientId: this.clientId,
    };
  }

  /**
   * Registers a new user in the system
   * @param {Object} reqBody - Registration details
   * @returns {Promise<Object>} Registration result
   */
  async signUp(reqBody, res) {
    Logger.info("Processing signup request");
    const { username, password, attributes, registrationMethod, faceImage } =
      reqBody;

    if (registrationMethod === "EMAIL") {
      return this._emailSignUp(username, password, attributes);
    } else if (registrationMethod === "FACE_ID") {
      return this._faceIdSignUp(username, faceImage, res);
    }

    return throwApiError(400, "Invalid registration method");
  }

  /**
   * Handle email-based registration
   * @private
   */
  async _emailSignUp(username, password, attributes) {
    const params = {
      ...this._getBaseParams(),
      Username: username,
      Password: password,
      UserAttributes: attributes,
    };

    const command = new SignUpCommand(params);
    try {
      await this.client.send(command);
      Logger.info("Sign-up successful");

      const hashedPassword = await this.hashPassword(password);

      const createdUser = await User.create({
        email: username,
        password: hashedPassword,
        registrationMethod: "EMAIL",
        lastLoginMethod: "EMAIL",
      });

      return createdUser.toJSON();
    } catch (error) {
      Logger.error("Signup error:", error);
      throw handleCognitoError(error);
    }
  }

  /**
   * Handle face ID based registration
   * @private
   */
  async _faceIdSignUp(username, faceImage, res) {
    try {
      const registerFaceResponse = await RekognitionModel.registerFace({
        faceImage,
      });

      const { isNewFace, faceId } = registerFaceResponse;

      if (!isNewFace) {
        return throwApiError(409, "Face already registered");
      }

      // Upload face image to S3
      const s3UploadResult = await S3Model.uploadFaceImage(faceImage, username);
      Logger.info("Face image uploaded to S3:", s3UploadResult);

      // Create user in database with face image reference
      const createdUser = await User.create({
        email: username,
        faceImageUrl: s3UploadResult.imageUrl,
        registrationMethod: "FACE_ID",
        lastLoginMethod: "FACE_ID",
      });

      await this.generateTokenAndSetCookies(res, createdUser.userId, "FACE_ID");

      return {
        user: createdUser.toJSON(),
        faceRegistration: registerFaceResponse,
        signedUrl: s3UploadResult.signedUrl,
      };
    } catch (error) {
      Logger.error("Face registration error:", error);
      console.error("Error during face registration:", error);
      throw error;
    }
  }

  /**
   * Confirms a user's registration
   * @param {Object} params - Confirmation parameters
   * @returns {Promise<Object>} Confirmation result
   */
  async confirmSignUp({ username, confirmationCode }, res) {
    const params = {
      ...this._getBaseParams(),
      Username: username,
      ConfirmationCode: confirmationCode,
    };

    const command = new ConfirmSignUpCommand(params);

    try {
      const confirmSignUpResponse = await this.client.send(command);
      Logger.info(
        "User confirmed successfully in Cognito",
        confirmSignUpResponse
      );

      const userExists = await this.userModel.getUserByUsername(username);

      if (!userExists) {
        Logger.warn("User confirmed in Cognito but not found in database");
      }

      const [emailVerified] = await User.update(
        { isEmailVerified: true },
        { where: { email: username } }
      );

      await this.generateTokenAndSetCookies(res, userExists.userId, "EMAIL");

      return { ...userExists, isEmailVerified: emailVerified > 0 };
    } catch (error) {
      Logger.error("Confirm signup error:", error);
      throw handleCognitoError(error);
    }
  }

  /**
   * Resends confirmation code to user
   * @param {Object} params - Parameters with username
   * @returns {Promise<Object>} Resend confirmation result
   */
  async resendConfirmationCode({ username }) {
    Logger.info(`Resending confirmation code for user: ${username}`);

    const params = {
      ...this._getBaseParams(),
      Username: username,
    };

    const command = new ResendConfirmationCodeCommand(params);

    try {
      const response = await this.client.send(command);
      Logger.info(" CognitoModelresendConfirmationCode response", response);
      Logger.info(
        `Confirmation code resent successfully for user: ${username}`
      );

      return { successMessage: "Verification code has been resent" };
    } catch (error) {
      Logger.error("Resend confirmation code error:", error);
      throw handleCognitoError(error);
    }
  }

  /**
   * Authenticates a user
   * @param {Object} credentials - User credentials
   * @param {Object} res - Express response object for setting cookies
   * @returns {Promise<Object>} Authentication result
   */
  async signIn({ username, password, loginMethod, faceImage }, res) {
    Logger.info(`Attempting to sign in with method: ${loginMethod}`);

    let response;

    if (loginMethod === "EMAIL") {
      response = this._emailSignIn(username, password, res);
    } else if (loginMethod === "FACE_ID") {
      response = this._faceIdSignIn(username, faceImage, res);
    }

    return response;
  }

  /**
   * Handle email-based authentication
   * @private
   */
  async _emailSignIn(username, password, res) {
    const params = {
      ...this._getBaseParams(),
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
    };

    const command = new InitiateAuthCommand(params);

    try {
      const response = await this.client.send(command);
      Logger.info("Email sign-in successful");

      const userDetails = await this.userModel.getUserByUsername(username);

      // Update last login method
      await User.update(
        { lastLoginMethod: "EMAIL" },
        { where: { email: username } }
      );

      await this.generateTokenAndSetCookies(res, userDetails.userId, "EMAIL");

      return { ...userDetails };
    } catch (error) {
      Logger.error("Email sign in error:", error);
      throw handleCognitoError(error);
    }
  }

  /**
   * Handle face recognition-based authentication
   * @private
   */
  async _faceIdSignIn(username, faceImage, res) {
    try {
      Logger.info("Attempting face recognition login");

      // Verify if the user exists in the database
      const user = await User.findOne({ where: { email: username } });

      if (!user) {
        return throwApiError(404, "User not found");
      }

      if (user.registrationMethod !== "FACE_ID") {
        return throwApiError(
          400,
          "User is not registered with face recognition"
        );
      }

      // Verify face using Rekognition
      const faceVerificationResult = await RekognitionModel.verifyFace({
        faceImage,
      });

      if (!faceVerificationResult.faceId) {
        return throwApiError(401, "Face verification failed");
      }

      Logger.info("Face verification successful");

      // Update last login method
      await User.update(
        { lastLoginMethod: "FACE_ID" },
        { where: { email: username } }
      );

      // get signed URL for the face image extract key from user.faceImageUrl
      const faceImageKey = user?.faceImageUrl.split("/").pop();
      const signedUrl = await S3Model.getPresignedUrl(faceImageKey);
      Logger.info("Signed URL for face image:", signedUrl);

      await this.generateTokenAndSetCookies(res, user.userId, "FACE_ID");

      return {
        ...user.toJSON(),
        faceVerification: faceVerificationResult,
        signedUrl,
      };
    } catch (error) {
      Logger.error("Face ID sign in error:", error);
      console.error("Error during face ID sign in:", error);
      throw handleCognitoError(error);
    }
  }

  /**
   * Refreshes an authentication session
   * @param {Object} req - Express request object containing refresh token
   * @param {Object} res - Express response object for setting cookies
   * @returns {Promise<Object>} Session refresh result
   */
  async refreshSession(req, res) {
    try {
      Logger.info("Processing refresh session request");

      // Check if refresh token exists in cookies
      const refreshToken = req.cookies?.refresh_token;
      if (!refreshToken) {
        return throwApiError(401, "No refresh token provided");
      }

      // Verify the refresh token
      const tokenData = await this.tokenModel.verifyToken(
        refreshToken,
        "REFRESH"
      );
      if (!tokenData || tokenData.type !== "REFRESH") {
        return throwApiError(401, "Invalid refresh token");
      }

      // Check if token is expired
      if (tokenData.expiresAt < Math.floor(Date.now() / 1000)) {
        return throwApiError(401, "Refresh token expired");
      }

      // Get user from database
      const user = await User.findByPk(tokenData.userId).then((user) =>
        user.toJSON()
      );

      if (!user) {
        return throwApiError(404, "User not found");
      }

      // Generate new tokens
      await this.generateTokenAndSetCookies(
        res,
        user.userId,
        tokenData.authMethod
      );

      Logger.info("Session refreshed successfully");
      return {
        successMessage: "Session refreshed successfully",
        user,
      };
    } catch (error) {
      Logger.error("Refresh session error:", error);
      this._clearAuthCookies(res);
      throw error;
    }
  }

  /**
   * Logs out a user by invalidating their tokens
   * @param {Object} req - Express request object containing access token
   * @param {Object} res - Express response object for clearing cookies
   * @returns {Promise<Object>} Logout result
   */
  async logout(req, res) {
    try {
      Logger.info("Processing logout request");

      if (!req.cookies?.access_token) {
        Logger.warn("No access token found during logout");
        this._clearAuthCookies(res);
        return { successMessage: "Logged out successfully" };
      }

      const accessToken = req.cookies.access_token;

      // Call Cognito to invalidate the token
      const params = {
        AccessToken: accessToken,
      };

      const command = new GlobalSignOutCommand(params);
      await this.client.send(command);
      Logger.info("User signed out from Cognito successfully");

      // Clear auth cookies
      this._clearAuthCookies(res);

      return { successMessage: "Logged out successfully" };
    } catch (error) {
      Logger.error("Logout error:", error);

      // Clear cookies even if Cognito call fails
      this._clearAuthCookies(res);

      if (error.name === "NotAuthorizedException") {
        return { successMessage: "Already logged out" };
      }

      throw handleCognitoError(error);
    }
  }

  /**
   * Helper method to clear authentication cookies
   * @private
   */
  _clearAuthCookies(res) {
    res.clearCookie("access_token", { path: "/" });
    res.clearCookie("refresh_token", { path: "/" });
    res.clearCookie("id_token", { path: "/" });
  }

  /**
   * Initiates the password reset flow
   * @param {Object} params - Parameters with username
   * @returns {Promise<Object>} Password reset initiation result
   */
  async forgotPassword({ username }) {
    try {
      const params = {
        ...this._getBaseParams(),
        Username: username,
      };

      const command = new ForgotPasswordCommand(params);
      const forgotPasswordResponse = await this.client.send(command);
      Logger.info(`Password reset initiated for user: ${username}`);

      return {
        successMessage: "Password reset initiated",
      };
    } catch (error) {
      Logger.error("Forgot password error:", error);
      throw handleCognitoError(error);
    }
  }

  async hashPassword(password) {
    const saltRounds = config[ENVIRONMENT].SALT_ROUNDS;
    const pepperedPassword = `${password}${config[ENVIRONMENT].PASSWORD_PEPPER}`;
    return bcrypt.hash(pepperedPassword, Number(saltRounds));
  }

  /**
   * Completes the password reset flow
   * @param {Object} params - Password reset confirmation details
   * @returns {Promise<Object>} Password reset confirmation result
   */
  async confirmForgotPassword({ username, confirmationCode, newPassword }) {
    try {
      const params = {
        ...this._getBaseParams(),
        Username: username,
        ConfirmationCode: confirmationCode,
        Password: newPassword,
      };

      const command = new ConfirmForgotPasswordCommand(params);
      const confirmForgotPasswordResponse = await this.client.send(command);
      Logger.info(
        "Password reset confirmed successfully",
        confirmForgotPasswordResponse
      );

      // update password in the database
      const user = await User.findOne({ where: { email: username } });
      if (!user) {
        return throwApiError(404, "User not found");
      }

      // Hash the new password before storing it
      const hashedPassword = await this.hashPassword(newPassword);

      const [updatedPassword] = await User.update(
        { password: hashedPassword },
        { where: { email: username } }
      );

      return {
        successMessage: "Password has been reset successfully",
        updatedPassword: updatedPassword > 0,
      };
    } catch (error) {
      Logger.error("Confirm forgot password error:", error);
      throw handleCognitoError(error);
    }
  }

  /**
   * Generates a token and sets it in cookies
   * @param {Object} res - Express response object for setting cookies
   * @param {Object} user - User details
   */
  async generateTokenAndSetCookies(res, userId, authMethod) {
    const expiresIn = 3600; // 1 hour

    const accessToken = await this.tokenModel.generateToken(
      userId,
      "ACCESS",
      authMethod,
      expiresIn
    );

    const refreshToken = await this.tokenModel.generateToken(
      userId,
      "REFRESH",
      authMethod,
      24 * 60 * 60 // 1 day
    );

    const idToken = await this.tokenModel.generateToken(
      userId,
      "ID",
      authMethod,
      expiresIn
    );

    setCookies(
      res,
      {
        access_token: accessToken,
        refresh_token: refreshToken,
        id_token: idToken,
      },
      expiresIn
    );

    Logger.info("Tokens generated and set in cookies");
  }
}

export default CognitoModel;
