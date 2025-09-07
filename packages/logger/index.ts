import winston from "winston";

export const getLogger = (service: string, level = "debug") => {
  return winston.createLogger({
    level: level,
    defaultMeta: { service },
    format: winston.format.combine(
      winston.format.timestamp({
        format: () => {
          return new Date().toLocaleString("en-US", {
            timeZone: "Asia/Colombo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          });
        },
      }),
      winston.format.printf(({ level, message, timestamp, service }) => {
        return `[${timestamp}] [${level}] [${service}]: ${message}`;
      })
    ),
    transports: [new winston.transports.Console()],
  });
};
