import dotenv from "dotenv";
import { Kafka, logLevel } from "kafkajs";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { getLogger } from "@swifttrack/logger";

dotenv.config();
const logger = getLogger("notification-service");
const PORT = process.env.PORT || 3002;

const httpServer = createServer();
const io = new SocketIOServer(httpServer, {
  cors: { origin: "*" },
});

let connectedClients = 0;

io.on("connection", (socket) => {
  connectedClients++;
  logger.info(`New client connected`, {
    socketId: socket.id,
    totalClients: connectedClients,
    clientIP: socket.handshake.address,
  });

  socket.on("disconnect", () => {
    connectedClients--;
    logger.info(`Client disconnected`, {
      socketId: socket.id,
      totalClients: connectedClients,
    });
  });
});

const kafka = new Kafka({
  clientId: "notification-service",
  brokers: process.env.KAFKA_BROKERS.split(","),
  logLevel: logLevel.NOTHING,
});
const consumer = kafka.consumer({ groupId: "notif-group" });

(async () => {
  try {
    logger.info("Starting Notification Service initialization", {
      kafkaBrokers: process.env.KAFKA_BROKERS,
      topic: process.env.ORDER_EVENTS_TOPIC,
    });

    await consumer.connect();
    logger.info("Connected to Kafka successfully");

    await consumer.subscribe({
      topic: process.env.ORDER_EVENTS_TOPIC,
      fromBeginning: true,
    });
    logger.info(`Subscribed to topic: ${process.env.ORDER_EVENTS_TOPIC}`);

    await consumer.run({
      eachMessage: async ({ topic, partition, message, heartbeat }) => {
        try {
          const event = JSON.parse(message.value.toString());

          logger.info(`Received order event`, {
            eventType: event.eventType,
            orderId: event.orderId,
            topic,
            partition,
            offset: message.offset,
            timestamp: event.timestamp,
          });

          // Broadcast to all connected WebSocket clients
          io.emit("orderUpdate", event);

          logger.debug(
            `Broadcasted event to ${connectedClients} connected clients`,
            {
              eventType: event.eventType,
              orderId: event.orderId,
              clientCount: connectedClients,
            }
          );

          // Call heartbeat to ensure the consumer stays alive
          await heartbeat();
        } catch (parseError) {
          logger.error("Failed to parse Kafka message", {
            error: parseError.message,
            rawMessage: message.value.toString(),
            topic,
            partition,
            offset: message.offset,
          });
        }
      },
    });

    httpServer.listen(PORT, () => {
      logger.info(`Notification Service started successfully`, {
        port: PORT,
        webSocketEndpoint: `ws://localhost:${PORT}`,
        httpEndpoint: `http://localhost:${PORT}`,
      });
    });
  } catch (error) {
    logger.error("Failed to start Notification Service", {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
})();
