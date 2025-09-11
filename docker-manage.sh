#!/bin/bash

# SwiftTrack Docker Management Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker first."
        exit 1
    fi
}

# Function to build all services
build_services() {
    print_status "Building all services..."
    docker-compose build --no-cache
    print_success "All services built successfully!"
}

# Function to start all services
start_services() {
    print_status "Starting all services..."
    docker-compose up -d
    print_success "All services started!"
    
    # Wait for services to be healthy
    print_status "Waiting for services to be healthy..."
    sleep 10
    
    # Check service health
    check_service_health
}

# Function to stop all services
stop_services() {
    print_status "Stopping all services..."
    docker-compose down
    print_success "All services stopped!"
}

# Function to restart all services
restart_services() {
    print_status "Restarting all services..."
    docker-compose restart
    print_success "All services restarted!"
}

# Function to check service health
check_service_health() {
    services=("postgres" "redpanda" "redis" "order-service" "driver-service" "notification-service" "cms-mock" "wms-mock" "ros-mock")
    
    for service in "${services[@]}"; do
        if docker-compose ps "$service" | grep -q "Up"; then
            print_success "$service is running"
        else
            print_warning "$service is not running properly"
        fi
    done
}

# Function to view logs
view_logs() {
    if [ -z "$1" ]; then
        print_status "Showing logs for all services..."
        docker-compose logs -f
    else
        print_status "Showing logs for $1..."
        docker-compose logs -f "$1"
    fi
}

# Function to clean up
cleanup() {
    print_status "Cleaning up Docker resources..."
    docker-compose down -v --remove-orphans
    docker system prune -f
    print_success "Cleanup completed!"
}

# Function to reset database
reset_database() {
    print_warning "This will destroy all data in the database. Are you sure? (y/N)"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        print_status "Resetting database..."
        docker-compose stop postgres
        docker volume rm swifttrack-middleware_postgres_data 2>/dev/null || true
        docker-compose up -d postgres
        print_success "Database reset completed!"
    else
        print_status "Database reset cancelled."
    fi
}

# Function to show service URLs
show_urls() {
    print_status "Service URLs:"
    echo "  Web Interface:      http://localhost:8080"
    echo "  Order Service:      http://localhost:4000"
    echo "  Driver Service:     http://localhost:4001"
    echo "  Notification Service: http://localhost:4002"
    echo "  CMS Mock:           http://localhost:5001"
    echo "  WMS Mock:           http://localhost:5002"
    echo "  ROS Mock:           http://localhost:5003"
    echo "  PostgreSQL:         localhost:5432"
    echo "  Redpanda (Kafka):   localhost:9092"
    echo "  Redis:              localhost:6379"
}

# Function to run development mode
dev_mode() {
    print_status "Starting development environment..."
    docker-compose up postgres redpanda redis cms-mock wms-mock ros-mock -d
    print_success "Development dependencies started!"
    print_status "You can now run your services locally for development."
}

# Function to show help
show_help() {
    echo "SwiftTrack Docker Management Script"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  build       Build all services"
    echo "  start       Start all services"
    echo "  stop        Stop all services"
    echo "  restart     Restart all services"
    echo "  status      Check service health status"
    echo "  logs [SERVICE] View logs (all services if no service specified)"
    echo "  cleanup     Stop services and clean up Docker resources"
    echo "  reset-db    Reset the database (destroys all data)"
    echo "  urls        Show service URLs"
    echo "  dev         Start only dependencies for local development"
    echo "  help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start                 # Start all services"
    echo "  $0 logs order-service    # View logs for order service"
    echo "  $0 status                # Check service health"
}

# Main script logic
case "${1:-help}" in
    build)
        check_docker
        build_services
        ;;
    start)
        check_docker
        start_services
        show_urls
        ;;
    stop)
        check_docker
        stop_services
        ;;
    restart)
        check_docker
        restart_services
        ;;
    status)
        check_docker
        check_service_health
        ;;
    logs)
        check_docker
        view_logs "$2"
        ;;
    cleanup)
        check_docker
        cleanup
        ;;
    reset-db)
        check_docker
        reset_database
        ;;
    urls)
        show_urls
        ;;
    dev)
        check_docker
        dev_mode
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
