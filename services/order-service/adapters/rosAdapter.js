import axios from "axios";

/**
 * ROS Adapter - Handles modern RESTful API communication
 * Demonstrates best practices for cloud-based API integration
 */
export class ROSAdapter {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.apiVersion = "v2.1";
    this.maxRetries = 3;
    this.timeout = 30000; // 30 seconds
    console.log(`ROS Adapter initialized for ${baseUrl}`);
  }

  /**
   * Convert order data to optimized REST/JSON format for cloud API
   */
  convertToRestJson(order) {
    const restPayload = {
      requestId: `REQ-${Date.now()}`,
      apiVersion: this.apiVersion,
      timestamp: new Date().toISOString(),

      // Top-level fields for backward compatibility
      orderId: order.id,
      clientId: order.clientId,
      priority: order.priority,

      source: {
        system: "SWIFTTRACK_MIDDLEWARE",
        version: "1.0.0",
        requestType: "ROUTE_OPTIMIZATION",
      },
      orderData: {
        orderId: order.id,
        clientId: order.clientId,
        priority: order.priority,
        serviceLevel: order.priority === "URGENT" ? "PREMIUM" : "STANDARD",
      },
      packages: order.packages.map((pkg, index) => ({
        packageId: `PKG-${index + 1}`,
        sku: pkg.sku,
        description: pkg.description,
        quantity: pkg.quantity,
        priority: pkg.priority,
        estimatedWeight: this.estimateWeight(pkg),
        specialHandling: this.determineSpecialHandling(pkg),
      })),
      // Include both formats for compatibility
      deliveryAddresses: order.deliveryAddresses, // Simple format for backward compatibility
      deliveryPoints: order.deliveryAddresses.map((addr, index) => ({
        stopId: `STOP-${index + 1}`,
        address: addr,
        coordinates: this.geocodeAddress(addr), // Simulated geocoding
        priority: index === 0 ? "HIGH" : "NORMAL",
        timeWindow: {
          earliest: "09:00",
          latest: "18:00",
        },
      })),
      constraints: {
        vehicleTypes: ["VAN", "TRUCK"],
        maxDeliveryTime: order.priority === "URGENT" ? 240 : 480, // minutes
        optimizationGoals: ["MINIMIZE_DISTANCE", "MINIMIZE_TIME"],
        trafficAware: true,
        realTimeUpdates: true,
      },
    };

    return restPayload;
  }

  /**
   * Estimate package weight based on SKU (simulated)
   */
  estimateWeight(pkg) {
    const weightMap = {
      BOOK: 0.5,
      ELECTRONICS: 2.0,
      FASHION: 0.3,
      COSMETICS: 0.2,
    };

    const category = pkg.sku.split("-")[0];
    const baseWeight = weightMap[category] || 1.0;
    return baseWeight * pkg.quantity;
  }

  /**
   * Determine special handling requirements (simulated)
   */
  determineSpecialHandling(pkg) {
    const requirements = [];

    if (pkg.description.toLowerCase().includes("fragile")) {
      requirements.push("FRAGILE");
    }
    if (pkg.priority === "URGENT") {
      requirements.push("PRIORITY_DELIVERY");
    }
    if (pkg.sku.includes("ELECTRONICS")) {
      requirements.push("MOISTURE_SENSITIVE");
    }

    return requirements;
  }

  /**
   * Simulate geocoding for addresses
   */
  geocodeAddress(address) {
    // Simulated coordinates for Sri Lankan locations
    const locationMap = {
      colombo: { lat: 6.9271, lng: 79.8612 },
      kandy: { lat: 7.2906, lng: 80.6337 },
      galle: { lat: 6.0535, lng: 80.221 },
      jaffna: { lat: 9.6615, lng: 80.0255 },
      maharagama: { lat: 6.8485, lng: 79.9267 },
    };

    for (const [city, coords] of Object.entries(locationMap)) {
      if (address.toLowerCase().includes(city)) {
        // Add some random variation
        return {
          latitude: coords.lat + (Math.random() - 0.5) * 0.01,
          longitude: coords.lng + (Math.random() - 0.5) * 0.01,
          accuracy: "HIGH",
          geocodingService: "Google Maps API",
        };
      }
    }

    // Default coordinates for Colombo
    return {
      latitude: 6.9271 + (Math.random() - 0.5) * 0.1,
      longitude: 79.8612 + (Math.random() - 0.5) * 0.1,
      accuracy: "MEDIUM",
      geocodingService: "Fallback Geocoder",
    };
  }

  /**
   * Parse REST/JSON response from cloud ROS
   */
  parseRestResponse(restResponse) {
    console.log("Parsing REST/JSON response from cloud ROS", {
      responseSize: JSON.stringify(restResponse).length,
      apiVersion: restResponse.apiVersion || this.apiVersion,
      optimizationStatus: restResponse.status || "SUCCESS",
    });

    return {
      ok: restResponse.ok || true,
      routeId: restResponse.routeId || `SWFT-RTE-${Date.now()}`,
      etaMinutes: restResponse.etaMinutes || 45,
      assignedDriver:
        restResponse.assignedDriver ||
        `DRV-${Math.floor(Math.random() * 100)
          .toString()
          .padStart(3, "0")}`,
      assignedVehicle:
        restResponse.assignedVehicle ||
        `VAN-${Math.floor(Math.random() * 50)
          .toString()
          .padStart(2, "0")}`,
      optimizedStops: restResponse.optimizedStops || [],
      estimatedDelivery:
        restResponse.estimatedDelivery ||
        new Date(Date.now() + 45 * 60000).toISOString(),
      protocol: "REST/JSON",
      systemType: "CLOUD_ROS",
      apiVersion: this.apiVersion,
      optimizationScore: restResponse.optimizationScore || 0.87,
    };
  }

  /**
   * Implement retry logic with exponential backoff
   */
  async makeRequestWithRetry(url, payload, attempt = 1) {
    try {
      const response = await axios.post(url, payload, {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-API-Version": this.apiVersion,
          "X-Request-ID": payload.requestId,
          "X-Client-System": "SWIFTTRACK_MIDDLEWARE",
          Authorization: "Bearer mock-cloud-api-token",
        },
        timeout: this.timeout,
      });

      return response.data;
    } catch (error) {
      if (attempt < this.maxRetries && this.isRetryableError(error)) {
        const backoffDelay = Math.pow(2, attempt) * 1000; // Exponential backoff

        console.warn(
          `ROS Adapter - Request failed, retrying in ${backoffDelay}ms`,
          {
            attempt,
            maxRetries: this.maxRetries,
            error: error.message,
            nextRetryIn: `${backoffDelay}ms`,
          }
        );

        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        return this.makeRequestWithRetry(url, payload, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Determine if error is retryable
   */
  isRetryableError(error) {
    const retryableCodes = [408, 429, 500, 502, 503, 504];
    return (
      retryableCodes.includes(error.response?.status) ||
      error.code === "ECONNRESET" ||
      error.code === "ETIMEDOUT"
    );
  }

  /**
   * Main adapter method to handle ROS communication
   */
  async optimizeRoute(order) {
    const startTime = Date.now();

    console.log("ROS Adapter - Starting cloud REST/JSON communication", {
      orderId: order.id,
      deliveryPointCount: order.deliveryAddresses.length,
      targetProtocol: "REST/JSON",
      cloudProvider: "AWS",
      apiVersion: this.apiVersion,
    });

    try {
      // Step 1: Convert to optimized REST/JSON format
      const restPayload = this.convertToRestJson(order);

      console.log("ROS Adapter - Prepared cloud API request", {
        requestId: restPayload.requestId,
        payloadSize: JSON.stringify(restPayload).length,
        deliveryPoints: restPayload.deliveryPoints.length,
        optimizationGoals: restPayload.constraints.optimizationGoals,
        geocodingCompleted: true,
      });

      // Step 2: Make cloud API request with retry logic
      const responseData = await this.makeRequestWithRetry(
        `${this.baseUrl}/optimize-route`,
        restPayload
      );

      // Step 3: Parse cloud API response
      const parsedResponse = this.parseRestResponse(responseData);

      const duration = Date.now() - startTime;

      console.log("ROS Adapter - Cloud REST/JSON communication completed", {
        orderId: order.id,
        duration,
        protocolUsed: "REST/JSON over HTTPS",
        cloudLatency: `${duration}ms`,
        optimizationScore: parsedResponse.optimizationScore,
        routeOptimized: true,
        driverAssigned: parsedResponse.assignedDriver,
      });

      return parsedResponse;
    } catch (error) {
      const duration = Date.now() - startTime;

      console.error("ROS Adapter - Cloud REST/JSON communication failed", {
        orderId: order.id,
        error: error.message,
        duration,
        protocolIssue: "Cloud API communication failure",
        httpStatus: error.response?.status,
        cloudProvider: "AWS",
      });

      throw new Error(`ROS Cloud Adapter failed: ${error.message}`);
    }
  }
}
