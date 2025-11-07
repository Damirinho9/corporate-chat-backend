#!/bin/bash

# Script to cleanup duplicate department chats
# Removes old group-type chats that duplicate department-type chats

echo "🧹 Очистка дублирующихся чатов отделов..."
echo ""

# Database credentials from ecosystem.config.js
export PGHOST=localhost
export PGPORT=5432
export PGDATABASE=chat_db
export PGUSER=postgres
export PGPASSWORD=12345

# Run the cleanup script
psql -f cleanup-duplicate-department-chats.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Дублирующиеся чаты удалены!"
    echo "Осталось:"
    echo "  - department: чаты отделов"
    echo "  - group: обычные групповые чаты (РОПы + Ассистенты)"
    exit 0
else
    echo ""
    echo "❌ Ошибка при очистке!"
    exit 1
fi
