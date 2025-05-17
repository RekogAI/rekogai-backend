import models from "./schemas/associations.js";
import Logger from "../lib/Logger.js";
import { Op } from "sequelize";
import { FolderExceptions } from "./exceptions.js";
import path from "path";
import { generateUUID } from "../utility/index.js";

class FolderModel {
  constructor() {
    this.Folder = models.Folder;
  }

  /**
   * Create a new folder
   * @param {Object} folderData - Folder data
   * @param {string} folderData.userId - User ID
   * @param {string} folderData.folderName - Folder name
   * @param {string} folderData.parentFolderId - Parent folder ID (optional)
   * @returns {Promise<Object>} Created folder
   */
  async createFolder({ userId, folderName, parentFolderId = null }) {
    try {
      if (!userId || !folderName) {
        FolderExceptions.throwInvalidParametersError();
      }

      // Validate folder name (no special characters except spaces, dashes, underscores)
      const folderNameRegex = /^[a-zA-Z0-9\s\-_]+$/;
      if (!folderNameRegex.test(folderName)) {
        FolderExceptions.throwInvalidFolderNameError();
      }

      // Check if parent folder exists and belongs to the user
      let folderPath = "";
      let isRoot = false;

      if (parentFolderId) {
        const parentFolder = await this.Folder.findOne({
          where: {
            folderId: parentFolderId,
            userId,
            isDeleted: false,
          },
        });

        if (!parentFolder) {
          FolderExceptions.throwParentFolderNotFoundError();
        }

        // Create path based on parent folder
        folderPath = path.join(parentFolder.folderPath, folderName);
      } else {
        // This is a root folder
        folderPath = `/${folderName}`;
        isRoot = true;
      }

      // Check if folder with same name already exists at this path
      const existingFolder = await this.Folder.findOne({
        where: {
          userId,
          folderName,
          // parentFolderId: parentFolderId || null,
          isDeleted: false,
        },
      });

      if (existingFolder) {
        FolderExceptions.throwFolderAlreadyExistsError();
      }

      // Create the folder
      const folder = await this.Folder.create({
        userId,
        folderName,
        folderPath,
        parentFolderId: parentFolderId || null,
        isRoot,
      }).then((folder) => folder.toJSON());

      Logger.info(`Created folder ${folderName} for user ${userId}`);

      return folder;
    } catch (error) {
      Logger.error("Error creating folder:", error);
      throw error;
    }
  }

  /**
   * Update folder name
   * @param {string} userId - User ID
   * @param {string} folderId - Folder ID to update
   * @param {string} newFolderName - New folder name
   * @returns {Promise<Object>} Updated folder
   */
  async updateFolderName({ userId, folderId, newFolderName }) {
    try {
      // Validate inputs
      if (!userId || !folderId || !newFolderName) {
        FolderExceptions.throwInvalidParametersError();
      }

      // Validate folder name format
      const folderNameRegex = /^[a-zA-Z0-9\s\-_]+$/;
      if (!folderNameRegex.test(newFolderName)) {
        FolderExceptions.throwInvalidFolderNameError();
      }

      // Find the folder to update
      const folder = await this.Folder.findOne({
        where: {
          folderId,
          userId,
          isDeleted: false,
        },
      });

      if (!folder) {
        FolderExceptions.throwFolderNotFoundError();
      }

      // Check if a folder with the same name already exists at the same level
      const existingFolder = await this.Folder.findOne({
        where: {
          userId,
          folderName: newFolderName,
          parentFolderId: folder.parentFolderId,
          folderId: { [Op.ne]: folderId }, // Not the current folder
          isDeleted: false,
        },
      });

      if (existingFolder) {
        FolderExceptions.throwFolderAlreadyExistsError();
      }

      // Generate new path
      const oldFolderName = folder.folderName;
      let newFolderPath = "";

      if (folder.isRoot) {
        newFolderPath = `/${newFolderName}`;
      } else {
        // Get parent folder path
        const parentFolder = await this.Folder.findOne({
          where: {
            folderId: folder.parentFolderId,
            isDeleted: false,
          },
        });

        if (!parentFolder) {
          FolderExceptions.throwParentFolderNotFoundError();
        }

        newFolderPath = path.join(parentFolder.folderPath, newFolderName);
      }

      const oldFolderPath = folder.folderPath;

      // Update folder
      await folder.update({
        folderName: newFolderName,
        folderPath: newFolderPath,
      });

      Logger.info(
        `Updated folder name from ${oldFolderName} to ${newFolderName} for user ${userId}`
      );

      // Update paths of child folders recursively
      await this.updateChildFolderPaths(oldFolderPath, newFolderPath, userId);

      Logger.info(
        `Updated folder name from ${oldFolderName} to ${newFolderName} for user ${userId}`
      );

      return folder.toJSON();
    } catch (error) {
      Logger.error("Error updating folder name:", error);
      throw error;
    }
  }

