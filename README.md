# SwiftTrack Distributed Middleware Architecture

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Key Features](#key-features)
- [Technologies](#technologies)
- [Quick Start](#quick-start)
- [API Documentation](#api-documentation)
- [Distributed Transaction Pattern](#distributed-transaction-pattern)
- [Fault Tolerance](#fault-tolerance)
- [Monitoring & Testing](#monitoring--testing)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

SwiftTrack is a sophisticated distributed middleware system designed for modern logistics and supply chain operations. It implements enterprise-grade patterns including **Saga-based distributed transactions**, **circuit breakers**, **event-driven architecture**, and **asynchronous processing** to ensure high availability, fault tolerance, and eventual consistency across heterogeneous systems.

### Business Problem Solved

Traditional logistics systems suffer from:

- **Synchronous processing bottlenecks** leading to poor user experience
- **Single points of failure** when external services are unavailable
- **Inconsistent state** during multi-service transactions
- **Poor integration** between heterogeneous legacy and modern systems

### Solution Architecture

SwiftTrack addresses these challenges through:

- ✅ **Asynchronous processing** with immediate response to clients
- ✅ **Distributed transaction management** using Saga pattern
- ✅ **Fault tolerance** with circuit breakers and automatic retry
- ✅ **Event-driven coordination** via Kafka messaging
- ✅ **Protocol adaptation** for heterogeneous system integration

## 🏗️ Architecture

### System Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client Apps   │    │   Load Balancer  │    │   Monitoring    │
│  (Web/Mobile)   │    │   (Future)       │    │   Dashboard     │
└─────────┬───────┘    └─────────┬────────┘    └─────────┬───────┘
          │                      │                       │
          └──────────────────────┼───────────────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────┐
│                    API Gateway │ Layer                          │
│                                ▼                                │
│    ┌─────────────────────────────────────────────────────────┐  │
│    │              Order Service (Port 4000)                 │  │
│    │  • Async Processing     • Saga Orchestration          │  │
│    │  • Circuit Breakers     • Event Publishing            │  │
│    └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────┐
│              Message Bus       │ (Event-Driven Layer)           │
│                                ▼                                │
│    ┌─────────────────────────────────────────────────────────┐  │
│    │                 Apache Kafka                           │  │
│    │  • Event Streaming      • Transaction Coordination     │  │
│    │  • Retry Coordination   • Progress Tracking           │  │
│    └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────┐
│           Integration Layer    │ (Protocol Adapters)            │
│                                ▼                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ CMS Adapter │  │ WMS Adapter │  │ ROS Adapter │              │
│  │ (SOAP/XML)  │  │ (TCP/Binary)│  │ (REST/JSON) │              │
│  │ Port 5001   │  │ Port 5002   │  │ Port 5003   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────┐
│            Data Layer          │                                │
│                                ▼                                │
│    ┌─────────────────────────────────────────────────────────┐  │
│    │              PostgreSQL Database                       │  │
│    │  • Transactional Data   • Event Store                 │  │
│    │  • Order State         • Audit Trail                  │  │
│    └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Distributed Transaction Flow

```
Client Request → Immediate Response (202 Accepted)
                        │
                        ▼
                Background Processing
                        │
    ┌───────────────────┼───────────────────┐
    │                   ▼                   │
    │    ┌─────────────────────────────┐    │
    │    │      Saga Orchestrator      │    │
    │    │   (Transaction Manager)     │    │
    │    └─────────────────────────────┘    │
    │                   │                   │
    │    ┌──────────────┼──────────────┐    │
    │    ▼              ▼              ▼    │
    │  Step 1         Step 2        Step 3  │
    │    CMS           WMS           ROS     │
    │ Verification   Package       Route     │
    │              Registration  Optimization │
    │                                         │
    │  Success ✅ → Continue                  │
    │  Failure ❌ → Compensate ← ← ← ← ← ←    │
    └─────────────────────────────────────────┘
```

## 🚀 Key Features

### 1. **Asynchronous Processing**

- **Immediate Response**: Orders return 202 Accepted in ~10-50ms
- **Background Processing**: Distributed transactions happen asynchronously
- **Real-time Progress**: Live status updates via polling/webhooks
- **Non-blocking Architecture**: High throughput and scalability

### 2. **Distributed Transaction Management**

- **Saga Pattern**: Ensures consistency across multiple services
- **Compensation Actions**: Automatic rollback on failures
- **Eventual Consistency**: Guaranteed state convergence
- **Transaction Isolation**: Independent processing units

### 3. **Fault Tolerance & Resilience**

- **Circuit Breakers**: Prevent cascade failures
- **Exponential Backoff Retry**: Intelligent failure recovery
- **Service Health Monitoring**: Real-time availability tracking
- **Graceful Degradation**: Continue operation during partial failures

### 4. **Event-Driven Architecture**

- **Kafka Integration**: Reliable message streaming
- **Event Sourcing**: Complete audit trail
- **Event Choreography**: Loosely coupled service coordination
- **Real-time Notifications**: Live progress updates

### 5. **Protocol Adaptation**

- **Heterogeneous Integration**: SOAP, TCP, REST protocols
- **Legacy System Support**: Seamless integration with older systems
- **Protocol Translation**: Automatic format conversion
- **Adapter Pattern**: Pluggable interface designs

## 🛠️ Technologies

### Core Stack

- **Runtime**: Node.js 18+ with ES Modules
- **Framework**: Express.js for REST APIs
- **Database**: PostgreSQL 15 with connection pooling
- **Message Broker**: Apache Kafka (via Redpanda)
- **Container Platform**: Docker & Docker Compose

### Libraries & Packages

- **Kafka Client**: KafkaJS for event streaming
- **Database Client**: pg (PostgreSQL driver)
- **HTTP Client**: Axios for external service calls
- **Logging**: Custom structured logging
- **Process Management**: PM2 (production)

### Development Tools

- **Package Manager**: npm workspaces (monorepo)
- **Process Runner**: nodemon for development
- **Testing**: Custom test scripts and monitoring tools
- **API Testing**: Postman collection included

## 🚀 Quick Start

### Prerequisites

- **Docker & Docker Compose** (v3.8+)
- **Node.js** (v18+ with npm)
- **Git** for version control

### 1. Clone & Setup

```bash
git clone <repository-url>
cd SwiftTrack-middleware
npm install
```

### 2. Start Infrastructure

```bash
# Start Kafka, PostgreSQL, and mock services
docker-compose up -d

# Wait for services to be ready (30-60 seconds)
docker-compose logs -f postgres  # Check database startup
```

### 3. Start Order Service

```bash
cd services/order-service
npm install
npm start
```

The service will be available at `http://localhost:4000`

### 4. Verify Installation

```bash
# Health check
curl http://localhost:4000/health

# Service health
curl http://localhost:4000/api/services/health
```

### 5. Run Demo

```bash
# Asynchronous processing demo
node demo-async-processing.js

# Distributed transaction monitor
node monitor-distributed-transactions.js
```

## 📚 API Documentation

### Core Endpoints

#### Submit Order (Asynchronous)

```http
POST /api/orders
Content-Type: application/json

{
  "id": "ORD-001",
  "clientId": "CLIENT-001",
  "priority": "STANDARD",
  "packages": [
    {
      "sku": "ITEM-001",
      "description": "Product Description",
      "quantity": 2,
      "priority": "STANDARD"
    }
  ],
  "deliveryAddresses": [
    "123 Main Street, City, Country"
  ]
}
```

**Response (202 Accepted)**:

```json
{
  "status": "accepted",
  "orderId": "ORD-001",
  "message": "Order accepted and is being processed asynchronously",
  "processing": {
    "status": "PROCESSING",
    "mode": "ASYNCHRONOUS",
    "estimatedCompletion": "2-5 minutes",
    "statusEndpoint": "/api/orders/ORD-001/status"
  }
}
```

#### Check Order Status

```http
GET /api/orders/{orderId}/status
```

**Response**:

```json
{
  "orderId": "ORD-001",
  "status": "PROCESSING",
  "processing": {
    "currentStage": "WMS_PROCESSING",
    "progress": {
      "completed": 1,
      "total": 3,
      "percentage": 33
    },
    "estimatedCompletion": "1-3 minutes"
  },
  "steps": [
    {
      "step": "CMS_VERIFICATION",
      "name": "Contract Verification",
      "status": "COMPLETED",
      "timestamp": "2025-09-09T10:30:00Z"
    },
    {
      "step": "WMS_REGISTRATION",
      "name": "Package Registration",
      "status": "IN_PROGRESS",
      "timestamp": null
    },
    {
      "step": "ROS_OPTIMIZATION",
      "name": "Route Optimization",
      "status": "PENDING",
      "timestamp": null
    }
  ]
}
```

#### Get Order Details

```http
GET /api/orders/{orderId}
```

#### List All Orders

```http
GET /api/orders
```

### Monitoring Endpoints

#### Service Health

```http
GET /api/services/health
```

#### System Health

```http
GET /health
```

#### Manual Service Recovery

```http
POST /api/services/{service}/recover
```

Where `{service}` is one of: `cms`, `wms`, `ros`

## 🔄 Distributed Transaction Pattern

### Saga Implementation

SwiftTrack implements the **Orchestration-based Saga pattern** for managing distributed transactions:

#### Transaction Steps

1. **CMS Verification**: Contract validation and billing setup
2. **WMS Registration**: Package registration and warehouse allocation
3. **ROS Optimization**: Route planning and driver assignment

#### Compensation Actions

Each step has a corresponding compensation action for rollback:

```javascript
// Compensation mapping
const compensationActions = {
  cms: async (orderId) => {
    // Cancel contract, release credit hold
    await orderRepo.updateOrderStatus(orderId, "CMS_COMPENSATION_EXECUTED");
  },
  wms: async (orderId) => {
    // Cancel package registration, release warehouse space
    await orderRepo.updateOrderStatus(orderId, "WMS_COMPENSATION_EXECUTED");
  },
  ros: async (orderId) => {
    // Cancel route, release driver/vehicle assignment
    await orderRepo.updateOrderStatus(orderId, "ROS_COMPENSATION_EXECUTED");
  },
};
```

#### Transaction Coordination

```javascript
class OrderProcessingSaga {
  async executeStep(stepName, serviceCall, compensationAction) {
    try {
      const result = await serviceCall();
      this.completedSteps.push(stepName);
      this.compensationActions.push({ stepName, action: compensationAction });
      return result;
    } catch (error) {
      await this.compensate(); // Execute all compensation actions
      throw error;
    }
  }
}
```

### Event Flow

```
Order Submitted → ORDER_ACCEPTED
                ↓
Background Processing Started → DISTRIBUTED_TRANSACTION_START
                ↓
CMS Processing → CMS_VERIFICATION_STARTED → CMS_VERIFIED
                ↓
WMS Processing → WMS_REGISTRATION_STARTED → WMS_REGISTERED
                ↓
ROS Processing → ROS_OPTIMIZATION_STARTED → ROS_OPTIMIZED
                ↓
Completion → ORDER_READY_FOR_DELIVERY
```

## 🛡️ Fault Tolerance

### Circuit Breaker Pattern

```javascript
const serviceHealth = {
  cms: { available: true, consecutiveFailures: 0 },
  wms: { available: true, consecutiveFailures: 0 },
  ros: { available: true, consecutiveFailures: 0 },
};

// Circuit breaker thresholds
const CIRCUIT_BREAKER_THRESHOLD = 3; // Failures before opening
const CIRCUIT_BREAKER_TIMEOUT = 30000; // 30s before retry attempt
```

### Retry Strategy

```javascript
// Exponential backoff retry
const RETRY_DELAY_MS = 2000;
const MAX_RETRY_ATTEMPTS = 5;

// Retry delay calculation: 2s, 4s, 8s, 16s, 32s
const delay = RETRY_DELAY_MS * Math.pow(2, retryCount);
```

### Failure Scenarios

| Scenario                    | Response                  | Recovery                                 |
| --------------------------- | ------------------------- | ---------------------------------------- |
| Service Temporarily Down    | Retry with backoff        | Automatic recovery when service returns  |
| Service Permanently Failed  | Circuit breaker opens     | Manual intervention or alternate routing |
| Network Timeout             | Exponential backoff retry | Continue retrying until max attempts     |
| Partial Transaction Failure | Saga compensation         | Rollback completed steps, safe to retry  |

## 📊 Monitoring & Testing

### Real-time Monitoring Dashboard

```bash
node monitor-distributed-transactions.js
```

Features:

- Live service health status
- Circuit breaker states
- Transaction progress tracking
- Performance metrics
- Quick recovery actions

### Asynchronous Processing Demo

```bash
node demo-async-processing.js
```

Demonstrates:

- Immediate order acceptance
- Background processing
- Real-time progress tracking
- Completion notification

### Distributed Transaction Testing

```bash
node test-distributed-transactions.js
```

Test scenarios:

- Normal processing flow
- Individual service failures
- Multiple service failures
- Recovery and retry mechanisms

### Manual Testing

```bash
# Submit test order
curl -X POST http://localhost:4000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "id": "TEST-001",
    "clientId": "TEST-CLIENT",
    "packages": [{"sku": "TEST", "quantity": 1}],
    "deliveryAddresses": ["Test Address"]
  }'

# Check processing status
curl http://localhost:4000/api/orders/TEST-001/status

# Monitor service health
curl http://localhost:4000/api/services/health
```

## ⚙️ Configuration

### Environment Variables

```bash
# Order Service (.env)
PORT=4000
KAFKA_BROKERS=localhost:9092
ORDER_EVENTS_TOPIC=order-events

# Database
DATABASE_URL=postgresql://swifttrack_user:swifttrack_pass@localhost:5432/swifttrack

# External Services
CMS_URL=http://localhost:5001
WMS_URL=http://localhost:5002
ROS_URL=http://localhost:5003

# Circuit Breaker Settings
CIRCUIT_BREAKER_THRESHOLD=3
CIRCUIT_BREAKER_TIMEOUT=30000
MAX_RETRY_ATTEMPTS=5
RETRY_DELAY_MS=2000
```

### Database Schema

The system uses PostgreSQL with the following key tables:

- **orders**: Main order data and status
- **order_events**: Event sourcing and audit trail
- **packages**: Package details and tracking
- **delivery_addresses**: Delivery location information

### Kafka Topics

- **order-events**: All order-related events
- **retry-events**: Retry coordination
- **health-events**: Service health monitoring

## 🔧 Troubleshooting

### Common Issues

#### Services Not Starting

```bash
# Check Docker services
docker-compose ps

# Check logs
docker-compose logs postgres
docker-compose logs redpanda

# Restart services
docker-compose restart
```

#### Order Processing Stuck

```bash
# Check service health
curl http://localhost:4000/api/services/health

# Force service recovery
curl -X POST http://localhost:4000/api/services/cms/recover
curl -X POST http://localhost:4000/api/services/wms/recover
curl -X POST http://localhost:4000/api/services/ros/recover
```

#### Database Connection Issues

```bash
# Test database connectivity
docker exec -it swifttrack-postgres-1 psql -U swifttrack_user -d swifttrack

# Check database logs
docker-compose logs postgres
```

#### Kafka Connection Issues

```bash
# Check Kafka broker
docker-compose logs redpanda

# Test Kafka connectivity
docker exec -it swifttrack-redpanda-1 rpk topic list
```

### Performance Tuning

#### Database Optimization

- Connection pooling configuration
- Index optimization for frequent queries
- Partition strategies for large datasets

#### Kafka Optimization

- Partition count for parallel processing
- Consumer group configuration
- Message retention policies

#### Circuit Breaker Tuning

- Adjust failure thresholds based on SLA requirements
- Optimize timeout values for service recovery
- Configure retry strategies per service type

### Monitoring & Alerts

#### Key Metrics to Monitor

- Order processing throughput (orders/minute)
- Average processing time per order
- Service availability percentages
- Circuit breaker open/close events
- Database connection pool utilization
- Kafka consumer lag

#### Recommended Alerts

- Service down for >30 seconds
- Circuit breaker open for >5 minutes
- Order processing time >10 minutes
- Database connection pool >80% utilized
- Kafka consumer lag >1000 messages

## 🎯 Production Considerations

### Deployment

#### Docker Production Setup

```yaml
# docker-compose.prod.yml
version: "3.8"
services:
  order-service:
    build: ./services/order-service
    deploy:
      replicas: 3
      restart_policy:
        condition: on-failure
        max_attempts: 3
    environment:
      NODE_ENV: production
```

#### Load Balancing

- Use nginx or cloud load balancer
- Health check endpoint: `/health`
- Session-free design supports horizontal scaling

#### Database Production Setup

- Read replicas for improved performance
- Automated backups and point-in-time recovery
- Connection pooling with pgbouncer

### Security

#### API Security

- JWT token authentication
- Rate limiting per client
- Input validation and sanitization
- CORS configuration for web clients

#### Network Security

- TLS encryption for all external communication
- VPC isolation for database and Kafka
- Service mesh for internal communication

#### Data Security

- Encryption at rest for sensitive data
- Audit logging for all transactions
- GDPR compliance for personal data

### Scalability

#### Horizontal Scaling

- Stateless service design enables easy scaling
- Database connection pooling supports multiple instances
- Kafka partitioning for parallel processing

#### Performance Optimization

- Database query optimization with proper indexing
- Kafka producer batching for better throughput
- Redis caching for frequently accessed data

#### Monitoring in Production

- Application Performance Monitoring (APM)
- Distributed tracing with tools like Jaeger
- Centralized logging with ELK stack
- Real-time dashboards with Grafana

---

## 📞 Support & Contributing

### Architecture Questions

For questions about the distributed transaction patterns, saga implementation, or fault tolerance mechanisms, please refer to the inline code documentation and architectural decision records.

### Performance Issues

Check the monitoring endpoints and review the troubleshooting section. The system includes comprehensive logging and metrics for debugging performance bottlenecks.

### Feature Requests

This architecture supports extensibility through:

- Plugin-based protocol adapters
- Event-driven integration points
- Configurable business rules
- Modular service design

---

**SwiftTrack** - _Delivering enterprise-grade distributed transaction reliability for modern logistics operations._
