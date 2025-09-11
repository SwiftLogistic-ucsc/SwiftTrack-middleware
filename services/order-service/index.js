import express from "express";
import dotenv from "dotenv";
import {
  startProducer,
  ensureTopic,
  emitEvent,
  startConsumer,
} from "./kafka.js";
import { CMSAdapter } from "./adapters/cmsAdapter.js";
import { WMSAdapter } from "./adapters/wmsAdapter.js";
import { ROSAdapter } from "./adapters/rosAdapter.js";
import { getLogger } from "@swifttrack/logger";
import { DatabaseClient, OrderRepository } from "@swifttrack/database";

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
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://user:password@localhost:5432/orderdb";

// Initialize database connection
const dbClient = new DatabaseClient(DATABASE_URL);
const orderRepo = new OrderRepository(dbClient);

// Test database connection
dbClient.testConnection().then((result) => {
  if (result.connected) {
    logger.info("Database connected successfully", {
      timestamp: result.timestamp,
    });
  } else {
    logger.error("Database connection failed", { error: result.error });
  }
});

// Initialize protocol adapters for heterogeneous systems integration
const cmsAdapter = new CMSAdapter(CMS_URL);
const wmsAdapter = new WMSAdapter(WMS_URL);
const rosAdapter = new ROSAdapter(ROS_URL);

// Circuit breaker state for service availability
const serviceHealth = {
  cms: { available: true, lastFailure: null, consecutiveFailures: 0 },
  wms: { available: true, lastFailure: null, consecutiveFailures: 0 },
  ros: { available: true, lastFailure: null, consecutiveFailures: 0 },
};

const CIRCUIT_BREAKER_THRESHOLD = 3; // Failures before circuit opens
const CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds before retry
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAY_MS = 2000;

logger.info("SwiftTrack Middleware - Protocol adapters initialized", {
  cmsAdapter: "SOAP/XML Legacy System",
  wmsAdapter: "TCP/IP Proprietary System",
  rosAdapter: "REST/JSON Cloud API",
  integrationChallenge: "Heterogeneous Systems Bridge",
});

function now() {
  return new Date().toISOString();
}

// Circuit breaker functions
function isServiceAvailable(service) {
  const health = serviceHealth[service];
  if (!health.available) {
    // Check if circuit breaker should reset
    if (Date.now() - health.lastFailure > CIRCUIT_BREAKER_TIMEOUT) {
      health.available = true;
      health.consecutiveFailures = 0;
      logger.info(`Circuit breaker reset for ${service} service`);
    }
  }
  return health.available;
}

function recordServiceFailure(service) {
  const health = serviceHealth[service];
  health.consecutiveFailures++;
  health.lastFailure = Date.now();

  if (health.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    health.available = false;
    logger.warn(`Circuit breaker opened for ${service} service`, {
      consecutiveFailures: health.consecutiveFailures,
      willRetryAfter: CIRCUIT_BREAKER_TIMEOUT,
    });
  }
}

function recordServiceSuccess(service) {
  const health = serviceHealth[service];
  if (!health.available || health.consecutiveFailures > 0) {
    logger.info(`Service ${service} recovered`, {
      previousFailures: health.consecutiveFailures,
    });
  }
  health.available = true;
  health.consecutiveFailures = 0;
  health.lastFailure = null;
}

// Asynchronous service call with retry and circuit breaker
async function callServiceWithRetry(
  serviceName,
  serviceCall,
  orderId,
  retryCount = 0
) {
  try {
    if (!isServiceAvailable(serviceName)) {
      throw new Error(`${serviceName} service circuit breaker is open`);
    }

    const result = await serviceCall();
    recordServiceSuccess(serviceName);
    return result;
  } catch (error) {
    recordServiceFailure(serviceName);

    // Extract enhanced error details if available
    const errorDetails = {
      orderId,
      serviceName,
      retryCount,
      maxRetries: MAX_RETRY_ATTEMPTS,
      errorType: error.errorType || "UNKNOWN",
      serviceError: error.serviceError || null,
      suggestedAction: error.suggestedAction || "Contact system administrator",
      originalMessage: error.message,
      timestamp: new Date().toISOString(),
    };

    logger.warn(`Service call failed for ${serviceName}`, errorDetails);

    if (retryCount < MAX_RETRY_ATTEMPTS) {
      // Enhanced retry event with detailed error info
      await emitEvent(TOPIC, {
        eventType: `${serviceName.toUpperCase()}_RETRY_SCHEDULED`,
        orderId,
        timestamp: now(),
        data: {
          serviceName,
          retryCount: retryCount + 1,
          nextRetryAt: new Date(
            Date.now() + RETRY_DELAY_MS * Math.pow(2, retryCount)
          ).toISOString(),
          error: error.message,
          errorType: error.errorType,
          errorDetails: error.serviceError?.errorDetails || {},
          suggestedAction: error.suggestedAction,
          retryReason: "Automatic retry due to service failure",
        },
      });

      // Wait and retry
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, retryCount))
      );
      return await callServiceWithRetry(
        serviceName,
        serviceCall,
        orderId,
        retryCount + 1
      );
    } else {
      // Max retries exceeded - create enhanced error for saga compensation
      const enhancedErrorMessage = createEnhancedErrorMessage(
        serviceName,
        error,
        retryCount
      );
      const finalError = new Error(enhancedErrorMessage);

      // Preserve error details for compensation and user display
      finalError.serviceError = error.serviceError;
      finalError.errorType = error.errorType;
      finalError.suggestedAction = error.suggestedAction;
      finalError.serviceName = serviceName;
      finalError.orderId = orderId;
      finalError.retryAttempts = retryCount + 1;

      throw finalError;
    }
  }
}

