import express from "express";
import { getLogger } from "@swifttrack/logger";

const logger = getLogger("ros-mock");
const app = express();
app.use(express.json());

// Mock delivery zones in Sri Lanka with realistic data
const deliveryZones = {
  "Colombo 01": { baseTime: 25, distance: 8.5, traffic: "high", zone: "METRO" },
  "Colombo 02": {
    baseTime: 30,
    distance: 12.3,
    traffic: "high",
    zone: "METRO",
  },
  "Colombo 03": {
    baseTime: 35,
    distance: 15.8,
    traffic: "moderate",
    zone: "METRO",
  },
  "Colombo 07": {
    baseTime: 28,
    distance: 10.2,
    traffic: "moderate",
    zone: "METRO",
  },
  "Colombo 15": {
    baseTime: 40,
    distance: 18.5,
    traffic: "moderate",
    zone: "SUBURBAN",
  },
  Gampaha: {
    baseTime: 55,
    distance: 35.6,
    traffic: "moderate",
    zone: "SUBURBAN",
  },
  Kandy: { baseTime: 180, distance: 115.2, traffic: "low", zone: "OUTSTATION" },
  Galle: { baseTime: 150, distance: 95.8, traffic: "low", zone: "OUTSTATION" },
  Negombo: {
    baseTime: 65,
    distance: 42.1,
    traffic: "moderate",
    zone: "SUBURBAN",
  },
  Maharagama: {
    baseTime: 45,
    distance: 22.3,
    traffic: "moderate",
    zone: "SUBURBAN",
  },
};

// Mock vehicle fleet for Swift Logistics
const vehicleFleet = {
  "VAN-001": {
    type: "VAN",
    capacity: 50,
    currentLoad: 25,
    driver: "Kamal Perera",
    status: "AVAILABLE",
    zone: "METRO",
  },
  "VAN-002": {
    type: "VAN",
    capacity: 50,
    currentLoad: 30,
    driver: "Nimal Silva",
    status: "ON_ROUTE",
    zone: "METRO",
  },
  "BIKE-001": {
    type: "MOTORCYCLE",
    capacity: 10,
    currentLoad: 5,
    driver: "Sunil Fernando",
    status: "AVAILABLE",
    zone: "METRO",
  },
  "BIKE-002": {
    type: "MOTORCYCLE",
    capacity: 10,
    currentLoad: 8,
    driver: "Ravi Jayasinghe",
    status: "AVAILABLE",
    zone: "SUBURBAN",
  },
  "TRUCK-001": {
    type: "TRUCK",
    capacity: 100,
    currentLoad: 60,
    driver: "Prasad Wickramasinghe",
    status: "AVAILABLE",
    zone: "OUTSTATION",
  },
};

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`ROS Cloud API - Incoming ${req.method} request to ${req.path}`, {
    method: req.method,
    path: req.path,
    userAgent: req.get("User-Agent"),
    ip: req.ip,
    contentType: req.get("Content-Type"),
  });
  next();
});

