-- ==============================================================================
-- CORTAI - Performance Indexes
-- ==============================================================================
-- Adds composite indexes for common query patterns to eliminate sequential scans
-- ==============================================================================

-- ==============================================================================
-- Jobs: composite indexes for user listing with status filter
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_jobs_user_status
  ON public.jobs(user_id, status);

-- ==============================================================================
-- Clips: composite indexes for filtered user queries
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_clips_user_status
  ON public.clips(user_id, status);

CREATE INDEX IF NOT EXISTS idx_clips_user_created
  ON public.clips(user_id, created_at DESC);

-- ==============================================================================
-- Subscriptions: composite for active subscription lookups
-- Covers: WHERE user_id = $1 AND status = 'active' AND current_period_end > NOW()
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status_period
  ON public.subscriptions(user_id, status, current_period_end);

-- ==============================================================================
-- Payments: composite for user payment history queries
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_payments_user_created
  ON public.payments(user_id, created_at DESC);

-- ==============================================================================
-- Usage records: composite for period-based usage aggregation
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_usage_records_user_type_period
  ON public.usage_records(user_id, usage_type, period_start, period_end);
