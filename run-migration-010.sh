#!/bin/bash

# Migration script for 010_fix_department_constraint.sql
# Uses credentials from ecosystem.config.js

echo "🚀 Running migration 010_fix_department_constraint.sql..."
echo ""

# Database credentials from ecosystem.config.js
export PGHOST=localhost
export PGPORT=5432
export PGDATABASE=chat_db
export PGUSER=postgres
export PGPASSWORD=12345

# Run the migration
psql -f database/migrations/010_fix_department_constraint.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    exit 0
else
    echo ""
    echo "❌ Migration failed!"
    exit 1
fi