// Create user-friendly error message from technical error
function createUserFriendlyErrorMessage(error) {
  if (!error) return "An unexpected error occurred. Please try again.";

  // If we have an enhanced error message from createEnhancedErrorMessage, use it
  if (error.enhancedErrorMessage) {
    return error.enhancedErrorMessage;
  }

  // If we have error type and suggested action, format them nicely
  if (error.errorType && error.suggestedAction) {
    const serviceError = error.serviceError?.errorDetails || {};
    const details =
      Object.keys(serviceError).length > 0
        ? ` (${Object.entries(serviceError)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ")})`
        : "";

    return `${error.errorType
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase())}${details}. ${
      error.suggestedAction
    }`;
  }

  // Fallback to basic error message
  return error.message || "An unexpected error occurred. Please try again.";
}

// Create user-friendly error messages
function createEnhancedErrorMessage(serviceName, error, retryCount) {
  const attempts = retryCount + 1;

  if (error.serviceError && error.serviceError.errorType !== "UNKNOWN") {
    const serviceDetails = error.serviceError.errorDetails;

    switch (error.serviceError.errorType) {
      case "INVENTORY_SHORTAGE":
        return `WMS Inventory Error: Insufficient inventory for ${
          serviceDetails.affectedSKUs?.join(", ") || "requested items"
        }. ${
          serviceDetails.estimatedRestockTime !== "Unknown"
            ? `Expected restock: ${serviceDetails.estimatedRestockTime}`
            : "Contact warehouse for availability."
        }`;

      case "INVALID_SKU":
        return `WMS Catalog Error: SKU(s) not found: ${
          serviceDetails.invalidSKUs?.join(", ") || "unknown"
        }. Please verify product codes in system catalog.`;

      case "CAPACITY_EXCEEDED":
        return `WMS Capacity Error: Warehouse capacity exceeded. Available space: ${
          serviceDetails.availableSpace || "limited"
        }. Consider splitting shipment or scheduling later.`;

      case "CONTRACT_NOT_FOUND":
        return `CMS Contract Error: No active contract found for client ${
          serviceDetails.clientId || "unknown"
        }. Client must have valid service contract to proceed.`;

      case "CREDIT_LIMIT_EXCEEDED":
        return `CMS Credit Error: Client credit limit exceeded. Current outstanding: ${
          serviceDetails.outstandingAmount || "unknown"
        }, Credit limit: ${
          serviceDetails.creditLimit || "unknown"
        }. Payment required to proceed.`;

      case "CLIENT_SUSPENDED":
        return `CMS Account Error: Client account suspended due to ${
          serviceDetails.suspensionReason || "payment issues"
        }. Contact accounts department for reactivation.`;

      case "NO_DRIVERS_AVAILABLE":
        return `ROS Scheduling Error: No drivers available in ${
          serviceDetails.requestedRegion || "requested area"
        }. Next available slot: ${
          serviceDetails.nextAvailableSlot || "unknown"
        }. Consider priority scheduling.`;

      case "ROUTE_OPTIMIZATION_FAILED":
        return `ROS Route Error: Cannot optimize route for delivery addresses. Problematic addresses: ${
          serviceDetails.problematicAddresses?.join(", ") ||
          "multiple locations"
        }. Verify addresses or split delivery.`;

      case "VEHICLE_CAPACITY_EXCEEDED":
        return `ROS Capacity Error: Order exceeds vehicle capacity. Packages: ${
          serviceDetails.packageCount
        }, Suggested vehicle: ${
          serviceDetails.suggestedVehicleType || "larger truck"
        }. Consider splitting shipment.`;

      case "RESTRICTED_DELIVERY_ZONE":
        return `ROS Delivery Error: Delivery to restricted zone. Addresses: ${
          serviceDetails.restrictedAddresses?.join(", ") || "undisclosed"
        }. Use alternative address or special delivery service.`;

      default:
        return `${serviceName} Service Error: ${
          error.serviceError.errorDetails.reason || error.message
        } (${attempts} attempts)`;
    }
  }

  // Fallback for generic errors
  return `${serviceName} service failed after ${attempts} attempts: ${error.message}`;
}

