-- ==============================================================================
-- Migration: Usage idempotency key
-- Description: Prevent double-counting usage on retries / repeated events.
-- ==============================================================================

ALTER TABLE public.usage_records
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Unique per user + usage type + idempotency key.
-- Note: NULL values are allowed multiple times (Postgres unique index semantics).
CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_records_idempotency_key
  ON public.usage_records (user_id, usage_type, idempotency_key);

