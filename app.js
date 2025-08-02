import createError from "http-errors";
import express from "express";
import path from "path";
import cookieParser from "cookie-parser";

import createRouter from "./src/routes/index.js";
import { errorHandler, logRequest } from "./src/middlewares/index.js";
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
      console.log(
        "Available models before sync:",
        Object.keys(sequelize.models)
      );

      // Check database connection
      await sequelize.authenticate();
      console.log("Database connection established.");

      // Simpler sync approach
      await sequelize.sync({ force: false });

      console.log("Database synced successfully.");

      // Verify tables after sync
      const [results] = await sequelize.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
      );
      console.log(
        "Tables created:",
        results.map((r) => r.table_name).join(", ")
      );
    } catch (err) {
      console.error("Sync error:", err);
    }
  })();
}

// catch 404 and forward to error handler
app.use((req, res, next) => {
  next(createError(404));
});

// Custom error handler to format errors
app.use(errorHandler);

// Optional: Close Sequelize on app shutdown (for graceful shutdown)
process.on("SIGTERM", async () => {
  await sequelize.close();
  console.log("Database connection closed");
  process.exit(0);
});

export { app };
