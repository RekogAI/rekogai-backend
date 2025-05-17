import { throwApiError } from "../utility/ErrorHandler.js";
import {
  API_ERROR_CODES,
  API_ERROR_MESSAGES,
  API_ERROR_STATUS_CODES,
} from "../utility/constants.error.js";

/**
 * Folder related exceptions
 */
export const FolderExceptions = {
  /**
   * Throws an error when required parameters are missing
   */
  throwInvalidParametersError() {
    throwApiError(
      API_ERROR_STATUS_CODES.BAD_REQUEST,
      API_ERROR_MESSAGES.INVALID_PARAMETERS,
      API_ERROR_CODES.INVALID_PARAMETERS
    );
  },

  /**
   * Throws an error when folder name contains invalid characters
   */
  throwInvalidFolderNameError() {
    throwApiError(
      API_ERROR_STATUS_CODES.BAD_REQUEST,
      "Folder name contains invalid characters",
      API_ERROR_CODES.INVALID_PARAMETERS
    );
  },

  /**
   * Throws an error when parent folder is not found
   */
  throwParentFolderNotFoundError() {
    throwApiError(
      API_ERROR_STATUS_CODES.NOT_FOUND,
      "Parent folder not found",
      API_ERROR_CODES.RESOURCE_NOT_FOUND
    );
  },

  /**
   * Throws an error when a folder with the same name already exists
   */
  throwFolderAlreadyExistsError() {
    throwApiError(
      API_ERROR_STATUS_CODES.CONFLICT,
      "A folder with this name already exists in this location",
      API_ERROR_CODES.RESOURCE_EXISTS
    );
  },

  /**
   * Throws an error when folder is not found
   */
  throwFolderNotFoundError() {
    throwApiError(
      API_ERROR_STATUS_CODES.NOT_FOUND,
      "Folder not found",
      API_ERROR_CODES.RESOURCE_NOT_FOUND
    );
  },
};

export default FolderExceptions;
