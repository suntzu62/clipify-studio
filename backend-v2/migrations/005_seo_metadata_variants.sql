-- ==============================================================================
-- Migration: SEO Metadata Variants
-- Description: Persist SEO/copy suggestions (title/description/hashtags) + 3 variants per clip
-- Date: 2026-02-06
-- ==============================================================================

ALTER TABLE public.clips
  ADD COLUMN IF NOT EXISTS seo_title TEXT,
  ADD COLUMN IF NOT EXISTS seo_description TEXT,
  ADD COLUMN IF NOT EXISTS seo_hashtags TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS seo_variants JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS seo_selected_index INTEGER DEFAULT 0;

-- Backfill for existing clips (best-effort)
UPDATE public.clips
SET
  seo_title = COALESCE(seo_title, title),
  seo_description = COALESCE(seo_description, description),
  seo_hashtags = COALESCE(seo_hashtags, hashtags, '{}'::TEXT[])
WHERE seo_title IS NULL OR seo_description IS NULL;

-- ==============================================================================
-- End of migration
-- ==============================================================================

