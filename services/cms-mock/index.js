import express from "express";
import { getLogger } from "@swifttrack/logger";

const logger = getLogger("cms-mock");
const app = express();
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`Incoming ${req.method} request to ${req.path}`, {
    method: req.method,
    path: req.path,
    userAgent: req.get("User-Agent"),
    ip: req.ip,
  });
  next();
});

app.post("/verify", async (req, res) => {
  const startTime = Date.now();
  const { orderId, clientId, items } = req.body;

  logger.info(`Processing contract verification request`, {
    orderId,
    clientId,
    itemCount: items?.length || 0,
  });

  // Simulate processing delay
  const processingDelay = 300;
  await new Promise((r) => setTimeout(r, processingDelay));

  // Simulate contract verification logic
  const contractId = "C-" + orderId;

  // Mock validation - in real world this would check actual contracts
  const isValidClient = clientId && clientId.length > 0;
  const hasItems = items && items.length > 0;

  if (!isValidClient) {
    logger.warn(`Contract verification failed: invalid client`, {
      orderId,
      clientId,
      reason: "Invalid or missing client ID",
    });
    return res.status(400).json({
      ok: false,
      message: "CMS: Invalid client ID",
      error: "Client verification failed",
    });
  }

  if (!hasItems) {
    logger.warn(`Contract verification failed: no items`, {
      orderId,
      clientId,
      reason: "No items in order",
    });
    return res.status(400).json({
      ok: false,
      message: "CMS: No items to verify",
      error: "Order must contain at least one item",
    });
  }

  const duration = Date.now() - startTime;
  const response = {
    ok: true,
    message: "CMS: Contract verified",
    contractId,
    verificationDetails: {
      clientStatus: "ACTIVE",
      contractType: "STANDARD",
      creditLimit: 10000,
      itemsVerified: items.length,
    },
  };

  logger.info(`Contract verification successful`, {
    orderId,
    clientId,
    contractId,
    duration,
    itemsProcessed: items.length,
  });

  res.json(response);
});

app.get("/health", (req, res) => {
  logger.debug("Health check endpoint called");
  res.json({
    status: "ok",
    service: "cms-mock",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.listen(5001, () => {
  logger.info("CMS Mock Service started", {
    port: 5001,
    endpoints: ["/verify", "/health"],
    environment: process.env.NODE_ENV || "development",
  });
});
