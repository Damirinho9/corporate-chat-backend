#!/usr/bin/env bash
# Безопасный деплой с Blue-Green стратегией
# Использование: ./scripts/deploy.sh [version]

set -e

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

VERSION="${1:-latest}"
COMPOSE_FILE="docker-compose.production.yml"
BACKUP_DIR="./backups"
DEPLOY_LOG="./logs/deploy_$(date +%Y%m%d_%H%M%S).log"

# Функция логирования
log() {
    echo -e "${2:-$NC}$1${NC}" | tee -a "${DEPLOY_LOG}"
}

# Функция проверки health check
check_health() {
    local url=$1
    local max_attempts=30
    local attempt=1

    log "⏳ Checking health at ${url}..." "$YELLOW"

    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "${url}" > /dev/null; then
            log "✅ Health check passed!" "$GREEN"
            return 0
        fi
        log "   Attempt ${attempt}/${max_attempts}..." "$YELLOW"
        sleep 2
        ((attempt++))
    done

    log "❌ Health check failed after ${max_attempts} attempts" "$RED"
    return 1
}

# Функция smoke tests
run_smoke_tests() {
    local base_url=$1
    log "🧪 Running smoke tests..." "$YELLOW"

    # Test 1: Health endpoint
    if ! curl -f -s "${base_url}/api/health" | grep -q "ok"; then
        log "❌ Health endpoint test failed" "$RED"
        return 1
    fi
    log "✅ Health endpoint OK" "$GREEN"

    # Test 2: Auth endpoint exists
    if ! curl -f -s -o /dev/null -w "%{http_code}" "${base_url}/api/auth/login" | grep -q "400\|401"; then
        log "❌ Auth endpoint test failed" "$RED"
        return 1
    fi
    log "✅ Auth endpoint OK" "$GREEN"

    # Test 3: Static files
    if ! curl -f -s -o /dev/null "${base_url}/"; then
        log "❌ Static files test failed" "$RED"
        return 1
    fi
    log "✅ Static files OK" "$GREEN"

    log "✅ All smoke tests passed!" "$GREEN"
    return 0
}

# Определение текущего активного цвета
get_active_color() {
    if docker ps --format '{{.Names}}' | grep -q "backend-blue"; then
        if docker ps --format '{{.Names}}' | grep -q "backend-green"; then
            # Оба работают - проверяем конфиг nginx
            if grep -q "backend-green" nginx/active_backend.conf 2>/dev/null; then
                echo "green"
            else
                echo "blue"
            fi
        else
            echo "blue"
        fi
    elif docker ps --format '{{.Names}}' | grep -q "backend-green"; then
        echo "green"
    else
        echo "none"
    fi
}

