import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import Logger from "../lib/Logger.js";
import UserModel from "./UserModel.js";
import { changeCasing } from "../utility/index.js";

import configObj from "../config.js";
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

  async signUp({ username, password, attributes }) {
    const params = {
      ClientId: this.clientId,
      Username: username,
      Password: password,
      UserAttributes: attributes,
    };

    const command = new SignUpCommand(params);
    try {
      const response = await this.client.send(command);
      Logger.info("Sign-up successful:", response);
      return changeCasing(response);
    } catch (error) {
      Logger.error("Error during sign-up:", error.message);
      throw error;
    }
  }

  async confirmSignUp({ username, confirmationCode, password }) {
    const params = {
      ClientId: this.clientId,
      Username: username,
      ConfirmationCode: confirmationCode,
    };

    const command = new ConfirmSignUpCommand(params);
    try {
      const confirmSignUpResponse = await this.client.send(command);
      Logger.info("User confirmed successfully", confirmSignUpResponse);
      await this.userModel.createUser({ email: username });

      const signInResponse = await this.signIn({ username, password });
      return changeCasing(signInResponse);
    } catch (error) {
      Logger.error("Error during confirmation:", error.message);
      throw error;
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
      Logger.info("Sign-in successful:", response);

      const userDetails = await this.userModel.getUserByUsername(username);
      const result = {
        ...{ userAuth: response.AuthenticationResult },
        ...{ userDetails },
      };
      return changeCasing(result);
    } catch (error) {
      Logger.error("Error during sign-in:", error.message);
      throw error;
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
      Logger.info("Session refreshed successfully:", response);
      return changeCasing(response);
    } catch (error) {
      Logger.error("Error during session refresh:", error.message);
      throw error;
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
      return changeCasing(forgotPasswordResponse);
    } catch (error) {
      Logger.error("Error initiating forgot password:", error.message);
      throw error;
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
      return changeCasing(confirmForgotPasswordResponse);
    } catch (error) {
      Logger.error("Error confirming password reset:", error.message);
      throw error;
    }
  }
}

export default CognitoModel;