// Modern RESTful API endpoint for route optimization
app.post("/optimize-route", async (req, res) => {
  const startTime = Date.now();
  const { orderId, deliveryAddresses, packages, priority, clientId } = req.body;

  console.log("=== ROS DEBUG INFO ===");
  console.log("Full request body:", JSON.stringify(req.body, null, 2));
  console.log("Extracted deliveryAddresses:", deliveryAddresses);
  console.log("DeliveryAddresses type:", typeof deliveryAddresses);
  console.log("DeliveryAddresses length:", deliveryAddresses?.length);
  console.log("========================");

  logger.info(`ROS Cloud API - Processing route optimization request`, {
    orderId,
    clientId,
    deliveryCount: deliveryAddresses?.length || 0,
    packageCount: packages?.length || 0,
    priority: priority || "STANDARD",
    apiVersion: req.get("X-API-Version") || "UNKNOWN",
    requestId: req.get("X-Request-ID") || "NONE",
    clientSystem: req.get("X-Client-System") || "UNKNOWN",
    cloudProtocol: "REST/JSON over HTTPS",
  });

  // Simulate cloud API processing delay
  const processingDelay = Math.random() * 600 + 400; // 400-1000ms
  await new Promise((r) => setTimeout(r, processingDelay));

  const routeId = "SWFT-RTE-" + orderId + "-" + Date.now();

  if (!deliveryAddresses || deliveryAddresses.length === 0) {
    logger.warn(`ROS Cloud API - No delivery addresses provided`, {
      orderId,
      routeId,
    });
    return res.status(400).json({
      ok: false,
      message: "ROS Cloud: No delivery addresses provided",
      error: "MISSING_DELIVERY_ADDRESSES",
      apiResponse: "ERROR_INVALID_INPUT",
    });
  }

  // Analyze delivery zones and calculate route
  const routeAnalysis = analyzeDeliveryRoute(deliveryAddresses, packages);

  if (routeAnalysis.error) {
    logger.warn(`ROS Cloud API - Route analysis failed`, {
      orderId,
      routeId,
      error: routeAnalysis.error,
    });
    return res.status(400).json({
      ok: false,
      message: `ROS Cloud: ${routeAnalysis.error}`,
      error: "ROUTE_ANALYSIS_FAILED",
      details: routeAnalysis.details,
    });
  }

  // Find optimal vehicle based on route requirements
  const optimalVehicle = findOptimalVehicle(routeAnalysis, priority);

  if (!optimalVehicle) {
    logger.warn(`ROS Cloud API - No available vehicles`, {
      orderId,
      routeId,
      routeType: routeAnalysis.routeType,
      requiredCapacity: routeAnalysis.totalPackages,
    });
    return res.status(503).json({
      ok: false,
      message: "ROS Cloud: No available vehicles for this route",
      error: "NO_AVAILABLE_VEHICLES",
      suggestedRetry: "2025-09-07T14:00:00Z",
    });
  }

  // Generate optimized route
  const optimizedRoute = generateOptimizedRoute(
    deliveryAddresses,
    routeAnalysis
  );
  const estimatedDelivery = new Date(
    Date.now() + routeAnalysis.totalTime * 60000
  ).toISOString();

  const duration = Date.now() - startTime;
  const response = {
    ok: true,
    message: "ROS Cloud: Route optimized successfully",
    routeId,
    assignedVehicle: optimalVehicle.vehicleId,
    assignedDriver: optimalVehicle.driver,
    etaMinutes: routeAnalysis.totalTime,
    totalDistance: routeAnalysis.totalDistance,
    estimatedDelivery,
    routeDetails: {
      routeType: routeAnalysis.routeType,
      startLocation: "SWIFT_WAREHOUSE_CENTRAL",
      optimizedStops: optimizedRoute.stops,
      totalStops: optimizedRoute.stops.length,
      estimatedFuelCost: Math.round(routeAnalysis.totalDistance * 12.5), // LKR
      carbonFootprint: Math.round(routeAnalysis.totalDistance * 0.2), // kg CO2
    },
    optimizationDetails: {
      algorithm: "GENETIC_ALGORITHM_V2",
      optimizationScore: routeAnalysis.optimizationScore,
      trafficConditions: routeAnalysis.trafficConditions,
      weatherConditions: "CLEAR",
      optimizedAt: new Date().toISOString(),
      apiVersion: "ROS_v4.1.2",
    },
    driverInstructions: {
      vehicleId: optimalVehicle.vehicleId,
      departureTime: new Date(Date.now() + 30 * 60000).toISOString(), // 30 mins from now
      specialInstructions:
        priority === "URGENT" ? "HIGH PRIORITY DELIVERY" : "STANDARD DELIVERY",
      contactNumber: "+94771234567",
    },
  };

  // Update vehicle status (in real system this would be in database)
  vehicleFleet[optimalVehicle.vehicleId].status = "ASSIGNED";
  vehicleFleet[optimalVehicle.vehicleId].currentLoad += packages?.length || 1;

  logger.info(`ROS Cloud API - Route optimization successful`, {
    orderId,
    routeId,
    assignedVehicle: optimalVehicle.vehicleId,
    driverName: optimalVehicle.driver,
    routeType: routeAnalysis.routeType,
    totalStops: optimizedRoute.stops.length,
    etaMinutes: routeAnalysis.totalTime,
    totalDistance: routeAnalysis.totalDistance,
    duration,
  });

  res.json(response);
});

