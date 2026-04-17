# Supabase — in-repo record & workflow

This file is the **canonical index** of what we already know about your Supabase project from **queries you ran** and **results pasted in Cursor**. The goal: **do not repeat** the same asks; only request **new** SQL runs or pastes when something is **missing**, **stale**, or **scope changed**.

---

## How we work (you ↔ agent)

1. **You ask for a Supabase change or audit** → the agent may give you **SQL to run** in the Supabase SQL Editor (or Dashboard steps).
2. **You paste the results** (tables, JSON, error text) into the chat.
3. **The agent stores outcomes in the repo**: updates this file’s **Changelog**, and when appropriate saves **structured snapshots** (e.g. `supabase-audit-rls-snapshot.json`) or adds/edits SQL under `scripts/`.
4. **Next time** → the agent **reads this file and linked artifacts first**, then only asks you for work that is **not already recorded** (unless a scheduled **refresh** or **drift fix** applies).

---

## Artifacts (frozen in git)

| File | Purpose |
|------|--------|
| `scripts/supabase-rls-audit-queries.sql` | **Run whole file** in SQL Editor → RLS flags, `public` policies (diary + syndicate tables), `storage.objects` policies for `cull-photos`. |
| `scripts/supabase-audit-rls-snapshot.json` | **Frozen paste** of the results from the file above. Update `_meta.captured` (ISO date `YYYY-MM-DD`) whenever you refresh after policy/migration changes. |
| `scripts/supabase-audit-queries.sql` | Broader table / drift checks (see its header). |
| `scripts/supabase-audit-snapshot.json` | Optional companion snapshot for generic audit queries. |
| `scripts/validate-rls-snapshot.mjs` | Validates RLS JSON shape + required tables; optional `--max-age-days=N`. |
| `.github/workflows/rls-snapshot-validate.yml` | CI: validates snapshot on push/PR (when `scripts/**` etc. changes); **weekly** stale check (`--max-age-days=75`). |

**Do not commit** service-role keys, DB passwords, or session tokens. **Anon** keys in client JS are expected; security is **RLS**.

---

## RLS & storage — current snapshot summary

- **Captured in JSON:** `_meta.captured` = **2026-04-12** (see `supabase-audit-rls-snapshot.json` for full policy text).
- **RLS enabled** on: `cull_entries`, `cull_targets`, `grounds`, `ground_targets`, syndicate tables listed in that JSON.
- **Storage:** `cull-photos` policies on `storage.objects` (authenticated, own `auth.uid()` folder prefix) — see JSON `storage_policies`.

If you change **any** policy, RLS toggle, helper SQL used by policies, or storage rules → re-run `supabase-rls-audit-queries.sql` → paste into `supabase-audit-rls-snapshot.json` → set `_meta.captured` → `node scripts/validate-rls-snapshot.mjs` → commit → add a **Changelog** line below.

---

## Changelog (newest first)

