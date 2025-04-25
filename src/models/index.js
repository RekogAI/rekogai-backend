import sequelize from "../config/database.js";
import models from "./schemas/associations.js";

const { User, Image, Face, Album } = models;

export { User, Image, Face, Album, sequelize };
