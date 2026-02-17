-- =====================================================
-- Wave 1: Scan Status Lifecycle & AI Enrichment Separation
-- =====================================================
-- Migration: 20260217_wave1_scan_status_refactor.sql
-- 
-- Changes:
-- 1. Add AI enrichment tracking columns (separate from scan lifecycle)
-- 2. Update scan status values to canonical enum
-- 3. Ensure commit_hash consistency (already exists, just documenting)
--
-- =====================================================

-- Step 1: Add AI enrichment columns to scans table
ALTER TABLE scans 
  ADD COLUMN IF NOT EXISTS ai_enrichment_status TEXT DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS ai_enrichment_started_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS ai_enrichment_completed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS ai_enrichment_error TEXT;

-- Step 2: Add check constraint for AI enrichment status
ALTER TABLE scans 
  DROP CONSTRAINT IF EXISTS scans_ai_enrichment_status_check;

ALTER TABLE scans 
  ADD CONSTRAINT scans_ai_enrichment_status_check 
  CHECK (ai_enrichment_status IN ('not_requested', 'enriching', 'completed', 'failed'));

-- Step 3: Update scan status constraint to canonical values
-- Note: We'll map old values to new values in application code during transition
ALTER TABLE scans 
  DROP CONSTRAINT IF EXISTS scans_status_check;

ALTER TABLE scans 
  ADD CONSTRAINT scans_status_check 
  CHECK (status IN ('queued', 'processing', 'completed', 'failed'));

-- Step 4: Create index on AI enrichment status for queries
CREATE INDEX IF NOT EXISTS idx_scans_ai_enrichment_status 
  ON scans(ai_enrichment_status) 
  WHERE ai_enrichment_status != 'not_requested';

-- Step 5: Add comment to document the separation
COMMENT ON COLUMN scans.status IS 'Scan lifecycle status (queued → processing → completed/failed). AI enrichment is tracked separately.';
COMMENT ON COLUMN scans.ai_enrichment_status IS 'AI enrichment status (separate from scan lifecycle). Enrichment can fail without affecting scan completion.';

-- Step 6: Ensure commit_hash column exists (should already exist)
-- This is just documentation - the column should already be present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'scans' AND column_name = 'commit_hash'
  ) THEN
    RAISE EXCEPTION 'commit_hash column does not exist in scans table. Manual intervention required.';
  END IF;
END $$;

-- Step 7: Update auto_scan_history table to use commit_hash (if using commit_sha)
-- Check if the column exists with old name and rename it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'auto_scan_history' AND column_name = 'commit_sha'
  ) THEN
    ALTER TABLE auto_scan_history RENAME COLUMN commit_sha TO commit_hash;
  END IF;
END $$;

-- Step 8: Create helper function to map old status values to new ones (for transition period)
CREATE OR REPLACE FUNCTION map_legacy_scan_status(old_status TEXT) 
RETURNS TEXT AS $$
BEGIN
  RETURN CASE 
    WHEN old_status IN ('pending') THEN 'queued'
    WHEN old_status IN ('running', 'normalizing') THEN 'processing'
    WHEN old_status IN ('completed') THEN 'completed'
    WHEN old_status IN ('failed', 'cancelled') THEN 'failed'
    ELSE 'queued' -- Default fallback
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION map_legacy_scan_status IS 'Maps legacy scan status values to canonical Wave 1 status enum. Used during transition period.';
