-- ==============================================================================
-- Migration: Add Clip Review System
-- Description: Adds approval workflow and feedback system for clips
-- Date: 2026-01-14
-- ==============================================================================

-- 1. Add review-related columns to clips table
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending_review';
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS ai_score INTEGER;
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5);
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;

-- Update existing clips to have pending_review status if they have status 'ready' or 'pending'
UPDATE public.clips SET status = 'pending_review' WHERE status IN ('ready', 'pending', 'completed');

-- 2. Create enum type for clip status (optional, for better type safety)
DO $$ BEGIN
  CREATE TYPE clip_status AS ENUM (
    'pending_review',  -- Awaiting user review
    'approved',        -- Approved by user
    'rejected',        -- Rejected by user
    'reprocessing',    -- Being reprocessed with adjustments
    'hidden'           -- Hidden from view
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Create clip_feedback table
CREATE TABLE IF NOT EXISTS public.clip_feedback (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  clip_id TEXT NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback_type TEXT, -- 'hook_weak', 'bad_cut', 'caption_error', 'wrong_moment', 'other'
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_clip_feedback_clip_id ON public.clip_feedback(clip_id);
CREATE INDEX IF NOT EXISTS idx_clip_feedback_user_id ON public.clip_feedback(user_id);

-- 4. Create clip_adjustments table (history of reprocessing)
CREATE TABLE IF NOT EXISTS public.clip_adjustments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  clip_id TEXT NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  adjustment_type TEXT, -- 'duration', 'caption_style', 'trim_start', 'trim_end', etc
  previous_value TEXT,
  new_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_clip_adjustments_clip_id ON public.clip_adjustments(clip_id);

-- 5. Create user_preferences table (learn from feedback)
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id TEXT PRIMARY KEY,
  preferred_caption_styles JSONB, -- ['MrBeast', 'Hormozi']
  preferred_clip_duration INTEGER, -- 45 (seconds)
  min_ai_score INTEGER, -- 70 (only show clips with score > 70)
  auto_approve_threshold INTEGER, -- 90 (auto-approve if score > 90)
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_clips_status_review ON public.clips(status) WHERE status = 'pending_review';
CREATE INDEX IF NOT EXISTS idx_clips_user_rating ON public.clips(user_rating);
CREATE INDEX IF NOT EXISTS idx_clips_ai_score ON public.clips(ai_score);

-- 7. Add trigger for user_preferences updated_at
CREATE OR REPLACE FUNCTION update_user_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_user_preferences_updated_at_trigger ON public.user_preferences;
CREATE TRIGGER update_user_preferences_updated_at_trigger
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_user_preferences_updated_at();

-- ==============================================================================
-- End of migration
-- ==============================================================================
