import axios from "axios";

/**
 * CMS Adapter - Handles SOAP/XML protocol translation for legacy CMS system
 * Converts REST/JSON requests to SOAP/XML format and vice versa
 */
export class CMSAdapter {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.soapNamespace = "http://swiftlogistics.lk/cms/v1";
    console.log(`CMS Adapter initialized for ${baseUrl}`);
  }

  /**
   * Convert order data to SOAP XML format for legacy CMS
   */
  convertToSoapXml(order) {
    const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:cms="${this.soapNamespace}">
  <soap:Header>
    <cms:Authentication>
      <cms:SystemId>SWIFTTRACK_MIDDLEWARE</cms:SystemId>
      <cms:Timestamp>${new Date().toISOString()}</cms:Timestamp>
    </cms:Authentication>
  </soap:Header>
  <soap:Body>
    <cms:VerifyContractRequest>
      <cms:OrderId>${order.id}</cms:OrderId>
      <cms:ClientId>${order.clientId}</cms:ClientId>
      <cms:Priority>${order.priority}</cms:Priority>
      <cms:PackageList>
        ${order.packages
          .map(
            (pkg) => `
        <cms:Package>
          <cms:SKU>${pkg.sku}</cms:SKU>
          <cms:Description>${pkg.description}</cms:Description>
          <cms:Quantity>${pkg.quantity}</cms:Quantity>
          <cms:Priority>${pkg.priority}</cms:Priority>
        </cms:Package>`
          )
          .join("")}
      </cms:PackageList>
      <cms:DeliveryAddresses>
        ${order.deliveryAddresses
          .map(
            (addr) => `
        <cms:Address>${addr}</cms:Address>`
          )
          .join("")}
      </cms:DeliveryAddresses>
    </cms:VerifyContractRequest>
  </soap:Body>
</soap:Envelope>`;

    return soapEnvelope;
  }

  /**
   * Parse SOAP XML response from legacy CMS
   */
  parseSoapXmlResponse(soapResponse) {
    console.log("CMS Adapter - Parsing SOAP XML response from legacy CMS", {
      responseLength: soapResponse.length,
      contentType: "application/soap+xml",
    });

    // For this mock, we're receiving JSON from our CMS service
    // In a real implementation, you'd use a proper XML parser
    try {
      const jsonResponse = JSON.parse(soapResponse);

      // Check if it's already a JSON response from our mock CMS
      if (jsonResponse.ok !== undefined) {
        return {
          ok: jsonResponse.ok,
          contractId: jsonResponse.contractId || `SWFT-CTR-${Date.now()}`,
          billingStatus: jsonResponse.billingStatus || "ACTIVE",
          creditLimit: jsonResponse.clientDetails?.creditLimit || 100000,
          protocol: "SOAP/XML",
          systemType: "LEGACY_CMS",
          clientDetails: jsonResponse.clientDetails,
          estimatedCost: jsonResponse.estimatedCost,
        };
      }
    } catch (e) {
      // If JSON parsing fails, fall back to XML parsing simulation
    }

    // Legacy XML parsing simulation for demonstration
    const isSuccess = soapResponse.includes("<cms:Status>SUCCESS</cms:Status>");
    const contractId = this.extractXmlValue(soapResponse, "cms:ContractId");
    const billingStatus = this.extractXmlValue(
      soapResponse,
      "cms:BillingStatus"
    );

    return {
      ok: isSuccess,
      contractId: contractId || `SWFT-CTR-${Date.now()}`,
      billingStatus: billingStatus || "ACTIVE",
      creditLimit: 100000,
      protocol: "SOAP/XML",
      systemType: "LEGACY_CMS",
    };
  }

  extractXmlValue(xml, tagName) {
    const regex = new RegExp(`<${tagName}>(.*?)</${tagName}>`);
    const match = xml.match(regex);
    return match ? match[1] : null;
  }

  /**
   * Main adapter method to handle CMS communication
   */
  async verifyContract(order) {
    const startTime = Date.now();

    console.log("CMS Adapter - Starting SOAP/XML protocol translation", {
      orderId: order.id,
      clientId: order.clientId,
      targetProtocol: "SOAP/XML",
      sourceProtocol: "REST/JSON",
    });

    try {
      // Step 1: Convert REST/JSON to SOAP/XML
      const soapXmlRequest = this.convertToSoapXml(order);

      console.log("CMS Adapter - Converted to SOAP XML format", {
        xmlLength: soapXmlRequest.length,
        namespace: this.soapNamespace,
        operation: "VerifyContractRequest",
      });

      // Step 2: Send SOAP request to legacy CMS (simulated as REST for demo)
      const { data } = await axios.post(`${this.baseUrl}/verify`, order, {
        headers: {
          "Content-Type": "application/json",
          SOAPAction: `${this.soapNamespace}/VerifyContract`,
          "X-Protocol-Adapter": "SOAP-TO-REST",
          "X-Legacy-System": "CMS-v2.1",
          "X-Original-Protocol": "SOAP/XML",
        },
      });

      // Step 3: Simulate SOAP XML response parsing
      const parsedResponse = this.parseSoapXmlResponse(JSON.stringify(data));

      const duration = Date.now() - startTime;

      console.log("CMS Adapter - SOAP/XML protocol translation completed", {
        orderId: order.id,
        duration,
        protocolConversion: "SOAP/XML ↔ REST/JSON",
        legacySystemResponse: "SUCCESS",
        adapterOverhead: `${duration}ms`,
      });

      return parsedResponse;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Extract detailed error information
      let detailedError = {
        service: "CMS",
        orderId: order.id,
        duration,
        protocolIssue: "SOAP/XML communication failure",
        originalError: error.message,
        errorType: "UNKNOWN",
        errorDetails: {},
        suggestedAction: "Contact system administrator",
      };

      // Parse specific error types from CMS response
      if (error.response && error.response.data) {
        const errorData = error.response.data;

        if (errorData.error && errorData.error.includes("Contract not found")) {
          detailedError.errorType = "CONTRACT_NOT_FOUND";
          detailedError.errorDetails = {
            reason: "No valid contract found for client",
            clientId: order.clientId,
            contractStatus: errorData.contractStatus || "NOT_FOUND",
            availableContracts: errorData.availableContracts || [],
          };
          detailedError.suggestedAction =
            "Verify client has active contract or create new contract";
        } else if (
          errorData.error &&
          errorData.error.includes("Credit limit exceeded")
        ) {
          detailedError.errorType = "CREDIT_LIMIT_EXCEEDED";
          detailedError.errorDetails = {
            reason: "Client has exceeded credit limit",
            currentCredit: errorData.currentCredit || "Unknown",
            creditLimit: errorData.creditLimit || "Unknown",
            outstandingAmount: errorData.outstandingAmount || "Unknown",
            estimatedOrderCost: errorData.estimatedCost || "Unknown",
          };
          detailedError.suggestedAction =
            "Process payment or request credit limit increase";
        } else if (
          errorData.error &&
          errorData.error.includes("Client suspended")
        ) {
          detailedError.errorType = "CLIENT_SUSPENDED";
          detailedError.errorDetails = {
            reason: "Client account is suspended",
            suspensionReason: errorData.suspensionReason || "Payment overdue",
            suspendedDate: errorData.suspendedDate || "Unknown",
            reactivationRequirements: errorData.reactivationRequirements || [],
          };
          detailedError.suggestedAction =
            "Contact accounts department to reactivate client";
        }
      } else if (error.message.includes("401")) {
        detailedError.errorType = "AUTHENTICATION_FAILED";
        detailedError.errorDetails = {
          reason: "CMS authentication failed",
          statusCode: 401,
          authMethod: "SOAP Security Token",
        };
        detailedError.suggestedAction = "Check CMS authentication credentials";
      } else if (
        error.message.includes("timeout") ||
        error.message.includes("ECONNREFUSED")
      ) {
        detailedError.errorType = "CONNECTION_FAILURE";
        detailedError.errorDetails = {
          reason: "CMS service is temporarily unavailable",
          connectionAttempts: 1,
          lastAttempt: new Date().toISOString(),
        };
        detailedError.suggestedAction =
          "Service will retry automatically. Check CMS service health if issue persists";
      }

      console.error(
        "CMS Adapter - SOAP/XML protocol translation failed",
        detailedError
      );

      // Create enhanced error message
      const enhancedError = new Error(
        `CMS Service Error [${detailedError.errorType}]: ${
          detailedError.errorDetails.reason || error.message
        }`
      );
      enhancedError.serviceError = detailedError;
      enhancedError.errorType = detailedError.errorType;
      enhancedError.suggestedAction = detailedError.suggestedAction;
      enhancedError.clientId = order.clientId;

      throw enhancedError;
    }
  }
}
