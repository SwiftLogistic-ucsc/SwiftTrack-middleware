import express from "express";
import { getLogger } from "@swifttrack/logger";

const logger = getLogger("ros-mock");
const app = express();
app.use(express.json());

// Mock route data and delivery zones
const deliveryZones = {
  "Colombo 1": { baseTime: 25, distance: 8.5, traffic: "moderate" },
  "Colombo 2": { baseTime: 30, distance: 12.3, traffic: "high" },
  "Colombo 3": { baseTime: 35, distance: 15.8, traffic: "moderate" },
  "Colombo 7": { baseTime: 28, distance: 10.2, traffic: "low" },
  Gampaha: { baseTime: 55, distance: 35.6, traffic: "moderate" },
  Kandy: { baseTime: 180, distance: 115.2, traffic: "low" },
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

function calculateETA(addresses) {
  if (!addresses || addresses.length === 0) {
    return 37; // default ETA
  }

  let totalTime = 15; // base warehouse processing time

  for (const address of addresses) {
    // Find matching zone or use default
    const zone = Object.keys(deliveryZones).find((zone) =>
      address.toLowerCase().includes(zone.toLowerCase().replace(" ", ""))
    );

    if (zone) {
      const zoneData = deliveryZones[zone];
      let estimatedTime = zoneData.baseTime;

      // Adjust for traffic
      if (zoneData.traffic === "high") estimatedTime *= 1.3;
      else if (zoneData.traffic === "low") estimatedTime *= 0.8;

      totalTime += estimatedTime;

      logger.debug(`Route calculation for zone`, {
        zone,
        baseTime: zoneData.baseTime,
        traffic: zoneData.traffic,
        adjustedTime: estimatedTime,
        distance: zoneData.distance,
      });
    } else {
      // Unknown zone, use default
      totalTime += 45;
      logger.debug(`Unknown delivery zone, using default time`, { address });
    }
  }

  return Math.round(totalTime);
}

app.post("/optimize-route", async (req, res) => {
  const startTime = Date.now();
  const { orderId, addresses, items } = req.body;

  logger.info(`Processing route optimization request`, {
    orderId,
    addressCount: addresses?.length || 0,
    itemCount: items?.length || 0,
  });

  // Simulate processing delay
  const processingDelay = 500;
  await new Promise((r) => setTimeout(r, processingDelay));

  const routeId = "R-" + orderId;

  if (!addresses || addresses.length === 0) {
    logger.warn(`Route optimization failed: no addresses`, {
      orderId,
      routeId,
    });
    return res.status(400).json({
      ok: false,
      message: "ROS: No delivery addresses provided",
      routeId,
      error: "At least one delivery address is required",
    });
  }

  const etaMinutes = calculateETA(addresses);
  const totalDistance = addresses.length * 12.5; // Mock calculation

  // Generate optimized route details
  const routeDetails = {
    startLocation: "WAREHOUSE_CENTRAL",
    stops: addresses.map((addr, idx) => ({
      stopNumber: idx + 1,
      address: addr,
      estimatedArrival: new Date(
        Date.now() + etaMinutes * 60000 + idx * 15 * 60000
      ).toISOString(),
      priority: idx === 0 ? "HIGH" : "STANDARD",
    })),
    optimizationFactors: {
      trafficConditions: "MODERATE",
      weatherConditions: "CLEAR",
      routeComplexity: addresses.length > 3 ? "HIGH" : "LOW",
    },
  };

  const duration = Date.now() - startTime;
  const response = {
    ok: true,
    message: "ROS: Route optimized",
    routeId,
    etaMinutes,
    totalDistance: Math.round(totalDistance * 100) / 100,
    routeDetails,
  };

  logger.info(`Route optimization successful`, {
    orderId,
    routeId,
    etaMinutes,
    totalDistance: Math.round(totalDistance * 100) / 100,
    stopCount: addresses.length,
    duration,
    optimizationComplexity: routeDetails.optimizationFactors.routeComplexity,
  });

  res.json(response);
});

app.get("/zones", (req, res) => {
  logger.debug("Delivery zones query");
  res.json({
    availableZones: deliveryZones,
    totalZones: Object.keys(deliveryZones).length,
  });
});

app.get("/health", (req, res) => {
  logger.debug("Health check endpoint called");
  res.json({
    status: "ok",
    service: "ros-mock",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    availableZones: Object.keys(deliveryZones).length,
  });
});

app.listen(5003, () => {
  logger.info("ROS Mock Service started", {
    port: 5003,
    endpoints: ["/optimize-route", "/zones", "/health"],
    deliveryZones: Object.keys(deliveryZones).length,
    environment: process.env.NODE_ENV || "development",
  });
});
