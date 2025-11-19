#!/bin/bash
# Database backup script for corporate-chat

BACKUP_DIR="/home/user/corporate-chat-backend/backups"
DB_NAME="corporate_chat"
DB_USER="postgres"
DB_HOST="127.0.0.1"
DB_PORT="5433"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$DATE.sql"

# Create backup
pg_dump -U $DB_USER -h $DB_HOST -p $DB_PORT $DB_NAME > "$BACKUP_FILE" 2>&1

if [ $? -eq 0 ]; then
    # Compress backup
    gzip "$BACKUP_FILE"
    echo "$(date): Backup successful: ${BACKUP_FILE}.gz" >> "$BACKUP_DIR/backup.log"

    # Keep only last 7 days of backups
    find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +7 -delete
else
    echo "$(date): Backup FAILED" >> "$BACKUP_DIR/backup.log"
fi
