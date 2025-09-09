-- SwiftTrack Database Schema
-- This script initializes the database schema for SwiftTrack middleware

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE order_status AS ENUM (
    'SUBMITTED',
    'CMS_VERIFIED', 
    'WMS_REGISTERED',
    'ROS_OPTIMIZED',
    'READY_FOR_DELIVERY',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'FAILED',
    'CANCELLED'
);

CREATE TYPE package_priority AS ENUM ('STANDARD', 'HIGH', 'URGENT');
CREATE TYPE delivery_status AS ENUM ('PENDING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'ATTEMPTED');
CREATE TYPE driver_status AS ENUM ('ACTIVE', 'INACTIVE', 'ON_BREAK', 'OFF_DUTY');

-- Clients table (CMS data)
CREATE TABLE clients (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    contract_type VARCHAR(50) NOT NULL DEFAULT 'STANDARD',
    credit_limit DECIMAL(15,2) NOT NULL DEFAULT 100000.00,
    billing_cycle VARCHAR(50) NOT NULL DEFAULT 'MONTHLY',
    contract_expiry DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders table
CREATE TABLE orders (
    id VARCHAR(50) PRIMARY KEY,
    client_id VARCHAR(50) NOT NULL REFERENCES clients(id),
    status order_status NOT NULL DEFAULT 'SUBMITTED',
    priority package_priority NOT NULL DEFAULT 'STANDARD',
    total_packages INTEGER NOT NULL DEFAULT 0,
    total_delivery_addresses INTEGER NOT NULL DEFAULT 0,
    
    -- CMS verification data
    contract_id VARCHAR(100),
    billing_status VARCHAR(50),
    estimated_cost DECIMAL(15,2),
    
    -- WMS registration data
    warehouse_package_id VARCHAR(100),
    warehouse_location VARCHAR(100),
    estimated_ready_time TIMESTAMP WITH TIME ZONE,
    
    -- ROS optimization data
    route_id VARCHAR(100),
    assigned_driver_id VARCHAR(50),
    assigned_vehicle_id VARCHAR(50),
    optimized_stops INTEGER,
    estimated_delivery_time TIMESTAMP WITH TIME ZONE,
    eta_minutes INTEGER,
    
    -- Timestamps and metadata
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    cms_verified_at TIMESTAMP WITH TIME ZONE,
    wms_registered_at TIMESTAMP WITH TIME ZONE,
    ros_optimized_at TIMESTAMP WITH TIME ZONE,
    ready_for_delivery_at TIMESTAMP WITH TIME ZONE,
    processing_duration_ms INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Packages table
CREATE TABLE packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id VARCHAR(50) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    sku VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    priority package_priority NOT NULL DEFAULT 'STANDARD',
    weight_kg DECIMAL(8,3),
    dimensions_cm VARCHAR(50), -- "L x W x H"
    special_handling TEXT[],
    
    -- Package tracking
    warehouse_location VARCHAR(100),
    tracking_number VARCHAR(100),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Delivery addresses table
CREATE TABLE delivery_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id VARCHAR(50) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    geocoding_accuracy VARCHAR(50),
    special_instructions TEXT,
    contact_name VARCHAR(255),
    contact_phone VARCHAR(50),
    
    -- Route optimization data
    stop_sequence INTEGER,
    time_window_start TIME,
    time_window_end TIME,
    estimated_arrival_time TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Drivers table
CREATE TABLE drivers (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    license_number VARCHAR(50) UNIQUE NOT NULL,
    phone_number VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    
    -- Vehicle information
    vehicle_type VARCHAR(50) NOT NULL,
    vehicle_plate VARCHAR(50) NOT NULL,
    vehicle_capacity_kg DECIMAL(8,2),
    
    -- Driver status and schedule
    status driver_status NOT NULL DEFAULT 'ACTIVE',
    shift_start TIME NOT NULL DEFAULT '08:00',
    shift_end TIME NOT NULL DEFAULT '18:00',
    
    -- Current location
    current_latitude DECIMAL(10, 8),
    current_longitude DECIMAL(11, 8),
    location_updated_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Delivery manifests table
CREATE TABLE delivery_manifests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id VARCHAR(50) NOT NULL REFERENCES drivers(id),
    route_id VARCHAR(100) NOT NULL,
    manifest_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Route information
    total_stops INTEGER NOT NULL DEFAULT 0,
    estimated_distance_km DECIMAL(8,2),
    estimated_duration_minutes INTEGER,
    
    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'ASSIGNED',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(driver_id, manifest_date)
);

-- Delivery stops table (links orders to driver manifests)
CREATE TABLE delivery_stops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    manifest_id UUID NOT NULL REFERENCES delivery_manifests(id) ON DELETE CASCADE,
    order_id VARCHAR(50) NOT NULL REFERENCES orders(id),
    delivery_address_id UUID NOT NULL REFERENCES delivery_addresses(id),
    
    -- Stop details
    stop_sequence INTEGER NOT NULL,
    package_ids UUID[] NOT NULL, -- Array of package IDs for this stop
    
    -- Delivery status
    status delivery_status NOT NULL DEFAULT 'PENDING',
    attempted_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    failed_reason TEXT,
    delivery_notes TEXT,
    
    -- Customer information
    customer_name VARCHAR(255),
    customer_signature_url TEXT,
    delivery_photo_urls TEXT[],
    
    -- Location verification
    delivery_latitude DECIMAL(10, 8),
    delivery_longitude DECIMAL(11, 8),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Route updates table (for real-time route modifications)
CREATE TABLE route_updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    manifest_id UUID NOT NULL REFERENCES delivery_manifests(id),
    update_type VARCHAR(50) NOT NULL, -- 'TRAFFIC_DELAY', 'NEW_PRIORITY_DELIVERY', 'ROUTE_CHANGE'
    message TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM', -- 'LOW', 'MEDIUM', 'HIGH'
    
    -- Affected deliveries
    affected_stop_ids UUID[],
    
    -- Update details
    old_eta TIMESTAMP WITH TIME ZONE,
    new_eta TIMESTAMP WITH TIME ZONE,
    additional_data JSONB,
    
    -- Status
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Order events table (for audit trail and real-time tracking)
CREATE TABLE order_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id VARCHAR(50) NOT NULL REFERENCES orders(id),
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Event source
    source_service VARCHAR(50),
    source_user_id VARCHAR(50),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_orders_client_id ON orders(client_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_assigned_driver ON orders(assigned_driver_id);
CREATE INDEX idx_orders_submitted_at ON orders(submitted_at);

CREATE INDEX idx_packages_order_id ON packages(order_id);
CREATE INDEX idx_packages_sku ON packages(sku);

CREATE INDEX idx_delivery_addresses_order_id ON delivery_addresses(order_id);
CREATE INDEX idx_delivery_addresses_location ON delivery_addresses(latitude, longitude);

CREATE INDEX idx_drivers_status ON drivers(status);
CREATE INDEX idx_drivers_location ON drivers(current_latitude, current_longitude);

CREATE INDEX idx_delivery_manifests_driver_date ON delivery_manifests(driver_id, manifest_date);
CREATE INDEX idx_delivery_manifests_route_id ON delivery_manifests(route_id);

CREATE INDEX idx_delivery_stops_manifest_id ON delivery_stops(manifest_id);
CREATE INDEX idx_delivery_stops_order_id ON delivery_stops(order_id);
CREATE INDEX idx_delivery_stops_status ON delivery_stops(status);

CREATE INDEX idx_route_updates_manifest_id ON route_updates(manifest_id);
CREATE INDEX idx_route_updates_type ON route_updates(update_type);

CREATE INDEX idx_order_events_order_id ON order_events(order_id);
CREATE INDEX idx_order_events_type ON order_events(event_type);
CREATE INDEX idx_order_events_timestamp ON order_events(timestamp);

-- Create triggers for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_clients_updated_at 
    BEFORE UPDATE ON clients 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at 
    BEFORE UPDATE ON orders 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_drivers_updated_at 
    BEFORE UPDATE ON drivers 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_delivery_manifests_updated_at 
    BEFORE UPDATE ON delivery_manifests 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_delivery_stops_updated_at 
    BEFORE UPDATE ON delivery_stops 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
