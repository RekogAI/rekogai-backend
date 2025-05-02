import crypto from "crypto";
import Logger from "../lib/Logger.js";
import models from "./schemas/associations.js";
import { Op } from "sequelize";

class TokenModel {
  constructor() {
    this.Token = models.Token;
  }

  /**
   * Generate a new token for a user
   * @param {string} userId - The user's ID
   * @param {string} tokenType - Type of token (ACCESS, REFRESH, ID)
   * @param {string} authMethod - Authentication method (EMAIL, FACE_ID)
   * @param {number} expiresInSeconds - Seconds until token expires
   * @returns {Promise<Object>} The created token object
   */
  async generateToken(userId, tokenType, authMethod, expiresInSeconds = 3600) {
    try {
      // Generate a secure random token
      const token = crypto.randomBytes(64).toString("hex");

      // Calculate expiration time
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

      // Store token in database
      const tokenRecord = await this.Token.create({
        userId,
        token,
        tokenType,
        authMethod,
        expiresAt,
      });

      Logger.info(`Generated ${tokenType} token for user ${userId}`);

      return {
        token,
        expiresAt,
        tokenId: tokenRecord.tokenId,
      };
    } catch (error) {
      Logger.error("Token generation error:", error);
      throw new Error(`Failed to generate token: ${error.message}`);
    }
  }

  /**
   * Verify if a token is valid
   * @param {string} token - The token to verify
   * @param {string} tokenType - Type of token (ACCESS, REFRESH, ID)
   * @returns {Promise<Object|null>} The token record if valid, null otherwise
   */
  async verifyToken(token, tokenType = "ACCESS") {
    try {
      const tokenRecord = await this.Token.findOne({
        where: {
          token,
          tokenType,
          expiresAt: { [Op.gt]: new Date() },
          isRevoked: false,
        },
        include: [
          {
            model: models.User,
            as: "user",
            attributes: [
              "userId",
              "email",
              "registrationMethod",
              "lastLoginMethod",
            ],
          },
        ],
      });

      return tokenRecord.toJSON();
    } catch (error) {
      Logger.error("Token verification error:", error);
      return null;
    }
  }

  /**
   * Revoke a specific token
   * @param {string} token - The token to revoke
   * @returns {Promise<boolean>} True if token was revoked, false otherwise
   */
  async revokeToken(token) {
    try {
      const [updatedCount] = await this.Token.update(
        { isRevoked: true },
        { where: { token } }
      );

      return updatedCount > 0;
    } catch (error) {
      Logger.error("Token revocation error:", error);
      return false;
    }
  }

  /**
   * Revoke all tokens for a user
   * @param {string} userId - The user's ID
   * @param {Array<string>} excludeTokens - Tokens to exclude from revocation
   * @returns {Promise<number>} Number of revoked tokens
   */
  async revokeAllUserTokens(userId, excludeTokens = []) {
    try {
      const whereClause = {
        userId,
        isRevoked: false,
      };

      if (excludeTokens.length > 0) {
        whereClause.token = { [Op.notIn]: excludeTokens };
      }

      const [updatedCount] = await this.Token.update(
        { isRevoked: true },
        { where: whereClause }
      );

      return updatedCount;
    } catch (error) {
      Logger.error("Bulk token revocation error:", error);
      return 0;
    }
  }

  /**
   * Clean up expired tokens
   * @returns {Promise<number>} Number of deleted tokens
   */
  async cleanupExpiredTokens() {
    try {
      const deletedCount = await this.Token.destroy({
        where: {
          [Op.or]: [
            { expiresAt: { [Op.lt]: new Date() } },
            {
              isRevoked: true,
              updatedAt: {
                [Op.lt]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
              },
            },
          ],
        },
      });

      Logger.info(`Cleaned up ${deletedCount} expired tokens`);
      return deletedCount;
    } catch (error) {
      Logger.error("Token cleanup error:", error);
      return 0;
    }
  }
}

export default TokenModel;
