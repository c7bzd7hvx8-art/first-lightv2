-- First Light — app_errors table
--
-- Purpose: lightweight, one-shot client-side error capture so we can see
-- what breaks for real users without piping everything through Sentry or
-- setting up a separate logging backend. The Cull Diary installs a
-- window.onerror + unhandledrejection handler (modules/error-logger.mjs)
-- that best-effort inserts one row per distinct error into this table.
--
-- Access model:
--   * Anyone (including anonymous users mid-auth flow) can INSERT a row.
--   * Nobody can SELECT / UPDATE / DELETE via the anon key — you view the
--     rows in the Supabase dashboard, which runs as service_role.
--   * RLS is enabled so the insert-anyone policy is explicit, not implicit.
--
-- This file is idempotent (CREATE IF NOT EXISTS / DROP POLICY IF EXISTS /
-- CREATE POLICY) so re-running it in the SQL Editor is safe.

-- 1. Table ───────────────────────────────────────────────────────────
create table if not exists public.app_errors (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null    default now(),

  -- Null for errors captured while signed out (auth screen crashes).
  user_id     uuid        references auth.users(id) on delete set null,

  -- Free-text version tag the client passes in at install time. Today this
  -- is 'diary@<SW_VERSION>' (e.g. 'diary@7.73'). Gives us a way to filter
  -- to errors that came from a specific cache generation.
  app_version text,

  url         text,
  user_agent  text,

  -- Classification: 'error' (window.error event) /
  -- 'unhandledrejection' (promise rejection) / 'manual' (logErrorManually).
  source      text,

  message     text,
  stack       text,

  -- Populated only for source='error' (sync script errors have filename
  -- + line info; promise rejections don't).
  lineno      int,
  colno       int,

  -- Opaque extra payload for future callers. Currently unused; kept as
  -- jsonb so we can add context (e.g. entry id, syndicate id) later without
  -- another migration.
  extra       jsonb
);

-- 2. Indexes ─────────────────────────────────────────────────────────
-- Time-ordered readout is the default query in the dashboard.
create index if not exists app_errors_created_at_idx
  on public.app_errors (created_at desc);

-- Group-by-user queries (e.g. "which tester is hitting the most errors?").
create index if not exists app_errors_user_id_idx
  on public.app_errors (user_id);

-- 3. RLS ─────────────────────────────────────────────────────────────
alter table public.app_errors enable row level security;

-- Anyone — including anonymous auth-screen traffic — can insert.
-- This is deliberately permissive: the whole point is to capture errors
-- even when we can't identify the user. No SELECT / UPDATE / DELETE
-- policies exist, so the anon role cannot read back what it wrote.
drop policy if exists "app_errors_insert_anyone" on public.app_errors;
create policy "app_errors_insert_anyone"
  on public.app_errors
  for insert
  to anon, authenticated
  with check (true);

-- 4. Sanity checks (these are SELECTs, not mutations) ────────────────
-- Uncomment in the SQL Editor if you want to confirm the table and
-- policy landed cleanly:
--
-- select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename='app_errors';
-- select policyname, cmd, roles, with_check from pg_policies
--   where schemaname='public' and tablename='app_errors';
