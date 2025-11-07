#!/bin/bash

# Script to delete empty test departments
# Deletes: Отдел 1, Отдел 2, Отдел 3

echo "🗑️  Удаление пустых тестовых отделов..."
echo ""

# Database credentials from ecosystem.config.js
export PGHOST=localhost
export PGPORT=5432
export PGDATABASE=chat_db
export PGUSER=postgres
export PGPASSWORD=12345

# Run the deletion script
psql -f delete-empty-departments.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Пустые отделы удалены!"
    exit 0
else
    echo ""
    echo "❌ Ошибка при удалении отделов!"
    exit 1
fi
