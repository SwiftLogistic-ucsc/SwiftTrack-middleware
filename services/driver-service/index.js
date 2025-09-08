import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { getLogger } from "@swifttrack/logger";
import { KafkaClient } from "@swifttrack/kafka-client";

const logger = getLogger("driver-service");
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

const PORT = process.env.PORT || 4001;
const KAFKA_BROKER = process.env.KAFKA_BROKER || "localhost:9092";
const TOPIC = "swift-logistics-events";

// Initialize Kafka client for real-time updates
const kafkaClient = new KafkaClient(KAFKA_BROKER);

// Configure multer for file uploads (photos and signatures)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), "uploads", "proof-of-delivery");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "signature") {
      // Accept image files for signatures
      if (file.mimetype.startsWith("image/")) {
        cb(null, true);
      } else {
        cb(new Error("Signatures must be image files"), false);
      }
    } else if (file.fieldname === "photo") {
      // Accept image files for delivery photos
      if (file.mimetype.startsWith("image/")) {
        cb(null, true);
      } else {
        cb(new Error("Photos must be image files"), false);
      }
    } else {
      cb(new Error("Unexpected field"), false);
    }
  },
});

app.use(express.json());
app.use(express.static("public"));

// Enable CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "*");
  next();
});

// Mock driver and delivery data
const drivers = {
  "DRV-001": {
    id: "DRV-001",
    name: "Kasun Perera",
    licenseNumber: "B1234567",
    phoneNumber: "+94771234567",
    vehicleType: "VAN",
    vehiclePlate: "CAR-1234",
    status: "ACTIVE",
    currentLocation: {
      latitude: 6.9271,
      longitude: 79.8612,
      timestamp: new Date().toISOString(),
    },
    shiftStart: "08:00",
    shiftEnd: "18:00",
  },
  "DRV-002": {
    id: "DRV-002",
    name: "Priya Fernando",
    licenseNumber: "B2345678",
    phoneNumber: "+94771234568",
    vehicleType: "TRUCK",
    vehiclePlate: "CAR-5678",
    status: "ACTIVE",
    currentLocation: {
      latitude: 6.9319,
      longitude: 79.8478,
      timestamp: new Date().toISOString(),
    },
    shiftStart: "07:00",
    shiftEnd: "17:00",
  },
};

// Mock delivery manifests
const deliveryManifests = {
  "DRV-001": {
    driverId: "DRV-001",
    date: new Date().toISOString().split("T")[0],
    routeId: "SWFT-RTE-20250908-001",
    optimizedRoute: [
      {
        stopId: "STOP-001",
        packageId: "SWFT-PKG-ORD-2025-001",
        orderId: "ORD-2025-001",
        customerName: "John Silva",
        address: "No 45, Galle Road, Colombo 03, Sri Lanka",
        coordinates: { latitude: 6.927, longitude: 79.8612 },
        timeWindow: { earliest: "09:00", latest: "11:00" },
        packageDetails: {
          sku: "BOOK-001",
          description: "Academic Textbook",
          quantity: 1,
          priority: "STANDARD",
        },
        status: "PENDING",
        estimatedDeliveryTime: "10:15",
        specialInstructions: "Call before delivery",
      },
      {
        stopId: "STOP-002",
        packageId: "SWFT-PKG-ORD-2025-002",
        orderId: "ORD-2025-002",
        customerName: "Mary Fernando",
        address: "123 Kandy Road, Malabe, Sri Lanka",
        coordinates: { latitude: 6.9319, longitude: 79.9533 },
        timeWindow: { earliest: "14:00", latest: "16:00" },
        packageDetails: {
          sku: "ELECTRONICS-001",
          description: "Smartphone",
          quantity: 1,
          priority: "HIGH",
        },
        status: "PENDING",
        estimatedDeliveryTime: "15:30",
        specialInstructions: "Handle with care - fragile",
      },
    ],
    totalStops: 2,
    estimatedDistance: "45.2 km",
    estimatedDuration: "2h 45min",
    status: "ASSIGNED",
  },
};

// Delivery status tracking
const deliveryStatuses = {};

// Request logging middleware
app.use((req, res, next) => {
  logger.info(
    `Driver Service - Incoming ${req.method} request to ${req.path}`,
    {
      method: req.method,
      path: req.path,
      driverId: req.get("X-Driver-ID") || req.query.driverId || "UNKNOWN",
      userAgent: req.get("User-Agent"),
      ip: req.ip,
    }
  );
  next();
});

// ===== DRIVER API ENDPOINTS =====

