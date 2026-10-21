import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import apiRouter from "./routes/index.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Standard middlewares
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API Routes
app.use("/api", apiRouter);

import { processManager } from "./services/processes/processManager.js";
import { databaseService } from "./services/database/databaseService.js";

const HOST = process.env.HOST || "127.0.0.1";

// Start server
const server = app.listen(Number(PORT), HOST, () => {
  console.log(`[DevDesk Backend] Server running at http://${HOST}:${PORT}`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[DevDesk Backend] FATAL: Port ${PORT} is already occupied by another process.`);
    console.error(`[DevDesk Backend] DevDesk requires port ${PORT} for its local API. Please free port ${PORT} before running.`);
    process.exit(98);
  } else {
    console.error("[DevDesk Backend] Server failed to start:", err);
    process.exit(1);
  }
});

function handleShutdown(signal: string) {
  console.log(`[DevDesk Backend] Received ${signal}. Shutting down gracefully...`);
  processManager.cleanupAll();
  databaseService.closeAllConnections().catch(() => {});
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));

export default app;
