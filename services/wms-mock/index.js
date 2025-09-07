import express from "express";
import { getLogger } from "@swifttrack/logger";

const logger = getLogger("wms-mock");
const app = express();
app.use(express.json());

// Mock inventory data
const inventory = {
  "SKU-001": { available: 150, reserved: 25, location: "A1-B2" },
  "SKU-002": { available: 200, reserved: 10, location: "A2-C3" },
  "SKU-003": { available: 75, reserved: 5, location: "B1-A4" },
};

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

app.post("/register", async (req, res) => {
  const startTime = Date.now();
  const { orderId, items, addresses } = req.body;

  logger.info(`Processing package registration request`, {
    orderId,
    itemCount: items?.length || 0,
    addresses: addresses?.length || 0,
  });

  // Simulate processing delay
  const processingDelay = 400;
  await new Promise((r) => setTimeout(r, processingDelay));

  const packageId = "P-" + orderId;

  // Mock inventory checking
  const itemDetails = [];
  let allItemsAvailable = true;

  if (items && items.length > 0) {
    for (const item of items) {
      const stock = inventory[item.sku] || {
        available: 0,
        reserved: 0,
        location: "UNKNOWN",
      };
      const isAvailable = stock.available >= (item.qty || 1);

      if (!isAvailable) {
        allItemsAvailable = false;
      }

      itemDetails.push({
        sku: item.sku,
        requestedQty: item.qty || 1,
        available: stock.available,
        location: stock.location,
        status: isAvailable ? "RESERVED" : "OUT_OF_STOCK",
      });

      logger.debug(`Inventory check for ${item.sku}`, {
        orderId,
        sku: item.sku,
        requested: item.qty || 1,
        available: stock.available,
        status: isAvailable ? "AVAILABLE" : "OUT_OF_STOCK",
      });
    }
  }

  if (!allItemsAvailable) {
    logger.warn(`Package registration failed: insufficient inventory`, {
      orderId,
      packageId,
      itemDetails,
    });
    return res.status(400).json({
      ok: false,
      message: "WMS: Insufficient inventory",
      packageId,
      itemDetails,
      error: "One or more items are out of stock",
    });
  }

  const duration = Date.now() - startTime;
  const response = {
    ok: true,
    message: "WMS: Package registered",
    packageId,
    warehouseDetails: {
      facility: "WAREHOUSE_CENTRAL",
      zone: "ZONE_A",
      pickingStatus: "QUEUED",
      estimatedPickTime: "15-30 minutes",
    },
    itemDetails,
  };

  logger.info(`Package registration successful`, {
    orderId,
    packageId,
    duration,
    itemsRegistered: items?.length || 0,
    warehouseFacility: "WAREHOUSE_CENTRAL",
  });

  res.json(response);
});

app.get("/inventory/:sku?", (req, res) => {
  const { sku } = req.params;

  logger.debug(`Inventory query`, { sku: sku || "ALL" });

  if (sku) {
    const stock = inventory[sku];
    if (!stock) {
      return res.status(404).json({ error: "SKU not found" });
    }
    res.json({ sku, ...stock });
  } else {
    res.json(inventory);
  }
});

app.get("/health", (req, res) => {
  logger.debug("Health check endpoint called");
  res.json({
    status: "ok",
    service: "wms-mock",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    inventoryItems: Object.keys(inventory).length,
  });
});

app.listen(5002, () => {
  logger.info("WMS Mock Service started", {
    port: 5002,
    endpoints: ["/register", "/inventory", "/health"],
    inventoryItems: Object.keys(inventory).length,
    environment: process.env.NODE_ENV || "development",
  });
});