  /**
   * Update paths of child folders when a parent folder name changes
   * @param {string} oldParentPath - Old parent folder path
   * @param {string} newParentPath - New parent folder path
   * @param {string} userId - User ID
   * @private
   */
  async updateChildFolderPaths(oldParentPath, newParentPath, userId) {
    try {
      // Find all child folders that have paths starting with the old parent path
      const childFolders = await this.Folder.findAll({
        where: {
          userId,
          folderPath: {
            [Op.like]: `${oldParentPath}/%`,
          },
          isDeleted: false,
        },
      });

      // Update each child folder's path
      for (const childFolder of childFolders) {
        const newChildPath = childFolder.folderPath.replace(
          oldParentPath,
          newParentPath
        );
        await childFolder.update({ folderPath: newChildPath });
      }
    } catch (error) {
      Logger.error("Error updating child folder paths:", error);
      throw error;
    }
  }

  /**
   * Delete a folder (soft delete)
   * @param {Object} params - Delete parameters
   * @param {string} params.userId - User ID
   * @param {string} params.folderId - Folder ID to delete
   * @returns {Promise<Object>} Deletion result
   */
  async deleteFolder({ userId, folderId }) {
    try {
      // Validate inputs
      if (!userId || !folderId) {
        FolderExceptions.throwInvalidParametersError();
      }

      // Find the folder to delete
      const folder = await this.Folder.findOne({
        where: {
          folderId,
          userId,
          isDeleted: false,
        },
      });

      if (!folder) {
        FolderExceptions.throwFolderNotFoundError();
      }

      // Soft delete the folder
      const [rowsAffected] = await this.Folder.update(
        { isDeleted: true },
        {
          where: {
            folderId,
            userId,
          },
        }
      );

      // Soft delete all child folders
      await this.deleteChildFolders(folder.folderPath, userId);

      Logger.info(`Deleted folder ${folder.folderName} for user ${userId}`);

      return {
        isFolderDeleted: rowsAffected > 0,
        message:
          rowsAffected > 0
            ? "Folder deleted successfully"
            : "Failed to delete folder",
      };
    } catch (error) {
      Logger.error("Error deleting folder:", error);
      throw error;
    }
  }

  /**
   * Delete all child folders of a parent folder
   * @param {string} parentFolderPath - Parent folder path
   * @param {string} userId - User ID
   * @private
   */
  async deleteChildFolders(parentFolderPath, userId) {
    try {
      // Find and update all child folders
      await this.Folder.update(
        { isDeleted: true },
        {
          where: {
            userId,
            folderPath: {
              [Op.like]: `${parentFolderPath}/%`,
            },
            isDeleted: false,
          },
        }
      );
    } catch (error) {
      Logger.error("Error deleting child folders:", error);
      throw error;
    }
  }

