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
import configObj from "../config.js";
import RekognitionModel from "./RekognitionModel.js";
const { config, ENVIRONMENT, AWS_REGION } = configObj;
import models from "../models/schemas/associations.js";
import S3Model from "./S3Model.js";
import { ApiError, throwApiError } from "../utility/ErrorHandler.js";
import {
  API_ERROR_CODES,
  API_ERROR_MESSAGES,
  API_ERROR_STATUS_CODES,
} from "../utility/constants.error.js";
const { User } = models;
import TokenModel from "./TokenModel.js";
import bcrypt from "bcrypt";
import {
  SIGN_UP_METHODS,
  TOKEN_VALIDITY_IN_MINUTES,
  TOKEN_TYPE,
} from "../utility/constants.js";

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
    console.log("Processing signup request");
    const { username, password, signUpMethod, faceIDImageBase64 } = reqBody;

    if (signUpMethod === SIGN_UP_METHODS.EMAIL) {
      return this._emailSignUp(username, password, res);
    } else if (signUpMethod === SIGN_UP_METHODS.FACE_ID) {
      return this._faceIdSignUp(username, faceIDImageBase64, res);
    }

    throwApiError(
      API_ERROR_STATUS_CODES.BAD_REQUEST,
      API_ERROR_MESSAGES.INVALID_METHOD,
      API_ERROR_CODES.INVALID_METHOD
    );
  }

  /**
   * Handle email-based registration
   * @private
   */
  async _emailSignUp(username, password, res) {
    try {
      const userExists = await this.userModel.getUserByUsername(username);
      console.log(" CognitoModel_emailSignUp userExists", userExists);

      if (userExists && userExists.signUpMethod === SIGN_UP_METHODS.FACE_ID) {
        throwApiError(
          API_ERROR_STATUS_CODES.CONFLICT,
          API_ERROR_MESSAGES.USER_EXISTS_WITH_DIFFERENT_METHOD,
          API_ERROR_CODES.USER_EXISTS_WITH_DIFFERENT_METHOD
        );
      }

      if (userExists && !userExists.isEmailVerified) {
        return this.resendConfirmationCode({
          username,
        });
      } else if (userExists && userExists.isEmailVerified) {
        throwApiError(
          API_ERROR_STATUS_CODES.CONFLICT,
          API_ERROR_MESSAGES.USER_ALREADY_EXISTS,
          API_ERROR_CODES.USER_ALREADY_EXISTS
        );
      }

      const params = {
        ...this._getBaseParams(),
        Username: username,
        Password: password,
      };

      console.log("signupCommand params", params);

      const command = new SignUpCommand(params);
      console.log(" CognitoModel_emailSignUp command", command);

      const signUpCommandResponse = await this.client.send(command);

      console.log(
        "CognitoModel_emailSignUp signUpCommandResponse",
        signUpCommandResponse
      );

      const hashedPassword = await this.hashPassword(password);

      const createdUser = await User.create({
        email: username,
        password: hashedPassword,
        signUpMethod: SIGN_UP_METHODS.EMAIL,
        lastLoginMethod: SIGN_UP_METHODS.EMAIL,
      }).then((user) => user.toJSON());
      console.log(" CognitoModel_emailSignUp createdUser", createdUser);

      // Return user without hashed password
      const { password: _, ...userWithoutPassword } = createdUser;

      return userWithoutPassword;
    } catch (error) {
      console.error("Signup error:", error);
      throw error;
    }
  }

  /**
   * Handle face ID based registration
   * @private
   */
  async _faceIdSignUp(username, faceIDImageBase64, res) {
    if (!username || !faceIDImageBase64) {
      throwApiError(
        API_ERROR_CODES.BAD_REQUEST,
        API_ERROR_MESSAGES.INVALID_PARAMETERS,
        API_ERROR_CODES.INVALID_PARAMETERS
      );
    }
    try {
      const registerFaceResponse =
        await RekognitionModel.registerFaceAuth(faceIDImageBase64);

      const { isNewFace, faceId } = registerFaceResponse;

      if (!isNewFace) {
        throwApiError(
          API_ERROR_STATUS_CODES.CONFLICT,
          API_ERROR_MESSAGES.FACE_ALREADY_REGISTERED,
          API_ERROR_CODES.FACE_ALREADY_REGISTERED
        );
      }

      // Upload face image to S3
      const s3UploadResult = await S3Model.uploadFaceAuthImage(
        faceIDImageBase64,
        username
      );
      console.log("Face image uploaded to S3:", s3UploadResult);

      // Create user in database with face image reference
      const createdUser = await User.create({
        email: username,
        faceIDS3Url: s3UploadResult.imageUrl,
        signUpMethod: SIGN_UP_METHODS.FACE_ID,
        lastLoginMethod: SIGN_UP_METHODS.FACE_ID,
        faceIDS3Key: s3UploadResult.key,
      }).then((user) => user.toJSON());

      // Return user without hashed password
      const { password: _, ...userWithoutPassword } = createdUser;

      return {
        ...userWithoutPassword,
        signedUrl: s3UploadResult.signedUrl,
      };
    } catch (error) {
      console.error("Error during face registration:", error);
      throw error;
    }
  }

  /**
   * Confirms a user's registration
   * @param {Object} params - Confirmation parameters
   * @returns {Promise<Object>} Confirmation result
   */
  async confirmSignUp({ username, confirmationCode, signUpMethod }, res) {
    try {
      if (!username || !confirmationCode) {
        throwApiError(
          API_ERROR_STATUS_CODES.BAD_REQUEST,
          API_ERROR_MESSAGES.INVALID_PARAMETERS,
          API_ERROR_CODES.INVALID_PARAMETERS
        );
      }
      const params = {
        ...this._getBaseParams(),
        Username: username,
        ConfirmationCode: confirmationCode,
      };

      const command = new ConfirmSignUpCommand(params);
      const confirmSignUpResponse = await this.client.send(command);
      console.log(
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

      await this.generateTokenAndSetCookies(
        res,
        userExists.userId,
        signUpMethod
      );

      return { ...userExists, isEmailVerified: emailVerified > 0 };
    } catch (error) {
      console.error("Confirm signup error:", error);
      throw error;
    }
  }

  /**
   * Resends confirmation code to user
   * @param {Object} params - Parameters with username
   * @returns {Promise<Object>} Resend confirmation result
   */
  async resendConfirmationCode({ username }) {
    console.log(`Resending confirmation code for user: ${username}`);

    const params = {
      ...this._getBaseParams(),
      Username: username,
    };

    const command = new ResendConfirmationCodeCommand(params);

    try {
      const response = await this.client.send(command);
      console.log(" CognitoModelresendConfirmationCode response", response);
      console.log(
        `Confirmation code resent successfully for user: ${username}`
      );

      return { successMessage: "Verification code has been resent" };
    } catch (error) {
      console.error("Resend confirmation code error:", error);
      throw error;
    }
  }

  /**
   * Authenticates a user
   * @param {Object} credentials - User credentials
   * @param {Object} res - Express response object for setting cookies
   * @returns {Promise<Object>} Authentication result
   */
  async signIn({ username, password, loginMethod, faceIDImageBase64 }, res) {
    console.log(`Attempting to sign in with method: ${loginMethod}`);

    let response;

    if (loginMethod === SIGN_UP_METHODS.EMAIL) {
      response = this._emailSignIn({ username, password, res });
    } else if (loginMethod === SIGN_UP_METHODS.FACE_ID) {
      response = this._faceIdSignIn({ username, faceIDImageBase64, res });
    }

    return response;
  }

  /**
   * Handle email-based authentication
   * @private
   */
  async _emailSignIn({ username, password, res }) {
    try {
      if (!username || !password) {
        throwApiError(
          API_ERROR_STATUS_CODES.BAD_REQUEST,
          API_ERROR_MESSAGES.INVALID_PARAMETERS,
          API_ERROR_CODES.INVALID_PARAMETERS
        );
      }

      const userDetails = await this.userModel.getUserByUsername(username);
      console.log(" CognitoModel_emailSignIn userDetails", userDetails);

      if (!userDetails) {
        throw throwApiError(
          API_ERROR_STATUS_CODES.NOT_FOUND,
          API_ERROR_MESSAGES.USER_NOT_FOUND,
          API_ERROR_CODES.USER_NOT_FOUND
        );
      }

      if (!userDetails.isEmailVerified) {
        return this.resendConfirmationCode({
          username,
        });
      }

      const params = {
        ...this._getBaseParams(),
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password,
        },
      };

      const command = new InitiateAuthCommand(params);
      const InitiateAuthCommandResponse = await this.client.send(command);
      console.log(
        " CognitoModel_emailSignIn InitiateAuthCommandResponse",
        InitiateAuthCommandResponse
      );

      await User.update(
        { lastLoginMethod: SIGN_UP_METHODS.EMAIL },
        { where: { email: username } }
      );

      await this.generateTokenAndSetCookies(
        res,
        userDetails.userId,
        SIGN_UP_METHODS.EMAIL
      );

      return { ...userDetails };
    } catch (error) {
      console.error("Email sign in error:", error);
      throw error;
    }
  }

  /**
   * Handle face recognition-based authentication
   * @private
   */
  async _faceIdSignIn({ username, faceIDImageBase64, res }) {
    try {
      if (!username || !faceIDImageBase64) {
        throwApiError(
          API_ERROR_STATUS_CODES.BAD_REQUEST,
          API_ERROR_MESSAGES.INVALID_PARAMETERS,
          API_ERROR_CODES.INVALID_PARAMETERS
        );
      }

      console.log("Attempting face recognition login");

      // Verify if the user exists in the database
      const user = await User.findOne({
        where: { email: username },
        raw: true,
      }).then((user) => user.toJSON());
      console.log(" CognitoModel_faceIdSignIn user", user);

      if (!user) {
        throwApiError(
          API_ERROR_STATUS_CODES.NOT_FOUND,
          API_ERROR_MESSAGES.USER_NOT_FOUND,
          API_ERROR_CODES.USER_NOT_FOUND
        );
      }

      if (user.signUpMethod !== SIGN_UP_METHODS.FACE_ID) {
        throwApiError(
          API_ERROR_STATUS_CODES.BAD_REQUEST,
          API_ERROR_MESSAGES.FACE_ID_NOT_SUPPORTED,
          API_ERROR_CODES.FACE_ID_NOT_SUPPORTED
        );
      }

      if (!user.isEmailVerified) {
        return this.resendConfirmationCode({
          username,
        });
      }

      // compare faces using Rekognition
      const faceVerificationResult =
        await RekognitionModel.authenticateFaceAuth(
          user.faceIDS3Key,
          faceIDImageBase64
        );

      if (!faceVerificationResult.isAuthenticated) {
        throwApiError(
          API_ERROR_STATUS_CODES.UNAUTHORIZED,
          API_ERROR_MESSAGES.FACE_MISMATCH,
          API_ERROR_CODES.FACE_MISMATCH
        );
      }

      console.log("Face verification successful");

      // Update last login method
      await User.update(
        { lastLoginMethod: SIGN_UP_METHODS.FACE_ID },
        { where: { email: username } }
      );

      // get signed URL for the face image extract key from user.faceIDS3Url
      const faceIDS3Key = user?.faceIDS3Url.split("/").pop();
      const signedUrl = await S3Model.getPresignedUrl(faceIDS3Key);
      console.log("Signed URL for face image:", signedUrl);

      await this.generateTokenAndSetCookies(
        res,
        user.userId,
        SIGN_UP_METHODS.FACE_ID
      );

      const { password: _, ...userWithoutPassword } = user;

      return {
        ...userWithoutPassword,
        signedUrl,
      };
    } catch (error) {
      console.error("Face ID sign in error:", error);
      throw error;
    }
  }

  // Implement the isTokenExpired method to check token expiration
  isTokenExpired(token, generatedAt, expiryInMinutes) {
    console.log(
      " CognitoModelisTokenExpired token, generatedAt, expiryInMinutes",
      token,
      generatedAt,
      expiryInMinutes
    );
    if (!token || !generatedAt || !expiryInMinutes) {
      return true;
    }

    const tokenGeneratedTime = new Date(generatedAt).getTime();
    const expiryTimeMs = expiryInMinutes * 60 * 1000;
    const currentTime = Date.now();

    return currentTime > tokenGeneratedTime + expiryTimeMs;
  }

  // Check if token is about to expire (within 5 minutes)
  isTokenNearExpiry(token, generatedAt, expiryInMinutes) {
    if (!token || !generatedAt || !expiryInMinutes) {
      return true;
    }

    const tokenGeneratedTime = new Date(generatedAt).getTime();
    const expiryTimeMs = expiryInMinutes * 60 * 1000;
    const currentTime = Date.now();
    const timeToExpiryMs = tokenGeneratedTime + expiryTimeMs - currentTime;

    // Return true if token will expire within 5 minutes
    return timeToExpiryMs < 5 * 60 * 1000;
  }

  /**
   * Refreshes an authentication session
   * @param {Object} req - Express request object containing refresh token
   * @param {Object} res - Express response object for setting cookies
   * @returns {Promise<Object>} Session refresh result
   */
  async refreshSession(req, res) {
    try {
      console.log("Processing refresh session request");

      const idToken = req.cookies?.id_token;
      const refreshToken = req.cookies?.refresh_token;
      const accessToken = req.cookies?.access_token;

      // const idToken = req.body?.id_token;
      // const refreshToken = req.body?.refresh_token;
      // const accessToken = req.body?.access_token;

      // Check if refresh token exists in cookies
      if (!refreshToken || !idToken || !accessToken) {
        throwApiError(
          API_ERROR_STATUS_CODES.UNAUTHORIZED,
          API_ERROR_MESSAGES.INVALID_TOKEN,
          API_ERROR_CODES.INVALID_TOKEN
        );
      }

      // fetch tokens from database
      const userTokens = await this.tokenModel.fetchUserTokens({
        idToken,
        refreshToken,
        accessToken,
      });

      const { tokens, tokensCount } = userTokens || {};

      if (tokensCount < 3) {
        throwApiError(
          API_ERROR_STATUS_CODES.UNAUTHORIZED,
          API_ERROR_MESSAGES.INVALID_TOKEN,
          API_ERROR_CODES.INVALID_TOKEN
        );
      }

      const _idToken = tokens.find(
        (token) => token.tokenType === TOKEN_TYPE.ID
      );
      const _refreshToken = tokens.find(
        (token) => token.tokenType === TOKEN_TYPE.REFRESH
      );
      const _accessToken = tokens.find(
        (token) => token.tokenType === TOKEN_TYPE.ACCESS
      );

      if (!_idToken || !_refreshToken || !_accessToken) {
        throwApiError(
          API_ERROR_STATUS_CODES.UNAUTHORIZED,
          API_ERROR_MESSAGES.INVALID_TOKEN,
          API_ERROR_CODES.INVALID_TOKEN
        );
      }

      // Check if ID token is expired
      if (
        this.isTokenExpired(
          _idToken.token,
          _idToken.generatedAt,
          _idToken.validityInMinutes
        )
      ) {
        throwApiError(
          API_ERROR_STATUS_CODES.UNAUTHORIZED,
          API_ERROR_MESSAGES.SESSION_EXPIRED,
          API_ERROR_CODES.SESSION_EXPIRED
        );
      }

      // Check if refresh token is expired
      if (
        this.isTokenExpired(
          _refreshToken.token,
          _refreshToken.generatedAt,
          _refreshToken.validityInMinutes
        )
      ) {
        throwApiError(
          API_ERROR_STATUS_CODES.UNAUTHORIZED,
          API_ERROR_MESSAGES.SESSION_EXPIRED,
          API_ERROR_CODES.SESSION_EXPIRED
        );
      }

      // Check if access token needs rotation (expired or close to expiry)
      const accessTokenExpired = this.isTokenExpired(
        _accessToken.token,
        _accessToken.generatedAt,
        _accessToken.validityInMinutes
      );

      const accessTokenNearExpiry = this.isTokenNearExpiry(
        _accessToken.token,
        _accessToken.generatedAt,
        _accessToken.validityInMinutes
      );

      if (accessTokenExpired || accessTokenNearExpiry) {
        console.log("Access token needs rotation, generating new tokens");

        const userId = _idToken?.user?.userId;

        // Check if user has "remember me" enabled by looking at refresh token expiry
        const rememberMe =
          _refreshToken.expiryInMinutes > TOKEN_VALIDITY_IN_MINUTES["24_HOURS"];

        const newAccessToken = await this.tokenModel.generateToken(
          userId,
          TOKEN_TYPE.ACCESS,
          TOKEN_VALIDITY_IN_MINUTES["30_MINUTES"],
          true
        );

        console.log(
          " CognitoModelrefreshSession newAccessToken",
          newAccessToken
        );

        // Update the access token in the database
        const isTokenUpdated = await this.tokenModel.updateToken(
          _accessToken.tokenId,
          newAccessToken.token
        );

        if (!isTokenUpdated) {
          throwApiError(
            API_ERROR_STATUS_CODES.UNAUTHORIZED,
            API_ERROR_MESSAGES.ACCESS_TOKEN_NOT_GENERATED,
            API_ERROR_CODES.ACCESS_TOKEN_NOT_GENERATED
          );
        }

        console.log(
          "CognitoModelrefreshSession isTokenUpdated",
          isTokenUpdated
        );

        setCookies(res, { access_token: newAccessToken }, rememberMe);

        console.log("Access token rotated successfully");
      } else {
        console.log("Access token still valid, no need for rotation");
      }

      console.log("Session refreshed successfully");
      return {
        successMessage: "Session refreshed successfully",
      };
    } catch (error) {
      console.error("Refresh session error:", error);
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
      console.log("Processing logout request");

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
      console.log("User signed out from Cognito successfully");

      // Clear auth cookies
      this._clearAuthCookies(res);

      return { successMessage: "Logged out successfully" };
    } catch (error) {
      console.error("Logout error:", error);

      // Clear cookies even if Cognito call fails
      this._clearAuthCookies(res);

      if (error.name === "NotAuthorizedException") {
        return { successMessage: "Already logged out" };
      }

      throw error;
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
      console.log(`Password reset initiated for user: ${username}`);

      return {
        successMessage: "Password reset initiated",
      };
    } catch (error) {
      console.error("Forgot password error:", error);
      throw error;
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
      console.log(
        "Password reset confirmed successfully",
        confirmForgotPasswordResponse
      );

      // update password in the database
      const user = await User.findOne({ where: { email: username } });
      if (!user) {
        throwApiError(
          API_ERROR_STATUS_CODES.NOT_FOUND,
          API_ERROR_MESSAGES.USER_NOT_FOUND,
          API_ERROR_CODES.USER_NOT_FOUND
        );
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
      console.error("Confirm forgot password error:", error);
      throw error;
    }
  }

  /**
   * Generates a token and sets it in cookies
   * @param {Object} res - Express response object for setting cookies
   * @param {Object} user - User details
   */
  async generateTokenAndSetCookies(res, userId, rememberMe = false) {
    const accessToken = await this.tokenModel.generateToken(
      userId,
      TOKEN_TYPE.ACCESS,
      TOKEN_VALIDITY_IN_MINUTES["30_MINUTES"]
    );

    const refreshToken = await this.tokenModel.generateToken(
      userId,
      TOKEN_TYPE.REFRESH,
      rememberMe
        ? TOKEN_VALIDITY_IN_MINUTES["30_DAYS"]
        : TOKEN_VALIDITY_IN_MINUTES["24_HOURS"]
    );

    const idToken = await this.tokenModel.generateToken(
      userId,
      TOKEN_TYPE.ID,
      TOKEN_VALIDITY_IN_MINUTES["1_YEAR"]
    );

    const cookies = {
      access_token: accessToken,
      refresh_token: refreshToken,
      id_token: idToken,
    };

    setCookies(res, cookies, rememberMe);

    console.log("Tokens generated and set in cookies");
  }
}

export default CognitoModel;
