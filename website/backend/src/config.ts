import path from "path";
import fs from "fs";
import dotenv from "dotenv";

// Load .env
const projectRoot = path.resolve(process.cwd());
dotenv.config({ path: path.join(projectRoot, ".env") });

export const config = {
  projectName: "PulseGuard Emergency Triage & Telemetry",
  version: "1.0.0",
  environment: process.env.ENVIRONMENT || "development",
  host: process.env.API_HOST || "0.0.0.0",
  port: parseInt(process.env.API_PORT || "8000", 10),

  // Storage
  storageDir: path.join(projectRoot, process.env.STORAGE_LOCAL_DIR || "storage"),
  photosDir: path.join(projectRoot, process.env.STORAGE_LOCAL_DIR || "storage", "photos"),
  chartsDir: path.join(projectRoot, process.env.STORAGE_LOCAL_DIR || "storage", "charts"),

  // Telegram Paramedic Bot
  telegramBotToken: (process.env.TELEGRAM_BOT_TOKEN || "").trim(),
  paramedicChatId: (process.env.PARAMEDIC_DEFAULT_CHAT_ID || "").trim(),

  // Clinical Thresholds
  hrMin: 45.0,
  hrMax: 135.0,
  rrMin: 9.0,
  rrMax: 28.0,
  spo2Min: 90.0,
  hrvRmssdMin: 15.0, // Low vagal tone / autonomic collapse indicator
};

// Ensure storage directories exist
fs.mkdirSync(config.photosDir, { recursive: true });
fs.mkdirSync(config.chartsDir, { recursive: true });
