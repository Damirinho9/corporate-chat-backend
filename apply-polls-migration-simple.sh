#!/bin/bash
# Simple script to apply polls migration directly via psql

echo "🔧 Applying polls migration..."

# Check if we have database credentials from environment
if [ -z "$DB_NAME" ]; then
    echo "❌ DB_NAME is not set. Please provide database connection details."
    echo ""
    echo "Usage examples:"
    echo "1. Using environment variables from PM2:"
    echo "   pm2 exec 'node apply-polls-migration.js' --env production"
    echo ""
    echo "2. Using psql directly:"
    echo "   psql -h localhost -U your_user -d your_database -f database/migrations/012_create_polls.sql"
    echo ""
    echo "3. Set environment variables and run:"
    echo "   export DB_NAME=your_database"
    echo "   export DB_USER=your_user"
    echo "   export DB_PASSWORD=your_password"
    echo "   export DB_HOST=localhost"
    echo "   export DB_PORT=5432"
    echo "   node apply-polls-migration.js"
    exit 1
fi

# Try to apply migration using Node.js script
node apply-polls-migration.js