// Saga pattern implementation for distributed transactions
class OrderProcessingSaga {
  constructor(orderId) {
    this.orderId = orderId;
    this.completedSteps = [];
    this.compensationActions = [];
  }

  async executeStep(stepName, serviceCall, compensationAction) {
    try {
      logger.info(`Executing saga step: ${stepName}`, {
        orderId: this.orderId,
      });

      const result = await serviceCall();
      this.completedSteps.push(stepName);

      if (compensationAction) {
        this.compensationActions.push({
          stepName,
          action: compensationAction,
          timestamp: now(),
        });
      }

      logger.info(`Saga step completed: ${stepName}`, {
        orderId: this.orderId,
        completedSteps: this.completedSteps.length,
      });

      return result;
    } catch (error) {
      logger.error(`Saga step failed: ${stepName}`, {
        orderId: this.orderId,
        error: error.message,
        completedSteps: this.completedSteps,
      });

      // Trigger compensation
      await this.compensate();
      throw error;
    }
  }

  async compensate() {
    logger.warn(`Starting saga compensation for order ${this.orderId}`, {
      stepsToCompensate: this.compensationActions.length,
    });

    // Execute compensation actions in reverse order
    for (let i = this.compensationActions.length - 1; i >= 0; i--) {
      const compensation = this.compensationActions[i];
      try {
        await compensation.action();
        logger.info(
          `Compensation executed for step: ${compensation.stepName}`,
          {
            orderId: this.orderId,
          }
        );
      } catch (compensationError) {
        logger.error(`Compensation failed for step: ${compensation.stepName}`, {
          orderId: this.orderId,
          error: compensationError.message,
        });
      }
    }

    await emitEvent(TOPIC, {
      eventType: "ORDER_SAGA_COMPENSATED",
      orderId: this.orderId,
      timestamp: now(),
      data: {
        compensatedSteps: this.compensationActions.map((c) => c.stepName),
        reason: "Service failure during processing",
      },
    });
  }
}

// Compensation actions for each service
const compensationActions = {
  cms: async (orderId) => {
    logger.info(`Compensating CMS verification for order ${orderId}`);
    // In real system: cancel contract, release credit hold
    await orderRepo.updateOrderStatus(orderId, "CMS_COMPENSATION_EXECUTED");
  },

  wms: async (orderId) => {
    logger.info(`Compensating WMS registration for order ${orderId}`);
    // In real system: cancel package registration, release warehouse space
    await orderRepo.updateOrderStatus(orderId, "WMS_COMPENSATION_EXECUTED");
  },

  ros: async (orderId) => {
    logger.info(`Compensating ROS optimization for order ${orderId}`);
    // In real system: cancel route, release driver/vehicle assignment
    await orderRepo.updateOrderStatus(orderId, "ROS_COMPENSATION_EXECUTED");
  },
};

