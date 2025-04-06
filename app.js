import createError from "http-errors";
import express from "express";
import path from "path";
import cookieParser from "cookie-parser";

import createRouter from "./src/routes/index.js";
import { logRequest } from "./src/middlewares/index.js";
import Logger from "./src/lib/Logger.js";
import configObj from "./src/config.js";
const { ENVIRONMENT, corsOptions } = configObj;
import { sequelize } from "./src/models/index.js";
import cors from "cors";

const app = express();

// view engine setup
const __dirname = path.dirname(new URL(import.meta.url).pathname);
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(logRequest);

// Use routers
app.use(createRouter());

// Sync models in dev (optional, use migrations in prod)
if (ENVIRONMENT === "development") {
  (async () => {
    await sequelize.sync({ force: false });
    Logger.info("Database synced successfully in development");
  })().catch((err) => Logger.error("Sync error:", err));
}

// catch 404 and forward to error handler
app.use((req, res, next) => {
  next(createError(404));
});

// Error handler
app.use((err, req, res, next) => {
  // Log the error for debugging (optional)
  Logger.error(err.stack);

  // Prepare error response
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res.status(status).json({
    success: false,
    error: {
      status,
      message,
    },
  });
});

// Optional: Close Sequelize on app shutdown (for graceful shutdown)
process.on("SIGTERM", async () => {
  await sequelize.close();
  Logger.info("Database connection closed");
  process.exit(0);
});

export { app };
