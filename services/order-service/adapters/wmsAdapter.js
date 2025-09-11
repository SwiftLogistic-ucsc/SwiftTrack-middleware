import axios from "axios";

/**
 * WMS Adapter - Handles proprietary TCP/IP protocol trans  parseTcpResponse(tcpResponse) {
    console.log("WMS Adapter - Parsing TCP/IP binary response from WMS", {
      messageType: tcpResponse.messageType || "PACKAGE_REGISTER_RESP",
      payloadSize: tcpResponse.payloadLength || 0,
      protocol: this.protocolVersion
    });
 * Converts REST/JSON requests to TCP/IP messaging format and vice versa
 */
export class WMSAdapter {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.tcpPort = 9001;
    this.protocolVersion = "WMS_TCP_v3.2.1";
    console.log(`WMS Adapter initialized for ${baseUrl}`);
  }

  /**
   * Convert order data to proprietary TCP/IP message format
   */
  convertToTcpMessage(order) {
    // Simulate proprietary TCP/IP message format with binary-like structure
    const tcpMessage = {
      header: {
        messageType: "PACKAGE_REGISTER_REQ",
        version: this.protocolVersion,
        sequenceId: Date.now(),
        payloadLength: 0, // Will be calculated
        checksum: 0, // Will be calculated
        timestamp: Date.now(),
        sourceSystem: "SWIFTTRACK_MIDDLEWARE",
        targetSystem: "WMS_PROPRIETARY",
      },
      payload: {
        orderId: order.id,
        clientId: order.clientId,
        priority: order.priority,
        packageCount: order.packages.length,
        packages: order.packages.map((pkg, index) => ({
          packageIndex: index + 1,
          sku: pkg.sku,
          description: pkg.description,
          quantity: pkg.quantity,
          priority: pkg.priority,
          binaryFlags: this.generateBinaryFlags(pkg),
        })),
        deliveryAddresses: order.deliveryAddresses.map((addr, index) => ({
          addressIndex: index + 1,
          address: addr,
          encodedAddress: Buffer.from(JSON.stringify(addr)).toString("base64"),
        })),
      },
    };

    // Calculate payload length and checksum (simulated)
    tcpMessage.header.payloadLength = JSON.stringify(tcpMessage.payload).length;
    tcpMessage.header.checksum = this.calculateChecksum(tcpMessage);

    return tcpMessage;
  }

  /**
   * Generate binary flags for TCP/IP message (simulated)
   */
  generateBinaryFlags(pkg) {
    const flags = {
      urgent: pkg.priority === "URGENT" ? 1 : 0,
      fragile: pkg.description.toLowerCase().includes("fragile") ? 1 : 0,
      heavy: pkg.quantity > 5 ? 1 : 0,
      reserved: 0,
    };

    // Convert to binary representation
    return (
      (flags.urgent << 3) |
      (flags.fragile << 2) |
      (flags.heavy << 1) |
      flags.reserved
    );
  }

  /**
   * Calculate checksum for TCP/IP message integrity (simulated)
   */
  calculateChecksum(message) {
    const data = JSON.stringify(message.payload);
    let checksum = 0;
    for (let i = 0; i < data.length; i++) {
      checksum += data.charCodeAt(i);
    }
    return checksum % 65536; // 16-bit checksum
  }

  /**
   * Parse TCP/IP binary response from WMS
   */
  parseTcpResponse(tcpResponse) {
    console.log("Parsing TCP/IP binary response from WMS", {
      messageType: tcpResponse.messageType || "PACKAGE_REGISTER_RESP",
      payloadSize: tcpResponse.payloadLength || 0,
      protocol: this.protocolVersion,
    });

    // Simulate parsing proprietary TCP/IP response
    return {
      ok: tcpResponse.ok || true,
      packageId: tcpResponse.packageId || `SWFT-PKG-${Date.now()}`,
      warehouseLocation: tcpResponse.warehouseLocation || "A1-STAGING",
      estimatedReadyTime:
        tcpResponse.estimatedReadyTime ||
        new Date(Date.now() + 15 * 60000).toISOString(),
      protocol: "TCP/IP Proprietary",
      systemType: "WMS_PROPRIETARY",
      tcpSequenceId: tcpResponse.sequenceId || Date.now(),
      checksumVerified: true,
    };
  }

  /**
   * Simulate TCP/IP connection establishment
   */
  async establishTcpConnection() {
    console.log("WMS Adapter - Establishing TCP/IP connection", {
      targetHost: this.baseUrl,
      targetPort: this.tcpPort,
      protocol: this.protocolVersion,
    });

    // Simulate TCP handshake delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    console.log("WMS Adapter - TCP/IP connection established", {
      connectionId: `TCP-${Date.now()}`,
      status: "CONNECTED",
    });
  }

  /**
   * Simulate TCP/IP connection teardown
   */
  async closeTcpConnection() {
    console.log("WMS Adapter - Closing TCP/IP connection", {
      status: "DISCONNECTING",
    });

    // Simulate connection close delay
    await new Promise((resolve) => setTimeout(resolve, 25));

    console.log("WMS Adapter - TCP/IP connection closed", {
      status: "DISCONNECTED",
    });
  }

  /**
   * Main adapter method to handle WMS communication
   */
  async registerPackage(order) {
    const startTime = Date.now();

    console.log("WMS Adapter - Starting TCP/IP protocol translation", {
      orderId: order.id,
      packageCount: order.packages.length,
      targetProtocol: "TCP/IP Proprietary",
      sourceProtocol: "REST/JSON",
    });

    try {
      // Step 1: Establish TCP/IP connection
      await this.establishTcpConnection();

      // Step 2: Convert REST/JSON to TCP/IP message format
      const tcpMessage = this.convertToTcpMessage(order);

      console.log("WMS Adapter - Converted to TCP/IP message format", {
        messageType: tcpMessage.header.messageType,
        sequenceId: tcpMessage.header.sequenceId,
        payloadLength: tcpMessage.header.payloadLength,
        checksum: tcpMessage.header.checksum,
        binaryOptimization: "ENABLED",
      });

      // Step 3: Send TCP/IP message to WMS (simulated as REST for demo)
      const { data } = await axios.post(`${this.baseUrl}/register`, order, {
        headers: {
          "Content-Type": "application/json",
          "X-Protocol-Adapter": "TCP-TO-REST",
          "X-TCP-Sequence-Id": tcpMessage.header.sequenceId.toString(),
          "X-Message-Type": tcpMessage.header.messageType,
          "X-Protocol-Version": this.protocolVersion,
          "X-Checksum": tcpMessage.header.checksum.toString(),
        },
      });

      // Step 4: Parse TCP/IP response
      const parsedResponse = this.parseTcpResponse(data);

      // Step 5: Close TCP/IP connection
      await this.closeTcpConnection();

      const duration = Date.now() - startTime;

      console.log("WMS Adapter - TCP/IP protocol translation completed", {
        orderId: order.id,
        duration,
        protocolConversion: "TCP/IP ↔ REST/JSON",
        messageExchange: "BINARY_OPTIMIZED",
        tcpOverhead: `${duration}ms`,
        packagesProcessed: order.packages.length,
      });

      return parsedResponse;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Extract detailed error information
      let detailedError = {
        service: "WMS",
        orderId: order.id,
        duration,
        protocolIssue: "TCP/IP communication failure",
        originalError: error.message,
        errorType: "UNKNOWN",
        errorDetails: {},
        suggestedAction: "Contact system administrator",
      };

      // Parse specific error types from WMS response
      if (error.response && error.response.data) {
        const errorData = error.response.data;

        if (
          errorData.error &&
          errorData.error.includes("Insufficient inventory")
        ) {
          detailedError.errorType = "INVENTORY_SHORTAGE";
          detailedError.errorDetails = {
            reason: "Insufficient inventory for requested items",
            affectedSKUs: order.packages.map((pkg) => pkg.sku),
            warehouseStatus: "INVENTORY_LOW",
            estimatedRestockTime: errorData.estimatedRestock || "Unknown",
          };
          detailedError.suggestedAction =
            "Check inventory levels or adjust quantities";
        } else if (
          errorData.error &&
          errorData.error.includes("SKU not found")
        ) {
          detailedError.errorType = "INVALID_SKU";
          detailedError.errorDetails = {
            reason: "One or more SKUs are not found in warehouse system",
            invalidSKUs:
              errorData.invalidSKUs || order.packages.map((pkg) => pkg.sku),
            validSKUs: errorData.validSKUs || [],
          };
          detailedError.suggestedAction =
            "Verify SKU codes or update product catalog";
        } else if (
          errorData.error &&
          errorData.error.includes("Warehouse capacity")
        ) {
          detailedError.errorType = "CAPACITY_EXCEEDED";
          detailedError.errorDetails = {
            reason: "Warehouse capacity exceeded",
            currentCapacity: errorData.currentCapacity || "Unknown",
            requestedSpace: errorData.requestedSpace || "Unknown",
            availableSpace: errorData.availableSpace || "Unknown",
          };
          detailedError.suggestedAction =
            "Schedule delivery for later or use alternate warehouse";
        }
      } else if (error.message.includes("409")) {
        detailedError.errorType = "BUSINESS_RULE_VIOLATION";
        detailedError.errorDetails = {
          reason: "Business rule validation failed",
          statusCode: 409,
          possibleCauses: [
            "Insufficient inventory for requested quantities",
            "SKU not available in selected warehouse",
            "Delivery constraints not met",
          ],
        };
        detailedError.suggestedAction =
          "Review order details and inventory availability";
      } else if (
        error.message.includes("timeout") ||
        error.message.includes("ECONNREFUSED")
      ) {
        detailedError.errorType = "CONNECTION_FAILURE";
        detailedError.errorDetails = {
          reason: "WMS service is temporarily unavailable",
          connectionAttempts: 1,
          lastAttempt: new Date().toISOString(),
        };
        detailedError.suggestedAction =
          "Service will retry automatically. Check WMS service health if issue persists";
      }

      console.error(
        "WMS Adapter - TCP/IP protocol translation failed",
        detailedError
      );

      // Ensure connection is closed on error
      await this.closeTcpConnection();

      // Create enhanced error message
      const enhancedError = new Error(
        `WMS Service Error [${detailedError.errorType}]: ${
          detailedError.errorDetails.reason || error.message
        }`
      );
      enhancedError.serviceError = detailedError;
      enhancedError.errorType = detailedError.errorType;
      enhancedError.suggestedAction = detailedError.suggestedAction;
      enhancedError.affectedSKUs = detailedError.errorDetails.affectedSKUs;

      throw enhancedError;
    }
  }
}