| Date | What | Where stored |
|------|------|----------------|
| 2026-04-16 | Ran `supabase-verify-drift.sql` after v2 deploy — **success** (no rows returned). Drift check 3i confirms the new `e.syndicate_id = p_syndicate_id` filter is present on `syndicate_member_larder_for_manager(uuid, text)`. | SQL Editor result (chat), this file |
| 2026-04-16 | Ran `syndicate-manager-larder.sql` v2 in Supabase SQL Editor — **success** (no rows returned). Team Larder RPC now filters on explicit per-entry attribution (`e.syndicate_id = p_syndicate_id`), matching the other three syndicate RPCs from the 2026-04-15 migration. C2 bug resolved. | SQL Editor result (chat), `scripts/syndicate-manager-larder.sql`, this file |
| 2026-04-16 | Team Larder Book RPC v2 shipped as source: added `e.syndicate_id = p_syndicate_id` filter. Without it, no-ground-filter syndicates swallowed sibling syndicate attributions (C2 smoke test caught it). Also added weak_function drift check 3i. | `scripts/syndicate-manager-larder.sql`, `scripts/supabase-verify-drift.sql`, this file |
| 2026-04-16 | Ran `syndicate-manager-larder.sql` v1 in Supabase SQL Editor — **success** (no rows returned). Manager-only RPC `syndicate_member_larder_for_manager(uuid, text)` now live; Team Larder button operational. v1 missed explicit-attribution filter — superseded by v2 above. | SQL Editor result (chat), `scripts/syndicate-manager-larder.sql`, this file |
| 2026-04-16 | Added Team Larder Book manager RPC: `syndicate_member_larder_for_manager(uuid, text)`. Full larder payload for every active member's cull in a season, scoped to the syndicate's `ground_filter`, excludes `'left on hill'` and anonymised retention rows. `is_syndicate_manager` guard. | `scripts/syndicate-manager-larder.sql`, this file |
| 2026-04-16 | Ran `migrate-add-abnormalities.sql` in Supabase SQL Editor — **success** (no rows returned). `abnormalities TEXT[]` and `abnormalities_other TEXT` columns added to `cull_entries`; structured larder-inspection checklist now persists end-to-end. | SQL Editor result (chat), `scripts/migrate-add-abnormalities.sql`, this file |
| 2026-04-15 | Ran `migrate-add-tag-number.sql` in Supabase SQL Editor — **success** (no rows returned). `tag_number TEXT` column added to `cull_entries`. | SQL Editor result (chat), `scripts/migrate-add-tag-number.sql`, this file |
| 2026-04-15 | Ran `migrate-single-weight.sql` in Supabase SQL Editor — **success** (no rows returned). `weight_gralloch` renamed to `weight_kg`, `weight_clean` and `weight_larder` dropped. | SQL Editor result (chat), `scripts/migrate-single-weight.sql`, this file |
| 2026-04-15 | Re-ran `supabase-verify-drift.sql` after explicit-attribution refresh — **success** (no rows returned), `weak_function syndicate_season_summary(uuid,text)` cleared. | SQL Editor result (chat), this file |
| 2026-04-15 | Re-ran `syndicate-explicit-attribution.sql` to refresh function bodies — **success** (no rows returned). | SQL Editor run result (chat), this file |
| 2026-04-15 | Deep drift check run returned `weak_function` for `syndicate_season_summary(uuid,text)` (explicit attribution body not active in DB). | SQL Editor result (chat screenshot), this file |
| 2026-04-15 | Deepened drift checks: added **weak_function** assertions for critical syndicate RPC bodies (`redeem_syndicate_invite`, `leave_syndicate_member`, `syndicate_season_summary`, `syndicate_member_actuals_for_manager`). | `scripts/supabase-verify-drift.sql` |
| 2026-04-15 | Re-ran `supabase-verify-drift.sql` after manager-leave migration — **success** (no rows returned), `leave_syndicate_member` drift clear. | SQL Editor result (chat), this file |
| 2026-04-15 | Ran `syndicate-manager-leave-transfer.sql` in Supabase SQL Editor — **success** (no rows returned). | SQL Editor run result (chat), this file |
| 2026-04-15 | Added manager-leave safety RPC `leave_syndicate_member` (manager can leave only if another active manager exists). | `scripts/syndicate-manager-leave-transfer.sql`, `scripts/syndicate-schema.sql`, `scripts/supabase-verify-drift.sql` |
| 2026-04-15 | Ran `syndicate-rls-self-leave-hardening.sql` in Supabase SQL Editor — **success** (no rows returned). | SQL Editor run result (chat), this file |
| 2026-04-15 | Added self-leave hardening for `syndicate_members` (strict policy + guard trigger) and added drift checks (`missing_trigger` / `weak_policy`). | `scripts/syndicate-rls-self-leave-hardening.sql`, `scripts/syndicate-schema.sql`, `scripts/supabase-verify-drift.sql` |
| 2026-04-15 | Re-ran `supabase-verify-drift.sql` after manual column/index fix — **success** (no rows returned), `cull_entries.syndicate_id` drift cleared. | SQL Editor result (chat), this file |
| 2026-04-15 | Ran `supabase-verify-drift.sql` after migration attempt — still shows `missing_column cull_entries.syndicate_id`. | SQL Editor result (chat screenshot), this file |
| 2026-04-15 | Ran `syndicate-explicit-attribution.sql` in Supabase SQL Editor — **success** (no rows returned). | SQL Editor run result (chat), this file |
| 2026-04-15 | Added explicit syndicate attribution migration (`cull_entries.syndicate_id`) and replaced syndicate aggregate/breakdown/summary functions to count by explicit attribution (one cull -> one syndicate). | `scripts/syndicate-explicit-attribution.sql`, `scripts/supabase-verify-drift.sql` |
| 2026-04-13 | RLS snapshot **validator** + **GitHub Actions** (push/PR + weekly stale 75d) + Cursor rule to read records first. | `validate-rls-snapshot.mjs`, `rls-snapshot-validate.yml`, `.cursor/rules/supabase.mdc`, this file |
| 2026-04-12 | Full **RLS + storage policies** inventory from Dashboard SQL. | `supabase-audit-rls-snapshot.json` (`_meta` + `rls_enabled_by_table` + `public_policies` + `storage_policies`) |

*(Append new rows for every audit or migration review.)*

---

## Pending / must refresh

*(Agent: if something is needed but not in repo, list it here with the exact query file or SQL snippet. Remove rows when done.)*

- [x] ~~Run `scripts/migrate-add-tag-number.sql`~~ — done 2026-04-15
- [x] ~~Run `scripts/migrate-add-abnormalities.sql`~~ — done 2026-04-16
- [x] ~~Run `scripts/syndicate-manager-larder.sql`~~ — done 2026-04-16

---

## Query library (reuse before inventing new SQL)

- **RLS + `cull-photos` storage policies:** `scripts/supabase-rls-audit-queries.sql`
- **General audit union / table list:** `scripts/supabase-audit-queries.sql`
- **Syndicate / RPC / retention:** other `scripts/*.sql` — search `scripts/` for `syndicate`, `cull`, `rls`

---

## Agent checklist (before asking you)

1. Read **`scripts/SUPABASE-RECORD.md`** (this file), especially **Changelog**, **Pending**, and **Artifacts**.
2. Open **`scripts/supabase-audit-rls-snapshot.json`** when the task touches **RLS, row access, or `cull-photos` storage**.
3. If the answer is already in-repo → **cite the file** and proceed; **do not** ask you to re-paste the same result set.
4. If something is **missing** → give **one** concrete query (prefer an existing `scripts/*.sql` file), then after paste, **update this file + JSON/SQL** in the same session.
5. If **CI stale check** or `_meta.captured` is older than the agreed window → ask for a **refresh** of the RLS audit only (same queries as `supabase-rls-audit-queries.sql`).

---

## User checklist (after pasting results)

- Confirm the agent committed updates to **this record** and any **JSON/SQL** snapshots.
- For RLS refreshes: run `node scripts/validate-rls-snapshot.mjs` before push.
