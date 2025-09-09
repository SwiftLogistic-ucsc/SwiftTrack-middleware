-- SwiftTrack Database Seed Data
-- This script populates the database with initial test data

-- Insert test clients
INSERT INTO clients (id, name, status, contract_type, credit_limit, billing_cycle, contract_expiry) VALUES
('client-123', 'Test Client Demo', 'ACTIVE', 'STANDARD', 100000.00, 'MONTHLY', '2025-12-31'),
('CLIENT-001', 'ABC Electronics Ltd', 'ACTIVE', 'PREMIUM', 500000.00, 'MONTHLY', '2025-12-31'),
('CLIENT-002', 'XYZ Fashion House', 'ACTIVE', 'STANDARD', 250000.00, 'WEEKLY', '2025-11-30'),
('CLIENT-003', 'Global Books Distribution', 'ACTIVE', 'ENTERPRISE', 1000000.00, 'MONTHLY', '2026-06-30');

-- Insert test drivers
INSERT INTO drivers (
    id, name, license_number, phone_number, email,
    vehicle_type, vehicle_plate, vehicle_capacity_kg,
    status, shift_start, shift_end,
    current_latitude, current_longitude, location_updated_at
) VALUES
('DRV-001', 'Kasun Perera', 'B1234567', '+94771234567', 'kasun.perera@swiftlogistics.lk',
 'VAN', 'CAR-1234', 500.00,
 'ACTIVE', '08:00', '18:00',
 6.9271, 79.8612, NOW()),
 
('DRV-002', 'Priya Fernando', 'B2345678', '+94771234568', 'priya.fernando@swiftlogistics.lk',
 'TRUCK', 'CAR-5678', 1500.00,
 'ACTIVE', '07:00', '17:00',
 6.9319, 79.8478, NOW()),
 
('DRV-003', 'Mahesh Silva', 'B3456789', '+94771234569', 'mahesh.silva@swiftlogistics.lk',
 'MOTORCYCLE', 'CAR-9012', 50.00,
 'ACTIVE', '09:00', '19:00',
 6.9147, 79.9261, NOW()),
 
('DRV-004', 'Anjali Wijesinghe', 'B4567890', '+94771234570', 'anjali.w@swiftlogistics.lk',
 'VAN', 'CAR-3456', 750.00,
 'ACTIVE', '06:00', '16:00',
 6.8406, 79.9045, NOW());

-- Function to create a sample order with all related data
CREATE OR REPLACE FUNCTION create_sample_order(
    p_order_id VARCHAR(50),
    p_client_id VARCHAR(50),
    p_priority package_priority DEFAULT 'STANDARD',
    p_driver_id VARCHAR(50) DEFAULT 'DRV-001'
) RETURNS VOID AS $$
DECLARE
    v_delivery_address_id UUID;
    v_package_id UUID;
    v_manifest_id UUID;
    v_route_id VARCHAR(100);
