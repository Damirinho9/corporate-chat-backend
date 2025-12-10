#!/bin/bash

# Скрипт для сброса пароля админа

set -e

# Load .env
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "❌ Файл .env не найден"
    exit 1
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}🔐 Сброс пароля администратора${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

# Prompt for new password
read -p "Введите новый пароль для admin: " NEW_PASSWORD

if [ -z "$NEW_PASSWORD" ]; then
    echo -e "${RED}❌ Пароль не может быть пустым${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Генерация bcrypt hash...${NC}"

# Generate bcrypt hash using Node.js
HASH=$(node -e "
const bcrypt = require('bcryptjs');
const password = process.argv[1];
const hash = bcrypt.hashSync(password, 10);
console.log(hash);
" "$NEW_PASSWORD")

if [ -z "$HASH" ]; then
    echo -e "${RED}❌ Ошибка генерации хеша${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Hash сгенерирован${NC}"
echo ""

# Update database
echo -e "${YELLOW}Обновление базы данных...${NC}"

PGPASSWORD=$DB_PASSWORD psql -h localhost -p 5433 -U postgres -d corporate_chat <<EOF
UPDATE users
SET password_hash = '$HASH',
    initial_password = '$NEW_PASSWORD'
WHERE username = 'admin';

SELECT
    id,
    username,
    name,
    role,
    LEFT(password_hash, 30) || '...' as password_hash_start,
    initial_password
FROM users
WHERE username = 'admin';
EOF

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Пароль успешно сброшен!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Логин: ${YELLOW}admin${NC}"
echo -e "Пароль: ${YELLOW}$NEW_PASSWORD${NC}"
echo ""
