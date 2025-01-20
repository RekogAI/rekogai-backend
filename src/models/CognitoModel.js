import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import configObj from "../config.js";
import Logger from "../lib/Logger.js";
import UserModel from "./UserModel.js";

const { config, ENVIRONMENT, AWS_REGION } = configObj;

// Initialize Cognito Client Configuration
const cognitoConfig = {
  region: AWS_REGION,
  credentials: {
    accessKeyId: config[ENVIRONMENT].AWS_ACCESS_KEY_ID,
    secretAccessKey: config[ENVIRONMENT].AWS_SECRET_ACCESS_KEY,
  },
};

/**
 * Cognito Model - Contains methods for Cognito operations.
 */
class CognitoModel {
  constructor() {
    this.client = new CognitoIdentityProviderClient(cognitoConfig);
    this.userPoolId = config[ENVIRONMENT].COGNITO_USER_POOL_ID;
    this.clientId = config[ENVIRONMENT].COGNITO_CLIENT_ID;

    this.userModel = new UserModel();
  }

  /**
   * Sign up a new user.
   * @param {string} username - User's username (e.g., email).
   * @param {string} password - User's password.
   * @param {Array} attributes - User attributes (e.g., name, email).
   * @returns {Promise<object>} - Sign-up response.
   */
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
      return response;
    } catch (error) {
      Logger.error("Error during sign-up:", error.message);
      throw error;
    }
  }

  /**
   * Confirm user sign-up with a confirmation code.
   * @param {string} username - User's username (e.g., email).
   * @param {string} confirmationCode - Confirmation code sent to the user.
   * @returns {Promise<void>}
   */
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

      return await this.signIn({ username, password });
    } catch (error) {
      Logger.error("Error during confirmation:", error.message);
      throw error;
    }
  }

  /**
   * Sign in a user.
   * @param {string} username - User's username (e.g., email).
   * @param {string} password - User's password.
   * @returns {Promise<object>} - Authentication response.
   */
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
      return Object.assign(
        { userAuth: response.AuthenticationResult },
        { userDetails }
      );
    } catch (error) {
      Logger.error("Error during sign-in:", error.message);
      throw error;
    }
  }

  /**
   * Refresh session tokens using a refresh token.
   * @param {string} refreshToken - The refresh token.
   * @returns {Promise<object>} - New tokens.
   */
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
      return response;
    } catch (error) {
      Logger.error("Error during session refresh:", error.message);
      throw error;
    }
  }

  /**
   * Initiate forgot password process.
   * @param {string} username - User's username (e.g., email).
   * @returns {Promise<void>}
   */
  async forgotPassword({ username }) {
    try {
      const params = {
        ClientId: this.clientId,
        Username: username,
      };

      const command = new ForgotPasswordCommand(params);
      const forgotPasswordResponse = await this.client.send(command);
      Logger.info(`Password reset initiated for user: ${username}`);
      return forgotPasswordResponse;
    } catch (error) {
      Logger.error("Error initiating forgot password:", error.message);
      throw error;
    }
  }

  /**
   * Confirm password reset using the confirmation code.
   * @param {string} username - User's username (e.g., email).
   * @param {string} confirmationCode - Code sent to the user via email/SMS.
   * @param {string} newPassword - New password to set for the user.
   * @returns {Promise<void>}
   */
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
      return confirmForgotPasswordResponse;
    } catch (error) {
      Logger.error("Error confirming password reset:", error.message);
      throw error;
    }
  }
}

export default CognitoModel;