app.post("/api/orders", async (req, res) => {
  const order = req.body;
  const submissionTime = Date.now();

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
      `Accepting order for asynchronous distributed processing: ${order.id}`,
      {
        clientId: order.clientId,
        packageCount: order.packages.length,
        deliveryCount: order.deliveryAddresses.length,
        priority: order.priority,
        processingMode: "ASYNCHRONOUS",
        distributedTransaction: true,
        sagaPattern: true,
      }
    );

    // Save order to database with PROCESSING status
    const savedOrder = await orderRepo.createOrder(order);
    logger.info(`Order ${order.id} accepted and queued for processing`, {
      orderId: savedOrder.id,
      status: savedOrder.status,
      queuedAt: new Date().toISOString(),
    });

    // Emit order acceptance event
    await emitEvent(TOPIC, {
      eventType: "ORDER_ACCEPTED",
      orderId: order.id,
      timestamp: now(),
      data: {
        order,
        status: "PROCESSING",
        stage: "QUEUED_FOR_PROCESSING",
        distributedTransaction: true,
        processingMode: "ASYNCHRONOUS",
        estimatedProcessingTime: "2-5 minutes",
      },
    });

    // Trigger asynchronous distributed transaction processing
    await emitEvent(TOPIC, {
      eventType: "DISTRIBUTED_TRANSACTION_START",
      orderId: order.id,
      timestamp: now(),
      data: {
        order,
        processingSteps: [
          "CMS_VERIFICATION",
          "WMS_REGISTRATION",
          "ROS_OPTIMIZATION",
        ],
        sagaPattern: true,
        faultTolerance: true,
        submittedAt: submissionTime,
      },
    });

    // Return immediate response - order is now processing asynchronously
    const responseTime = Date.now() - submissionTime;
    logger.info(`Order ${order.id} accepted for asynchronous processing`, {
      responseTime,
      status: "PROCESSING",
      nextSteps: "Distributed transaction saga initiated",
    });

    res.status(202).json({
      // 202 Accepted for asynchronous processing
      status: "accepted",
      orderId: order.id,
      message: "Order accepted and is being processed asynchronously",
      processing: {
        status: "PROCESSING",
        mode: "ASYNCHRONOUS",
        distributedTransaction: {
          sagaInitiated: true,
          faultTolerance: "enabled",
          consistencyModel: "eventual",
        },
        estimatedCompletion: "2-5 minutes",
        statusEndpoint: `/api/orders/${order.id}/status`,
        webhookSupport: "available",
      },
      tracking: {
        orderId: order.id,
        submittedAt: new Date(submissionTime).toISOString(),
        currentStage: "QUEUED",
        nextStage: "CMS_VERIFICATION",
      },
    });
  } catch (err) {
    const responseTime = Date.now() - submissionTime;
    logger.error(`Order acceptance failed for order ${order.id}`, {
      error: err.message,
      responseTime,
      stack: err.stack,
      clientId: order.clientId,
    });

    res.status(500).json({
      error: "Order acceptance failed",
      orderId: order.id,
      message: err.message,
      status: "FAILED_TO_ACCEPT",
    });
  }
});

