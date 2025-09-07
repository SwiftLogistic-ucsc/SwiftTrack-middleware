import express from "express";
import dotenv from "dotenv";
import { startProducer, ensureTopic, emitEvent } from "./kafka.js";
import { CMSAdapter } from "./adapters/cmsAdapter.js";
import { WMSAdapter } from "./adapters/wmsAdapter.js";
import { ROSAdapter } from "./adapters/rosAdapter.js";
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

// Initialize protocol adapters for heterogeneous systems integration
const cmsAdapter = new CMSAdapter(CMS_URL);
const wmsAdapter = new WMSAdapter(WMS_URL);
const rosAdapter = new ROSAdapter(ROS_URL);

logger.info("SwiftTrack Middleware - Protocol adapters initialized", {
  cmsAdapter: "SOAP/XML Legacy System",
  wmsAdapter: "TCP/IP Proprietary System",
  rosAdapter: "REST/JSON Cloud API",
  integrationChallenge: "Heterogeneous Systems Bridge",
});

function now() {
  return new Date().toISOString();
}

app.post("/api/orders", async (req, res) => {
  const order = req.body;
  const startTime = Date.now();

  logger.info(`Processing new e-commerce order submission`, {
    orderId: order?.id,
    clientId: order?.clientId,
    itemCount: order?.packages?.length || 0,
    deliveryAddresses: order?.deliveryAddresses?.length || 0,
    priority: order?.priority || "STANDARD",
  });

  // Validate required fields for Swift Logistics order processing
  if (!order?.id) {
    logger.warn(`Order submission failed: missing order ID`, {
      body: req.body,
    });
    return res.status(400).json({ error: "order.id is required" });
  }

  if (!order?.clientId) {
    logger.warn(`Order submission failed: missing client ID`, {
      orderId: order.id,
    });
    return res
      .status(400)
      .json({ error: "clientId is required for Swift Logistics processing" });
  }

  if (!order?.packages || order.packages.length === 0) {
    logger.warn(`Order submission failed: no packages`, { orderId: order.id });
    return res.status(400).json({ error: "At least one package is required" });
  }

  if (!order?.deliveryAddresses || order.deliveryAddresses.length === 0) {
    logger.warn(`Order submission failed: no delivery addresses`, {
      orderId: order.id,
    });
    return res
      .status(400)
      .json({ error: "At least one delivery address is required" });
  }

  try {
    logger.info(
      `Starting Swift Logistics order processing workflow for order ${order.id}`,
      {
        clientId: order.clientId,
        packageCount: order.packages.length,
        deliveryCount: order.deliveryAddresses.length,
        priority: order.priority,
      }
    );

    // Emit initial order submission event for real-time tracking
    await emitEvent(TOPIC, {
      eventType: "ORDER_SUBMITTED",
      orderId: order.id,
      timestamp: now(),
      data: {
        order,
        status: "PROCESSING",
        stage: "INITIAL_SUBMISSION",
      },
    });
    logger.debug(`Emitted ORDER_SUBMITTED event for order ${order.id}`);

    // Step 1: CMS Contract Verification (Legacy SOAP/XML system simulation)
    logger.info(
      `Step 1: Starting CMS contract verification for client ${order.clientId}, order ${order.id}`
    );
    logger.info(
      "Heterogeneous Integration - Using SOAP/XML adapter for legacy CMS",
      {
        systemType: "LEGACY_ON_PREMISE",
        protocol: "SOAP/XML",
        challenge: "Protocol translation from REST/JSON to SOAP/XML",
      }
    );

    const cmsStartTime = Date.now();
    const cms = await cmsAdapter.verifyContract(order);
    const cmsDuration = Date.now() - cmsStartTime;

    if (!cms.ok) {
      logger.error(`CMS contract verification failed for order ${order.id}`, {
        response: cms,
        duration: cmsDuration,
        clientId: order.clientId,
      });
      throw new Error(
        `CMS verification failed: ${cms.error || "Contract validation error"}`
      );
    }

    logger.info(`CMS contract verification successful for order ${order.id}`, {
      contractId: cms.contractId,
      billingStatus: cms.billingStatus,
      creditLimit: cms.creditLimit,
      duration: cmsDuration,
    });

    await emitEvent(TOPIC, {
      eventType: "CMS_VERIFIED",
      orderId: order.id,
      timestamp: now(),
      data: {
        ...cms,
        status: "CONTRACT_VERIFIED",
        stage: "CMS_PROCESSING",
      },
    });
    logger.debug(`Emitted CMS_VERIFIED event for order ${order.id}`);

    // Step 2: WMS Package Registration (Proprietary TCP/IP messaging simulation)
    logger.info(
      `Step 2: Starting WMS package registration for order ${order.id}`
    );
    logger.info(
      "Heterogeneous Integration - Using TCP/IP adapter for proprietary WMS",
      {
        systemType: "PROPRIETARY_ON_PREMISE",
        protocol: "TCP/IP Binary Messaging",
        challenge:
          "Protocol translation from REST/JSON to TCP/IP binary format",
      }
    );

    const wmsStartTime = Date.now();
    const wms = await wmsAdapter.registerPackage(order);
    const wmsDuration = Date.now() - wmsStartTime;

    if (!wms.ok) {
      logger.error(`WMS package registration failed for order ${order.id}`, {
        response: wms,
        duration: wmsDuration,
        packages: order.packages.length,
      });
      throw new Error(
        `WMS registration failed: ${wms.error || "Package registration error"}`
      );
    }

    logger.info(`WMS package registration successful for order ${order.id}`, {
      packageId: wms.packageId,
      warehouseLocation: wms.warehouseLocation,
      estimatedReadyTime: wms.estimatedReadyTime,
      duration: wmsDuration,
    });

    await emitEvent(TOPIC, {
      eventType: "WMS_REGISTERED",
      orderId: order.id,
      timestamp: now(),
      data: {
        ...wms,
        status: "PACKAGES_REGISTERED",
        stage: "WMS_PROCESSING",
      },
    });
    logger.debug(`Emitted WMS_REGISTERED event for order ${order.id}`);

    // Step 3: ROS Route Optimization (Modern RESTful API simulation)
    logger.info(
      `Step 3: Starting ROS route optimization for order ${order.id}`
    );
    logger.info(
      "Heterogeneous Integration - Using REST/JSON adapter for cloud ROS",
      {
        systemType: "CLOUD_BASED_SAAS",
        protocol: "REST/JSON over HTTPS",
        challenge: "Cloud API integration with retry logic and error handling",
      }
    );

    const rosStartTime = Date.now();
    const ros = await rosAdapter.optimizeRoute(order);
    const rosDuration = Date.now() - rosStartTime;

    if (!ros.ok) {
      logger.error(`ROS route optimization failed for order ${order.id}`, {
        response: ros,
        duration: rosDuration,
        deliveryAddresses: order.deliveryAddresses.length,
      });
      throw new Error(
        `ROS optimization failed: ${ros.error || "Route optimization error"}`
      );
    }

    logger.info(`ROS route optimization successful for order ${order.id}`, {
      routeId: ros.routeId,
      etaMinutes: ros.etaMinutes,
      driverId: ros.assignedDriver,
      vehicleId: ros.assignedVehicle,
      optimizedStops: ros.optimizedStops,
      duration: rosDuration,
    });

    await emitEvent(TOPIC, {
      eventType: "ROS_OPTIMIZED",
      orderId: order.id,
      timestamp: now(),
      data: {
        ...ros,
        status: "ROUTE_OPTIMIZED",
        stage: "ROS_PROCESSING",
      },
    });
    logger.debug(`Emitted ROS_OPTIMIZED event for order ${order.id}`);

    // Final completion event
    await emitEvent(TOPIC, {
      eventType: "ORDER_READY_FOR_DELIVERY",
      orderId: order.id,
      timestamp: now(),
      data: {
        ok: true,
        status: "READY_FOR_DELIVERY",
        stage: "PROCESSING_COMPLETE",
        manifest: {
          contractId: cms.contractId,
          packageId: wms.packageId,
          routeId: ros.routeId,
          assignedDriver: ros.assignedDriver,
          estimatedDelivery: ros.estimatedDelivery,
        },
      },
    });

    const totalDuration = Date.now() - startTime;
    logger.info(
      `Swift Logistics order processing completed successfully for order ${order.id}`,
      {
        totalDuration,
        cmsDuration,
        wmsDuration,
        rosDuration,
        stages: [
          "CMS_VERIFIED",
          "WMS_REGISTERED",
          "ROS_OPTIMIZED",
          "READY_FOR_DELIVERY",
        ],
        assignedDriver: ros.assignedDriver,
        estimatedDelivery: ros.estimatedDelivery,
        protocolIntegration: {
          cmsProtocol: "SOAP/XML",
          wmsProtocol: "TCP/IP Binary",
          rosProtocol: "REST/JSON HTTPS",
          totalAdapterOverhead: `${cmsDuration + wmsDuration + rosDuration}ms`,
        },
      }
    );

    res.json({
      status: "success",
      orderId: order.id,
      message: "Order processed successfully and ready for delivery",
      manifest: {
        contractId: cms.contractId,
        packageId: wms.packageId,
        routeId: ros.routeId,
        assignedDriver: ros.assignedDriver,
        estimatedDelivery: ros.estimatedDelivery,
      },
    });
  } catch (err) {
    const totalDuration = Date.now() - startTime;
    logger.error(
      `Swift Logistics order processing failed for order ${order.id}`,
      {
        error: err.message,
        duration: totalDuration,
        stack: err.stack,
        clientId: order.clientId,
        failureStage: err.stage || "UNKNOWN",
      }
    );

    // Emit failure event for real-time tracking
    await emitEvent(TOPIC, {
      eventType: "ORDER_FAILED",
      orderId: order.id,
      timestamp: now(),
      data: {
        error: err.message,
        status: "FAILED",
        stage: "ERROR_HANDLING",
        requiresManualIntervention: true,
      },
    });

    res.status(500).json({
      error: err.message,
      orderId: order.id,
      status: "failed",
      message:
        "Order processing failed. Please contact Swift Logistics support.",
    });
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
