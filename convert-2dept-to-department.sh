#!/bin/bash

# Script to convert "2 отдел" chat from group to department type

echo "🔄 Конвертация чата '2 отдел' group → department..."
echo ""

# Database credentials from ecosystem.config.js
export PGHOST=localhost
export PGPORT=5432
export PGDATABASE=chat_db
export PGUSER=postgres
export PGPASSWORD=12345

# Run the conversion script
psql -f convert-2dept-to-department.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Чат '2 отдел' успешно конвертирован в department!"
    exit 0
else
    echo ""
    echo "❌ Ошибка при конвертации!"
    exit 1
fi
