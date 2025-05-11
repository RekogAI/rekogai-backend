import crypto from "crypto";
import Logger from "../lib/Logger.js";
import models from "./schemas/associations.js";
import { Op, Sequelize } from "sequelize";
import { TOKEN_TYPE } from "../utility/constants.js";

const TOKEN_STATUS = { VALID: "VALID", INVALID: "INVALID" };

class TokenModel {
  constructor() {
    this.Token = models.Token;
  }

  /**
   * Generate a new token for a user
   * @param {string} userId - The user's ID
   * @param {string} tokenType - Type of token (ACCESS, REFRESH, ID)
   * @param {number} expiresInMinutes - Seconds until token expires
   * @returns {Promise<Object>} The created token object
   */
  async generateToken(userId, tokenType, expiresInMinutes, onlyUpdate = false) {
    try {
      const token = crypto.randomBytes(64).toString("hex");

      if (onlyUpdate) {
        return { token, tokenId: null };
      }
      const tokenRecord = await this.Token.create({
        userId,
        token,
        tokenType,
        status: TOKEN_STATUS.VALID,
        validityInMinutes: expiresInMinutes,
      });

      console.log(`Generated ${tokenType} token for user ${userId}`);

      return {
        token,
        tokenId: tokenRecord.tokenId,
      };
    } catch (error) {
      console.error("Token generation error:", error);
      throw error;
    }
  }

  /**
   * Verify if a token is valid
   * @param {string} token - The token to verify
   * @param {string} tokenType - Type of token (ACCESS, REFRESH, ID)
   * @returns {Promise<Object|null>} The token record if valid, null otherwise
   */
  async verifyToken(token, tokenType = TOKEN_TYPE.ACCESS) {
    try {
      const tokenRecord = await this.Token.findOne({
        where: {
          token,
          tokenType,
        },
        include: [
          {
            model: models.User,
            as: "user",
            attributes: ["userId", "email", "signUpMethod", "lastLoginMethod"],
          },
        ],
        raw: true,
      });

      return tokenRecord;
    } catch (error) {
      console.error("Token verification error:", error);
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
      console.error("Token revocation error:", error);
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
      console.error("Bulk token revocation error:", error);
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
            { expiredAt: { [Op.lt]: new Date() } },
            {
              isRevoked: true,
              updatedAt: {
                [Op.lt]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
              },
            },
          ],
        },
      });

      console.log(`Cleaned up ${deletedCount} expired tokens`);
      return deletedCount;
    } catch (error) {
      console.error("Token cleanup error:", error);
      return 0;
    }
  }

  /**
   * Fetch user tokens from the database
   * @param {Object} params - Token parameters
   * @param {string} [params.idToken] - The ID token
   * @param {string} [params.accessToken] - The access token
   * @param {string} [params.refreshToken] - The refresh token
   * @returns {Promise<Object>} Object containing the tokens and count
   */
  async fetchUserTokens({ idToken, accessToken, refreshToken } = {}) {
    try {
      const tokenValues = [idToken, accessToken, refreshToken].filter(Boolean);

      if (!tokenValues.length) {
        Logger.warn("fetchUserTokens called with no valid token values");
        return { tokens: [], tokensCount: 0 };
      }

      const tokens = await this.Token.findAll({
        where: {
          token: { [Op.in]: tokenValues },
          status: TOKEN_STATUS.VALID,
        },
        include: [
          {
            model: models.User,
            as: "user",
            attributes: ["userId", "email"],
          },
        ],
        raw: true,
        nest: true,
      });

      Logger.debug(
        `Found ${tokens.length} valid tokens out of ${tokenValues.length} provided`
      );

      return {
        tokens,
        tokensCount: tokens.length,
      };
    } catch (error) {
      Logger.error("Error fetching user tokens:", error);
      throw new Error(`Failed to fetch user tokens: ${error.message}`);
    }
  }

  /**
   * Update an existing token
   * @param {string} tokenId - The ID of the token to update
   * @param {Object} newToken - Object containing token properties to update
   * @returns {Promise<boolean>} True if token was updated, false otherwise
   */
  async updateToken(tokenId, newToken) {
    try {
      const [updatedCount] = await this.Token.update(
        {
          token: newToken,
          generatedAt: new Date(),
          status: TOKEN_STATUS.VALID,
        },
        {
          where: { tokenId },
        }
      );

      return updatedCount > 0;
    } catch (error) {
      console.error("Token update error:", error);
      return false;
    }
  }
}

export default TokenModel;
