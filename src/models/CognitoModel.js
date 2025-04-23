import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  ResendConfirmationCodeCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import Logger from "../lib/Logger.js";
import UserModel from "./UserModel.js";
import { formatErrorResponse, formatSuccessResponse, setCookies } from "../utility/index.js";
import { handleCognitoError } from "../errors/cognito-errors.js";

import configObj from "../config.js";
// import {
//   User,
//   Image,
//   Face,
//   Album,
//   Folder,
//   APIResponse,
// } from "../models/schemas/associations.js";
const { config, ENVIRONMENT, AWS_REGION } = configObj;

class CognitoModel {
  constructor() {
    this.client = new CognitoIdentityProviderClient(
      config[ENVIRONMENT].AWS_SDK_CONFIG
    );
    this.userPoolId = config[ENVIRONMENT].COGNITO_USER_POOL_ID;
    this.clientId = config[ENVIRONMENT].COGNITO_CLIENT_ID;

    this.userModel = new UserModel();
  }

  async signUp(reqBody) {
    console.log(" CognitoModelsignUp reqBody", reqBody);
    const { username, password, attributes } = reqBody;
    const params = {
      ClientId: this.clientId,
      Username: username,
      Password: password,
      UserAttributes: attributes,
    };

    const command = new SignUpCommand(params);
    try {
      const response = await this.client.send(command);
      Logger.info("Sign-up successful");
      const createdUsers = await this.userModel.createUser({
        email: username,
        password,
      });
      return formatSuccessResponse(
        { ...createdUsers, ...response },
        "User registered successfully"
      );
    } catch (error) {
      Logger.error("Signup error:", error);
      throw handleCognitoError(error);
    }
  }

  async confirmSignUp({ username, confirmationCode }) {
    const params = {
      ClientId: this.clientId,
      Username: username,
      ConfirmationCode: confirmationCode,
    };

    const command = new ConfirmSignUpCommand(params);

    try {
      const confirmSignUpResponse = await this.client.send(command);
      Logger.info("User confirmed successfully in Cognito");

      const userExists = await this.userModel.getUserByUsername(username);

      if (!userExists) {
        Logger.warn("User confirmed in Cognito but not found in database");
      }

      return formatSuccessResponse(
        confirmSignUpResponse,
        "User confirmed successfully"
      );
    } catch (error) {
      Logger.error("Confirm signup error:", error);
      throw handleCognitoError(error);
    }
  }

  async resendConfirmationCode({ username }) {
    Logger.info(`Resending confirmation code for user: ${username}`);

    const params = {
      ClientId: this.clientId,
      Username: username,
    };

    const command = new ResendConfirmationCodeCommand(params);

    try {
      const response = await this.client.send(command);
      Logger.info(
        `Confirmation code resent successfully for user: ${username}`
      );

      return formatSuccessResponse(
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

  async signIn({ username, password }, res) {
    const params = {
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: this.clientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
    };

    const command = new InitiateAuthCommand(params);

    try {
      const response = await this.client.send(command);
      Logger.info("Sign-in successful");

      const userDetails = await this.userModel.getUserByUsername(username);

      const { AccessToken, RefreshToken, IdToken, ExpiresIn } =
        response.AuthenticationResult;

      console.log(
        " CognitoModelsignIn response.AuthenticationResult",
        response.AuthenticationResult
      );
      setCookies(
        res,
        {
          access_token: AccessToken,
          refresh_token: RefreshToken,
          id_token: IdToken,
        },
        ExpiresIn
      );

      return formatSuccessResponse(
        { ...userDetails, ExpiresIn },
        "Login successful"
      );
    } catch (error) {
      Logger.error("Sign in error:", error);
      throw handleCognitoError(error);
    }
  }

  async refreshSession(req, res) {
    try {
      Logger.info("Attempting to refresh session with token");

      // Enhanced validation for refresh token
      if (
        !req.cookies ||
        !req.cookies.refresh_token ||
        req.cookies.refresh_token.trim() === ""
      ) {
        Logger.error("No refresh token found in cookies");
        return formatErrorResponse(
          401,
          "No refresh token found. Please log in again."
        );
      }

      const refreshToken = req.cookies.refresh_token;
      Logger.info(
        `Refresh token found. Token starts with: ${refreshToken.substring(0, 5)}...`
      );

      // Ensure the client and userPoolId are properly set
      if (!this.clientId || !this.userPoolId) {
        Logger.error("Missing Cognito configuration");
        return formatErrorResponse(500, "Authentication service misconfigured");
      }

      const params = {
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: this.clientId,
        AuthParameters: {
          REFRESH_TOKEN: refreshToken,
        },
      };

      Logger.info("Sending refresh token request to Cognito");
      const command = new InitiateAuthCommand(params);
      const response = await this.client.send(command);
      Logger.info("Session refreshed successfully");

      // Check if we have the expected result structure
      if (
        !response.AuthenticationResult ||
        !response.AuthenticationResult.AccessToken
      ) {
        Logger.error("Invalid response from Cognito:", response);
        return formatErrorResponse(
          500,
          "Authentication service returned an invalid response"
        );
      }

      const { AccessToken, IdToken, ExpiresIn } = response.AuthenticationResult;

      // Keep the existing RefreshToken if a new one wasn't provided
      const newRefreshToken =
        response.AuthenticationResult.RefreshToken || refreshToken;

      // Set cookies with secure options and proper expiration
      setCookies(
        res,
        {
          access_token: AccessToken,
          refresh_token: newRefreshToken,
          id_token: IdToken,
        },
        ExpiresIn
      );

      return formatSuccessResponse(
        { ExpiresIn },
        "Session refreshed successfully"
      );
    } catch (error) {
      Logger.error("Session refresh error:", error.message);

      // Log more detailed error for debugging
      if (error.name) {
        Logger.error(`Error type: ${error.name}`);
      }

      // Clear the invalid cookies on authentication failure
      if (
        error.name === "NotAuthorizedException" ||
        error.name === "InvalidParameterException"
      ) {
        res.clearCookie("access_token", { path: "/" });
        res.clearCookie("refresh_token", { path: "/" });
        res.clearCookie("id_token", { path: "/" });
        return formatErrorResponse(
          401,
          "Session expired. Please log in again."
        );
      }

      throw handleCognitoError(error);
    }
  }

  async forgotPassword({ username }) {
    try {
      const params = {
        ClientId: this.clientId,
        Username: username,
      };

      const command = new ForgotPasswordCommand(params);
      const forgotPasswordResponse = await this.client.send(command);
      Logger.info(`Password reset initiated for user: ${username}`);
      return formatSuccessResponse(
        forgotPasswordResponse,
        "Password reset initiated"
      );
    } catch (error) {
      Logger.error("Forgot password error:", error);
      throw handleCognitoError(error);
    }
  }

  async confirmForgotPassword({ username, confirmationCode, newPassword }) {
    try {
      const params = {
        ClientId: this.clientId,
        Username: username,
        ConfirmationCode: confirmationCode,
        Password: newPassword,
      };

      const command = new ConfirmForgotPasswordCommand(params);
      const confirmForgotPasswordResponse = await this.client.send(command);
      Logger.info("Password reset confirmed successfully");
      return formatSuccessResponse(
        confirmForgotPasswordResponse,
        "Password has been reset successfully"
      );
    } catch (error) {
      Logger.error("Confirm forgot password error:", error);
      throw handleCognitoError(error);
    }
  }
}

export default CognitoModel;
