#!/bin/bash

# Script to delete duplicate group-type chats for departments 3 and 4

echo "🗑️  Удаление дублирующихся чатов (ID 1, 3)..."
echo ""

# Database credentials from ecosystem.config.js
export PGHOST=localhost
export PGPORT=5432
export PGDATABASE=chat_db
export PGUSER=postgres
export PGPASSWORD=12345

# Run the deletion script with automatic output (no pager)
PAGER=cat psql -f delete-duplicate-chats.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Дубли удалены!"
    echo ""
    echo "Результат:"
    echo "  🏢 Department: 2 отдел, 3 отдел, 4 отдел, Ассистенты"
    echo "  👥 Group: РОПы + Ассистенты"
    exit 0
else
    echo ""
    echo "❌ Ошибка при удалении!"
    exit 1
fi
