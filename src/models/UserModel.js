import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import configObj from "../config.js";
import Logger from "../lib/Logger.js";
import { TABLE_NAME } from "../utility/constants.js";
import { generateUUID } from "../utility/index.js";
import AWS from "aws-sdk";

const { config, ENVIRONMENT, AWS_REGION } = configObj;

// Initialize DynamoDB Client Configuration
const userModelConfig = {
  region: AWS_REGION,
  credentials: {
    accessKeyId: config[ENVIRONMENT].AWS_ACCESS_KEY_ID,
    secretAccessKey: config[ENVIRONMENT].AWS_SECRET_ACCESS_KEY,
  },
};

/**
 * UserModel - Contains methods for interacting with DynamoDB to manage users.
 */
class UserModel {
  constructor() {
    this.client = new DynamoDBClient(userModelConfig);
    this.tableName = TABLE_NAME.USERS; // Your DynamoDB table name
  }

  /**
   * Create a new user in DynamoDB.
   * @param {Object} user - The user data.
   * @param {string} user.userId - The user's unique ID.
   * @param {string} user.name - The user's name.
   * @param {string} user.email - The user's email address.
   * @returns {Promise<Object>} - The response from DynamoDB.
   */
  async createUser({ email }) {
    const userId = generateUUID();
    const params = {
      TableName: this.tableName,
      Item: {
        UserID: { S: userId },
        email: { S: email },
        createdAt: { S: new Date().toISOString() },
      },
    };

    const command = new PutItemCommand(params);

    try {
      const response = await this.client.send(command);
      Logger.info("User created successfully:", response);
      const result = Object.assign(response, userId);
      return result;
    } catch (error) {
      Logger.error("Error creating user:", error.message);
      throw error;
    }
  }

  /**
   * Fetch a user from DynamoDB by userId.
   * @param {string} userId - The user's unique ID.
   * @returns {Promise<Object>} - The user data from DynamoDB.
   */
  async getUserById(userId) {
    const params = {
      TableName: this.tableName,
      Key: {
        userId: { S: userId },
      },
    };

    const command = new GetItemCommand(params);

    try {
      const response = await this.client.send(command);
      Logger.info("User fetched successfully:", response);
      return response.Item
        ? AWS.DynamoDB.Converter.unmarshall(response.Item)
        : null;
    } catch (error) {
      Logger.error("Error fetching user:", error.message);
      throw error;
    }
  }

  /**
   * Fetch a user from DynamoDB by email.
   * @param {string} email - The user's email address.
   * @returns {Promise<Object>} - The user data from DynamoDB.
   */
  async getUserByUsername(email) {
    const params = {
      TableName: this.tableName,
      IndexName: "emailIndex", // Replace with your GSI name
      KeyConditionExpression: "email = :email",
      ExpressionAttributeValues: {
        ":email": { S: email },
      },
    };

    const command = new QueryCommand(params);

    try {
      const response = await this.client.send(command);
      Logger.info("User fetched successfully by email:", response);
      return response.Items && response.Items.length > 0
        ? AWS.DynamoDB.Converter.unmarshall(response.Items[0])
        : null;
    } catch (error) {
      Logger.error("Error fetching user by email:", error.message);
      throw error;
    }
  }

  /**
   * Update a user's information in DynamoDB.
   * @param {Object} user - The user data to update.
   * @param {string} user.userId - The user's unique ID.
   * @param {string} user.name - The user's name.
   * @param {string} user.email - The user's email.
   * @returns {Promise<Object>} - The update response from DynamoDB.
   */
  async updateUser(user) {
    const params = {
      TableName: this.tableName,
      Key: {
        userId: { S: user.userId },
      },
      UpdateExpression: "SET #name = :name, #email = :email",
      ExpressionAttributeNames: {
        "#name": "name",
        "#email": "email",
      },
      ExpressionAttributeValues: {
        ":name": { S: user.name },
        ":email": { S: user.email },
      },
      ReturnValues: "ALL_NEW",
    };

    const command = new UpdateItemCommand(params);

    try {
      const response = await this.client.send(command);
      Logger.info("User updated successfully:", response);
      return response.Attributes
        ? AWS.DynamoDB.Converter.unmarshall(response.Attributes)
        : null;
    } catch (error) {
      Logger.error("Error updating user:", error.message);
      throw error;
    }
  }

  /**
   * Delete a user from DynamoDB.
   * @param {string} userId - The user's unique ID.
   * @returns {Promise<Object>} - The delete response from DynamoDB.
   */
  async deleteUser(userId) {
    const params = {
      TableName: this.tableName,
      Key: {
        userId: { S: userId },
      },
    };

    const command = new DeleteItemCommand(params);

    try {
      const response = await this.client.send(command);
      Logger.info("User deleted successfully:", response);
      return response;
    } catch (error) {
      Logger.error("Error deleting user:", error.message);
      throw error;
    }
  }
}

export default UserModel;
