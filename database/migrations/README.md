# Database Migrations

This directory contains SQL migration scripts for database schema changes.

## How to Apply Migrations

### Option 1: Using the migration script (Recommended)

```bash
./scripts/apply_migration.sh database/migrations/002_fix_admin_logs_foreign_key.sql
```

### Option 2: Manual psql

```bash
psql -h localhost -U postgres -d corporate_chat -f database/migrations/002_fix_admin_logs_foreign_key.sql
```

### Option 3: Using environment variables

```bash
export $(grep -v '^#' .env | xargs)
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f database/migrations/002_fix_admin_logs_foreign_key.sql
```

## Current Migrations

### 002_fix_admin_logs_foreign_key.sql
**Problem**: Cannot delete users who have admin_logs entries
**Solution**: Add `ON DELETE SET NULL` to `admin_logs.user_id` foreign key
**Impact**: Allows user deletion; user_id in logs becomes NULL (preserves audit trail)

## Migration Naming Convention

Migrations are numbered sequentially: `XXX_description.sql`

Example:
- `001_initial_schema.sql`
- `002_fix_admin_logs_foreign_key.sql`
- `003_add_new_feature.sql`

## Best Practices

1. Always test migrations on a backup/dev database first
2. Create a database backup before running migrations
3. Migrations should be idempotent (safe to run multiple times)
4. Use `IF EXISTS` / `IF NOT EXISTS` where possible
5. Document the purpose and impact of each migration
