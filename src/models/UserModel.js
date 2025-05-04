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

      console.log("User created successfully:", newUser);
      return newUser;
    } catch (error) {
      console.error("Error creating user:", error.message);
      throw error;
    }
  }

  async getUserById(userId) {
    try {
      const user = await this.User.findOne({
        where: { userId },
      });

      console.log("User fetched successfully:", user);
      return user;
    } catch (error) {
      console.error("Error fetching user:", error.message);
      throw error;
    }
  }

  async getUserByUsername(email) {
    try {
      const user = await this.User.findOne({
        where: { email },
        raw: true,
      });

      console.log("User fetched successfully by email:", user);
      return user;
    } catch (error) {
      console.error("Error fetching user by email:", error.message);
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

      console.log("User updated successfully:", updatedRows[0]);
      return updatedRows[0];
    } catch (error) {
      console.error("Error updating user:", error.message);
      throw error;
    }
  }

  async deleteUser(userId) {
    try {
      const deletedRowCount = await this.User.destroy({
        where: { userId },
      });

      console.log("User deleted successfully, count:", deletedRowCount);
      return deletedRowCount > 0;
    } catch (error) {
      console.error("Error deleting user:", error.message);
      throw error;
    }
  }
}

export default UserModel;
