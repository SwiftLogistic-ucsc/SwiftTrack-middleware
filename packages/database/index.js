import pg from "pg";
const { Pool } = pg;

/**
 * SwiftTrack Database Client
 * Provides connection pooling and query utilities for PostgreSQL database
 */
export class DatabaseClient {
  constructor(connectionString) {
    this.pool = new Pool({
      connectionString: connectionString || process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on("error", (err) => {
      console.error("Unexpected error on idle client", err);
    });
  }

  /**
   * Execute a query with parameters
   */
  async query(text, params = []) {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      console.log("Database query executed", {
        query: text.substring(0, 100) + "...",
        duration,
        rows: result.rowCount,
      });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      console.error("Database query failed", {
        query: text.substring(0, 100) + "...",
        duration,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Execute a transaction
   */
  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Close the connection pool
   */
  async close() {
    await this.pool.end();
  }

  /**
   * Test database connection
   */
  async testConnection() {
    try {
      const result = await this.query("SELECT NOW() as current_time");
      return { connected: true, timestamp: result.rows[0].current_time };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }
}

/**
 * Order Repository - handles all order-related database operations
 */
export class OrderRepository {
  constructor(dbClient) {
    this.db = dbClient;
  }

  /**
   * Create a new order with packages and delivery addresses
   */
  async createOrder(orderData) {
    return await this.db.transaction(async (client) => {
      console.log("=== DATABASE DEBUG - ORDER CREATION ===");
      console.log("Order Data:", JSON.stringify(orderData, null, 2));

      // Insert order
      const orderQuery = `
        INSERT INTO orders (id, client_id, status, priority, total_packages, total_delivery_addresses)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      const orderParams = [
        orderData.id,
        orderData.clientId,
        "SUBMITTED",
        orderData.priority || "STANDARD",
        orderData.packages.length,
        orderData.deliveryAddresses.length,
      ];

      console.log(
        "Order params:",
        orderParams.map((p, i) => `${i}: ${typeof p} = ${JSON.stringify(p)}`)
      );

      const orderResult = await client.query(orderQuery, orderParams);

      // Insert packages
      console.log("=== INSERTING PACKAGES ===");
      for (const pkg of orderData.packages) {
        console.log("Package data:", JSON.stringify(pkg, null, 2));

        // Convert dimensions object to string format if needed
        let dimensionsString = null;
        if (pkg.dimensions && typeof pkg.dimensions === "object") {
          const { length, width, height } = pkg.dimensions;
          if (length && width && height) {
            dimensionsString = `${length} x ${width} x ${height}`;
          }
        } else if (typeof pkg.dimensions === "string") {
          dimensionsString = pkg.dimensions;
        }

        const packageParams = [
          orderData.id,
          pkg.sku,
          pkg.description,
          pkg.quantity,
          pkg.priority || "STANDARD",
          pkg.weight || 1.0,
          dimensionsString,
        ];

        console.log(
          "Package params:",
          packageParams.map(
            (p, i) => `${i}: ${typeof p} = ${JSON.stringify(p)}`
          )
        );

        await client.query(
          `
          INSERT INTO packages (order_id, sku, description, quantity, priority, weight_kg, dimensions_cm)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
          packageParams
        );
      }

      // Insert delivery addresses
      for (let i = 0; i < orderData.deliveryAddresses.length; i++) {
        const addr = orderData.deliveryAddresses[i];

        // Convert address object to string if needed
        let addressString;
        if (typeof addr === "string") {
          addressString = addr;
        } else if (addr && typeof addr === "object") {
          addressString = `${addr.street || ""}, ${addr.city || ""}, ${
            addr.postalCode || ""
          }, ${addr.country || ""}`
            .replace(/,\s*,/g, ",")
            .replace(/^,\s*|,\s*$/g, "");
        } else {
          addressString = "Unknown Address";
        }

        await client.query(
          `
          INSERT INTO delivery_addresses (order_id, address, stop_sequence, special_instructions, latitude, longitude)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
          [
            orderData.id,
            addressString,
            i + 1,
            orderData.specialInstructions || null,
            addr && typeof addr === "object" ? addr.latitude || null : null,
            addr && typeof addr === "object" ? addr.longitude || null : null,
          ]
        );
      }

      // Insert order event
      await client.query(
        `
        INSERT INTO order_events (order_id, event_type, event_data, source_service)
        VALUES ($1, $2, $3, $4)
      `,
        [
          orderData.id,
          "ORDER_SUBMITTED",
          JSON.stringify({ status: "SUBMITTED", timestamp: new Date() }),
          "order-service",
        ]
      );

      return orderResult.rows[0];
    });
  }

  /**
   * Update order status and stage-specific data
   */
  async updateOrderStatus(orderId, status, updateData = {}) {
    console.log(`=== UPDATE ORDER STATUS: ${status} ===`);
    console.log("Update Data:", JSON.stringify(updateData, null, 2));

    let updateFields = ["status = $2", "updated_at = NOW()"];
    let values = [orderId, status];
    let paramIndex = 3;

    // Add stage-specific updates
    if (status === "CMS_VERIFIED" && updateData.cms) {
      console.log("=== CMS UPDATE DEBUG ===");
      updateFields.push(`contract_id = $${paramIndex++}`);
      updateFields.push(`billing_status = $${paramIndex++}`);
      updateFields.push(`estimated_cost = $${paramIndex++}`);
      updateFields.push(`cms_verified_at = NOW()`);
      const cmsValues = [
        updateData.cms.contractId,
        updateData.cms.billingStatus,
        updateData.cms.estimatedCost,
      ];
      console.log(
        "CMS Values:",
        cmsValues.map((v, i) => `${i}: ${typeof v} = ${JSON.stringify(v)}`)
      );
      values.push(...cmsValues);
    }

    if (status === "WMS_REGISTERED" && updateData.wms) {
      console.log("=== WMS UPDATE DEBUG ===");
      updateFields.push(`warehouse_package_id = $${paramIndex++}`);
      updateFields.push(`warehouse_location = $${paramIndex++}`);
      updateFields.push(`estimated_ready_time = $${paramIndex++}`);
      updateFields.push(`wms_registered_at = NOW()`);
      const wmsValues = [
        updateData.wms.packageId,
        updateData.wms.warehouseLocation,
        updateData.wms.estimatedReadyTime,
      ];
      console.log(
        "WMS Values:",
        wmsValues.map((v, i) => `${i}: ${typeof v} = ${JSON.stringify(v)}`)
      );
      values.push(...wmsValues);
    }

    if (status === "ROS_OPTIMIZED" && updateData.ros) {
      updateFields.push(`route_id = $${paramIndex++}`);
      updateFields.push(`assigned_driver_id = $${paramIndex++}`);
      updateFields.push(`assigned_vehicle_id = $${paramIndex++}`);
      updateFields.push(`optimized_stops = $${paramIndex++}`);
      updateFields.push(`estimated_delivery_time = $${paramIndex++}`);
      updateFields.push(`eta_minutes = $${paramIndex++}`);
      updateFields.push(`ros_optimized_at = NOW()`);

      // Convert optimizedStops array to count if it's an array
      let optimizedStopsCount = updateData.ros.optimizedStops;
      if (Array.isArray(optimizedStopsCount)) {
        optimizedStopsCount = optimizedStopsCount.length;
      }

      console.log("=== ROS UPDATE DEBUG ===");
      console.log("ROS Update Data:", JSON.stringify(updateData.ros, null, 2));
      console.log(
        "optimizedStopsCount:",
        optimizedStopsCount,
        typeof optimizedStopsCount
      );
      console.log(
        "etaMinutes:",
        updateData.ros.etaMinutes,
        typeof updateData.ros.etaMinutes
      );

      const rosValues = [
        updateData.ros.routeId,
        updateData.ros.assignedDriver,
        updateData.ros.assignedVehicle,
        optimizedStopsCount,
        updateData.ros.estimatedDelivery,
        updateData.ros.etaMinutes,
      ];

      console.log(
        "ROS values:",
        rosValues.map((v, i) => `${i}: ${typeof v} = ${JSON.stringify(v)}`)
      );

      values.push(...rosValues);
    }
    if (status === "READY_FOR_DELIVERY") {
      updateFields.push(`ready_for_delivery_at = NOW()`);
    }

    const query = `UPDATE orders SET ${updateFields.join(
      ", "
    )} WHERE id = $1 RETURNING *`;

    console.log("=== FINAL SQL EXECUTION DEBUG ===");
    console.log("Query:", query);
    console.log(
      "Values:",
      values.map((v, i) => `${i}: ${typeof v} = ${JSON.stringify(v)}`)
    );

    const result = await this.db.query(query, values);

    // Insert order event
    await this.db.query(
      `
      INSERT INTO order_events (order_id, event_type, event_data, source_service)
      VALUES ($1, $2, $3, $4)
    `,
      [
        orderId,
        `ORDER_${status}`,
        JSON.stringify({ status, ...updateData, timestamp: new Date() }),
        "order-service",
      ]
    );

    return result.rows[0];
  }

  /**
   * Get order by ID with all related data
   */
  async getOrderById(orderId) {
    const orderQuery = `
      SELECT o.*, c.name as client_name, c.contract_type, c.credit_limit
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      WHERE o.id = $1
    `;
    const orderResult = await this.db.query(orderQuery, [orderId]);

    if (orderResult.rows.length === 0) {
      return null;
    }

    const order = orderResult.rows[0];

    // Get packages
    const packagesResult = await this.db.query(
      "SELECT * FROM packages WHERE order_id = $1 ORDER BY created_at",
      [orderId]
    );

    // Get delivery addresses
    const addressesResult = await this.db.query(
      "SELECT * FROM delivery_addresses WHERE order_id = $1 ORDER BY stop_sequence",
      [orderId]
    );

    return {
      ...order,
      packages: packagesResult.rows,
      deliveryAddresses: addressesResult.rows,
    };
  }

  /**
   * Get all orders with basic client information
   */
  async getAllOrders() {
    const query = `
      SELECT o.*, c.name as client_name
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      ORDER BY o.created_at DESC
    `;
    const result = await this.db.query(query);
    return result.rows;
  }

  /**
   * Get order events/audit trail for a specific order
   */
  async getOrderEvents(orderId) {
    const query = `
      SELECT * FROM order_events 
      WHERE order_id = $1 
      ORDER BY created_at ASC
    `;
    const result = await this.db.query(query, [orderId]);
    return result.rows;
  }

  /**
   * Get orders for a specific driver
   */
  async getOrdersForDriver(driverId, date = null) {
    const dateFilter = date || new Date().toISOString().split("T")[0];

    const query = `
      SELECT DISTINCT o.*, c.name as client_name,
             dm.id as manifest_id, dm.route_id, dm.status as manifest_status,
             ds.id as stop_id, ds.stop_sequence, ds.status as delivery_status,
             ds.customer_name, ds.delivery_notes
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      JOIN delivery_manifests dm ON o.assigned_driver_id = dm.driver_id
      JOIN delivery_stops ds ON ds.order_id = o.id AND ds.manifest_id = dm.id
      WHERE o.assigned_driver_id = $1 
        AND dm.manifest_date = $2
        AND o.status IN ('READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY')
      ORDER BY ds.stop_sequence
    `;

    const result = await this.db.query(query, [driverId, dateFilter]);
    return result.rows;
  }
}

/**
 * Driver Repository - handles driver-related database operations
 */
export class DriverRepository {
  constructor(dbClient) {
    this.db = dbClient;
  }

  /**
   * Get driver by ID
   */
  async getDriverById(driverId) {
    const result = await this.db.query("SELECT * FROM drivers WHERE id = $1", [
      driverId,
    ]);
    return result.rows[0] || null;
  }

  /**
   * Update driver location
   */
  async updateDriverLocation(driverId, latitude, longitude) {
    const result = await this.db.query(
      `
      UPDATE drivers 
      SET current_latitude = $2, current_longitude = $3, location_updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
      [driverId, latitude, longitude]
    );

    return result.rows[0];
  }

  /**
   * Get driver's delivery manifest for a specific date
   */
  async getDriverManifest(driverId, date = null) {
    const dateFilter = date || new Date().toISOString().split("T")[0];

    console.log(
      `getDriverManifest called with driverId: ${driverId}, date: ${dateFilter}`
    );

    // Query orders directly assigned to this driver
    const ordersQuery = `
      SELECT o.id, o.client_id, o.status, o.priority, o.estimated_delivery_time, 
             o.route_id, o.assigned_driver_id, o.assigned_vehicle_id, o.created_at,
             c.name as client_name
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE o.assigned_driver_id = $1 
        AND DATE(o.created_at) = $2
        AND o.status IN ('READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY')
      ORDER BY o.created_at
    `;

    console.log(`Executing query: ${ordersQuery}`);
    console.log(`With parameters: [${driverId}, ${dateFilter}]`);

    const ordersResult = await this.db.query(ordersQuery, [
      driverId,
      dateFilter,
    ]);

    console.log(`Query returned ${ordersResult.rows.length} orders`);

    if (ordersResult.rows.length === 0) {
      console.log(`No orders found for driver ${driverId} on ${dateFilter}`);
      return null;
    }

    // Get packages and delivery addresses for each order
    const manifest = {
      driverId,
      manifest_date: dateFilter,
      total_stops: ordersResult.rows.length,
      status: "ACTIVE",
      optimizedRoute: [],
    };

    for (let i = 0; i < ordersResult.rows.length; i++) {
      const order = ordersResult.rows[i];

      // Get packages for this order
      const packagesQuery = `SELECT * FROM packages WHERE order_id = $1`;
      const packagesResult = await this.db.query(packagesQuery, [order.id]);

      // Get delivery addresses for this order
      const addressesQuery = `SELECT * FROM delivery_addresses WHERE order_id = $1 ORDER BY stop_sequence`;
      const addressesResult = await this.db.query(addressesQuery, [order.id]);

      manifest.optimizedRoute.push({
        stopId: `STOP-${(i + 1).toString().padStart(3, "0")}`,
        packageId: order.id,
        orderId: order.id,
        customerName: `${order.client_name} Customer`, // Use client name since customer_name doesn't exist
        address: addressesResult.rows?.[0]?.address || "Address not available",
        coordinates: {
          latitude: parseFloat(addressesResult.rows?.[0]?.latitude || 0),
          longitude: parseFloat(addressesResult.rows?.[0]?.longitude || 0),
        },
        timeWindow: {
          earliest: "09:00",
          latest: "18:00",
        },
        packageDetails: packagesResult.rows?.[0], // First package for display
        packages: packagesResult.rows,
        status: order.status,
        specialInstructions: addressesResult.rows?.[0]?.special_instructions,
        currentStatus: { status: order.status },
        priority: order.priority,
        clientName: order.client_name,
        estimatedDelivery: order.estimated_delivery_time,
        routeId: order.route_id,
        assignedVehicle: order.assigned_vehicle_id,
      });
    }

    console.log(`Created manifest with ${manifest.total_stops} stops`);
    return manifest;
  }

  /**
   * Update delivery status
   */
  async updateDeliveryStatus(manifestId, orderId, status, updateData = {}) {
    return await this.db.transaction(async (client) => {
      // Update delivery stop status
      const updateQuery = `
        UPDATE delivery_stops 
        SET status = $3, 
            attempted_at = CASE WHEN $3 IN ('ATTEMPTED', 'FAILED') THEN NOW() ELSE attempted_at END,
            delivered_at = CASE WHEN $3 = 'DELIVERED' THEN NOW() ELSE delivered_at END,
            failed_reason = $4,
            delivery_notes = $5,
            delivery_latitude = $6,
            delivery_longitude = $7,
            customer_name = $8,
            updated_at = NOW()
        WHERE manifest_id = $1 AND order_id = $2
        RETURNING *
      `;

      const result = await client.query(updateQuery, [
        manifestId,
        orderId,
        status,
        updateData.reason || null,
        updateData.notes || null,
        updateData.latitude || null,
        updateData.longitude || null,
        updateData.customerName || null,
      ]);

      // Update order status in main orders table for key status changes
      if (status === "DELIVERED") {
        await client.query(
          "UPDATE orders SET status = $2, updated_at = NOW() WHERE id = $1",
          [orderId, "DELIVERED"]
        );
      } else if (status === "OUT_FOR_DELIVERY") {
        await client.query(
          "UPDATE orders SET status = $2, updated_at = NOW() WHERE id = $1",
          [orderId, "OUT_FOR_DELIVERY"]
        );
      } else if (status === "FAILED") {
        await client.query(
          "UPDATE orders SET status = $2, updated_at = NOW() WHERE id = $1",
          [orderId, "FAILED"]
        );
      }

      // Insert order event
      await client.query(
        `
        INSERT INTO order_events (order_id, event_type, event_data, source_service)
        VALUES ($1, $2, $3, $4)
      `,
        [
          orderId,
          `DELIVERY_${status}`,
          JSON.stringify({ status, ...updateData, timestamp: new Date() }),
          "driver-service",
        ]
      );

      return result.rows[0];
    });
  }

  /**
   * Simple method to update order status directly (for driver status updates)
   */
  async updateOrderDeliveryStatus(orderId, status, updateData = {}) {
    return await this.db.transaction(async (client) => {
      // Update order status in main orders table
      const orderUpdateQuery = `
        UPDATE orders 
        SET status = $2, updated_at = NOW() 
        WHERE id = $1
        RETURNING *
      `;

      const orderResult = await client.query(orderUpdateQuery, [
        orderId,
        status,
      ]);

      // Insert order event for tracking
      await client.query(
        `
        INSERT INTO order_events (order_id, event_type, event_data, source_service)
        VALUES ($1, $2, $3, $4)
      `,
        [
          orderId,
          "DELIVERY_STATUS_UPDATED",
          JSON.stringify({
            status,
            timestamp: new Date(),
            location: updateData.location,
            notes: updateData.notes,
            driverId: updateData.driverId,
          }),
          "driver-service",
        ]
      );

      return orderResult.rows[0];
    });
  }

  /**
   * Store proof of delivery
   */
  async storeProofOfDelivery(packageId, proofData) {
    const query = `
      UPDATE delivery_stops 
      SET customer_signature_url = $2,
          delivery_photo_urls = $3,
          delivery_notes = COALESCE(delivery_notes, '') || $4,
          updated_at = NOW()
      WHERE order_id = $1
      RETURNING *
    `;

    const result = await this.db.query(query, [
      packageId,
      proofData.signature?.path || null,
      proofData.photos?.map((p) => p.path) || [],
      proofData.notes ? "\nProof: " + proofData.notes : "",
    ]);

    return result.rows[0];
  }
}

// Export default database instance
export default DatabaseClient;
