-- Add virality score columns to clips table
ALTER TABLE clips ADD COLUMN IF NOT EXISTS virality_components JSONB;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS virality_label TEXT;

-- ai_score column already exists, will be used for the unified virality score (0-100)
