import createError from "http-errors";
import express from "express";
import path from "path";
import cookieParser from "cookie-parser";

import createRouter from "./src/routes/index.js";
import { logRequest } from "./src/middlewares/index.js";
import Logger from "./src/lib/Logger.js";

const app = express();

// view engine setup
const __dirname = path.dirname(new URL(import.meta.url).pathname);
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(logRequest);

// Use routers
app.use(createRouter());

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

export { app };
