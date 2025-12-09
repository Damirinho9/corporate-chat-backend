#!/bin/bash

# Apply database migration script
# Usage: ./scripts/apply_migration.sh <migration_file>

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if migration file is provided
if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: Migration file not specified${NC}"
    echo "Usage: $0 <migration_file>"
    echo "Example: $0 database/migrations/002_fix_admin_logs_foreign_key.sql"
    exit 1
fi

MIGRATION_FILE="$1"

# Check if file exists
if [ ! -f "$MIGRATION_FILE" ]; then
    echo -e "${RED}❌ Error: Migration file not found: $MIGRATION_FILE${NC}"
    exit 1
fi

# Load database credentials from .env
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo -e "${YELLOW}⚠️  Warning: .env file not found, using default values${NC}"
fi

# Set defaults if not in .env
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-corporate_chat}
DB_USER=${DB_USER:-postgres}

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}🗄️  Applying Database Migration${NC}"
echo -e "${YELLOW}========================================${NC}"
echo "Migration file: $MIGRATION_FILE"
echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo "User: $DB_USER"
echo ""

# Confirm before applying
read -p "Apply this migration? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}❌ Migration cancelled${NC}"
    exit 0
fi

# Apply migration
echo -e "${GREEN}📝 Applying migration...${NC}"

PGPASSWORD=$DB_PASSWORD psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -f "$MIGRATION_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✅ Migration applied successfully!${NC}"
    echo -e "${GREEN}========================================${NC}"
else
    echo ""
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}❌ Migration failed!${NC}"
    echo -e "${RED}========================================${NC}"
    exit 1
fi