// Background distributed transaction processor
async function processDistributedTransaction(order) {
  const startTime = Date.now();

  logger.info(
    `Starting background distributed transaction processing for order ${order.id}`,
    {
      orderId: order.id,
      clientId: order.clientId,
      processingMode: "BACKGROUND_ASYNC",
      distributedTransaction: true,
      sagaPattern: true,
    }
  );

  try {
    // Initialize saga for distributed transaction management
    const saga = new OrderProcessingSaga(order.id);

    // Step 1: CMS Contract Verification with fault tolerance
    await emitEvent(TOPIC, {
      eventType: "CMS_VERIFICATION_STARTED",
      orderId: order.id,
      timestamp: now(),
      data: { stage: "CMS_PROCESSING", step: 1, totalSteps: 3 },
    });

    const cmsResult = await saga.executeStep(
      "CMS_VERIFICATION",
      async () => {
        return await callServiceWithRetry(
          "cms",
          () => cmsAdapter.verifyContract(order),
          order.id
        );
      },
      () => compensationActions.cms(order.id)
    );

    // Update order in database with CMS data
    await orderRepo.updateOrderStatus(order.id, "CMS_VERIFIED", {
      cms: {
        contractId: cmsResult.contractId,
        billingStatus: cmsResult.billingStatus,
        estimatedCost: cmsResult.estimatedCost || 0,
      },
    });

    await emitEvent(TOPIC, {
      eventType: "CMS_VERIFIED",
      orderId: order.id,
      timestamp: now(),
      data: {
        ...cmsResult,
        status: "CONTRACT_VERIFIED",
        stage: "CMS_PROCESSING",
        sagaStep: "COMPLETED",
        progress: { completed: 1, total: 3 },
      },
    });

    // Step 2: WMS Package Registration with fault tolerance
    await emitEvent(TOPIC, {
      eventType: "WMS_REGISTRATION_STARTED",
      orderId: order.id,
      timestamp: now(),
      data: { stage: "WMS_PROCESSING", step: 2, totalSteps: 3 },
    });

    const wmsResult = await saga.executeStep(
      "WMS_REGISTRATION",
      async () => {
        return await callServiceWithRetry(
          "wms",
          () => wmsAdapter.registerPackage(order),
          order.id
        );
      },
      () => compensationActions.wms(order.id)
    );

    // Update order in database with WMS data
    await orderRepo.updateOrderStatus(order.id, "WMS_REGISTERED", {
      wms: {
        packageId: wmsResult.packageId,
        warehouseLocation: wmsResult.warehouseLocation,
        estimatedReadyTime: wmsResult.estimatedReadyTime,
      },
    });

    await emitEvent(TOPIC, {
      eventType: "WMS_REGISTERED",
      orderId: order.id,
      timestamp: now(),
      data: {
        ...wmsResult,
        status: "PACKAGES_REGISTERED",
        stage: "WMS_PROCESSING",
        sagaStep: "COMPLETED",
        progress: { completed: 2, total: 3 },
      },
    });

    // Step 3: ROS Route Optimization with fault tolerance
    await emitEvent(TOPIC, {
      eventType: "ROS_OPTIMIZATION_STARTED",
      orderId: order.id,
      timestamp: now(),
      data: { stage: "ROS_PROCESSING", step: 3, totalSteps: 3 },
    });

    const rosResult = await saga.executeStep(
      "ROS_OPTIMIZATION",
      async () => {
        return await callServiceWithRetry(
          "ros",
          () => rosAdapter.optimizeRoute(order),
          order.id
        );
      },
      () => compensationActions.ros(order.id)
    );

    // Update order in database with ROS data
    await orderRepo.updateOrderStatus(order.id, "ROS_OPTIMIZED", {
      ros: {
        routeId: rosResult.routeId,
        assignedDriver: rosResult.assignedDriver,
        assignedVehicle: rosResult.assignedVehicle,
        optimizedStops: rosResult.optimizedStops,
        estimatedDelivery: rosResult.estimatedDelivery,
        etaMinutes: rosResult.etaMinutes,
      },
    });

    await emitEvent(TOPIC, {
      eventType: "ROS_OPTIMIZED",
      orderId: order.id,
      timestamp: now(),
      data: {
        ...rosResult,
        status: "ROUTE_OPTIMIZED",
        stage: "ROS_PROCESSING",
        sagaStep: "COMPLETED",
        progress: { completed: 3, total: 3 },
      },
    });

    // Final completion event and database update
    await orderRepo.updateOrderStatus(order.id, "READY_FOR_DELIVERY");

    await emitEvent(TOPIC, {
      eventType: "ORDER_READY_FOR_DELIVERY",
      orderId: order.id,
      timestamp: now(),
      data: {
        ok: true,
        status: "READY_FOR_DELIVERY",
        stage: "PROCESSING_COMPLETE",
        sagaCompleted: true,
        completedSteps: saga.completedSteps,
        progress: { completed: 3, total: 3 },
        manifest: {
          contractId: cmsResult.contractId,
          packageId: wmsResult.packageId,
          routeId: rosResult.routeId,
          assignedDriver: rosResult.assignedDriver,
          estimatedDelivery: rosResult.estimatedDelivery,
        },
      },
    });

    const totalDuration = Date.now() - startTime;
    logger.info(
      `Background distributed transaction completed successfully for order ${order.id}`,
      {
        totalDuration,
        sagaSteps: saga.completedSteps,
        serviceHealth: Object.keys(serviceHealth).map((service) => ({
          service,
          available: serviceHealth[service].available,
          failures: serviceHealth[service].consecutiveFailures,
        })),
        faultTolerance: "ENABLED",
        consistencyModel: "EVENTUAL_CONSISTENCY",
        processingMode: "BACKGROUND_ASYNC",
      }
    );
  } catch (err) {
    const totalDuration = Date.now() - startTime;

    // Extract detailed error information for better user experience
    const errorInfo = {
      orderId: order.id,
      error: err.message,
      duration: totalDuration,
      stack: err.stack,
      clientId: order.clientId,
      failureStage: err.serviceName || "UNKNOWN",
      processingMode: "BACKGROUND_ASYNC",
      serviceHealth: Object.keys(serviceHealth).map((service) => ({
        service,
        available: serviceHealth[service].available,
        failures: serviceHealth[service].consecutiveFailures,
      })),
      enhancedErrorDetails: {
        errorType: err.errorType || "UNKNOWN",
        suggestedAction: err.suggestedAction || "Contact system administrator",
        serviceError: err.serviceError || null,
        retryAttempts: err.retryAttempts || 0,
      },
    };

    logger.error(
      `Background distributed transaction failed for order ${order.id}`,
      errorInfo
    );

    // Update order status to failed with detailed error info
    await orderRepo.updateOrderStatus(order.id, "FAILED", {
      error: err.message,
      errorType: err.errorType,
      failedAt: new Date().toISOString(),
      canRetry: true,
      suggestedAction: err.suggestedAction,
      serviceErrorDetails: err.serviceError,
      retryAttempts: err.retryAttempts,
    });

    // Emit detailed failure event for real-time tracking
    await emitEvent(TOPIC, {
      eventType: "ORDER_FAILED",
      orderId: order.id,
      timestamp: now(),
      data: {
        error: err.message,
        status: "FAILED",
        stage: "ERROR_HANDLING",
        sagaCompensated: true,
        requiresManualIntervention: false,
        canRetryLater: true,
        processingMode: "BACKGROUND_ASYNC",
        errorDetails: {
          errorType: err.errorType || "UNKNOWN",
          suggestedAction:
            err.suggestedAction || "Contact system administrator",
          failedService: err.serviceName || "UNKNOWN",
          retryAttempts: err.retryAttempts || 0,
          serviceSpecificDetails: err.serviceError?.errorDetails || {},
          userFriendlyMessage: createUserFriendlyErrorMessage(err),
        },
      },
    });
  }
}

