import express from "express";
import { getLogger } from "@swifttrack/logger";

const logger = getLogger("wms-mock");
const app = express();
app.use(express.json());

// Mock warehouse inventory for Swift Logistics
const inventory = {
  "BOOK-001": {
    available: 150,
    reserved: 25,
    location: "A1-B2-C3",
    weight: 0.5,
  },
  "BOOK-002": {
    available: 200,
    reserved: 10,
    location: "A2-C3-D1",
    weight: 0.8,
  },
  "ELECTRONICS-001": {
    available: 75,
    reserved: 5,
    location: "B1-A4-E2",
    weight: 2.5,
  },
  "FASHION-001": {
    available: 120,
    reserved: 15,
    location: "C1-B3-F1",
    weight: 0.3,
  },
  "COSMETICS-001": {
    available: 90,
    reserved: 8,
    location: "D1-C2-G3",
    weight: 0.2,
  },
};

// Mock warehouse zones
const warehouseZones = {
  A1: { name: "Electronics Zone", capacity: 1000, currentLoad: 750 },
  B1: { name: "Books & Media", capacity: 800, currentLoad: 600 },
  C1: { name: "Fashion & Apparel", capacity: 1200, currentLoad: 900 },
  D1: { name: "Beauty & Health", capacity: 600, currentLoad: 400 },
};

// Request logging middleware
app.use((req, res, next) => {
  logger.info(
    `WMS Proprietary System - Incoming ${req.method} request to ${req.path}`,
    {
      method: req.method,
      path: req.path,
      userAgent: req.get("User-Agent"),
      ip: req.ip,
      contentType: req.get("Content-Type"),
    }
  );
  next();
});

// Simulate proprietary TCP/IP messaging endpoint for package registration
app.post("/register", async (req, res) => {
  const startTime = Date.now();
  const { orderId, packages, deliveryAddresses, clientId } = req.body;

  logger.info(`WMS Proprietary System - Processing package registration`, {
    orderId,
    clientId,
    packageCount: packages?.length || 0,
    deliveryCount: deliveryAddresses?.length || 0,
  });

  // Simulate proprietary TCP/IP messaging delay
  const processingDelay = Math.random() * 500 + 300; // 300-800ms
  await new Promise((r) => setTimeout(r, processingDelay));

  const packageId = "SWFT-PKG-" + orderId + "-" + Date.now();

  if (!packages || packages.length === 0) {
    logger.warn(`WMS Proprietary System - No packages to register`, {
      orderId,
      reason: "Empty packages array",
    });
    return res.status(400).json({
      ok: false,
      message: "WMS Proprietary: No packages to register",
      error: "EMPTY_PACKAGE_LIST",
      tcpResponse: "ERROR_NO_PACKAGES",
    });
  }

  // Mock inventory checking with detailed tracking
  const packageDetails = [];
  let allPackagesAvailable = true;
  let totalWeight = 0;

  for (const pkg of packages) {
    const stock = inventory[pkg.sku] || {
      available: 0,
      reserved: 0,
      location: "UNKNOWN",
      weight: 1.0,
    };
    const requestedQty = pkg.quantity || 1;
    const isAvailable = stock.available >= requestedQty;

    if (!isAvailable) {
      allPackagesAvailable = false;
    }

    const packageWeight = stock.weight * requestedQty;
    totalWeight += packageWeight;

    packageDetails.push({
      sku: pkg.sku,
      description: pkg.description || `Product ${pkg.sku}`,
      requestedQty,
      availableQty: stock.available,
      reservedQty: stock.reserved,
      warehouseLocation: stock.location,
      weight: packageWeight,
      status: isAvailable ? "RESERVED" : "OUT_OF_STOCK",
      pickingPriority: pkg.priority === "URGENT" ? "HIGH" : "STANDARD",
    });

    logger.debug(`WMS Inventory check for ${pkg.sku}`, {
      orderId,
      sku: pkg.sku,
      requested: requestedQty,
      available: stock.available,
      location: stock.location,
      status: isAvailable ? "AVAILABLE" : "OUT_OF_STOCK",
    });

    // Update mock inventory if available
    if (isAvailable) {
      stock.available -= requestedQty;
      stock.reserved += requestedQty;
    }
  }

  if (!allPackagesAvailable) {
    logger.warn(`WMS Proprietary System - Insufficient inventory`, {
      orderId,
      packageId,
      packageDetails: packageDetails.filter((p) => p.status === "OUT_OF_STOCK"),
    });
    return res.status(409).json({
      ok: false,
      message: "WMS Proprietary: Insufficient inventory",
      error: "INVENTORY_SHORTAGE",
      packageId,
      packageDetails,
      tcpResponse: "ERROR_INSUFFICIENT_STOCK",
    });
  }

  // Determine optimal warehouse zone
  const optimalZone = Object.entries(warehouseZones).sort(
    (a, b) => a[1].currentLoad - b[1].currentLoad
  )[0];

  const estimatedPickTime = calculatePickingTime(packages.length, totalWeight);
  const estimatedReadyTime = new Date(
    Date.now() + estimatedPickTime * 60000
  ).toISOString();

  const duration = Date.now() - startTime;
  const response = {
    ok: true,
    message: "WMS Proprietary: Packages registered successfully",
    packageId,
    warehouseDetails: {
      facility: "SWIFT_WAREHOUSE_CENTRAL",
      zone: optimalZone[0],
      zoneName: optimalZone[1].name,
      totalWeight,
      pickingStatus: "QUEUED",
      pickingPriority: packages.some((p) => p.priority === "URGENT")
        ? "HIGH"
        : "STANDARD",
      estimatedPickTime: `${estimatedPickTime} minutes`,
      estimatedReadyTime,
    },
    warehouseLocation: `${optimalZone[0]}-STAGING`,
    packageDetails,
    operationalDetails: {
      registeredAt: new Date().toISOString(),
      systemProtocol: "TCP_IP_PROPRIETARY",
      systemVersion: "WMS_v3.2.1",
      sessionId: `WMS-${Date.now()}`,
      trackingEnabled: true,
    },
  };

  logger.info(`WMS Proprietary System - Package registration successful`, {
    orderId,
    packageId,
    packageCount: packages.length,
    totalWeight,
    warehouseZone: optimalZone[0],
    estimatedPickTime,
    duration,
  });

  res.json(response);
});

