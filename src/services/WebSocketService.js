import { Server as SocketIOServer } from "socket.io";
import NotificationService, { CHANNELS } from "./NotificationService.js";
import Logger from "../lib/Logger.js";
import configObj from "../config.js";

const { corsOptions } = configObj;

class WebSocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map();
  }

  initialize(server) {
    this.io = new SocketIOServer(server, {
      cors: corsOptions,
      transports: ["websocket", "polling"],
    });

    this.setupEventHandlers();
    this.subscribeToRedisChannels();

    Logger.info("WebSocket service initialized");
  }

  setupEventHandlers() {
    this.io.on("connection", (socket) => {
      Logger.info(`Client connected: ${socket.id}`);

      socket.on("authenticate", (data) => {
        const { userId } = data;
        if (userId) {
          socket.userId = userId;
          socket.join(`user:${userId}`);
          this.connectedUsers.set(userId, socket.id);
          Logger.info(`User ${userId} authenticated and joined room`);
        }
      });

      socket.on("disconnect", () => {
        if (socket.userId) {
          this.connectedUsers.delete(socket.userId);
          Logger.info(`User ${socket.userId} disconnected`);
        }
        Logger.info(`Client disconnected: ${socket.id}`);
      });

      socket.on("subscribe-job", (jobId) => {
        socket.join(`job:${jobId}`);
        Logger.info(`Socket ${socket.id} subscribed to job: ${jobId}`);
      });

      socket.on("unsubscribe-job", (jobId) => {
        socket.leave(`job:${jobId}`);
        Logger.info(`Socket ${socket.id} unsubscribed from job: ${jobId}`);
      });
    });
  }

  subscribeToRedisChannels() {
    // Subscribe to job progress updates
    NotificationService.subscribe(CHANNELS.JOB_PROGRESS, (data) => {
      this.broadcastJobUpdate("job_progress", data);
    });

    // Subscribe to job completion updates
    NotificationService.subscribe(CHANNELS.JOB_COMPLETED, (data) => {
      this.broadcastJobUpdate("job_completed", data);
    });

    // Subscribe to job failure updates
    NotificationService.subscribe(CHANNELS.JOB_FAILED, (data) => {
      this.broadcastJobUpdate("job_failed", data);
    });
  }

  broadcastJobUpdate(event, data) {
    try {
      // Broadcast to specific job room
      if (data.jobId) {
        this.io.to(`job:${data.jobId}`).emit(event, data);
      }

      // Broadcast to specific user room
      if (data.userId) {
        this.io.to(`user:${data.userId}`).emit(event, data);
      }

      Logger.info(`Broadcasted ${event} to clients`);
    } catch (error) {
      Logger.error("Error broadcasting job update:", error);
    }
  }

  // Send notification to specific user
  sendToUser(userId, event, data) {
    try {
      this.io.to(`user:${userId}`).emit(event, data);
      Logger.info(`Sent ${event} to user ${userId}`);
    } catch (error) {
      Logger.error("Error sending notification to user:", error);
    }
  }

  // Broadcast to all connected clients
  broadcast(event, data) {
    try {
      this.io.emit(event, data);
      Logger.info(`Broadcasted ${event} to all clients`);
    } catch (error) {
      Logger.error("Error broadcasting to all clients:", error);
    }
  }

  // Get connected users count
  getConnectedUsersCount() {
    return this.connectedUsers.size;
  }

  // Check if user is online
  isUserOnline(userId) {
    return this.connectedUsers.has(userId);
  }
}

export default new WebSocketService();
