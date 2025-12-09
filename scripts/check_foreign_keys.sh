#!/bin/bash

# Check all foreign keys referencing users table
# and their ON DELETE actions

set -e

# Load database credentials from .env
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-corporate_chat}
DB_USER=${DB_USER:-postgres}

echo "========================================="
echo "🔍 Checking Foreign Keys on users table"
echo "========================================="
echo ""

PGPASSWORD=$DB_PASSWORD psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -c "
SELECT
    tc.table_name,
    kcu.column_name,
    tc.constraint_name,
    rc.delete_rule,
    CASE
        WHEN rc.delete_rule = 'NO ACTION' THEN '❌ NO ACTION (will block deletion)'
        WHEN rc.delete_rule = 'RESTRICT' THEN '❌ RESTRICT (will block deletion)'
        WHEN rc.delete_rule = 'CASCADE' THEN '✅ CASCADE'
        WHEN rc.delete_rule = 'SET NULL' THEN '✅ SET NULL'
        WHEN rc.delete_rule = 'SET DEFAULT' THEN '⚠️ SET DEFAULT'
        ELSE '❓ UNKNOWN'
    END as status
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.referential_constraints rc
    ON tc.constraint_name = rc.constraint_name
JOIN information_schema.constraint_column_usage ccu
    ON rc.unique_constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = 'users'
    AND tc.table_schema = 'public'
ORDER BY
    CASE
        WHEN rc.delete_rule IN ('NO ACTION', 'RESTRICT') THEN 0
        ELSE 1
    END,
    tc.table_name;
"

echo ""
echo "========================================="
echo "Legend:"
echo "  ❌ = Will block user deletion"
echo "  ✅ = Allows user deletion"
echo "  ⚠️ = Check default value"
echo "========================================="
