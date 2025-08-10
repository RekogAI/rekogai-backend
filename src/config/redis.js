import { Redis } from "ioredis";
import Logger from "../lib/Logger.js";
import configObj from "../config.js";
const { config, ENVIRONMENT } = configObj;

const redisConfig = {
  host: config[ENVIRONMENT].REDIS_HOST,
  port: config[ENVIRONMENT].REDIS_PORT,
  password: config[ENVIRONMENT].REDIS_PASSWORD,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
};

// Main Redis connection for general operations
export const redis = new Redis(redisConfig);

// Separate connection for pub-sub operations
export const redisPubSub = new Redis(redisConfig);

// Connection event handlers
redis.on("connect", () => {
  Logger.info("Redis connected successfully");
});

redis.on("error", (err) => {
  Logger.error("Redis connection error:", err);
});

redisPubSub.on("connect", () => {
  Logger.info("Redis Pub-Sub connected successfully");
});

redisPubSub.on("error", (err) => {
  Logger.error("Redis Pub-Sub connection error:", err);
});

export default redis;
