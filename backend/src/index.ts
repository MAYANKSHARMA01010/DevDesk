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

// Start server
app.listen(PORT, () => {
  console.log(`[DevDesk Backend] Server running at http://localhost:${PORT}`);
});

export default app;
