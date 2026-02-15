-- ==============================================================================
-- CORTAI - PostgreSQL Local Development Schema
-- ==============================================================================
-- Este schema é uma versão simplificada para desenvolvimento local
-- Remove dependências do Supabase Auth e RLS para facilitar testes
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- Table: jobs
-- Tracks video processing jobs (YouTube downloads and local uploads)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('youtube', 'upload')),
  youtube_url TEXT,
  upload_path TEXT,
  video_path TEXT,
  title TEXT,
  target_duration INTEGER,
  clip_count INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  current_step TEXT,
  current_step_message TEXT,
  error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON public.jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_source_type ON public.jobs(source_type);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_user_created ON public.jobs(user_id, created_at DESC);

-- ==============================================================================
-- Table: clips
-- Stores generated clips from processed videos
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.clips (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  title TEXT,
  description TEXT,
  hashtags TEXT[] DEFAULT '{}'::TEXT[],
  seo_title TEXT,
  seo_description TEXT,
  seo_hashtags TEXT[] DEFAULT '{}'::TEXT[],
  seo_variants JSONB DEFAULT '[]'::jsonb,
  seo_selected_index INTEGER DEFAULT 0,
  start_time DOUBLE PRECISION,
  end_time DOUBLE PRECISION,
  duration DOUBLE PRECISION,
  video_url TEXT,
  thumbnail_url TEXT,
  storage_path TEXT,
  thumbnail_storage_path TEXT,
  transcript JSONB,
  ai_score INTEGER,
  virality_components JSONB,
  virality_label TEXT,
  status TEXT DEFAULT 'pending',
  user_rating INTEGER,
  rejection_reason TEXT,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_clips_job_id ON public.clips(job_id);
CREATE INDEX IF NOT EXISTS idx_clips_user_id ON public.clips(user_id);
CREATE INDEX IF NOT EXISTS idx_clips_status ON public.clips(status);

-- ==============================================================================
-- Table: projects
-- User projects (optional - for future use)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  youtube_url TEXT,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);

-- ==============================================================================
-- Table: profiles
-- User profiles (simplified version without auth.users reference)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- ==============================================================================
-- Table: user_settings
-- Persist user preferences for notifications, privacy and appearance
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id TEXT PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==============================================================================
-- Triggers for updated_at
-- ==============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clips_updated_at BEFORE UPDATE ON public.clips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- Table: caption_templates
-- Stores caption/subtitle templates with styling configurations
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.caption_templates (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('creator', 'professional', 'minimal', 'custom')),
  is_premium BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT true,
  created_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  thumbnail_url TEXT,
  use_count INTEGER DEFAULT 0,
  style_config JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_caption_templates_category ON public.caption_templates(category);
CREATE INDEX IF NOT EXISTS idx_caption_templates_public ON public.caption_templates(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_caption_templates_created_by ON public.caption_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_caption_templates_use_count ON public.caption_templates(use_count DESC);

-- Trigger for updated_at
CREATE TRIGGER update_caption_templates_updated_at BEFORE UPDATE ON public.caption_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- Seed data for development
-- ==============================================================================

-- Usuários de teste devem ser criados via endpoint /auth/register

-- Seed caption templates (famous creator styles)
INSERT INTO public.caption_templates (id, name, category, is_public, style_config) VALUES
  ('template_mrbeast', 'MrBeast Style', 'creator', true, '{
    "font": "Impact",
    "fontSize": 80,
    "bold": true,
    "italic": false,
    "letterSpacing": 0,
    "fontColor": "#FFFF00",
    "backgroundColor": "#000000",
    "backgroundOpacity": 0.8,
    "outline": true,
    "outlineColor": "#000000",
    "outlineWidth": 8,
    "shadow": true,
    "shadowColor": "#000000",
    "shadowOffsetX": 4,
    "shadowOffsetY": 4,
    "position": "center",
    "marginBottom": 0,
    "marginTop": 0,
    "maxCharsPerLine": 25,
    "textAlign": "center",
    "highlightKeywords": true,
    "highlightColor": "#FF6B35",
    "highlightStyle": "color"
  }'::jsonb),

  ('template_hormozi', 'Alex Hormozi Style', 'creator', true, '{
    "font": "Montserrat Black",
    "fontSize": 72,
    "bold": true,
    "italic": false,
    "letterSpacing": 2,
    "fontColor": "#FFFFFF",
    "backgroundColor": "#FF0000",
    "backgroundOpacity": 1.0,
    "outline": false,
    "shadow": false,
    "position": "bottom",
    "marginBottom": 100,
    "marginTop": 0,
    "maxCharsPerLine": 30,
    "textAlign": "center",
    "highlightKeywords": true,
    "highlightColor": "#FFD700",
    "highlightStyle": "background"
  }'::jsonb),

  ('template_gadzhi', 'Iman Gadzhi Style', 'creator', true, '{
    "font": "Arial Black",
    "fontSize": 68,
    "bold": true,
    "italic": false,
    "letterSpacing": 1,
    "fontColor": "#FFFFFF",
    "backgroundColor": "#000000",
    "backgroundOpacity": 0,
    "outline": true,
    "outlineColor": "#FFD700",
    "outlineWidth": 5,
    "shadow": true,
    "shadowColor": "#000000",
    "shadowOffsetX": 2,
    "shadowOffsetY": 2,
    "position": "bottom",
    "marginBottom": 120,
    "marginTop": 0,
    "maxCharsPerLine": 28,
    "textAlign": "center",
    "highlightKeywords": false
  }'::jsonb),

  ('template_minimal', 'Minimal Clean', 'minimal', true, '{
    "font": "Helvetica",
    "fontSize": 56,
    "bold": false,
    "italic": false,
    "letterSpacing": 0,
    "fontColor": "#FFFFFF",
    "backgroundColor": "#000000",
    "backgroundOpacity": 0.5,
    "outline": false,
    "shadow": false,
    "position": "bottom",
    "marginBottom": 80,
    "marginTop": 0,
    "maxCharsPerLine": 35,
    "textAlign": "center",
    "highlightKeywords": false
  }'::jsonb),

  ('template_professional', 'Professional News', 'professional', true, '{
    "font": "Arial",
    "fontSize": 60,
    "bold": true,
    "italic": false,
    "letterSpacing": 0,
    "fontColor": "#FFFFFF",
    "backgroundColor": "#1E3A8A",
    "backgroundOpacity": 0.9,
    "outline": false,
    "shadow": true,
    "shadowColor": "#000000",
    "shadowOffsetX": 2,
    "shadowOffsetY": 2,
    "position": "bottom",
    "marginBottom": 60,
    "marginTop": 0,
    "maxCharsPerLine": 40,
    "textAlign": "center",
    "highlightKeywords": false
  }'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- Grant permissions (for local development - no RLS needed)
-- ==============================================================================
-- Note: In production with Supabase, use RLS policies instead
-- For local dev, we grant all permissions

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres;

-- ==============================================================================
-- End of schema
-- ==============================================================================