// Calculate picking time based on package count and weight
function calculatePickingTime(packageCount, totalWeight) {
  const baseTime = 5; // 5 minutes base time
  const timePerPackage = 3; // 3 minutes per package
  const weightFactor = totalWeight > 10 ? Math.ceil(totalWeight / 10) * 2 : 0; // Extra time for heavy items

  return baseTime + packageCount * timePerPackage + weightFactor;
}

// Real-time inventory endpoint
app.get("/inventory/:sku?", (req, res) => {
  const { sku } = req.params;

  logger.debug(`WMS Inventory query`, { sku: sku || "ALL" });

  if (sku) {
    const stock = inventory[sku];
    if (!stock) {
      return res.status(404).json({
        error: "SKU not found in warehouse system",
        tcpResponse: "ERROR_SKU_NOT_FOUND",
      });
    }
    res.json({ sku, ...stock });
  } else {
    res.json({
      inventory,
      totalSkus: Object.keys(inventory).length,
      totalAvailable: Object.values(inventory).reduce(
        (sum, item) => sum + item.available,
        0
      ),
      totalReserved: Object.values(inventory).reduce(
        (sum, item) => sum + item.reserved,
        0
      ),
    });
  }
});

// Warehouse zones status
app.get("/zones", (req, res) => {
  logger.debug("WMS Warehouse zones query");
  res.json({
    zones: warehouseZones,
    totalCapacity: Object.values(warehouseZones).reduce(
      (sum, zone) => sum + zone.capacity,
      0
    ),
    totalLoad: Object.values(warehouseZones).reduce(
      (sum, zone) => sum + zone.currentLoad,
      0
    ),
  });
});

// Package tracking endpoint
app.get("/track/:packageId", (req, res) => {
  const { packageId } = req.params;
  logger.debug(`WMS Package tracking query`, { packageId });

  // Mock tracking data
  res.json({
    packageId,
    status: "IN_WAREHOUSE",
    location: "A1-STAGING",
    lastUpdate: new Date().toISOString(),
    pickingStatus: "QUEUED",
    estimatedReady: new Date(Date.now() + 15 * 60000).toISOString(),
  });
});

// Proprietary system health endpoint
app.get("/health", (req, res) => {
  logger.debug("WMS Proprietary System - Health check endpoint called");
  res.json({
    status: "ok",
    service: "wms-proprietary-mock",
    systemVersion: "WMS_v3.2.1",
    protocol: "TCP/IP Proprietary",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    inventoryItems: Object.keys(inventory).length,
    warehouseZones: Object.keys(warehouseZones).length,
  });
});

// System status endpoint
app.get("/status", (req, res) => {
  logger.debug("WMS Proprietary System - Status endpoint called");
  const totalCapacity = Object.values(warehouseZones).reduce(
    (sum, zone) => sum + zone.capacity,
    0
  );
  const totalLoad = Object.values(warehouseZones).reduce(
    (sum, zone) => sum + zone.currentLoad,
    0
  );

  res.json({
    systemStatus: "OPERATIONAL",
    tcpConnection: "ACTIVE",
    databaseConnection: "CONNECTED",
    pickingSystemStatus: "RUNNING",
    warehouseUtilization: Math.round((totalLoad / totalCapacity) * 100),
    lastInventorySync: "2025-09-07T06:00:00Z",
    nextInventorySync: "2025-09-07T18:00:00Z",
    totalPackagesInWarehouse: Object.values(inventory).reduce(
      (sum, item) => sum + item.reserved,
      0
    ),
    availablePickingSlots: 25,
  });
});

app.listen(5002, () => {
  logger.info("Swift Logistics WMS Proprietary Mock Service started", {
    port: 5002,
    protocol: "TCP/IP Proprietary (simulated as REST)",
    endpoints: [
      "/register",
      "/inventory",
      "/zones",
      "/track",
      "/health",
      "/status",
    ],
    inventoryItems: Object.keys(inventory).length,
    warehouseZones: Object.keys(warehouseZones).length,
    environment: process.env.NODE_ENV || "development",
    systemVersion: "WMS_v3.2.1",
  });
});
