-- ==============================================================================
-- Baseline migration
-- Ensures common helpers exist across environments (local docker, Render, Supabase).
-- ==============================================================================

-- Extensions (best-effort; safe when already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- updated_at trigger helper
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

