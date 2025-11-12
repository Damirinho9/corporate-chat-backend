#!/bin/bash
# scripts/backup.sh
# Bash обертка для системы бэкапов

set -e

# Определяем директорию проекта
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Загружаем переменные окружения
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Функция для вывода цветного текста
log_info() {
    echo -e "\033[0;34m[INFO]\033[0m $1"
}

log_success() {
    echo -e "\033[0;32m[SUCCESS]\033[0m $1"
}

log_error() {
    echo -e "\033[0;31m[ERROR]\033[0m $1"
}

# Проверяем наличие необходимых утилит
check_dependencies() {
    local missing=()

    if ! command -v pg_dump &> /dev/null; then
        missing+=("postgresql-client (pg_dump)")
    fi

    if ! command -v gzip &> /dev/null; then
        missing+=("gzip")
    fi

    if ! command -v tar &> /dev/null; then
        missing+=("tar")
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing dependencies:"
        for dep in "${missing[@]}"; do
            echo "  - $dep"
        done
        echo ""
        echo "Install on Ubuntu/Debian:"
        echo "  sudo apt-get install postgresql-client gzip tar"
        exit 1
    fi
}

# Выполняем бэкап
perform_backup() {
    log_info "Starting backup process..."

    if [ -z "$DB_PASSWORD" ]; then
        log_error "DB_PASSWORD not set in .env file"
        exit 1
    fi

    node scripts/backup.js

    if [ $? -eq 0 ]; then
        log_success "Backup completed successfully"
        return 0
    else
        log_error "Backup failed"
        return 1
    fi
}

# Показать помощь
show_help() {
    cat << EOF
Corporate Chat Backup Script

Usage:
  ./scripts/backup.sh [command]

Commands:
  backup    - Perform backup now (default)
  check     - Check if all dependencies are installed
  list      - List available backups
  help      - Show this help message

Environment variables (set in .env):
  BACKUP_ENABLED=true           - Enable automatic backups
  BACKUP_DIR=./backups          - Backup directory
  BACKUP_KEEP_DAYS=7            - Keep backups for N days
  BACKUP_INTERVAL_HOURS=24      - Backup interval in hours

Examples:
  ./scripts/backup.sh                    # Perform backup now
  ./scripts/backup.sh check              # Check dependencies
  ./scripts/backup.sh list               # List backups

Cron setup for automatic backups:
  # Add to crontab -e:
  0 3 * * * cd /path/to/corporate-chat-backend && ./scripts/backup.sh backup >> /var/log/chat-backup.log 2>&1

EOF
}

# Список бэкапов
list_backups() {
    log_info "Available backups:"
    if [ -d "${BACKUP_DIR:-./backups}" ]; then
        ls -lh "${BACKUP_DIR:-./backups}" | grep -E "(db-backup|files-backup|backup-metadata)" || echo "  No backups found"
    else
        echo "  Backup directory doesn't exist: ${BACKUP_DIR:-./backups}"
    fi
}

# Главная функция
main() {
    local command="${1:-backup}"

    case "$command" in
        backup)
            check_dependencies
            perform_backup
            ;;
        check)
            check_dependencies
            log_success "All dependencies are installed"
            ;;
        list)
            list_backups
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "Unknown command: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

main "$@"