// Analyze delivery route and calculate metrics
function analyzeDeliveryRoute(addresses, packages) {
  let totalTime = 15; // Base warehouse time
  let totalDistance = 0;
  let routeType = "LOCAL";
  let trafficConditions = "MODERATE";
  let optimizationScore = 85;

  const zones = addresses
    .map((addr) => {
      const zone = Object.keys(deliveryZones).find((z) =>
        addr.toLowerCase().includes(z.toLowerCase().replace(/\s/g, ""))
      );
      return zone ? deliveryZones[zone] : null;
    })
    .filter(Boolean);

  if (zones.length === 0) {
    return {
      error: "Unknown delivery zones",
      details: "All delivery addresses are outside service area",
    };
  }

  // Determine route type based on zones
  const hasMetro = zones.some((z) => z.zone === "METRO");
  const hasSuburban = zones.some((z) => z.zone === "SUBURBAN");
  const hasOutstation = zones.some((z) => z.zone === "OUTSTATION");

  if (hasOutstation) {
    routeType = "OUTSTATION";
    optimizationScore = 75;
  } else if (hasSuburban) {
    routeType = "SUBURBAN";
    optimizationScore = 80;
  } else if (hasMetro) {
    routeType = "METRO";
    optimizationScore = 90;
  }

  // Calculate totals
  for (const zone of zones) {
    let estimatedTime = zone.baseTime;

    // Adjust for traffic
    if (zone.traffic === "high") {
      estimatedTime *= 1.4;
      trafficConditions = "HIGH";
    } else if (zone.traffic === "low") {
      estimatedTime *= 0.8;
    }

    totalTime += estimatedTime;
    totalDistance += zone.distance;
  }

  return {
    totalTime: Math.round(totalTime),
    totalDistance: Math.round(totalDistance * 100) / 100,
    routeType,
    trafficConditions,
    optimizationScore,
    totalPackages: packages?.length || 1,
    zones: zones.map((z) => z.zone),
  };
}

// Find optimal vehicle for the route
function findOptimalVehicle(routeAnalysis, priority) {
  const availableVehicles = Object.entries(vehicleFleet)
    .filter(([id, vehicle]) => vehicle.status === "AVAILABLE")
    .map(([id, vehicle]) => ({ vehicleId: id, ...vehicle }));

  if (availableVehicles.length === 0) {
    return null;
  }

  // Filter by zone capability
  let suitableVehicles = availableVehicles;

  if (routeAnalysis.routeType === "OUTSTATION") {
    suitableVehicles = availableVehicles.filter(
      (v) => v.type === "TRUCK" || v.type === "VAN"
    );
  } else if (routeAnalysis.routeType === "METRO" && priority === "URGENT") {
    suitableVehicles = availableVehicles.filter((v) => v.type === "MOTORCYCLE");
  }

  // Check capacity
  suitableVehicles = suitableVehicles.filter(
    (v) => v.capacity - v.currentLoad >= routeAnalysis.totalPackages
  );

  if (suitableVehicles.length === 0) {
    return availableVehicles[0]; // Fallback to any available vehicle
  }

  // Choose vehicle with lowest current load
  return suitableVehicles.sort((a, b) => a.currentLoad - b.currentLoad)[0];
}