// 1. Get driver's daily delivery manifest
app.get("/api/drivers/:driverId/manifest", async (req, res) => {
  const { driverId } = req.params;
  const date = req.query.date || new Date().toISOString().split("T")[0];

  logger.info(`Driver ${driverId} requesting delivery manifest`, {
    driverId,
    date,
    requestedBy: "DRIVER_APP",
  });

  const driver = drivers[driverId];
  if (!driver) {
    logger.warn(`Driver not found: ${driverId}`);
    return res.status(404).json({
      ok: false,
      error: "DRIVER_NOT_FOUND",
      message: "Driver not found in system",
    });
  }

  const manifest = deliveryManifests[driverId];
  if (!manifest) {
    logger.warn(`No manifest found for driver: ${driverId}`);
    return res.status(404).json({
      ok: false,
      error: "NO_MANIFEST",
      message: "No delivery manifest assigned for today",
    });
  }

  // Add real-time status updates to the manifest
  const manifestWithStatus = {
    ...manifest,
    driverInfo: driver,
    lastUpdated: new Date().toISOString(),
    optimizedRoute: manifest.optimizedRoute.map((stop) => ({
      ...stop,
      currentStatus: deliveryStatuses[stop.packageId] || { status: "PENDING" },
    })),
  };

  logger.info(`Delivery manifest sent to driver ${driverId}`, {
    driverId,
    totalStops: manifest.totalStops,
    completedStops: manifest.optimizedRoute.filter(
      (stop) => deliveryStatuses[stop.packageId]?.status === "DELIVERED"
    ).length,
  });

  res.json({
    ok: true,
    manifest: manifestWithStatus,
  });
});

// 2. Update package delivery status
app.put(
  "/api/drivers/:driverId/deliveries/:packageId/status",
  async (req, res) => {
    const { driverId, packageId } = req.params;
    const { status, reason, location, timestamp } = req.body;

    logger.info(`Driver ${driverId} updating delivery status`, {
      driverId,
      packageId,
      status,
      reason: reason || "NONE",
      location: location ? "PROVIDED" : "NOT_PROVIDED",
    });

    const driver = drivers[driverId];
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: "DRIVER_NOT_FOUND",
      });
    }

    // Validate status
    const validStatuses = [
      "DELIVERED",
      "FAILED",
      "ATTEMPTED",
      "OUT_FOR_DELIVERY",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_STATUS",
        validStatuses,
      });
    }

    const deliveryUpdate = {
      packageId,
      driverId,
      status,
      reason: reason || null,
      location: location || driver.currentLocation,
      timestamp: timestamp || new Date().toISOString(),
      updatedBy: "DRIVER_APP",
    };

    // Store the status update
    deliveryStatuses[packageId] = deliveryUpdate;

    // Emit real-time update to connected clients
    io.emit("delivery-status-update", deliveryUpdate);

    // Send Kafka event for other services
    await emitEvent({
      eventType: "DELIVERY_STATUS_UPDATED",
      packageId,
      driverId,
      status,
      timestamp: deliveryUpdate.timestamp,
      data: deliveryUpdate,
    });

    logger.info(`Delivery status updated successfully`, {
      packageId,
      driverId,
      newStatus: status,
      location: location ? "CAPTURED" : "DEFAULT",
    });

    res.json({
      ok: true,
      message: "Delivery status updated successfully",
      update: deliveryUpdate,
    });
  }
);

// 3. Upload proof of delivery (photo and/or signature)
app.post(
  "/api/drivers/:driverId/deliveries/:packageId/proof",
  upload.fields([
    { name: "photo", maxCount: 3 },
    { name: "signature", maxCount: 1 },
  ]),
  async (req, res) => {
    const { driverId, packageId } = req.params;
    const { customerName, notes } = req.body;

    logger.info(`Driver ${driverId} uploading proof of delivery`, {
      driverId,
      packageId,
      customerName: customerName || "NOT_PROVIDED",
      photoCount: req.files?.photo?.length || 0,
      signatureCount: req.files?.signature?.length || 0,
      notes: notes ? "PROVIDED" : "NONE",
    });

    const proofId = uuidv4();
    const proofData = {
      proofId,
      packageId,
      driverId,
      customerName: customerName || null,
      timestamp: new Date().toISOString(),
      photos:
        req.files?.photo?.map((file) => ({
          filename: file.filename,
          originalName: file.originalname,
          path: file.path,
          size: file.size,
          uploadedAt: new Date().toISOString(),
        })) || [],
      signature: req.files?.signature?.[0]
        ? {
            filename: req.files.signature[0].filename,
            originalName: req.files.signature[0].originalname,
            path: req.files.signature[0].path,
            size: req.files.signature[0].size,
            uploadedAt: new Date().toISOString(),
          }
        : null,
      notes: notes || null,
      location: drivers[driverId]?.currentLocation || null,
    };

    // Store proof of delivery
    if (!deliveryStatuses[packageId]) {
      deliveryStatuses[packageId] = {};
    }
    deliveryStatuses[packageId].proofOfDelivery = proofData;

    // Emit real-time update
    io.emit("proof-of-delivery-uploaded", {
      packageId,
      driverId,
      proofId,
      timestamp: proofData.timestamp,
    });

    // Send Kafka event
    await emitEvent({
      eventType: "PROOF_OF_DELIVERY_UPLOADED",
      packageId,
      driverId,
      proofId,
      timestamp: proofData.timestamp,
      data: {
        hasPhoto: proofData.photos.length > 0,
        hasSignature: !!proofData.signature,
        customerName: customerName,
      },
    });

    logger.info(`Proof of delivery uploaded successfully`, {
      proofId,
      packageId,
      driverId,
      photoCount: proofData.photos.length,
      hasSignature: !!proofData.signature,
    });

    res.json({
      ok: true,
      message: "Proof of delivery uploaded successfully",
      proofId,
      uploadedFiles: {
        photos: proofData.photos.length,
        signature: !!proofData.signature,
      },
    });
  }
);