// Get order details by ID
app.get("/api/orders/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;

    logger.info(`Retrieving order details for ${orderId}`);

    const order = await orderRepo.getOrderById(orderId);

    if (!order) {
      logger.warn(`Order not found: ${orderId}`);
      return res.status(404).json({
        error: "Order not found",
        orderId,
      });
    }

    logger.info(`Order details retrieved for ${orderId}`, {
      status: order.status,
      clientId: order.client_id,
      packageCount: order.packages.length,
      deliveryCount: order.deliveryAddresses.length,
    });

    res.json({
      ok: true,
      order: {
        id: order.id,
        clientId: order.client_id,
        clientName: order.client_name,
        status: order.status,
        priority: order.priority,
        packages: order.packages,
        deliveryAddresses: order.deliveryAddresses.map((addr) => addr.address),

        // Processing details
        contractId: order.contract_id,
        billingStatus: order.billing_status,
        estimatedCost: order.estimated_cost,
        warehousePackageId: order.warehouse_package_id,
        warehouseLocation: order.warehouse_location,
        routeId: order.route_id,
        assignedDriver: order.assigned_driver_id,
        assignedVehicle: order.assigned_vehicle_id,
        estimatedDelivery: order.estimated_delivery_time,

        // Timestamps
        submittedAt: order.submitted_at,
        cmsVerifiedAt: order.cms_verified_at,
        wmsRegisteredAt: order.wms_registered_at,
        rosOptimizedAt: order.ros_optimized_at,
        readyForDeliveryAt: order.ready_for_delivery_at,
      },
    });
  } catch (err) {
    logger.error(`Failed to retrieve order ${req.params.orderId}`, {
      error: err.message,
      stack: err.stack,
    });

    res.status(500).json({
      error: "Failed to retrieve order",
      message: err.message,
    });
  }
});

