-- Migration: add structured abnormality fields for trained-hunter gralloch
-- inspection (AHVLA course checklist). Previously the Game Dealer PDF relied
-- on hard-coded "No abnormalities observed" boilerplate + whatever the user
-- had typed into notes, which wasn't auditable and made aggregation across
-- seasons impossible.
--
-- `abnormalities` stores an array of short codes selected from a closed list
-- (see diary.js → ABNORMALITY_OPTIONS). `abnormalities_other` captures any
-- free-text the user adds for items not in the preset list.
-- Both are NULLable and independent — an entry can have codes only, other
-- text only, both, or neither (explicit "none observed" is a code itself).
--
-- Run in Supabase SQL Editor. Idempotent.

ALTER TABLE cull_entries
  ADD COLUMN IF NOT EXISTS abnormalities TEXT[],
  ADD COLUMN IF NOT EXISTS abnormalities_other TEXT;
