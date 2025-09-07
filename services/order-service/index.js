import express from "express";
import dotenv from "dotenv";
import { startProducer, ensureTopic, emitEvent } from "./kafka.js";
import { verifyContract } from "./services/cmsClient.js";
import { registerPackage } from "./services/wmsClient.js";
import { optimizeRoute } from "./services/rosClient.js";
import { getLogger } from "@swifttrack/logger";

dotenv.config();
const logger = getLogger("order-service");
const app = express();

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});

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

app.use(express.json());

const PORT = process.env.PORT || 4000;
const TOPIC = process.env.ORDER_EVENTS_TOPIC;
const CMS_URL = process.env.CMS_URL;
const WMS_URL = process.env.WMS_URL;
const ROS_URL = process.env.ROS_URL;

function now() {
  return new Date().toISOString();
}

app.post("/api/orders", async (req, res) => {
  const order = req.body;
  const startTime = Date.now();

  logger.info(`Processing new order request`, {
    orderId: order?.id,
    clientId: order?.clientId,
    itemCount: order?.items?.length || 0,
  });

  if (!order?.id) {
    logger.warn(`Order submission failed: missing order ID`, {
      body: req.body,
    });
    return res.status(400).json({ error: "order.id is required" });
  }

  try {
    logger.info(`Starting order processing workflow for order ${order.id}`);

    await emitEvent(TOPIC, {
      eventType: "ORDER_SUBMITTED",
      orderId: order.id,
      timestamp: now(),
      data: { order },
    });
    logger.debug(`Emitted ORDER_SUBMITTED event for order ${order.id}`);

    // Step 1: CMS verify
    logger.info(`Step 1: Starting CMS verification for order ${order.id}`);
    const cmsStartTime = Date.now();
    const cms = await verifyContract(order, CMS_URL);
    const cmsDuration = Date.now() - cmsStartTime;

    if (!cms.ok) {
      logger.error(`CMS verification failed for order ${order.id}`, {
        response: cms,
        duration: cmsDuration,
      });
      throw new Error("CMS verification failed");
    }

    logger.info(`CMS verification successful for order ${order.id}`, {
      contractId: cms.contractId,
      duration: cmsDuration,
    });

    await emitEvent(TOPIC, {
      eventType: "CMS_VERIFIED",
      orderId: order.id,
      timestamp: now(),
      data: cms,
    });
    logger.debug(`Emitted CMS_VERIFIED event for order ${order.id}`);

    // Step 2: WMS register
    logger.info(`Step 2: Starting WMS registration for order ${order.id}`);
    const wmsStartTime = Date.now();
    const wms = await registerPackage(order, WMS_URL);
    const wmsDuration = Date.now() - wmsStartTime;

    if (!wms.ok) {
      logger.error(`WMS registration failed for order ${order.id}`, {
        response: wms,
        duration: wmsDuration,
      });
      throw new Error("WMS registration failed");
    }

    logger.info(`WMS registration successful for order ${order.id}`, {
      packageId: wms.packageId,
      duration: wmsDuration,
    });

    await emitEvent(TOPIC, {
      eventType: "WMS_REGISTERED",
      orderId: order.id,
      timestamp: now(),
      data: wms,
    });
    logger.debug(`Emitted WMS_REGISTERED event for order ${order.id}`);

    // Step 3: ROS optimize route
    logger.info(
      `Step 3: Starting ROS route optimization for order ${order.id}`
    );
    const rosStartTime = Date.now();
    const ros = await optimizeRoute(order, ROS_URL);
    const rosDuration = Date.now() - rosStartTime;

    if (!ros.ok) {
      logger.error(`ROS optimization failed for order ${order.id}`, {
        response: ros,
        duration: rosDuration,
      });
      throw new Error("ROS optimization failed");
    }

    logger.info(`ROS optimization successful for order ${order.id}`, {
      routeId: ros.routeId,
      etaMinutes: ros.etaMinutes,
      duration: rosDuration,
    });

    await emitEvent(TOPIC, {
      eventType: "ROS_OPTIMIZED",
      orderId: order.id,
      timestamp: now(),
      data: ros,
    });
    logger.debug(`Emitted ROS_OPTIMIZED event for order ${order.id}`);

    await emitEvent(TOPIC, {
      eventType: "ORDER_COMPLETED",
      orderId: order.id,
      timestamp: now(),
      data: { ok: true },
    });

    const totalDuration = Date.now() - startTime;
    logger.info(
      `Order processing completed successfully for order ${order.id}`,
      {
        totalDuration,
        cmsDuration,
        wmsDuration,
        rosDuration,
        steps: ["CMS_VERIFIED", "WMS_REGISTERED", "ROS_OPTIMIZED"],
      }
    );

    res.json({ status: "ok", orderId: order.id });
  } catch (err) {
    const totalDuration = Date.now() - startTime;
    logger.error(`Order processing failed for order ${order.id}`, {
      error: err.message,
      duration: totalDuration,
      stack: err.stack,
    });

    await emitEvent(TOPIC, {
      eventType: "ORDER_FAILED",
      orderId: order.id,
      timestamp: now(),
      data: { error: err.message },
    });

    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (_, res) => {
  logger.debug("Health check endpoint called");
  res.json({ status: "ok" });
});

app.listen(PORT, async () => {
  logger.info(`Order Service starting on port ${PORT}`, {
    port: PORT,
    kafkaTopic: TOPIC,
    cmsUrl: CMS_URL,
    wmsUrl: WMS_URL,
    rosUrl: ROS_URL,
  });

  try {
    await ensureTopic(TOPIC);
    logger.info(`Kafka topic '${TOPIC}' ensured`);

    await startProducer();
    logger.info("Kafka producer started successfully");

    logger.info(`Order Service is ready and listening on ${PORT}`);
  } catch (error) {
    logger.error("Failed to initialize Order Service", {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
});
