import User from "./users.js";
import Image from "./images.js";
import Face from "./faces.js";
import Album from "./albums.js";
import Folder from "./folders.js";
import APIResponse from "./api_reponse.js";
import Thumbnail from "./thumbnails.js";
import Token from "./tokens.js";

// User Associations
User.hasMany(Image, {
  foreignKey: "userId",
  as: "images",
});

User.hasMany(Album, {
  foreignKey: "userId",
  as: "albums",
});

// Image Associations
Image.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

Image.hasMany(Face, {
  foreignKey: "imageId",
  as: "faces",
});

// Face Associations
Face.belongsTo(Image, {
  foreignKey: "imageId",
  as: "image",
});

// Album Associations
Album.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

// Folder Associations
Folder.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

User.hasMany(Folder, {
  foreignKey: "userId",
  as: "folders",
});

Folder.hasMany(Image, {
  foreignKey: "folderId",
  as: "images",
});

Image.belongsTo(Folder, {
  foreignKey: "folderId",
  as: "folder",
});

// APIResponse Associations
APIResponse.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

User.hasMany(APIResponse, {
  foreignKey: "userId",
  as: "apiResponses",
});

APIResponse.belongsTo(Image, {
  foreignKey: "imageId",
  as: "image",
});

Image.hasMany(APIResponse, {
  foreignKey: "imageId",
  as: "apiResponses",
});

// Thumbnail Associations
Thumbnail.belongsTo(Face, {
  foreignKey: "faceId",
  as: "face",
});

Face.hasOne(Thumbnail, {
  foreignKey: "faceId",
  as: "thumbnail",
});

// Token Associations
Token.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

User.hasMany(Token, {
  foreignKey: "userId",
  as: "tokens",
});

// Self-referencing relationship for parent-child folders
Folder.hasMany(Folder, {
  foreignKey: "parentFolderId",
  as: "subFolders",
});
Folder.belongsTo(Folder, {
  foreignKey: "parentFolderId",
  as: "parentFolder",
  // onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

export default {
  User,
  Image,
  Face,
  Album,
  Folder,
  APIResponse,
  Thumbnail,
  Token,
};
