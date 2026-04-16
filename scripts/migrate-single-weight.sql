-- Migration: consolidate three weight columns into one
-- Run in Supabase SQL Editor. Idempotent — safe to run multiple times.

-- Step 1: Rename weight_gralloch → weight_kg (preserves existing data)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cull_entries' AND column_name = 'weight_gralloch'
  ) THEN
    ALTER TABLE cull_entries RENAME COLUMN weight_gralloch TO weight_kg;
  END IF;
END $$;

-- Step 2: Drop weight_clean and weight_larder
ALTER TABLE cull_entries DROP COLUMN IF EXISTS weight_clean;
ALTER TABLE cull_entries DROP COLUMN IF EXISTS weight_larder;
