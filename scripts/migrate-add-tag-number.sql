-- Migration: add tag_number column for carcass/tag tracking
-- Run in Supabase SQL Editor. Idempotent.

ALTER TABLE cull_entries ADD COLUMN IF NOT EXISTS tag_number TEXT;
