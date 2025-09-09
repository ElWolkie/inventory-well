-- =========================================================
--  Base de datos y esquema para "inventary-well"
--  Ejecutar con:
--    psql -U postgres -h localhost -f schema_inventary-well.sql
-- =========================================================

-- 1) Crear la base de datos (usa comillas por el guion en el nombre)
--    Si ya existe, este comando fallará pero psql seguirá con el resto
--    (a menos que fuerces ON_ERROR_STOP=on).
CREATE DATABASE "inventary-well"
  WITH ENCODING 'UTF8'
       TEMPLATE template0;

-- 2) Conectarse a la nueva base
\connect "inventary-well"

-- 3) Crear la tabla (idempotente)
CREATE TABLE IF NOT EXISTS entries (
  id SERIAL PRIMARY KEY,
  client_name TEXT NOT NULL,
  client_address TEXT,
  environment TEXT,
  pressure INTEGER,
  oil_type TEXT,
  min_barrels INTEGER,
  max_barrels INTEGER,
  test_duration INTEGER,
  results JSONB NOT NULL,
  params JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- (Opcional) Índices útiles para búsquedas:
-- CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries (created_at);
-- CREATE INDEX IF NOT EXISTS idx_entries_env ON entries (environment);

-- (Opcional) Verificación rápida:
-- \dt
-- \d+ entries