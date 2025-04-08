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
import { formatSuccessResponse, handleError } from "../utility/index.js";
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

  async signIn({ username, password }) {
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
      const result = {
        userAuth: response.AuthenticationResult,
        userDetails,
      };
      return formatSuccessResponse(result, "Login successful");
    } catch (error) {
      Logger.error("Sign in error:", error);
      throw handleCognitoError(error);
    }
  }

  async refreshSession({ refreshToken }) {
    const params = {
      AuthFlow: "REFRESH_TOKEN_AUTH",
      ClientId: this.clientId,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    };

    const command = new InitiateAuthCommand(params);
    try {
      const response = await this.client.send(command);
      Logger.info("Session refreshed successfully");
      return formatSuccessResponse(response, "Session refreshed successfully");
    } catch (error) {
      throw handleError(error);
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
