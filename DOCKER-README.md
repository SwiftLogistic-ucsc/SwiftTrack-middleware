# SwiftTrack Middleware - Docker Setup

This document explains how to run the SwiftTrack middleware using Docker containers.

## Prerequisites

- Docker Desktop installed and running
- Docker Compose v2.0 or higher
- At least 8GB of available RAM
- At least 10GB of free disk space

## Services Overview

### Core Services

- **Order Service** (Port 4000): Main order processing and management
- **Driver Service** (Port 4001): Driver operations and proof of delivery
- **Notification Service** (Port 4002): Email and SMS notifications

### Mock Services

- **CMS Mock** (Port 5001): Customer Management System simulator
- **WMS Mock** (Port 5002): Warehouse Management System simulator
- **ROS Mock** (Port 5003): Route Optimization System simulator

### Infrastructure

- **PostgreSQL** (Port 5432): Primary database
- **Redpanda** (Port 9092): Kafka-compatible messaging
- **Redis** (Port 6379): Caching and session storage
- **Web Interface** (Port 8080): Frontend application

## Quick Start

### Option 1: Using Management Script (Recommended)

**Windows PowerShell:**

```powershell
# Start all services
.\docker-manage.ps1 start

# Check service status
.\docker-manage.ps1 status

# View logs
.\docker-manage.ps1 logs

# Stop all services
.\docker-manage.ps1 stop
```

**Linux/Mac Bash:**

```bash
# Make script executable
chmod +x docker-manage.sh

# Start all services
./docker-manage.sh start

# Check service status
./docker-manage.sh status

# View logs
./docker-manage.sh logs

# Stop all services
./docker-manage.sh stop
```

### Option 2: Using Docker Compose Directly

```bash
# Build all services
docker-compose build

# Start all services
docker-compose up -d

# Check running services
docker-compose ps

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

## Development Workflow

### Local Development Mode

If you want to run some services locally for development while using containerized dependencies:

```powershell
# Start only infrastructure and mock services
.\docker-manage.ps1 dev
```

This will start:

- PostgreSQL
- Redpanda (Kafka)
- Redis
- Mock services (CMS, WMS, ROS)

You can then run your core services (order, driver, notification) locally with your IDE.

### Building Individual Services

```bash
# Build specific service
docker-compose build order-service

# Restart specific service
docker-compose restart order-service

# View logs for specific service
docker-compose logs -f order-service
```

## Environment Variables

### Core Services Configuration

The services use these environment variables:

```env
# Database
DATABASE_URL=postgresql://swifttrack_user:swifttrack_pass@postgres:5432/swifttrack

# Messaging
KAFKA_BROKER=redpanda:9092
ORDER_EVENTS_TOPIC=swift-logistics-events

# Cache
REDIS_URL=redis://redis:6379

# Service URLs
CMS_URL=http://cms-mock:5001
WMS_URL=http://wms-mock:5002
ROS_URL=http://ros-mock:5003

# Email (Notification Service)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
EMAIL_USER=swifttrack@example.com
EMAIL_PASS=your_email_password
```

### Customizing Configuration

You can override these by creating a `.env` file in the root directory:

```env
# .env file
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
LOG_LEVEL=debug
```

## Networking

All services communicate through a Docker network. The services are accessible from your host machine through the exposed ports.

### Internal Service Communication

Services communicate using their container names:

- `http://order-service:4000`
- `http://driver-service:4001`
- `http://notification-service:4002`
- `postgres:5432`
- `redpanda:9092`
- `redis:6379`

### External Access

From your host machine:

- Web Interface: http://localhost:8080
- Order Service API: http://localhost:4000
- Driver Service API: http://localhost:4001
- Notification Service API: http://localhost:4002

## Data Persistence

### Volumes

The setup uses Docker volumes for data persistence:

- `postgres_data`: PostgreSQL database files
- `driver_uploads`: Driver service file uploads

### Backup and Restore

```bash
# Backup database
docker exec -t swifttrack-middleware_postgres_1 pg_dump -U swifttrack_user swifttrack > backup.sql

# Restore database
docker exec -i swifttrack-middleware_postgres_1 psql -U swifttrack_user swifttrack < backup.sql
```

## Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure ports 4000-4002, 5001-5003, 5432, 6379, 8080, 9092 are not in use
2. **Memory issues**: Increase Docker Desktop memory allocation to at least 8GB
3. **Database connection issues**: Wait for PostgreSQL health check to pass before starting services

### Debugging Commands

```bash
# Check service health
docker-compose ps

# View all logs
docker-compose logs

# View specific service logs
docker-compose logs order-service

# Enter service container
docker-compose exec order-service sh

# Check network connectivity
docker-compose exec order-service ping postgres
```

### Resetting the Environment

```powershell
# Complete cleanup (removes all data)
.\docker-manage.ps1 cleanup

# Reset only database
.\docker-manage.ps1 reset-db
```

## Monitoring and Health Checks

### Health Check Endpoints

Most services expose health check endpoints:

- Order Service: http://localhost:4000/health
- Driver Service: http://localhost:4001/health
- Notification Service: http://localhost:4002/health

### Service Status

```bash
# Check all service status
docker-compose ps

# Check specific service health
curl http://localhost:4000/health
```

## Production Considerations

### Security

For production deployment:

1. Change default passwords in docker-compose.yml
2. Use secrets management for sensitive data
3. Enable SSL/TLS certificates
4. Configure firewall rules
5. Regular security updates

### Performance

1. Adjust memory limits based on load
2. Configure proper logging levels
3. Set up monitoring and alerting
4. Use load balancers for high availability

### Scaling

```bash
# Scale specific services
docker-compose up -d --scale order-service=3
docker-compose up -d --scale driver-service=2
```

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Review service logs for error messages
3. Verify all prerequisites are met
4. Ensure Docker Desktop is running and healthy