// 4. Get real-time route updates
app.get("/api/drivers/:driverId/route-updates", async (req, res) => {
  const { driverId } = req.params;

  logger.info(`Driver ${driverId} requesting route updates`);

  const driver = drivers[driverId];
  if (!driver) {
    return res.status(404).json({
      ok: false,
      error: "DRIVER_NOT_FOUND",
    });
  }

  // Simulate route updates (in production, this would come from ROS)
  const routeUpdates = {
    driverId,
    lastUpdated: new Date().toISOString(),
    updates: [
      {
        type: "TRAFFIC_DELAY",
        message: "Traffic congestion detected on Galle Road. ETA updated.",
        affectedStops: ["STOP-001"],
        newETA: "10:45",
        severity: "MEDIUM",
      },
      {
        type: "NEW_PRIORITY_DELIVERY",
        message: "High priority delivery added to your route.",
        packageId: "SWFT-PKG-URGENT-001",
        address: "456 Negombo Road, Colombo 15",
        timeWindow: { earliest: "12:00", latest: "13:00" },
        severity: "HIGH",
      },
    ],
    currentLocation: driver.currentLocation,
    nextStop: deliveryManifests[driverId]?.optimizedRoute.find(
      (stop) =>
        !deliveryStatuses[stop.packageId] ||
        deliveryStatuses[stop.packageId].status === "PENDING"
    ),
  };

  res.json({
    ok: true,
    routeUpdates,
  });
});

// 5. WebSocket connection for real-time updates
io.on("connection", (socket) => {
  logger.info("Driver connected to real-time updates", {
    socketId: socket.id,
  });

  socket.on("driver-login", (data) => {
    const { driverId } = data;
    socket.join(`driver-${driverId}`);
    logger.info(`Driver ${driverId} joined real-time channel`);

    // Send welcome message with current status
    socket.emit("connection-confirmed", {
      message: `Welcome ${drivers[driverId]?.name || "Driver"}`,
      timestamp: new Date().toISOString(),
    });
  });

  socket.on("location-update", async (data) => {
    const { driverId, latitude, longitude } = data;

    if (drivers[driverId]) {
      drivers[driverId].currentLocation = {
        latitude,
        longitude,
        timestamp: new Date().toISOString(),
      };

      // Broadcast location update to dispatch
      socket.broadcast.emit("driver-location-update", {
        driverId,
        location: drivers[driverId].currentLocation,
      });

      // Send Kafka event for location tracking
      await emitEvent({
        eventType: "DRIVER_LOCATION_UPDATED",
        driverId,
        timestamp: new Date().toISOString(),
        data: drivers[driverId].currentLocation,
      });
    }
  });

  socket.on("disconnect", () => {
    logger.info("Driver disconnected from real-time updates", {
      socketId: socket.id,
    });
  });
});

// Helper function to emit Kafka events
async function emitEvent(event) {
  try {
    await kafkaClient.sendMessage(TOPIC, event);
    logger.debug("Event emitted to Kafka", {
      eventType: event.eventType,
      timestamp: event.timestamp,
    });
  } catch (error) {
    logger.error("Failed to emit Kafka event", {
      eventType: event.eventType,
      error: error.message,
    });
  }
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "driver-service",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    features: [
      "delivery-manifest",
      "status-updates",
      "proof-of-delivery",
      "real-time-updates",
      "route-optimization",
    ],
    activeDrivers: Object.keys(drivers).length,
    realTimeConnections: io.sockets.sockets.size,
  });
});

// Start server
server.listen(PORT, () => {
  logger.info(`SwiftTrack Driver Service started on port ${PORT}`, {
    port: PORT,
    features: [
      "Driver Manifest Management",
      "Real-time Route Updates",
      "Delivery Status Tracking",
      "Proof of Delivery Upload",
      "WebSocket Real-time Communication",
    ],
    integrations: ["Kafka Events", "File Upload", "Location Tracking"],
  });
});

export default app;
