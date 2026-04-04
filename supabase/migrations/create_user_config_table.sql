-- SQL-запрос для создания таблицы user_config
-- Таблица для хранения неубиваемых ключей конфигурации в Supabase

CREATE TABLE IF NOT EXISTS user_config (
    id SERIAL PRIMARY KEY,
    key_name TEXT UNIQUE NOT NULL,
    key_value TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индекс для быстрого поиска по key_name
CREATE INDEX IF NOT EXISTS idx_user_config_key_name ON user_config(key_name);

-- Триггер для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_config_updated_at
    BEFORE UPDATE ON user_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Разрешения (если нужно)
-- GRANT SELECT, INSERT, UPDATE ON user_config TO authenticated;
-- GRANT USAGE, SELECT ON SEQUENCE user_config_id_seq TO authenticated;
