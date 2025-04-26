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

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(logRequest);

// Use routers
app.use(createRouter());

if (ENVIRONMENT === "development") {
  (async () => {
    try {
      // Log models before sync
      Logger.info(
        "Available models before sync:",
        Object.keys(sequelize.models)
      );

      // Check database connection
      await sequelize.authenticate();
      Logger.info("Database connection established.");

      try {
        await sequelize.query(`
          CREATE TABLE IF NOT EXISTS collections (
            "collectionId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            "userId" UUID NOT NULL,
            "name" VARCHAR(255) NOT NULL,
            "description" TEXT,
            "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
            "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
            "deletedAt" TIMESTAMP WITH TIME ZONE
          );
        `);
        Logger.info("Collections table created or already exists");
      } catch (tableErr) {
        Logger.error("Error creating collections table:", tableErr);
      }

      // Simpler sync approach
      await sequelize.sync({ force: false });

      Logger.info("Database synced successfully.");

      // Verify tables after sync
      const [results] = await sequelize.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
      );
      Logger.info(
        "Tables created:",
        results.map((r) => r.table_name).join(", ")
      );
    } catch (err) {
      Logger.error("Sync error:", err);
    }
  })();
}

// catch 404 and forward to error handler
app.use((req, res, next) => {
  next(createError(404));
});

// Enhanced error handler with specific handling for PayloadTooLargeError
app.use((err, req, res, next) => {
  // Log the error for debugging
  Logger.error(err.stack);

  // Handle payload too large errors specifically
  if (err.type === "entity.too.large" || err.name === "PayloadTooLargeError") {
    return res.status(413).json({
      success: false,
      error: {
        status: 413,
        message:
          "Request entity too large. Please reduce the size of your upload.",
      },
    });
  }

  // Prepare error response for other errors
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
