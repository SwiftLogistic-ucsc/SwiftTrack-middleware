import express from "express";
import { getLogger } from "@swifttrack/logger";

const logger = getLogger("cms-mock");
const app = express();
app.use(express.json());

// Mock client database for Swift Logistics
const clients = {
  "CLIENT-001": {
    name: "E-Commerce Giant LK",
    status: "ACTIVE",
    contractType: "PREMIUM",
    creditLimit: 500000,
    billingCycle: "MONTHLY",
    contractExpiry: "2025-12-31",
  },
  "CLIENT-002": {
    name: "Fashion Store Online",
    status: "ACTIVE",
    contractType: "STANDARD",
    creditLimit: 100000,
    billingCycle: "WEEKLY",
    contractExpiry: "2025-06-30",
  },
  "CLIENT-003": {
    name: "Electronics Hub",
    status: "SUSPENDED",
    contractType: "BASIC",
    creditLimit: 50000,
    billingCycle: "MONTHLY",
    contractExpiry: "2025-03-15",
  },
  "client-123": {
    name: "Test Client Demo",
    status: "ACTIVE",
    contractType: "STANDARD",
    creditLimit: 100000,
    billingCycle: "MONTHLY",
    contractExpiry: "2025-12-31",
  },
};

// Request logging middleware
app.use((req, res, next) => {
  logger.info(
    `CMS Legacy System - Incoming ${req.method} request to ${req.path}`,
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

// Simulate SOAP/XML endpoint for contract verification
app.post("/verify", async (req, res) => {
  const startTime = Date.now();
  const { orderId, clientId, packages, deliveryAddresses, priority } = req.body;

  console.log("=== CMS DEBUG INFO ===");
  console.log("Full request body:", JSON.stringify(req.body, null, 2));
  console.log("Extracted clientId:", clientId);
  console.log("ClientId type:", typeof clientId);
  console.log("ClientId length:", clientId?.length);
  console.log("Available clients:", Object.keys(clients));
  console.log("Client exists check:", !!clients[clientId]);
  console.log("Direct lookup result:", clients[clientId]);
  console.log("========================");

  logger.info(`CMS Legacy System - Processing contract verification`, {
    orderId,
    clientId,
    packageCount: packages?.length || 0,
    deliveryCount: deliveryAddresses?.length || 0,
    priority: priority || "STANDARD",
    incomingProtocol: req.get("X-Protocol-Adapter") || "NATIVE",
    soapAction: req.get("SOAPAction") || "DIRECT_CALL",
    availableClients: Object.keys(clients),
    clientExists: !!clients[clientId],
  });

  // Simulate legacy system processing delay (SOAP/XML overhead)
  const processingDelay = Math.random() * 400 + 200; // 200-600ms
  await new Promise((r) => setTimeout(r, processingDelay));

  const contractId = "SWFT-CTR-" + orderId + "-" + Date.now();

  // Check if client exists in legacy system
  const client = clients[clientId];
  if (!client) {
    logger.warn(`CMS Legacy System - Client not found`, {
      orderId,
      clientId,
      reason: "Client ID not in legacy CMS database",
    });
    return res.status(404).json({
      ok: false,
      message: "CMS Legacy: Client not found in system",
      error: "INVALID_CLIENT_ID",
      soapFault: "Client.InvalidClientId",
    });
  }

  // Check client status
  if (client.status !== "ACTIVE") {
    logger.warn(`CMS Legacy System - Client account suspended`, {
      orderId,
      clientId,
      clientStatus: client.status,
      reason: "Client account is not active",
    });
    return res.status(403).json({
      ok: false,
      message: "CMS Legacy: Client account suspended",
      error: "CLIENT_SUSPENDED",
      soapFault: "Client.AccountSuspended",
    });
  }

  // Check contract expiry
  const contractExpiry = new Date(client.contractExpiry);
  if (contractExpiry < new Date()) {
    logger.warn(`CMS Legacy System - Contract expired`, {
      orderId,
      clientId,
      contractExpiry: client.contractExpiry,
      reason: "Client contract has expired",
    });
    return res.status(403).json({
      ok: false,
      message: "CMS Legacy: Contract expired",
      error: "CONTRACT_EXPIRED",
      soapFault: "Contract.Expired",
    });
  }

  // Calculate estimated cost for credit limit check
  const basePackageCost = 250; // LKR per package
  const deliveryDistanceCost = deliveryAddresses?.length * 150 || 150; // LKR per delivery point
  const priorityCost = priority === "URGENT" ? 500 : 0;
  const estimatedCost =
    (packages?.length || 1) * basePackageCost +
    deliveryDistanceCost +
    priorityCost;

  // Check credit limit
  if (estimatedCost > client.creditLimit) {
    logger.warn(`CMS Legacy System - Credit limit exceeded`, {
      orderId,
      clientId,
      estimatedCost,
      creditLimit: client.creditLimit,
      reason: "Order cost exceeds client credit limit",
    });
    return res.status(402).json({
      ok: false,
      message: "CMS Legacy: Credit limit exceeded",
      error: "CREDIT_LIMIT_EXCEEDED",
      estimatedCost,
      creditLimit: client.creditLimit,
      soapFault: "Payment.InsufficientCredit",
    });
  }

  // Successful verification
  const duration = Date.now() - startTime;
  const response = {
    ok: true,
    message: "CMS Legacy: Contract verified successfully",
    contractId,
    clientDetails: {
      name: client.name,
      status: client.status,
      contractType: client.contractType,
      creditLimit: client.creditLimit,
      remainingCredit: client.creditLimit - estimatedCost,
      billingCycle: client.billingCycle,
    },
    billingStatus: "APPROVED",
    estimatedCost,
    verificationDetails: {
      verifiedAt: new Date().toISOString(),
      verificationMethod: "SOAP_XML_LEGACY",
      systemVersion: "CMS_v2.1.4",
      contractValidUntil: client.contractExpiry,
    },
  };

  logger.info(`CMS Legacy System - Contract verification successful`, {
    orderId,
    clientId,
    contractId,
    clientName: client.name,
    contractType: client.contractType,
    estimatedCost,
    remainingCredit: client.creditLimit - estimatedCost,
    duration,
  });

  // Simulate XML response format (but return JSON for simplicity)
  res.set("Content-Type", "application/json"); // In real SOAP, this would be application/soap+xml
  res.json(response);
});

// Legacy system health endpoint
app.get("/health", (req, res) => {
  logger.debug("CMS Legacy System - Health check endpoint called");
  res.json({
    status: "ok",
    service: "cms-legacy-mock",
    systemVersion: "CMS_v2.1.4",
    protocol: "SOAP/XML",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    clientCount: Object.keys(clients).length,
  });
});

// Legacy system status endpoint
app.get("/status", (req, res) => {
  logger.debug("CMS Legacy System - Status endpoint called");
  res.json({
    systemStatus: "OPERATIONAL",
    databaseConnection: "CONNECTED",
    soapService: "RUNNING",
    lastMaintenance: "2025-08-15T02:00:00Z",
    nextMaintenance: "2025-09-15T02:00:00Z",
    activeClients: Object.values(clients).filter((c) => c.status === "ACTIVE")
      .length,
    totalClients: Object.keys(clients).length,
  });
});

app.listen(5001, () => {
  logger.info("Swift Logistics CMS Legacy Mock Service started", {
    port: 5001,
    protocol: "SOAP/XML (simulated as REST)",
    endpoints: ["/verify", "/health", "/status"],
    clientsLoaded: Object.keys(clients).length,
    environment: process.env.NODE_ENV || "development",
    systemVersion: "CMS_v2.1.4",
  });
});