// Get order status by ID
app.get("/api/orders/:orderId/status", async (req, res) => {
  try {
    const { orderId } = req.params;

    logger.info(`Retrieving order status for ${orderId}`);

    const order = await orderRepo.getOrderById(orderId);

    if (!order) {
      logger.warn(`Order not found: ${orderId}`);
      return res.status(404).json({
        error: "Order not found",
        orderId,
      });
    }

    // Get order events to show processing steps
    const events = await orderRepo.getOrderEvents(orderId);

    // Calculate processing progress
    const totalSteps = 3; // CMS, WMS, ROS
    let completedSteps = 0;
    let currentStage = "QUEUED";
    let estimatedCompletion = "2-5 minutes";

    if (order.cms_verified_at) completedSteps++;
    if (order.wms_registered_at) completedSteps++;
    if (order.ros_optimized_at) completedSteps++;

    // Determine current processing stage
    if (order.ready_for_delivery_at) {
      currentStage = "READY_FOR_DELIVERY";
      estimatedCompletion = "COMPLETED";
    } else if (order.ros_optimized_at) {
      currentStage = "FINALIZING";
      estimatedCompletion = "< 1 minute";
    } else if (order.wms_registered_at) {
      currentStage = "ROS_PROCESSING";
      estimatedCompletion = "1-2 minutes";
    } else if (order.cms_verified_at) {
      currentStage = "WMS_PROCESSING";
      estimatedCompletion = "1-3 minutes";
    } else if (order.status === "PROCESSING") {
      currentStage = "CMS_PROCESSING";
      estimatedCompletion = "2-4 minutes";
    }

    const progressPercentage = Math.round((completedSteps / totalSteps) * 100);

    logger.info(`Order status retrieved for ${orderId}`, {
      status: order.status,
      currentStage,
      progress: `${completedSteps}/${totalSteps}`,
      eventsCount: events.length,
    });

    res.json({
      ok: true,
      orderId: order.id,
      status: order.status,
      priority: order.priority,

      // Asynchronous processing information
      processing: {
        mode: "ASYNCHRONOUS",
        currentStage,
        progress: {
          completed: completedSteps,
          total: totalSteps,
          percentage: progressPercentage,
        },
        estimatedCompletion,
        distributedTransaction: {
          sagaPattern: true,
          faultTolerance: "enabled",
          eventualConsistency: true,
        },
      },

      // Detailed step tracking
      steps: [
        {
          step: "CMS_VERIFICATION",
          name: "Contract Verification",
          status: order.cms_verified_at
            ? "COMPLETED"
            : currentStage === "CMS_PROCESSING"
            ? "IN_PROGRESS"
            : "PENDING",
          timestamp: order.cms_verified_at,
          estimatedDuration: "30-90 seconds",
        },
        {
          step: "WMS_REGISTRATION",
          name: "Package Registration",
          status: order.wms_registered_at
            ? "COMPLETED"
            : currentStage === "WMS_PROCESSING"
            ? "IN_PROGRESS"
            : "PENDING",
          timestamp: order.wms_registered_at,
          estimatedDuration: "45-120 seconds",
        },
        {
          step: "ROS_OPTIMIZATION",
          name: "Route Optimization",
          status: order.ros_optimized_at
            ? "COMPLETED"
            : currentStage === "ROS_PROCESSING"
            ? "IN_PROGRESS"
            : "PENDING",
          timestamp: order.ros_optimized_at,
          estimatedDuration: "60-180 seconds",
        },
      ],

      // Service-specific results (if available)
      results: {
        cms: order.cms_verified_at
          ? {
              contractId: order.contract_id,
              billingStatus: order.billing_status,
              estimatedCost: order.estimated_cost,
              verifiedAt: order.cms_verified_at,
            }
          : null,

        wms: order.wms_registered_at
          ? {
              packageId: order.warehouse_package_id,
              warehouseLocation: order.warehouse_location,
              registeredAt: order.wms_registered_at,
            }
          : null,

        ros: order.ros_optimized_at
          ? {
              routeId: order.route_id,
              assignedDriver: order.assigned_driver_id,
              assignedVehicle: order.assigned_vehicle_id,
              estimatedDelivery: order.estimated_delivery_time,
              optimizedAt: order.ros_optimized_at,
            }
          : null,
      },

      // Real-time tracking
      tracking: {
        submittedAt: order.submitted_at,
        lastUpdated: order.updated_at,
        processingEvents: events.length,
        realTimeUpdates: "available",
        webhookSupport: "enabled",
      },

      // Actions available to client
      actions: {
        cancel: order.status === "PROCESSING" ? "available" : "not_available",
        modify: "not_available_during_processing",
        track: "real_time_available",
        estimate: "dynamic_updates",
      },
    });
  } catch (err) {
    logger.error(`Failed to retrieve order status ${req.params.orderId}`, {
      error: err.message,
      stack: err.stack,
    });

    res.status(500).json({
      error: "Failed to retrieve order status",
      message: err.message,
    });
  }
});

// Get all orders
app.get("/api/orders", async (req, res) => {
  try {
    logger.info("Retrieving all orders");

    const orders = await orderRepo.getAllOrders();

    logger.info(`Retrieved ${orders.length} orders from database`);

    res.json({
      ok: true,
      orders: orders.map((order) => ({
        order_id: order.id,
        client_id: order.client_id,
        status: order.status,
        priority: order.priority,
        total_packages: order.total_packages,
        total_delivery_addresses: order.total_delivery_addresses,
        created_at: order.created_at,
        updated_at: order.updated_at,
        customer_name: order.customer_name || "Unknown", // Fallback for missing field
      })),
    });
  } catch (err) {
    logger.error("Failed to retrieve orders", {
      error: err.message,
      stack: err.stack,
    });

    res.status(500).json({
      error: "Failed to retrieve orders",
      message: err.message,
    });
  }
});

app.get("/health", (_, res) => {
  logger.debug("Health check endpoint called");
  res.json({
    status: "ok",
    distributedTransactions: "enabled",
    serviceHealth: Object.keys(serviceHealth).map((service) => ({
      service,
      available: serviceHealth[service].available,
      consecutiveFailures: serviceHealth[service].consecutiveFailures,
      lastFailure: serviceHealth[service].lastFailure,
    })),
    faultTolerance: {
      circuitBreakerThreshold: CIRCUIT_BREAKER_THRESHOLD,
      circuitBreakerTimeout: CIRCUIT_BREAKER_TIMEOUT,
      maxRetryAttempts: MAX_RETRY_ATTEMPTS,
      retryDelay: RETRY_DELAY_MS,
    },
  });
});

