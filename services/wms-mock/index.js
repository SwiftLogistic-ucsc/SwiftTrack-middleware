import express from "express";
import { getLogger } from "@swifttrack/logger";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = getLogger("wms-mock");
const app = express();
app.use(express.json());

// Load data from JSON files
let inventoryData, warehouseZones, wmsConfig;

try {
  // Load inventory data
  const inventoryPath = path.join(__dirname, "data", "inventory.json");
  inventoryData = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));

  // Load warehouse zones
  const zonesPath = path.join(__dirname, "data", "zones.json");
  const zonesData = JSON.parse(fs.readFileSync(zonesPath, "utf8"));
  warehouseZones = zonesData.zones;

  // Load WMS configuration
  const configPath = path.join(__dirname, "data", "config.json");
  wmsConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

  logger.info("WMS Mock Service - Data files loaded successfully", {
    inventoryItems: Object.keys(inventoryData.items).length,
    warehouseZones: Object.keys(warehouseZones).length,
    configVersion: wmsConfig.system.version,
  });
} catch (error) {
  logger.error("Failed to load WMS data files", { error: error.message });
  process.exit(1);
}

// Dynamic inventory reference (for runtime modifications)
const inventory = inventoryData.items;

// Utility functions for data persistence
function saveInventoryData() {
  try {
    inventoryData.lastUpdated = new Date().toISOString();
    const inventoryPath = path.join(__dirname, "data", "inventory.json");
    fs.writeFileSync(inventoryPath, JSON.stringify(inventoryData, null, 2));
    logger.debug("Inventory data saved to file");
    return true;
  } catch (error) {
    logger.error("Failed to save inventory data", { error: error.message });
    return false;
  }
}

