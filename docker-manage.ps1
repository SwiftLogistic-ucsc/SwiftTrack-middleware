# SwiftTrack Docker Management Script (PowerShell)

param(
    [Parameter(Position = 0)]
    [string]$Command = "help",
    
    [Parameter(Position = 1)]
    [string]$Service = ""
)

# Colors for output
$colors = @{
    Red    = "Red"
    Green  = "Green"
    Yellow = "Yellow"
    Blue   = "Blue"
    White  = "White"
}

function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor $colors.Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor $colors.Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor $colors.Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor $colors.Red
}

# Function to check if Docker is running
function Test-Docker {
    try {
        docker info | Out-Null
        return $true
    }
    catch {
        Write-Error "Docker is not running. Please start Docker first."
        exit 1
    }
}

# Function to build all services
function Build-Services {
    Write-Status "Building all services..."
    docker-compose build --no-cache
    if ($LASTEXITCODE -eq 0) {
        Write-Success "All services built successfully!"
    }
    else {
        Write-Error "Build failed!"
        exit 1
    }
}

# Function to start all services
function Start-Services {
    Write-Status "Starting all services..."
    docker-compose up -d
    if ($LASTEXITCODE -eq 0) {
        Write-Success "All services started!"
        
        # Wait for services to be healthy
        Write-Status "Waiting for services to be healthy..."
        Start-Sleep 10
        
        # Check service health
        Test-ServiceHealth
    }
    else {
        Write-Error "Failed to start services!"
        exit 1
    }
}

# Function to stop all services
function Stop-Services {
    Write-Status "Stopping all services..."
    docker-compose down
    if ($LASTEXITCODE -eq 0) {
        Write-Success "All services stopped!"
    }
    else {
        Write-Error "Failed to stop services!"
    }
}

# Function to restart all services
function Restart-Services {
    Write-Status "Restarting all services..."
    docker-compose restart
    if ($LASTEXITCODE -eq 0) {
        Write-Success "All services restarted!"
    }
    else {
        Write-Error "Failed to restart services!"
    }
}

# Function to check service health
function Test-ServiceHealth {
    $services = @("postgres", "redpanda", "redis", "order-service", "driver-service", "notification-service", "cms-mock", "wms-mock", "ros-mock")
    
    foreach ($service in $services) {
        $status = docker-compose ps $service
        if ($status -match "Up") {
            Write-Success "$service is running"
        }
        else {
            Write-Warning "$service is not running properly"
        }
    }
}

# Function to view logs
function Show-Logs {
    param([string]$ServiceName)
    
    if ([string]::IsNullOrEmpty($ServiceName)) {
        Write-Status "Showing logs for all services..."
        docker-compose logs -f
    }
    else {
        Write-Status "Showing logs for $ServiceName..."
        docker-compose logs -f $ServiceName
    }
}

# Function to clean up
function Invoke-Cleanup {
    Write-Status "Cleaning up Docker resources..."
    docker-compose down -v --remove-orphans
    docker system prune -f
    Write-Success "Cleanup completed!"
}

# Function to reset database
function Reset-Database {
    $response = Read-Host "This will destroy all data in the database. Are you sure? (y/N)"
    if ($response -match "^[yY]") {
        Write-Status "Resetting database..."
        docker-compose stop postgres
        docker volume rm swifttrack-middleware_postgres_data 2>$null
        docker-compose up -d postgres
        Write-Success "Database reset completed!"
    }
    else {
        Write-Status "Database reset cancelled."
    }
}

# Function to show service URLs
function Show-Urls {
    Write-Status "Service URLs:"
    Write-Host "  Web Interface:       http://localhost:8080" -ForegroundColor $colors.White
    Write-Host "  Order Service:       http://localhost:4000" -ForegroundColor $colors.White
    Write-Host "  Driver Service:      http://localhost:4001" -ForegroundColor $colors.White
    Write-Host "  Notification Service: http://localhost:4002" -ForegroundColor $colors.White
    Write-Host "  CMS Mock:            http://localhost:5001" -ForegroundColor $colors.White
    Write-Host "  WMS Mock:            http://localhost:5002" -ForegroundColor $colors.White
    Write-Host "  ROS Mock:            http://localhost:5003" -ForegroundColor $colors.White
    Write-Host "  PostgreSQL:          localhost:5432" -ForegroundColor $colors.White
    Write-Host "  Redpanda (Kafka):    localhost:9092" -ForegroundColor $colors.White
    Write-Host "  Redis:               localhost:6379" -ForegroundColor $colors.White
}

# Function to run development mode
function Start-DevMode {
    Write-Status "Starting development environment..."
    docker-compose up postgres redpanda redis cms-mock wms-mock ros-mock -d
    Write-Success "Development dependencies started!"
    Write-Status "You can now run your services locally for development."
}

# Function to show help
function Show-Help {
    Write-Host "SwiftTrack Docker Management Script (PowerShell)" -ForegroundColor $colors.Blue
    Write-Host ""
    Write-Host "Usage: .\docker-manage.ps1 [COMMAND] [SERVICE]" -ForegroundColor $colors.White
    Write-Host ""
    Write-Host "Commands:" -ForegroundColor $colors.Yellow
    Write-Host "  build       Build all services" -ForegroundColor $colors.White
    Write-Host "  start       Start all services" -ForegroundColor $colors.White
    Write-Host "  stop        Stop all services" -ForegroundColor $colors.White
    Write-Host "  restart     Restart all services" -ForegroundColor $colors.White
    Write-Host "  status      Check service health status" -ForegroundColor $colors.White
    Write-Host "  logs        View logs (all services if no service specified)" -ForegroundColor $colors.White
    Write-Host "  cleanup     Stop services and clean up Docker resources" -ForegroundColor $colors.White
    Write-Host "  reset-db    Reset the database (destroys all data)" -ForegroundColor $colors.White
    Write-Host "  urls        Show service URLs" -ForegroundColor $colors.White
    Write-Host "  dev         Start only dependencies for local development" -ForegroundColor $colors.White
    Write-Host "  help        Show this help message" -ForegroundColor $colors.White
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor $colors.Yellow
    Write-Host "  .\docker-manage.ps1 start                 # Start all services" -ForegroundColor $colors.White
    Write-Host "  .\docker-manage.ps1 logs order-service    # View logs for order service" -ForegroundColor $colors.White
    Write-Host "  .\docker-manage.ps1 status                # Check service health" -ForegroundColor $colors.White
}

# Main script logic
Test-Docker

switch ($Command.ToLower()) {
    "build" {
        Build-Services
    }
    "start" {
        Start-Services
        Show-Urls
    }
    "stop" {
        Stop-Services
    }
    "restart" {
        Restart-Services
    }
    "status" {
        Test-ServiceHealth
    }
    "logs" {
        Show-Logs $Service
    }
    "cleanup" {
        Invoke-Cleanup
    }
    "reset-db" {
        Reset-Database
    }
    "urls" {
        Show-Urls
    }
    "dev" {
        Start-DevMode
    }
    "help" {
        Show-Help
    }
    default {
        Write-Error "Unknown command: $Command"
        Show-Help
        exit 1
    }
}
