#!/usr/bin/env node

/**
 * Asynchronous Order Processing Demo
 * Demonstrates the new async distributed transaction processing
 */

const axios = require("axios");

const ORDER_SERVICE_URL = "http://localhost:4000";

async function demonstrateAsyncProcessing() {
  console.log("🚀 SwiftTrack Asynchronous Order Processing Demo");
  console.log("================================================");
  console.log("");

  const orderId = `ASYNC-DEMO-${Date.now()}`;

  const testOrder = {
    id: orderId,
    clientId: "CLIENT-001",
    priority: "STANDARD",
    packages: [
      {
        sku: "ELECTRONICS-001",
        description: "Asynchronous Processing Test Package",
        quantity: 2,
        priority: "STANDARD",
      },
    ],
    deliveryAddresses: [
      "123 Async Street, Background Processing District, Colombo 07",
    ],
  };

  try {
    console.log("📦 Submitting order for asynchronous processing...");
    console.log(`   Order ID: ${orderId}`);
    console.log(`   Client: ${testOrder.clientId}`);
    console.log("");

    // Submit order
    const startTime = Date.now();
    const submitResponse = await axios.post(
      `${ORDER_SERVICE_URL}/api/orders`,
      testOrder
    );
    const submitDuration = Date.now() - startTime;

    console.log("✅ Order submitted successfully!");
    console.log(`   Response Time: ${submitDuration}ms (immediate response)`);
    console.log(`   Status: ${submitResponse.data.status}`);
    console.log(`   Processing Mode: ${submitResponse.data.processing.mode}`);
    console.log(
      `   Estimated Completion: ${submitResponse.data.processing.estimatedCompletion}`
    );
    console.log(
      `   Status Endpoint: ${submitResponse.data.processing.statusEndpoint}`
    );
    console.log("");

    // Poll for status updates
    console.log("🔍 Monitoring processing progress...");
    console.log("=====================================");

    let completed = false;
    let pollCount = 0;
    const maxPolls = 30; // Max 5 minutes of polling

    while (!completed && pollCount < maxPolls) {
      pollCount++;

      try {
        const statusResponse = await axios.get(
          `${ORDER_SERVICE_URL}/api/orders/${orderId}/status`
        );
        const status = statusResponse.data;

        const progressBar = createProgressBar(
          status.processing.progress.percentage
        );

        console.log(`Poll ${pollCount}: ${status.processing.currentStage}`);
        console.log(
          `   Progress: ${progressBar} ${status.processing.progress.percentage}%`
        );
        console.log(
          `   Completed Steps: ${status.processing.progress.completed}/${status.processing.progress.total}`
        );
        console.log(`   ETA: ${status.processing.estimatedCompletion}`);

        // Show step details
        status.steps.forEach((step) => {
          const statusIcon =
            step.status === "COMPLETED"
              ? "✅"
              : step.status === "IN_PROGRESS"
              ? "🔄"
              : "⏳";
          console.log(`   ${statusIcon} ${step.name}: ${step.status}`);
        });

        console.log("");

        if (status.status === "READY_FOR_DELIVERY") {
          completed = true;
          console.log("🎉 Order processing completed!");
          console.log("===============================");

          if (status.results.cms) {
            console.log(
              `✅ CMS: Contract ${status.results.cms.contractId} verified`
            );
          }
          if (status.results.wms) {
            console.log(
              `✅ WMS: Package ${status.results.wms.packageId} registered`
            );
          }
          if (status.results.ros) {
            console.log(
              `✅ ROS: Route ${status.results.ros.routeId} optimized`
            );
            console.log(
              `   Assigned Driver: ${status.results.ros.assignedDriver}`
            );
            console.log(
              `   Estimated Delivery: ${status.results.ros.estimatedDelivery}`
            );
          }

          const totalTime = Date.now() - startTime;
          console.log("");
          console.log(`⏱️  Total Processing Time: ${totalTime}ms`);
          console.log(`🔄  Distributed Transaction: Completed successfully`);
          console.log(`🛡️  Fault Tolerance: Enabled throughout process`);
        } else if (status.status === "FAILED") {
          console.log("❌ Order processing failed");
          console.log(`   Reason: ${status.error || "Unknown error"}`);
          completed = true;
        }

        if (!completed) {
          // Wait before next poll
          await new Promise((resolve) => setTimeout(resolve, 3000)); // 3 second intervals
        }
      } catch (statusError) {
        console.log(`❌ Error checking status: ${statusError.message}`);
        break;
      }
    }

    if (!completed && pollCount >= maxPolls) {
      console.log("⏰ Polling timeout reached. Order may still be processing.");
    }
  } catch (error) {
    console.log(`❌ Demo failed: ${error.message}`);

    if (error.response && error.response.data) {
      console.log(`   Server Error: ${error.response.data.error}`);
      console.log(`   Details: ${error.response.data.message}`);
    }
  }

  console.log("");
  console.log("🏁 Demo completed!");
  console.log("");
  console.log("Key Benefits Demonstrated:");
  console.log("• Immediate response to client (fast user experience)");
  console.log("• Background distributed transaction processing");
  console.log("• Real-time progress tracking via status polling");
  console.log("• Fault tolerance with automatic retry and compensation");
  console.log("• Eventual consistency across distributed services");
  console.log("• Non-blocking asynchronous architecture");
}

function createProgressBar(percentage) {
  const width = 20;
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

// Run the demo
demonstrateAsyncProcessing().catch(console.error);