// Service health monitoring endpoint
app.get("/api/services/health", (_, res) => {
  logger.debug("Service health monitoring endpoint called");

  const healthSummary = {
    overall: Object.values(serviceHealth).every((s) => s.available)
      ? "healthy"
      : "degraded",
    services: Object.keys(serviceHealth).map((service) => {
      const health = serviceHealth[service];
      return {
        service: service.toUpperCase(),
        status: health.available ? "available" : "circuit_open",
        consecutiveFailures: health.consecutiveFailures,
        lastFailure: health.lastFailure,
        nextRetryAllowed: health.lastFailure
          ? new Date(health.lastFailure + CIRCUIT_BREAKER_TIMEOUT).toISOString()
          : null,
      };
    }),
    distributedTransactions: {
      enabled: true,
      sagaPattern: true,
      eventualConsistency: true,
      compensationActions: "configured",
    },
  };

  res.json(healthSummary);
});

// Manual service recovery endpoint for testing
app.post("/api/services/:service/recover", (req, res) => {
  const { service } = req.params;

  if (!serviceHealth[service]) {
    return res.status(404).json({ error: "Service not found" });
  }

  recordServiceSuccess(service);

  logger.info(`Manual service recovery triggered for ${service}`);

  res.json({
    message: `Service ${service} manually recovered`,
    service: service,
    newStatus: serviceHealth[service],
  });
});

app.listen(PORT, async () => {
  logger.info(`Order Service starting on port ${PORT}`, {
    port: PORT,
    kafkaTopic: TOPIC,
    cmsUrl: CMS_URL,
    wmsUrl: WMS_URL,
    rosUrl: ROS_URL,
    distributedTransactions: "ENABLED",
    faultTolerance: "ENABLED",
    consistencyModel: "EVENTUAL_CONSISTENCY",
  });

  try {
    await ensureTopic(TOPIC);
    logger.info(`Kafka topic '${TOPIC}' ensured`);

    await startProducer();
    logger.info("Kafka producer started successfully");

    // Start Kafka consumer for handling retry events and distributed transaction coordination
    await startConsumer(TOPIC, async (message) => {
      try {
        const event = JSON.parse(message.value.toString());

        // Handle distributed transaction start events
        if (event.eventType === "DISTRIBUTED_TRANSACTION_START") {
          logger.info(
            `Starting background distributed transaction processing`,
            {
              orderId: event.orderId,
              eventType: event.eventType,
            }
          );

          // Process distributed transaction in background (non-blocking)
          setImmediate(async () => {
            try {
              await processDistributedTransaction(event.data.order);
            } catch (error) {
              logger.error(`Background transaction processing failed`, {
                orderId: event.orderId,
                error: error.message,
              });
            }
          });
        }

        // Handle retry events
        if (event.eventType.includes("RETRY_SCHEDULED")) {
          logger.info(`Processing retry event`, {
            eventType: event.eventType,
            orderId: event.orderId,
            retryCount: event.data.retryCount,
          });

          // Retry logic would be implemented here
          // For now, just log the retry attempt
        }

        // Handle service recovery events
        if (event.eventType.includes("SERVICE_RECOVERED")) {
          const serviceName = event.data.serviceName;
          recordServiceSuccess(serviceName);
          logger.info(`Service recovery processed`, {
            service: serviceName,
            orderId: event.orderId,
          });
        }

        // Handle compensation events
        if (event.eventType.includes("COMPENSATION")) {
          logger.info(`Processing compensation event`, {
            eventType: event.eventType,
            orderId: event.orderId,
          });
        }

        // Handle progress tracking events
        if (
          event.eventType.includes("_STARTED") ||
          event.eventType.includes("_VERIFIED") ||
          event.eventType.includes("_REGISTERED") ||
          event.eventType.includes("_OPTIMIZED")
        ) {
          logger.info(`Order processing progress`, {
            eventType: event.eventType,
            orderId: event.orderId,
            stage: event.data.stage,
            progress: event.data.progress,
          });
        }
      } catch (error) {
        logger.error(`Error processing Kafka message`, {
          error: error.message,
          message: message.value.toString(),
        });
      }
    });
    logger.info(
      "Kafka consumer started for distributed transaction coordination"
    );

    logger.info(
      `Order Service is ready with distributed transaction support on ${PORT}`
    );
  } catch (error) {
    logger.error("Failed to initialize Order Service", {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
});
