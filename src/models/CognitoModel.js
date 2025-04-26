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
import { successResponse, setCookies } from "../utility/index.js";
import { handleCognitoError } from "../errors/cognito-errors.js";

import configObj from "../config.js";
import RekognitionModel from "./RekognitionModel.js";
const { config, ENVIRONMENT, AWS_REGION } = configObj;
import models from "../models/schemas/associations.js";
import S3Model from "./S3Model.js";
import { throwApiError } from "../utility/ErrorHandler.js";
const { User } = models;
import crypto from "crypto";
import TokenModel from "./TokenModel.js";

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
      const response = await this.client.send(command);
      Logger.info("Sign-up successful");

      const createdUser = await User.create({
        email: username,
        password,
        registrationMethod: "EMAIL",
        lastLoginMethod: "EMAIL",
      });

      return successResponse(
        { ...createdUser, ...response },
        "User registered successfully",
        201
      );
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

      await this.generateTokenAndSetCookies(res, createdUser.userId);

      return successResponse(
        {
          user: createdUser,
          faceRegistration: registerFaceResponse,
          signedUrl: s3UploadResult.signedUrl,
        },
        "User registered successfully with face recognition",
        201
      );
    } catch (error) {
      Logger.error("Face registration error:", error);
      throwApiError(500, error.message, error.name);
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

      await this.generateTokenAndSetCookies(res, userExists.userId);

      return successResponse(
        { ...userExists, isEmailVerified: emailVerified > 0 },
        "User confirmed successfully"
      );
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
      Logger.info(
        `Confirmation code resent successfully for user: ${username}`
      );

      return successResponse(
        {
          deliveryDetails: response.CodeDeliveryDetails,
        },
        "Verification code has been resent"
      );
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

      await this.generateTokenAndSetCookies(res, userDetails.userId);

      return successResponse({ ...userDetails, ExpiresIn }, "Login successful");
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

      await this.generateTokenAndSetCookies(res, user.userId);

      return successResponse(
        {
          ...user.toJSON(),
          ExpiresIn: expiresIn,
          faceVerification: faceVerificationResult,
        },
        "Login successful with face recognition"
      );
    } catch (error) {
      Logger.error("Face ID sign in error:", error);
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
      Logger.info("Attempting to refresh session with token");

      if (
        !req.cookies?.refresh_token ||
        req.cookies.refresh_token.trim() === ""
      ) {
        Logger.error("No refresh token found in cookies");
        throwApiError(401, "No refresh token found");
      }

      const refreshToken = req.cookies.refresh_token;
      Logger.info(
        `Refresh token found. Token starts with: ${refreshToken.substring(0, 5)}...`
      );

      if (!this.clientId) {
        Logger.error("Missing Cognito configuration");
        throwApiError(500, "Cognito configuration is missing");
      }

      const params = {
        ...this._getBaseParams(),
        AuthFlow: "REFRESH_TOKEN_AUTH",
        AuthParameters: {
          REFRESH_TOKEN: refreshToken,
        },
      };

      Logger.info("Sending refresh token request to Cognito");
      const command = new InitiateAuthCommand(params);
      const response = await this.client.send(command);
      Logger.info("Session refreshed successfully");

      if (!response.AuthenticationResult?.AccessToken) {
        Logger.error("Invalid response from Cognito:", response);
        throwApiError(500, "Invalid response from Cognito");
      }

      const { AccessToken, IdToken, ExpiresIn } = response.AuthenticationResult;
      const newRefreshToken =
        response.AuthenticationResult.RefreshToken || refreshToken;

      setCookies(
        res,
        {
          access_token: AccessToken,
          refresh_token: newRefreshToken,
          id_token: IdToken,
        },
        ExpiresIn
      );

      return successResponse({ ExpiresIn }, "Session refreshed successfully");
    } catch (error) {
      Logger.error("Session refresh error:", error.message);

      if (error.name) {
        Logger.error(`Error type: ${error.name}`);
      }

      if (
        ["NotAuthorizedException", "InvalidParameterException"].includes(
          error.name
        )
      ) {
        this._clearAuthCookies(res);
        throwApiError(401, "Session expired. Please log in again.");
      }

      throw handleCognitoError(error);
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
        return successResponse({}, "Logged out successfully");
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

      return successResponse({}, "Logged out successfully");
    } catch (error) {
      Logger.error("Logout error:", error);

      // Clear cookies even if Cognito call fails
      this._clearAuthCookies(res);

      if (error.name === "NotAuthorizedException") {
        return successResponse({}, "Already logged out");
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

      return successResponse(
        forgotPasswordResponse,
        "Password reset initiated"
      );
    } catch (error) {
      Logger.error("Forgot password error:", error);
      throw handleCognitoError(error);
    }
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
      Logger.info("Password reset confirmed successfully");

      return successResponse(
        confirmForgotPasswordResponse,
        "Password has been reset successfully"
      );
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
  async generateTokenAndSetCookies(res, userId) {
    const expiresIn = 3600; // 1 hour

    const accessToken = await this.tokenModel.generateToken(
      userId,
      "ACCESS",
      "FACE_ID",
      expiresIn
    );

    const refreshToken = await this.tokenModel.generateToken(
      userId,
      "REFRESH",
      "FACE_ID",
      24 * 60 * 60 // 1 day
    );

    const idToken = await this.tokenModel.generateToken(
      userId,
      "ID",
      "FACE_ID",
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