  /**
   * Get all folders for a user
   * @param {Object} params - Query parameters
   * @param {string} params.userId - User ID
   * @param {string} [params.folderName] - Filter folders by name (optional)
   * @param {string} [params.sortBy='createdAt'] - Sort by field (createdAt, folderName, totalItems, totalSize)
   * @param {string} [params.sortOrder='ASC'] - Sort order (ASC or DESC)
   * @returns {Promise<Array>} List of folders
   */
  async getAllFolders({
    userId,
    folderName,
    sortBy = "createdAt",
    sortOrder = "DESC",
  }) {
    try {
      // Validate inputs
      if (!userId) {
        FolderExceptions.throwInvalidParametersError();
      }

      // Validate sort parameters
      const validSortFields = [
        "createdAt",
        "folderName",
        "totalItems",
        "totalSize",
      ];
      const validSortOrders = ["ASC", "DESC"];

      if (!validSortFields.includes(sortBy)) {
        sortBy = "createdAt";
      }

      if (!validSortOrders.includes(sortOrder.toUpperCase())) {
        sortOrder = "ASC";
      }

      // Build query conditions
      const whereConditions = {
        userId,
        isDeleted: false,
      };

      // Add folder name filter if provided
      if (folderName) {
        whereConditions.folderName = {
          [Op.like]: `%${folderName}%`, // Case-insensitive partial match
        };
      }

      // Fetch all folders for the user
      const folders = await this.Folder.findAll({
        where: whereConditions,
        order: [[sortBy, sortOrder]],
        attributes: [
          "folderId",
          "folderName",
          "folderPath",
          "parentFolderId",
          "isRoot",
          "totalItems",
          "totalSize",
          "createdAt",
          "updatedAt",
        ],
      });

      Logger.info(`Retrieved ${folders} folders for user ${userId}`);

      // Organize folders into a hierarchical structure
      const rootFolders = [];
      const folderMap = {};

      // First pass: Create a map of all folders
      folders.forEach((folder) => {
        folderMap[folder.folderId] = {
          ...folder.toJSON(),
          children: [],
        };
      });

      // Second pass: Build the folder hierarchy
      folders.forEach((folder) => {
        const folderData = folderMap[folder.folderId];

        if (folder.isRoot) {
          rootFolders.push(folderData);
        } else if (folder.parentFolderId && folderMap[folder.parentFolderId]) {
          folderMap[folder.parentFolderId].children.push(folderData);
        } else {
          // Handle orphaned folders (parent was deleted or not found)
          rootFolders.push(folderData);
        }
      });

      return {
        folders: rootFolders,
        totalCount: folders.length,
      };
    } catch (error) {
      Logger.error("Error fetching folders:", error);
      throw error;
    }
  }

  /**
   * Get a folder by ID
   * @param {Object} params - Query parameters
   * @param {string} params.userId - User ID
   * @param {string} params.folderId - Folder ID
   * @returns {Promise<Object>} Folder details
   **/
  async getFolderById({ userId, folderId }) {
    try {
      // Validate inputs
      if (!userId || !folderId) {
        FolderExceptions.throwInvalidParametersError();
      }

      // Find the folder by ID
      const folder = await this.Folder.findOne({
        where: {
          folderId,
          userId,
          isDeleted: false,
        },
        include: [
          {
            model: models.Folder,
            as: "subFolders",
            attributes: [
              "folderId",
              "folderName",
              "folderPath",
              "parentFolderId",
              "isRoot",
              "totalItems",
              "totalSize",
            ],
          },
          {
            model: models.Image,
            as: "images",
            required: false,
          },
        ],
      }).then((folder) => folder.toJSON());

      if (!folder) {
        FolderExceptions.throwFolderNotFoundError();
      }

      Logger.info(`Retrieved folder ${folder.folderName} for user ${userId}`);

      return folder;
    } catch (error) {
      Logger.error("Error fetching folder:", error);
      throw error;
    }
  }

  /**
   * Restore a soft-deleted folder
   * @param {Object} params - Restore parameters
   * @param {string} params.userId - User ID
   * @param {string} params.folderId - Folder ID to restore
   * @returns {Promise<Object>} Restoration result
   */
  async restoreFolder({ userId, folderId }) {
    try {
      // Validate inputs
      if (!userId || !folderId) {
        FolderExceptions.throwInvalidParametersError();
      }

      // Find the folder to restore
      const folder = await this.Folder.findOne({
        where: {
          folderId,
          userId,
          isDeleted: true,
        },
      });

      if (!folder) {
        FolderExceptions.throwFolderNotFoundError();
      }

      // find all child folders to restore
      const childFolders = await this.Folder.findAll({
        where: {
          userId,
          folderPath: {
            [Op.like]: `${folder.folderPath}/%`,
          },
          isDeleted: true,
        },
      });

      const childFolderPromises = childFolders.map((childFolder) => {
        return this.Folder.update(
          { isDeleted: false },
          {
            where: {
              folderId: childFolder.folderId,
              userId,
            },
          }
        );
      });

      // Wait for all child folder updates to complete
      await Promise.all(childFolderPromises);

      await this.Folder.update(
        { isDeleted: false },
        {
          where: {
            folderId,
            userId,
          },
        }
      );

      Logger.info(`Restored folder ${folder.folderName} for user ${userId}`);

      return {
        isFolderRestored: true,
        message: "Folder restored successfully",
      };
    } catch (error) {
      Logger.error("Error restoring folder:", error);
      throw error;
    }
  }
}

export default FolderModel;
