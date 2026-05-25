import winston from "winston";
import fs from "fs";
import path from "path";

const severityMap: Record<string, string> = {
  error: "ERROR",
  warn: "WARNING",
  info: "INFO",
  http: "INFO",
  verbose: "DEBUG",
  debug: "DEBUG",
  silly: "DEFAULT",
};

const addSeverity = winston.format((info) => {
  info.severity = severityMap[info.level] ?? "DEFAULT";
  return info;
});

const isProd = process.env.NODE_ENV === "production";

// JSON format used by file transports and prod console
const jsonFormat = winston.format.combine(
  addSeverity(),
  winston.format.timestamp(),
  winston.format.json()
);

// Human-readable format for the dev console
const consoleDevFormat = winston.format.combine(
  addSeverity(),
  winston.format.timestamp({ format: "HH:mm:ss.SSS" }),
  winston.format.colorize({ all: false, level: true }),
  winston.format.printf(({ timestamp, level, message, severity, ...meta }) => {
    const hasMeta = Object.keys(meta).length > 0;
    const metaStr = hasMeta
      ? "\n  " + JSON.stringify(meta, null, 2).replace(/\n/g, "\n  ")
      : "";
    return `${timestamp} ${level}: ${message}${metaStr}`;
  })
);

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: isProd ? jsonFormat : consoleDevFormat,
  }),
];

// In dev, also write to log files so you can tail/grep them
if (!isProd) {
  const logsDir = path.join(process.cwd(), "logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
      format: jsonFormat,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      format: jsonFormat,
    })
  );
}

const logger = winston.createLogger({
  level: (process.env.LOG_LEVEL || (isProd ? "info" : "debug")).toLowerCase(),
  transports,
});

export default logger;
