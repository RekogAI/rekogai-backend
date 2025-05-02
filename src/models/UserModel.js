import Logger from "../lib/Logger.js";
import { generateUUID } from "../utility/index.js";
import models from "../models/schemas/associations.js";
import { throwApiError } from "../utility/ErrorHandler.js";

class UserModel {
  constructor() {
    this.User = models.User;
  }

  async createUser({ email, password }) {
    const userId = generateUUID();

    try {
      const newUser = await this.User.create({
        userId,
        email,
        password,
      });

      Logger.info("User created successfully:", newUser);
      return newUser;
    } catch (error) {
      Logger.error("Error creating user:", error.message);
      throw error;
    }
  }

  async getUserById(userId) {
    try {
      const user = await this.User.findOne({
        where: { userId },
      });

      Logger.info("User fetched successfully:", user);
      return user;
    } catch (error) {
      Logger.error("Error fetching user:", error.message);
      throw error;
    }
  }

  async getUserByUsername(email) {
    try {
      const user = await this.User.findOne({
        where: { email },
      });

      if (!user) {
        throwApiError(404, "User not found", "USER_NOT_FOUND");
      }

      Logger.info("User fetched successfully by email:", user);
      return user.toJSON();
    } catch (error) {
      Logger.error("Error fetching user by email:", error.message);
      throw error;
    }
  }

  async updateUser(user) {
    try {
      const [updatedRowsCount, updatedRows] = await this.User.update(
        {
          name: user.name,
          email: user.email,
        },
        {
          where: { userId: user.userId },
          returning: true,
        }
      );

      Logger.info("User updated successfully:", updatedRows[0]);
      return updatedRows[0];
    } catch (error) {
      Logger.error("Error updating user:", error.message);
      throw error;
    }
  }

  async deleteUser(userId) {
    try {
      const deletedRowCount = await this.User.destroy({
        where: { userId },
      });

      Logger.info("User deleted successfully, count:", deletedRowCount);
      return deletedRowCount > 0;
    } catch (error) {
      Logger.error("Error deleting user:", error.message);
      throw error;
    }
  }
}

export default UserModel;