BEGIN
    -- Insert order
    INSERT INTO orders (
        id, client_id, status, priority, total_packages, total_delivery_addresses,
        contract_id, billing_status, estimated_cost,
        warehouse_package_id, warehouse_location, estimated_ready_time,
        route_id, assigned_driver_id, assigned_vehicle_id, optimized_stops, 
        estimated_delivery_time, eta_minutes,
        submitted_at, cms_verified_at, wms_registered_at, ros_optimized_at, ready_for_delivery_at,
        processing_duration_ms
    ) VALUES (
        p_order_id, p_client_id, 'READY_FOR_DELIVERY', p_priority, 1, 1,
        'SWFT-CTR-' || p_order_id || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT,
        'APPROVED', 650.00,
        'SWFT-PKG-' || p_order_id || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT,
        'A1-STAGING', NOW() + INTERVAL '30 minutes',
        'SWFT-RTE-' || p_order_id || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT,
        p_driver_id, 'VEH-' || p_driver_id, 1,
        NOW() + INTERVAL '2 hours', 120,
        NOW() - INTERVAL '5 minutes',
        NOW() - INTERVAL '4 minutes',
        NOW() - INTERVAL '3 minutes', 
        NOW() - INTERVAL '2 minutes',
        NOW() - INTERVAL '1 minute',
        300000
    );
    
    v_route_id := 'SWFT-RTE-' || p_order_id || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT;
    
    -- Insert package
    INSERT INTO packages (order_id, sku, description, quantity, priority, weight_kg, dimensions_cm)
    VALUES (p_order_id, 'BOOK-001', 'Academic Textbook - Database Systems', 1, p_priority, 0.5, '25x18x3')
    RETURNING id INTO v_package_id;
    
    -- Insert delivery address
    INSERT INTO delivery_addresses (
        order_id, address, latitude, longitude, geocoding_accuracy,
        special_instructions, contact_name, contact_phone,
        stop_sequence, time_window_start, time_window_end, estimated_arrival_time
    ) VALUES (
        p_order_id, 'No 45, Galle Road, Colombo 03, Sri Lanka',
        6.926996, 79.862941, 'HIGH',
        'Call before delivery', 'John Silva', '+94771111111',
        1, '09:00', '18:00', NOW() + INTERVAL '2 hours'
    ) RETURNING id INTO v_delivery_address_id;
    
    -- Create or get delivery manifest
    INSERT INTO delivery_manifests (
        driver_id, route_id, manifest_date, total_stops, 
        estimated_distance_km, estimated_duration_minutes, status
    ) VALUES (
        p_driver_id, v_route_id, CURRENT_DATE, 1, 15.5, 45, 'ASSIGNED'
    ) ON CONFLICT (driver_id, manifest_date) 
    DO UPDATE SET 
        total_stops = delivery_manifests.total_stops + 1,
        estimated_distance_km = delivery_manifests.estimated_distance_km + 15.5,
        estimated_duration_minutes = delivery_manifests.estimated_duration_minutes + 45,
        updated_at = NOW()
    RETURNING id INTO v_manifest_id;
    
    -- If manifest already exists, get its ID
    IF v_manifest_id IS NULL THEN
        SELECT id INTO v_manifest_id 
        FROM delivery_manifests 
        WHERE driver_id = p_driver_id AND manifest_date = CURRENT_DATE;
    END IF;
    
    -- Insert delivery stop
    INSERT INTO delivery_stops (
        manifest_id, order_id, delivery_address_id, stop_sequence,
        package_ids, status, customer_name
    ) VALUES (
        v_manifest_id, p_order_id, v_delivery_address_id, 1,
        ARRAY[v_package_id], 'PENDING', 'John Silva'
    );
    
    -- Insert order event
    INSERT INTO order_events (order_id, event_type, event_data, source_service)
    VALUES (
        p_order_id, 'ORDER_READY_FOR_DELIVERY',
        jsonb_build_object(
            'status', 'READY_FOR_DELIVERY',
            'assignedDriver', p_driver_id,
            'routeId', v_route_id,
            'estimatedDelivery', NOW() + INTERVAL '2 hours'
        ),
        'order-service'
    );
END;
$$ LANGUAGE plpgsql;

-- Create sample orders
SELECT create_sample_order('ORD-2025-001', 'client-123', 'STANDARD', 'DRV-001');
SELECT create_sample_order('ORD-2025-002', 'CLIENT-001', 'HIGH', 'DRV-001');
SELECT create_sample_order('ORD-2025-003', 'CLIENT-002', 'URGENT', 'DRV-002');
SELECT create_sample_order('ORD-2025-004', 'CLIENT-003', 'STANDARD', 'DRV-003');

-- Create some additional packages for multi-package orders
INSERT INTO packages (order_id, sku, description, quantity, priority, weight_kg, dimensions_cm) VALUES
('ORD-2025-002', 'ELECTRONICS-001', 'Smartphone Samsung Galaxy', 1, 'HIGH', 0.2, '15x8x1'),
('ORD-2025-003', 'FASHION-001', 'Designer Dress Collection', 3, 'URGENT', 1.5, '40x30x10');

-- Update package counts
UPDATE orders SET total_packages = 2 WHERE id = 'ORD-2025-002';
UPDATE orders SET total_packages = 2 WHERE id = 'ORD-2025-003';

-- Insert some route updates for testing
INSERT INTO route_updates (manifest_id, update_type, message, severity, additional_data) 
SELECT 
    dm.id,
    'TRAFFIC_DELAY',
    'Traffic congestion detected on Galle Road. ETA updated by 15 minutes.',
    'MEDIUM',
    jsonb_build_object('delayMinutes', 15, 'affectedRoute', 'Galle Road')
FROM delivery_manifests dm 
WHERE dm.driver_id = 'DRV-001'
LIMIT 1;

INSERT INTO route_updates (manifest_id, update_type, message, severity, additional_data)
SELECT 
    dm.id,
    'NEW_PRIORITY_DELIVERY',
    'High priority delivery added to your route.',
    'HIGH',
    jsonb_build_object('newDeliveryId', 'ORD-2025-999', 'priority', 'URGENT')
FROM delivery_manifests dm 
WHERE dm.driver_id = 'DRV-002'
LIMIT 1;

-- Clean up the helper function
DROP FUNCTION create_sample_order(VARCHAR(50), VARCHAR(50), package_priority, VARCHAR(50));
