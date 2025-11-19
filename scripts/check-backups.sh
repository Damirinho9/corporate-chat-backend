#!/bin/bash
#
# Backup Health Check Script
# Проверка состояния бэкапов и отправка оповещений
#

BACKUP_DIR="/home/damir/corporate-chat-backend/backups"
LOG_FILE="$BACKUP_DIR/backup.log"

# Настройки оповещений (можно настроить email)
ALERT_EMAIL=""  # Укажите email для оповещений

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

errors=0
warnings=0

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((errors++))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((warnings++))
}

echo ""
echo "🔍 Проверка состояния бэкапов"
echo "================================"
echo ""

# 1. Проверяем директории
echo "📁 Директории:"
for dir in daily weekly monthly; do
    if [ -d "$BACKUP_DIR/$dir" ]; then
        check_pass "$dir/ существует"
    else
        check_fail "$dir/ не найдена"
    fi
done
echo ""

# 2. Проверяем наличие свежих бэкапов
echo "📅 Свежесть бэкапов:"

# Daily - должен быть за последние 25 часов
latest_daily=$(find "$BACKUP_DIR/daily" -name "backup_*.sql.gz" -mmin -1500 2>/dev/null | head -1)
if [ -n "$latest_daily" ]; then
    age_hours=$(( ($(date +%s) - $(stat -c %Y "$latest_daily" 2>/dev/null || stat -f %m "$latest_daily" 2>/dev/null)) / 3600 ))
    check_pass "Daily бэкап: $(basename "$latest_daily") (${age_hours}ч назад)"
else
    check_fail "Нет свежего daily бэкапа (>25 часов)"
fi

# Weekly - должен быть за последние 8 дней
latest_weekly=$(find "$BACKUP_DIR/weekly" -name "backup_*.sql.gz" -mtime -8 2>/dev/null | head -1)
if [ -n "$latest_weekly" ]; then
    check_pass "Weekly бэкап: $(basename "$latest_weekly")"
else
    # Не ошибка если weekly ещё не было
    if [ $(find "$BACKUP_DIR/weekly" -name "backup_*.sql.gz" 2>/dev/null | wc -l) -eq 0 ]; then
        check_warn "Weekly бэкапов пока нет (создаются по воскресеньям)"
    else
        check_warn "Weekly бэкап старше 8 дней"
    fi
fi

# Monthly
latest_monthly=$(find "$BACKUP_DIR/monthly" -name "backup_*.sql.gz" -mtime -35 2>/dev/null | head -1)
if [ -n "$latest_monthly" ]; then
    check_pass "Monthly бэкап: $(basename "$latest_monthly")"
else
    if [ $(find "$BACKUP_DIR/monthly" -name "backup_*.sql.gz" 2>/dev/null | wc -l) -eq 0 ]; then
        check_warn "Monthly бэкапов пока нет (создаются 1-го числа)"
    else
        check_warn "Monthly бэкап старше 35 дней"
    fi
fi
echo ""

# 3. Проверяем размеры бэкапов
echo "💾 Размеры последних бэкапов:"
if [ -n "$latest_daily" ]; then
    size=$(ls -lh "$latest_daily" | awk '{print $5}')
    size_bytes=$(stat -c%s "$latest_daily" 2>/dev/null || stat -f%z "$latest_daily" 2>/dev/null)

    if [ "$size_bytes" -lt 5000 ]; then
        check_fail "Бэкап слишком маленький: $size (возможно повреждён)"
    else
        check_pass "Размер: $size"
    fi
fi
echo ""

# 4. Проверяем целостность последнего бэкапа
echo "🔐 Целостность:"
if [ -n "$latest_daily" ]; then
    if gzip -t "$latest_daily" 2>/dev/null; then
        check_pass "gzip архив валидный"
    else
        check_fail "gzip архив повреждён!"
    fi

    if zcat "$latest_daily" | grep -q "CREATE TABLE"; then
        check_pass "SQL дамп содержит структуру таблиц"
    else
        check_fail "SQL дамп повреждён или пустой"
    fi
fi
echo ""

# 5. Статистика
echo "📊 Статистика:"
total_daily=$(find "$BACKUP_DIR/daily" -name "backup_*.sql.gz" 2>/dev/null | wc -l)
total_weekly=$(find "$BACKUP_DIR/weekly" -name "backup_*.sql.gz" 2>/dev/null | wc -l)
total_monthly=$(find "$BACKUP_DIR/monthly" -name "backup_*.sql.gz" 2>/dev/null | wc -l)
total_size=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)

echo "   Daily:   $total_daily файлов"
echo "   Weekly:  $total_weekly файлов"
echo "   Monthly: $total_monthly файлов"
echo "   Всего:   $total_size"
echo ""

# 6. Последние записи в логе
echo "📝 Последние записи в логе:"
if [ -f "$LOG_FILE" ]; then
    tail -5 "$LOG_FILE" | sed 's/^/   /'
else
    echo "   Лог не найден"
fi
echo ""

# 7. Проверяем cron
echo "⏰ Cron задания:"
cron_job=$(crontab -l 2>/dev/null | grep -c "backup-db.sh")
if [ "$cron_job" -gt 0 ]; then
    check_pass "Cron задание настроено"
    crontab -l 2>/dev/null | grep "backup-db.sh" | sed 's/^/   /'
else
    check_fail "Cron задание НЕ настроено!"
fi
echo ""

# Итог
echo "================================"
if [ $errors -eq 0 ] && [ $warnings -eq 0 ]; then
    echo -e "${GREEN}✅ Все проверки пройдены${NC}"
elif [ $errors -eq 0 ]; then
    echo -e "${YELLOW}⚠️  Предупреждений: $warnings${NC}"
else
    echo -e "${RED}❌ Ошибок: $errors, предупреждений: $warnings${NC}"

    # Отправка email если настроено
    if [ -n "$ALERT_EMAIL" ]; then
        echo "Отправка оповещения на $ALERT_EMAIL..."
        echo "Backup check failed with $errors errors" | mail -s "ALERT: Corporate Chat Backup Failed" "$ALERT_EMAIL"
    fi
fi
echo ""

exit $errors
