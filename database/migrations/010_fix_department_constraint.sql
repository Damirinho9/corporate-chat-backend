-- ================================================
-- МИГРАЦИЯ: Исправление check_department constraint
-- Разрешаем assistant и admin иметь опциональный department
-- ================================================

-- 1. Удаляем старый constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS check_department;

-- 2. Создаем новый constraint
-- Логика:
-- - admin и assistant: могут иметь department или NULL (опционально)
-- - rop, operator, employee: должны иметь department (обязательно)
ALTER TABLE users ADD CONSTRAINT check_department CHECK (
    (role IN ('admin', 'assistant')) OR
    (role IN ('rop', 'operator', 'employee') AND department IS NOT NULL)
);

COMMENT ON CONSTRAINT check_department ON users IS 'Проверяет что rop/operator/employee имеют отдел, admin/assistant могут иметь отдел опционально';
