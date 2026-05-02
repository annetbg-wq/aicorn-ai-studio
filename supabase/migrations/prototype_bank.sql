-- Архетипы
CREATE TABLE IF NOT EXISTS prototype_archetypes (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  manifest     JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Домены
CREATE TABLE IF NOT EXISTS prototype_domains (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  manifest     JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Модули
CREATE TABLE IF NOT EXISTS prototype_modules (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  manifest     JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Дизайн пакеты
CREATE TABLE IF NOT EXISTS prototype_design_packs (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  pack_type    TEXT NOT NULL,
  manifest     JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Core layer
CREATE TABLE IF NOT EXISTS prototype_core (
  id         TEXT PRIMARY KEY DEFAULT 'core',
  manifest   JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS — публичное чтение, только service role пишет
ALTER TABLE prototype_archetypes ENABLE ROW LEVEL SECURITY;
ALTER TABLE prototype_domains    ENABLE ROW LEVEL SECURITY;
ALTER TABLE prototype_modules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE prototype_design_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE prototype_core       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read archetypes"    ON prototype_archetypes    FOR SELECT USING (true);
CREATE POLICY "Public read domains"       ON prototype_domains        FOR SELECT USING (true);
CREATE POLICY "Public read modules"       ON prototype_modules        FOR SELECT USING (true);
CREATE POLICY "Public read design packs"  ON prototype_design_packs   FOR SELECT USING (true);
CREATE POLICY "Public read core"          ON prototype_core           FOR SELECT USING (true);
