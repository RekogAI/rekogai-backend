import sequelize from "../config/database.js";
import { User, Image, Face, Album } from "./schemas/associations.js";

export { User, Image, Face, Album, sequelize };