function saveZonesData() {
  try {
    const zonesData = {
      lastUpdated: new Date().toISOString(),
      version: "1.0.0",
      zones: warehouseZones,
      metadata: {
        totalZones: Object.keys(warehouseZones).length,
        totalCapacity: Object.values(warehouseZones).reduce(
          (sum, zone) => sum + zone.capacity,
          0
        ),
        totalCurrentLoad: Object.values(warehouseZones).reduce(
          (sum, zone) => sum + zone.currentLoad,
          0
        ),
        utilizationRate: Math.round(
          (Object.values(warehouseZones).reduce(
            (sum, zone) => sum + zone.currentLoad,
            0
          ) /
            Object.values(warehouseZones).reduce(
              (sum, zone) => sum + zone.capacity,
              0
            )) *
            100
        ),
        operationalStatus: "ACTIVE",
        emergencyProtocols: "ENABLED",
      },
    };
    const zonesPath = path.join(__dirname, "data", "zones.json");
    fs.writeFileSync(zonesPath, JSON.stringify(zonesData, null, 2));
    logger.debug("Zones data saved to file");
    return true;
  } catch (error) {
    logger.error("Failed to save zones data", { error: error.message });
    return false;
  }
}

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

  console.log("=== WMS DEBUG INFO ===");
  console.log("Full request body:", JSON.stringify(req.body, null, 2));
  console.log("Extracted packages:", packages);
  console.log("Packages type:", typeof packages);
  console.log("Packages length:", packages?.length);
  console.log("========================");

  logger.info(`WMS Proprietary System - Processing package registration`, {
    orderId,
    clientId,
    packageCount: packages?.length || 0,
    deliveryCount: deliveryAddresses?.length || 0,
    incomingProtocol: req.get("X-Protocol-Adapter") || "NATIVE",
    tcpSequenceId: req.get("X-TCP-Sequence-Id") || "NONE",
    messageType: req.get("X-Message-Type") || "DIRECT_CALL",
    protocolVersion: req.get("X-Protocol-Version") || "UNKNOWN",
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
      category: "UNKNOWN",
      description: "Unknown Product",
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
      description: stock.description || pkg.description || `Product ${pkg.sku}`,
      category: stock.category,
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
  const baseTime = wmsConfig.operations.pickingTimeBase;
  const timePerPackage = wmsConfig.operations.pickingTimePerPackage;
  const weightThreshold = wmsConfig.operations.weightFactorThreshold;
  const weightMultiplier = wmsConfig.operations.weightFactorMultiplier;

  const weightFactor =
    totalWeight > weightThreshold
      ? Math.ceil(totalWeight / weightThreshold) * weightMultiplier
      : 0;

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

// Get inventory by category
app.get("/inventory/category/:category", (req, res) => {
  const { category } = req.params;

  logger.debug(`WMS Inventory category query`, { category });

  const categoryItems = Object.entries(inventory)
    .filter(
      ([sku, item]) => item.category?.toLowerCase() === category.toLowerCase()
    )
    .reduce((acc, [sku, item]) => {
      acc[sku] = item;
      return acc;
    }, {});

  if (Object.keys(categoryItems).length === 0) {
    return res.status(404).json({
      error: `No items found in category: ${category}`,
      availableCategories: [
        ...new Set(Object.values(inventory).map((item) => item.category)),
      ],
    });
  }

  res.json({
    category,
    items: categoryItems,
    itemCount: Object.keys(categoryItems).length,
    totalAvailable: Object.values(categoryItems).reduce(
      (sum, item) => sum + item.available,
      0
    ),
    totalReserved: Object.values(categoryItems).reduce(
      (sum, item) => sum + item.reserved,
      0
    ),
  });
});

// Get all available categories
app.get("/categories", (req, res) => {
  logger.debug("WMS Categories query");

  const categories = [
    ...new Set(Object.values(inventory).map((item) => item.category)),
  ];
  const categoryStats = categories.map((category) => {
    const categoryItems = Object.values(inventory).filter(
      (item) => item.category === category
    );
    return {
      name: category,
      itemCount: categoryItems.length,
      totalAvailable: categoryItems.reduce(
        (sum, item) => sum + item.available,
        0
      ),
      totalReserved: categoryItems.reduce(
        (sum, item) => sum + item.reserved,
        0
      ),
      totalWeight: categoryItems.reduce(
        (sum, item) => sum + item.weight * (item.available + item.reserved),
        0
      ),
    };
  });

  res.json({
    categories: categoryStats,
    totalCategories: categories.length,
  });
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

// WMS Configuration endpoint
app.get("/config", (req, res) => {
  logger.debug("WMS Configuration query");
  res.json({
    system: wmsConfig.system,
    warehouse: wmsConfig.warehouse,
    operations: wmsConfig.operations,
    thresholds: wmsConfig.thresholds,
    dataFiles: {
      inventoryVersion: inventoryData.version,
      inventoryLastUpdated: inventoryData.lastUpdated,
      totalItems: Object.keys(inventory).length,
    },
  });
});

// Data management endpoints
app.post("/admin/save-data", (req, res) => {
  logger.info("Manual data save requested");

  const inventorySaved = saveInventoryData();
  const zonesSaved = saveZonesData();

  if (inventorySaved && zonesSaved) {
    res.json({
      success: true,
      message: "All data saved successfully",
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(500).json({
      success: false,
      message: "Failed to save some data files",
      inventorySaved,
      zonesSaved,
    });
  }
});

// Inventory management endpoints
app.put("/admin/inventory/:sku", (req, res) => {
  const { sku } = req.params;
  const updates = req.body;

  logger.info(`Updating inventory for SKU: ${sku}`, updates);

  if (!inventory[sku]) {
    return res.status(404).json({
      error: "SKU not found",
      sku,
    });
  }

  // Update inventory item
  Object.assign(inventory[sku], updates);

  // Save to file
  const saved = saveInventoryData();

  res.json({
    success: saved,
    message: saved
      ? "Inventory updated successfully"
      : "Failed to save inventory",
    sku,
    updatedItem: inventory[sku],
  });
});

// Add new inventory item
app.post("/admin/inventory", (req, res) => {
  const { sku, itemData } = req.body;

  logger.info(`Adding new inventory item: ${sku}`, itemData);

  if (inventory[sku]) {
    return res.status(409).json({
      error: "SKU already exists",
      sku,
    });
  }

  // Add new item
  inventory[sku] = itemData;

  // Save to file
  const saved = saveInventoryData();

  res.json({
    success: saved,
    message: saved
      ? "Inventory item added successfully"
      : "Failed to save inventory",
    sku,
    newItem: inventory[sku],
  });
});

// Get low stock alerts
app.get("/alerts/low-stock", (req, res) => {
  logger.debug("Low stock alerts query");

  const lowStockItems = Object.entries(inventory)
    .filter(([sku, item]) => {
      const threshold =
        item.reorderLevel || wmsConfig.thresholds.lowInventoryWarning;
      return item.available <= threshold;
    })
    .map(([sku, item]) => ({
      sku,
      available: item.available,
      reorderLevel:
        item.reorderLevel || wmsConfig.thresholds.lowInventoryWarning,
      category: item.category,
      description: item.description,
      supplier: item.supplier,
      urgency:
        item.available <= wmsConfig.thresholds.criticalInventoryWarning
          ? "CRITICAL"
          : "LOW",
    }));

  res.json({
    alerts: lowStockItems,
    totalAlerts: lowStockItems.length,
    criticalAlerts: lowStockItems.filter((item) => item.urgency === "CRITICAL")
      .length,
    timestamp: new Date().toISOString(),
  });
});

app.listen(5002, () => {
  logger.info("Swift Logistics WMS Proprietary Mock Service started", {
    port: 5002,
    protocol: wmsConfig.system.protocol,
    dataSource: "JSON Files",
    endpoints: [
      "/register",
      "/inventory",
      "/inventory/category/:category",
      "/categories",
      "/zones",
      "/track",
      "/health",
      "/status",
      "/config",
      "/admin/save-data",
      "/admin/inventory",
      "/alerts/low-stock",
    ],
    dataFiles: {
      inventoryItems: Object.keys(inventory).length,
      warehouseZones: Object.keys(warehouseZones).length,
      inventoryVersion: inventoryData.version,
      lastUpdated: inventoryData.lastUpdated,
    },
    environment: process.env.NODE_ENV || "development",
    systemVersion: wmsConfig.system.version,
    facility: wmsConfig.warehouse.facility,
  });
});
