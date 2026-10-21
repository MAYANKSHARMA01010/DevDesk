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

// Start server
const server = app.listen(PORT, () => {
  console.log(`[DevDesk Backend] Server running at http://localhost:${PORT}`);
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
