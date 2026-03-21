import winston from "winston";

/**
 * Maps Winston levels to Google Cloud Logging (Stackdriver) exact severity strings.
 * This ensures logs show up with the correct icons and filter correctly in GCP Logs Explorer.
 */
const severityMap: Record<string, string> = {
  error: "ERROR",
  warn: "WARNING",
  info: "INFO",
  http: "INFO",
  verbose: "DEBUG",
  debug: "DEBUG",
  silly: "DEFAULT",
};

const cloudLoggingFormat = winston.format((info) => {
  info.severity = severityMap[info.level];
  // Add an optional trace ID if you set it on the req object later
  return info;
});

const isProd = process.env.NODE_ENV === "production";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info", // Set LOG_LEVEL=debug in .env for verbose output
  format: winston.format.combine(
    cloudLoggingFormat(),
    winston.format.timestamp(),
    // Use raw JSON in production so Cloud Run parses the structure perfectly
    isProd
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, metadata, ...meta }) => {
            const metaStr = Object.keys(meta).length > 2 ? JSON.stringify(meta) : "";
            return `${timestamp} [${level}]: ${message} ${metaStr}`;
          })
        )
  ),
  transports: [
    new winston.transports.Console()
  ],
});

export default logger;
