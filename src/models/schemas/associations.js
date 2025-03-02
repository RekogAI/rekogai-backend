import User from "./users.js";
import Image from "./images.js";
import Face from "./faces.js";
import Album from "./albums.js";

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

export { User, Image, Face, Album };