# Главная логика деплоя
main() {
    log "========================================" "$BLUE"
    log "🚀 Starting Blue-Green Deployment" "$BLUE"
    log "========================================" "$BLUE"
    log "Version: ${VERSION}"
    log "Time: $(date)"
    log ""

    # Создаём необходимые директории
    mkdir -p backups logs nginx

    # Определяем текущий цвет
    ACTIVE_COLOR=$(get_active_color)
    if [ "$ACTIVE_COLOR" = "blue" ]; then
        NEW_COLOR="green"
        NEW_PORT=3002
        OLD_COLOR="blue"
        OLD_PORT=3001
    else
        NEW_COLOR="blue"
        NEW_PORT=3001
        OLD_COLOR="green"
        OLD_PORT=3002
    fi

    log "📊 Current active: ${ACTIVE_COLOR}" "$YELLOW"
    log "📊 Deploying to: ${NEW_COLOR}" "$YELLOW"
    log ""

    # ===== ШАГ 1: BACKUP =====
    log "========================================" "$BLUE"
    log "📦 STEP 1: Creating database backup" "$BLUE"
    log "========================================" "$BLUE"

    if [ -f "./scripts/backup_database.sh" ]; then
        ./scripts/backup_database.sh || {
            log "❌ Backup failed! Aborting deployment." "$RED"
            exit 1
        }
    else
        log "⚠️  Backup script not found, skipping..." "$YELLOW"
    fi

    log ""

    # ===== ШАГ 2: BUILD & START NEW VERSION =====
    log "========================================" "$BLUE"
    log "🏗️  STEP 2: Building and starting ${NEW_COLOR} environment" "$BLUE"
    log "========================================" "$BLUE"

    # Билдим новый образ
    docker-compose -f "${COMPOSE_FILE}" build backend-${NEW_COLOR} || {
        log "❌ Build failed! Aborting deployment." "$RED"
        exit 1
    }

    # Запускаем новый контейнер
    docker-compose -f "${COMPOSE_FILE}" up -d backend-${NEW_COLOR} || {
        log "❌ Failed to start ${NEW_COLOR} container! Aborting deployment." "$RED"
        exit 1
    }

    log "✅ ${NEW_COLOR} container started" "$GREEN"
    log ""

    # ===== ШАГ 3: RUN MIGRATIONS =====
    log "========================================" "$BLUE"
    log "🔄 STEP 3: Running database migrations" "$BLUE"
    log "========================================" "$BLUE"

    docker exec corporate-chat-backend-${NEW_COLOR} npm run migrate || {
        log "❌ Migrations failed! Stopping ${NEW_COLOR} container." "$RED"
        docker-compose -f "${COMPOSE_FILE}" stop backend-${NEW_COLOR}
        exit 1
    }

    log "✅ Migrations completed" "$GREEN"
    log ""

    # ===== ШАГ 4: HEALTH CHECK =====
    log "========================================" "$BLUE"
    log "🏥 STEP 4: Health check on new version" "$BLUE"
    log "========================================" "$BLUE"

    check_health "http://localhost:${NEW_PORT}/api/health" || {
        log "❌ Health check failed! Rolling back..." "$RED"
        docker-compose -f "${COMPOSE_FILE}" stop backend-${NEW_COLOR}
        exit 1
    }

    log ""

    # ===== ШАГ 5: SMOKE TESTS =====
    log "========================================" "$BLUE"
    log "🧪 STEP 5: Running smoke tests" "$BLUE"
    log "========================================" "$BLUE"

    run_smoke_tests "http://localhost:${NEW_PORT}" || {
        log "❌ Smoke tests failed! Rolling back..." "$RED"
        docker-compose -f "${COMPOSE_FILE}" stop backend-${NEW_COLOR}
        exit 1
    }

    log ""

    # ===== ШАГ 6: SWITCH TRAFFIC =====
    log "========================================" "$BLUE"
    log "🔀 STEP 6: Switching traffic to ${NEW_COLOR}" "$BLUE"
    log "========================================" "$BLUE"

    # Создаём nginx конфиг для нового backend
    cat > nginx/active_backend.conf <<EOF
# Active backend configuration
# Generated: $(date)
# Active color: ${NEW_COLOR}

upstream backend {
    server corporate-chat-backend-${NEW_COLOR}:3000;
}
EOF

    # Перезагружаем nginx
    if docker ps --format '{{.Names}}' | grep -q "corporate-chat-nginx"; then
        docker exec corporate-chat-nginx nginx -s reload || {
            log "❌ Failed to reload nginx! Manual intervention required." "$RED"
            exit 1
        }
        log "✅ Nginx reloaded, traffic switched to ${NEW_COLOR}" "$GREEN"
    else
        log "⚠️  Nginx container not running, starting it..." "$YELLOW"
        docker-compose -f "${COMPOSE_FILE}" up -d nginx
    fi

    log ""

    # ===== ШАГ 7: MONITOR =====
    log "========================================" "$BLUE"
    log "📊 STEP 7: Monitoring new version" "$BLUE"
    log "========================================" "$BLUE"

    log "Monitoring for 30 seconds..." "$YELLOW"
    for i in {1..6}; do
        sleep 5
        if ! check_health "http://localhost:${NEW_PORT}/api/health"; then
            log "❌ New version became unhealthy! Rolling back..." "$RED"

            # Rollback
            cat > nginx/active_backend.conf <<EOF
upstream backend {
    server corporate-chat-backend-${OLD_COLOR}:3000;
}
EOF
            docker exec corporate-chat-nginx nginx -s reload
            docker-compose -f "${COMPOSE_FILE}" stop backend-${NEW_COLOR}

            log "✅ Rolled back to ${OLD_COLOR}" "$GREEN"
            exit 1
        fi
        log "   Check ${i}/6 passed..." "$GREEN"
    done

    log "✅ New version stable!" "$GREEN"
    log ""

    # ===== ШАГ 8: CLEANUP =====
    log "========================================" "$BLUE"
    log "🧹 STEP 8: Cleanup old version" "$BLUE"
    log "========================================" "$BLUE"

    if [ "$ACTIVE_COLOR" != "none" ]; then
        log "Stopping ${OLD_COLOR} container..." "$YELLOW"
        docker-compose -f "${COMPOSE_FILE}" stop backend-${OLD_COLOR}
        log "✅ Old version stopped" "$GREEN"
    fi

    log ""

    # ===== COMPLETED =====
    log "========================================" "$GREEN"
    log "✅ DEPLOYMENT COMPLETED SUCCESSFULLY!" "$GREEN"
    log "========================================" "$GREEN"
    log "Active version: ${NEW_COLOR}"
    log "Deployment log: ${DEPLOY_LOG}"
    log ""
    log "🎯 To rollback, run: docker-compose -f ${COMPOSE_FILE} up -d backend-${OLD_COLOR} && nginx reload"
}

# Проверка зависимостей
command -v docker >/dev/null 2>&1 || { echo "❌ docker is required but not installed. Aborting." >&2; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo "❌ docker-compose is required but not installed. Aborting." >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "❌ curl is required but not installed. Aborting." >&2; exit 1; }

# Запуск
main "$@"
