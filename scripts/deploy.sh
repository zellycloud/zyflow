#!/bin/bash
# ==============================================
# ZyFlow Deployment Script
# ==============================================
# Usage:
#   ./scripts/deploy.sh [command]
#
# Commands:
#   setup     - Initial setup (create directories, copy configs)
#   build     - Build Docker image
#   start     - Start the service
#   stop      - Stop the service
#   restart   - Restart the service
#   logs      - View logs
#   status    - Check service status
#   backup    - Backup database
#   update    - Pull latest and redeploy
# ==============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DOCKER_COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"
ENV_FILE="$PROJECT_DIR/.env"
BACKUP_DIR="$PROJECT_DIR/backups"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi

    log_success "Prerequisites check passed"
}

# Docker Compose command (support both v1 and v2)
docker_compose() {
    if docker compose version &> /dev/null 2>&1; then
        docker compose "$@"
    else
        docker-compose "$@"
    fi
}

# Setup function
cmd_setup() {
    log_info "Setting up ZyFlow deployment..."

    check_prerequisites

    # Create backup directory
    mkdir -p "$BACKUP_DIR"

    # Check for .env file
    if [ ! -f "$ENV_FILE" ]; then
        if [ -f "$PROJECT_DIR/.env.production.template" ]; then
            log_warning ".env file not found. Creating from template..."
            cp "$PROJECT_DIR/.env.production.template" "$ENV_FILE"
            log_warning "Please edit $ENV_FILE with your configuration"

            # Generate SECRET_KEY if not set
            if grep -q "^SECRET_KEY=$" "$ENV_FILE"; then
                SECRET_KEY=$(openssl rand -hex 32)
                if [[ "$OSTYPE" == "darwin"* ]]; then
                    sed -i '' "s/^SECRET_KEY=$/SECRET_KEY=$SECRET_KEY/" "$ENV_FILE"
                else
                    sed -i "s/^SECRET_KEY=$/SECRET_KEY=$SECRET_KEY/" "$ENV_FILE"
                fi
                log_info "Generated SECRET_KEY"
            fi
        else
            log_error ".env.production.template not found"
            exit 1
        fi
    else
        log_info ".env file already exists"
    fi

    log_success "Setup complete!"
    log_info "Next steps:"
    echo "  1. Edit .env file with your configuration"
    echo "  2. Run: ./scripts/deploy.sh build"
    echo "  3. Run: ./scripts/deploy.sh start"
}

# Build function
cmd_build() {
    log_info "Building Docker image..."

    check_prerequisites

    cd "$PROJECT_DIR"
    docker_compose build --no-cache

    log_success "Build complete!"
}

# Start function
cmd_start() {
    log_info "Starting ZyFlow..."

    check_prerequisites

    if [ ! -f "$ENV_FILE" ]; then
        log_error ".env file not found. Run setup first."
        exit 1
    fi

    cd "$PROJECT_DIR"
    docker_compose up -d

    log_info "Waiting for service to be healthy..."
    sleep 5

    # Check health
    if docker_compose ps | grep -q "healthy"; then
        log_success "ZyFlow is running and healthy!"
    else
        log_warning "Service started but health check pending..."
        log_info "Check logs with: ./scripts/deploy.sh logs"
    fi

    cmd_status
}

# Stop function
cmd_stop() {
    log_info "Stopping ZyFlow..."

    cd "$PROJECT_DIR"
    docker_compose down

    log_success "ZyFlow stopped"
}

# Restart function
cmd_restart() {
    log_info "Restarting ZyFlow..."

    cmd_stop
    cmd_start
}

# Logs function
cmd_logs() {
    log_info "Showing logs (Ctrl+C to exit)..."

    cd "$PROJECT_DIR"
    docker_compose logs -f
}

# Status function
cmd_status() {
    log_info "ZyFlow Status:"

    cd "$PROJECT_DIR"

    echo ""
    docker_compose ps
    echo ""

    # Check if service is running
    if docker_compose ps | grep -q "Up"; then
        # Try health check
        if curl -s http://localhost:3100/api/health > /dev/null 2>&1; then
            log_success "Health check: OK"
        else
            log_warning "Health check: Service starting..."
        fi
    else
        log_warning "Service is not running"
    fi
}

# Backup function
cmd_backup() {
    log_info "Backing up database..."

    mkdir -p "$BACKUP_DIR"

    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/zyflow_backup_$TIMESTAMP.tar.gz"

    # Get volume name
    VOLUME_NAME=$(docker volume ls -q | grep zyflow-data || echo "")

    if [ -z "$VOLUME_NAME" ]; then
        log_error "No zyflow-data volume found"
        exit 1
    fi

    # Create backup
    docker run --rm \
        -v "$VOLUME_NAME:/data" \
        -v "$BACKUP_DIR:/backup" \
        alpine tar czf "/backup/zyflow_backup_$TIMESTAMP.tar.gz" -C /data .

    log_success "Backup created: $BACKUP_FILE"

    # Clean old backups (keep last 7)
    cd "$BACKUP_DIR"
    ls -t zyflow_backup_*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm
    log_info "Old backups cleaned (keeping last 7)"
}

# Update function
cmd_update() {
    log_info "Updating ZyFlow..."

    # Backup first
    cmd_backup

    cd "$PROJECT_DIR"

    # Pull latest
    log_info "Pulling latest changes..."
    git pull

    # Rebuild and restart
    cmd_build
    cmd_restart

    log_success "Update complete!"
}

# Help function
cmd_help() {
    echo "ZyFlow Deployment Script"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  setup     Initial setup (create directories, copy configs)"
    echo "  build     Build Docker image"
    echo "  start     Start the service"
    echo "  stop      Stop the service"
    echo "  restart   Restart the service"
    echo "  logs      View logs (follow mode)"
    echo "  status    Check service status"
    echo "  backup    Backup database"
    echo "  update    Pull latest and redeploy"
    echo "  help      Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 setup    # First time setup"
    echo "  $0 start    # Start the service"
    echo "  $0 logs     # View logs"
}

# Main
case "${1:-help}" in
    setup)
        cmd_setup
        ;;
    build)
        cmd_build
        ;;
    start)
        cmd_start
        ;;
    stop)
        cmd_stop
        ;;
    restart)
        cmd_restart
        ;;
    logs)
        cmd_logs
        ;;
    status)
        cmd_status
        ;;
    backup)
        cmd_backup
        ;;
    update)
        cmd_update
        ;;
    help|--help|-h)
        cmd_help
        ;;
    *)
        log_error "Unknown command: $1"
        cmd_help
        exit 1
        ;;
esac