// Generate optimized stop sequence
function generateOptimizedRoute(addresses, routeAnalysis) {
  const stops = addresses.map((address, index) => ({
    stopNumber: index + 1,
    address: address,
    estimatedArrival: new Date(
      Date.now() +
        (((index + 1) * routeAnalysis.totalTime) / addresses.length) * 60000
    ).toISOString(),
    priority: index === 0 ? "HIGH" : "STANDARD",
    serviceTime: "10-15 minutes",
  }));

  return { stops };
}

// Vehicle fleet status endpoint
app.get("/vehicles", (req, res) => {
  logger.debug("ROS Cloud API - Vehicle fleet query");
  res.json({
    fleet: vehicleFleet,
    available: Object.values(vehicleFleet).filter(
      (v) => v.status === "AVAILABLE"
    ).length,
    total: Object.keys(vehicleFleet).length,
    utilization: Math.round(
      (Object.values(vehicleFleet).filter((v) => v.status !== "AVAILABLE")
        .length /
        Object.keys(vehicleFleet).length) *
        100
    ),
  });
});

// Delivery zones information endpoint
app.get("/zones", (req, res) => {
  logger.debug("ROS Cloud API - Delivery zones query");
  res.json({
    availableZones: deliveryZones,
    totalZones: Object.keys(deliveryZones).length,
    serviceAreas: ["METRO", "SUBURBAN", "OUTSTATION"],
  });
});

// Route tracking endpoint
app.get("/track/:routeId", (req, res) => {
  const { routeId } = req.params;
  logger.debug(`ROS Cloud API - Route tracking query`, { routeId });

  // Mock tracking data
  res.json({
    routeId,
    status: "IN_PROGRESS",
    currentLocation: "Colombo 03",
    nextStop: "Colombo 07",
    completedStops: 1,
    totalStops: 3,
    estimatedCompletion: new Date(Date.now() + 45 * 60000).toISOString(),
    lastUpdate: new Date().toISOString(),
  });
});

// Cloud API health endpoint
app.get("/health", (req, res) => {
  logger.debug("ROS Cloud API - Health check endpoint called");
  res.json({
    status: "ok",
    service: "ros-cloud-mock",
    apiVersion: "ROS_v4.1.2",
    protocol: "RESTful API",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    deliveryZones: Object.keys(deliveryZones).length,
    vehicleFleet: Object.keys(vehicleFleet).length,
  });
});

// API status endpoint
app.get("/status", (req, res) => {
  logger.debug("ROS Cloud API - Status endpoint called");
  const availableVehicles = Object.values(vehicleFleet).filter(
    (v) => v.status === "AVAILABLE"
  ).length;

  res.json({
    apiStatus: "OPERATIONAL",
    cloudConnection: "CONNECTED",
    optimizationEngine: "RUNNING",
    trafficDataFeed: "LIVE",
    weatherDataFeed: "LIVE",
    vehicleFleetStatus: {
      total: Object.keys(vehicleFleet).length,
      available: availableVehicles,
      utilization: Math.round(
        ((Object.keys(vehicleFleet).length - availableVehicles) /
          Object.keys(vehicleFleet).length) *
          100
      ),
    },
    lastOptimization: new Date(Date.now() - 2 * 60000).toISOString(),
    averageOptimizationTime: "650ms",
    requestsToday: 245,
  });
});

app.listen(5003, () => {
  logger.info("Swift Logistics ROS Cloud Mock Service started", {
    port: 5003,
    protocol: "RESTful API (Cloud-based)",
    endpoints: [
      "/optimize-route",
      "/vehicles",
      "/zones",
      "/track",
      "/health",
      "/status",
    ],
    deliveryZones: Object.keys(deliveryZones).length,
    vehicleFleet: Object.keys(vehicleFleet).length,
    environment: process.env.NODE_ENV || "development",
    apiVersion: "ROS_v4.1.2",
  });
});
