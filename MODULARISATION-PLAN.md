# `diary.js` modularisation — plan

> Status: **draft for review**, not started. Last updated 2026-04-16.
>
> This document plans the split of `diary.js` (currently ~9,300 lines in
> one classic-script file) into a set of ES modules under `modules/`. It
> is the scoping doc for **P3 code-quality item #1** from `PROJECT-LOG.md`.
> Nothing here has been executed yet.

---

## 1. Goals & non-goals

### Goals

- Turn `diary.js` into ~15 focused ES modules with clear responsibility and
  a shallow dependency graph — so "where does the save flow live" is a
  one-second answer instead of a grep.
- Eliminate the remaining top-level mutable globals by threading a single
  `state` object through the modules that need it.
- Keep the app's **runtime footprint** roughly the same: no bundler, no
  build step, no framework. Still a static-hostable PWA.
- Keep offline behaviour identical — every new module must be in the SW
  pre-cache list before any release.
- Land tests for every pure helper extracted, so regressions are caught by
  `npm test` in CI (whenever we add CI) / pre-release manually today.

### Non-goals

- No bundler (esbuild / Vite / Rollup). The project ships flat files to a
  static host; adding a build step is a philosophical change we're not
  making as part of this refactor.
- No TypeScript. Annotate with JSDoc where it genuinely clarifies intent,
  but don't let types drive the layout.
- No framework (React / Vue / Svelte). The app is fine rendering to the
  existing DOM with plain JS.
- Not changing any user-facing behaviour. This refactor is invisible.
- Not changing the offline queue format, supabase schema, or storage key
  names — migration risk is too high for zero user benefit.

---

## 2. Current state

| Thing | Today |
|---|---|
| `diary.js` | ~9,300 lines, single classic `<script>` in `diary.html`. |
| Top-level globals | ~60 mutable, plus ~40 SVG / constants. 2 groups already migrated to grouped objects (`flSelection`, `flQuickEntry`) in the partial pass done 2026-04-16. |
| Pure helpers | Extracted to `lib/fl-pure.mjs` as an ES module with 31 node:test unit tests. Currently a **spec** — diary.js still inlines its own copies. Becomes the runtime copy once this plan ships. |
| Vendor libs | Leaflet + MarkerCluster + Supabase + jsPDF loaded as classic scripts in the `<head>` / above diary.js; they attach as `window` globals. |
| Entry point | `document.addEventListener('DOMContentLoaded', …)` inside diary.js. Single body-level `click` delegator keyed on `data-fl-action` attributes — no inline HTML handlers anywhere in `diary.html`. This is a major gift for the migration. |
| Service worker | `sw.js` pre-caches `./diary.js` as one file; bump-to-purge versioning. |
| Git / version control | **Not in use.** No automated rollback; backups are manual. |

---

## 3. Target module layout

~15 modules under `modules/` + the existing `lib/fl-pure.mjs`. Names are
provisional; we can rename during the work. Rough dependency tiers below
— later tiers depend on earlier tiers but not the reverse.

### Tier 0 — constants & pure helpers (no dependencies)

| Module | Contents |
|---|---|
| `lib/fl-pure.mjs` *(exists)* | Pure helpers: season maths, CSV quoting, sex labels, abnormality summary, date-part parser, esc, data tables (`MONTH_NAMES`, `ABNORMALITY_OPTIONS`). |
| `modules/constants.mjs` | App-wide constants that aren't pure-helper inputs: species ↔ class map, `PLAN_SPECIES`, `AGE_CLASSES`, `AGE_COLORS`, `CULL_ENTRY_LIST_COLUMNS`, `SVG_*` string blobs, tile URL templates, `OS_KEY` / `MAPBOX_TOKEN`, Supabase URL + anon key, `OFFLINE_*` keys. |

### Tier 1 — state & infrastructure (depends on tier 0 only)

| Module | Contents |
|---|---|
| `modules/state.mjs` | Single `state` object: `user`, `entries`, `filteredEntries`, `season`, `filter`, `groundFilter`, `search`, `listSortAsc`, `season`, `savedGrounds`, `cachedEarliestEntryDate`, `cullTargets`, `groundTargets`, `formDirty`, `editingId`, `photoFile`, `photoPreviewUrl`, `pendingDeleteEntryId`, etc. Plus already-grouped `selection`, `quickEntry`, `form`, `syndicate`, `map` sub-objects. One import, one source of truth. |
| `modules/ui.mjs` | View switching (`go`, `VIEWS`, `NAV_MAP`), toast, action dispatcher (`initDiaryFlUi`), keyboard-clickable enhancement, SW update banner, modal open/close helpers. |
| `modules/clock.mjs` | `diaryNow`, `syncDiaryTrustedUkClock`, endpoint list + offset cache. |
| `modules/supabase.mjs` | `initSupabase`, exports the `sb` client and `SUPABASE_CONFIGURED` flag; thin wrapper over the classic-script global. |
| `modules/sw-bridge.mjs` | `navigator.serviceWorker.register`, `controllerchange` wiring, update-banner trigger. |

### Tier 2 — data & auth (depends on tier 0-1)

| Module | Contents |
|---|---|
| `modules/auth.mjs` | `handleAuth`, `onSignedIn`, `signOut`, `signOutEverywhere`, password recovery, auth-state listener, account deletion. |
| `modules/data.mjs` | `loadEntries`, `saveEntry`, `deleteEntry` + bulk delete, season cache (`probeEarliestEntryDate`, `extendSeasonCacheForDate`, `invalidateSeasonCache`), photo storage path helpers, signed-URL cache. |
| `modules/offline.mjs` | Offline queue (`queueOfflineEntry`, `syncOfflineQueue`), IndexedDB photo store, storage-full recovery. |
| `modules/photo.mjs` | Photo capture, client-side resize (MAX 1600 policy), orientation normalisation, compare-by-hash, signed-URL reads, orphan cleanup. |
| `modules/weather.mjs` | `attachWeatherToEntry`, Open-Meteo fetch + London-TZ matching. |
| `modules/grounds.mjs` | `loadGrounds`, add/remove ground, syndicate ground-filter sync. |

### Tier 3 — views (depends on tier 0-2)

| Module | Contents |
|---|---|
| `modules/list.mjs` | `renderList`, filter/search/sort, multi-select mode, bulk CSV action. |
| `modules/form.mjs` | `openNewEntry`, `openEditEntry`, abnormality grid, calibre presets, placement picker, shooter toggle, "save to cloud" / "save offline" flow. |
| `modules/quick.mjs` | `openQuickEntry`, `saveQuickEntry`, sheet UI. |
| `modules/detail.mjs` | `openDetail`, map pin, photo lightbox, weather card. |
| `modules/map.mjs` | Cull map (Leaflet + MarkerCluster) and pin map logic, tile provider selection, fullscreen. |
| `modules/stats.mjs` | Stats tab: KPIs, charts, pace indicator, more-section toggle. |
| `modules/plan.mjs` | Targets sheet, per-ground allocation, plan card. |
| `modules/syndicate.mjs` | Everything syndicate: membership, invites, manager exports, team-larder RPC wrapper. |

### Tier 4 — exports (depends on tier 0-3)

| Module | Contents |
|---|---|
| `modules/csv.mjs` | `exportCSVData`, Excel-friendly BOM + CRLF. |
| `modules/pdf.mjs` | jsPDF wrappers: summary PDF, Game Dealer declaration, consignment PDF, larder book, team larder book. This module is likely to grow; we can split it further (`pdf-dealer.mjs`, `pdf-larder.mjs`) later. |

### Entry point

| File | Role |
|---|---|
| `diary.js` | Thin entry (~50 lines): imports init functions from the modules, wires `DOMContentLoaded`, kicks off supabase init + auth listener. Loaded as `<script type="module">`. |

---

## 4. Loader strategy

**Pure ES modules, no window shim** — viable because `diary.html` has zero
inline handlers. The only change to `diary.html` is:

```html
<!-- before -->
<script src="diary.js"></script>

<!-- after -->
<script type="module" src="diary.js"></script>
```

### Vendor libs

Leaflet, MarkerCluster, Supabase, jsPDF stay as classic `<script>` tags
above the module entry — they are UMD bundles that attach globals. From
inside an ES module you can still read them as `window.L`, `window.jspdf`,
`window.supabase`; or unprefixed (`L`, `jspdf`, `supabase`) since `window`
is the module's global. We'll prefer `window.X` in the modules to make the
dependency explicit in grep.

### Async load order

Classic `<script>` runs synchronously in document order; `type="module"`
is **deferred by default** (runs after DOM parse). That's fine — our
current code already waits for `DOMContentLoaded`. Order:

1. `leaflet.min.js` (classic, sync)
2. `leaflet.markercluster.js` (classic, sync)
3. `supabase-js@2` (classic, sync)
4. `jspdf.umd.min.js` (classic, sync)
5. `diary.js` (module, deferred → runs after DOM parse)

If a module imports a vendor indirectly (e.g. `pdf.mjs` uses `jspdf`),
access via `window.jspdf` at call time — don't cache it at module-init
time, because module init happens before or after classic-script execution
in a way that's browser-dependent if we ever move vendors to `defer` / `async`.

### Dev-server friendliness

`type="module"` requires `http://` / `https://` — not `file://`. We should
double-check that any local-testing recipe (opening diary.html by
double-click) no longer works, and document a `python -m http.server` /
VS Code Live Server step in the repo notes.

---

## 5. Migration strategy — incremental, module-by-module

Big-bang is the wrong call. We extract one module at a time, land each as
a backed-up checkpoint, then verify. Target: 1 module per session, more
if easy.

### Per-module recipe

1. **Backup** the workspace before starting (see §8).
2. **Identify** the chunk to extract — prefer tight, low-reference groups
   first (e.g. `modules/clock.mjs`: 3 functions + 3 constants; 10
   references in diary.js). Leave the deeply-intertwined bits for later.
3. **Create** `modules/foo.mjs` with the code copied verbatim. Replace
   `var` at the top of that chunk with `let` / `const` as natural; add
   `export` to public names.
4. **Switch diary.js to a module** (only on the very first extraction) by
   changing the `<script>` tag in `diary.html`. Everything else still
   works because there are no inline handlers.
5. **Import** from the new module in diary.js: `import * as clock from './modules/clock.mjs';`
   and replace direct calls with `clock.diaryNow()` etc.
6. **Delete** the inline copies from diary.js. The linter should show no
   leftover references.
7. **Add** the module to the SW pre-cache list; bump `SW_VERSION`.
8. **Unit-test** anything that was pure-able (may require light
   refactoring to pass inputs explicitly instead of reading globals).
9. **Smoke-test** in a browser manually — at minimum: auth, list render,
   open form, save entry, open map, switch to stats. See the checklist
   in §7.
10. **Commit** the backup as "checkpoint N" (zip-and-rename) and move on.

### Recommended extraction order

Easiest → hardest so we build confidence before tackling the core:

1. `constants.mjs` — just moving string literals + arrays. ~1 hour.
2. `clock.mjs` — self-contained. ~1 hour.
3. `sw-bridge.mjs` — SW registration + update banner. ~1 hour.
4. `supabase.mjs` — tiny wrapper. ~30 min.
5. `weather.mjs` — isolated calling pattern. ~1 hour.
6. `grounds.mjs` — small, mostly data-layer. ~1 hour.
7. `csv.mjs` — single export function; uses `fl-pure.mjs` already. ~30 min.
8. `pdf.mjs` — big but self-contained; good place to test the pattern. ~2 hours.
9. `offline.mjs` — moderately tangled with data saves. ~2 hours.
10. `photo.mjs` — entangled with form + detail. ~2 hours.
11. `state.mjs` — extract the remaining globals here. This is the moment
    we finish the P3 #2 "reduce globals" task. ~3 hours.
12. `auth.mjs` — straightforward after state.mjs exists. ~1 hour.
13. `data.mjs` — the core data layer. ~2 hours.
14. `ui.mjs` — view switcher + dispatcher. ~2 hours.
15. `list.mjs` + `form.mjs` + `quick.mjs` + `detail.mjs` + `map.mjs` +
    `stats.mjs` + `plan.mjs` + `syndicate.mjs` — the views. ~8 hours total.

Total rough estimate: **~25-30 hours of careful work across many
sessions**. Probably more because estimates are optimistic.

---

## 6. Testing strategy

### What we have now

- `tests/fl-pure.test.mjs` — 31 tests covering the pure helpers.
- `npm test` runs them via Node's built-in `node:test` runner. Zero deps.

### What to add during migration

Every module that contains *purifiable* logic grows a test file. Example:

- `modules/clock.mjs` exports `computeClockOffset(serverTimestamp, localNow)` as a
  pure function; tested.
- `modules/stats.mjs` exports `kpiPaceForEntries(entries, targets, asOfDate)` as a
  pure function; tested.
- `modules/csv.mjs` — the row builder is pure; tested.
- `modules/syndicate.mjs` — display-name resolution is pure; tested.

Target: **≥80% of pure logic under test** by the end of this work. Everything DOM/network stays untested (we're not mocking jsdom or supabase).

### Smoke-test checklist (manual, browser)

Run this after every extraction before calling it done.

1. Diary loads; no console errors; offline banner state matches
   `navigator.onLine`.
2. Sign in → existing entries visible.
3. Sign out → back to auth screen.
4. New entry: full form, save online → entry appears.
5. Quick entry: save online → entry appears.
6. Edit entry: change weight, save → change persists after reload.
7. Delete entry: bulk + single → removed.
8. Filter / search / sort — all three still wire up.
9. Stats tab: charts render, KPI pace indicator renders.
10. Plan tab: targets sheet opens, saves, reopens.
11. Map tab: map renders, pins cluster, tile switch works.
12. Syndicate: open manager exports, download Team Larder Book.
13. Offline: airplane-mode save → queued → reconnect → sync.
14. SW update: bump `SW_VERSION`, reload, update banner appears.

---

## 7. SW / cache implications

Every `.mjs` file loaded by the browser must be in `PRECACHE_URLS` in
`sw.js`, otherwise the very first offline session on a fresh device will
404 that import and the app will be non-functional.

Three options for handling the growing list:

| Option | Pro | Con |
|---|---|---|
| **A. Hand-list every file** (current pattern). | Zero tooling. | Easy to forget one; silent breakage. |
| **B. Glob at SW install time** via `fetch('./modules/')` + directory listing. | No list to maintain. | Depends on directory listing being enabled on the host (not portable); CORS / Supabase Storage hosts don't do this. |
| **C. Auto-generated list** — a tiny `scripts/gen-precache.mjs` that walks `./modules/` + `./lib/` and writes the `PRECACHE_URLS` array into `sw.js`. Runs as part of a release ritual. | One script; reliable. | Light tooling; a step to forget. |

Recommendation: **A** initially (it's the current pattern and the module
count isn't huge). Upgrade to **C** if we find ourselves chasing missed
entries. Document the "don't forget sw.js" rule in the per-module recipe.

---

## 8. Rollback / backup protocol (no git)

Until git is introduced, backups are manual but mandatory.

### Per-session

Before starting a module extraction:

1. Zip the workspace root (excluding `node_modules` if we ever add one)
   to `C:\Users\SohaibMengal\Documents\First-Light-backups\YYYY-MM-DD-HHMM-before-<module>.zip`.
2. Proceed with extraction.
3. If something breaks we can't debug in-session → restore from the zip
   and retry.

### Per "phase" (Tier 0, Tier 1, …)

Keep the last 3 phase zips for diffing; older zips can be archived or
deleted.

### Strongly recommended

**Install git.** Even without a remote. `git init && git add . && git
commit` takes 2 minutes and replaces every zip-based step above with
`git reset --hard`. Happy to do this as a one-off step before the first
extraction — flag it.

---

## 9. Open questions (decide before starting)

1. **Git?** Install git and make this commit-backed, or stick with zip
   backups? Strong recommendation: git.
2. **Test folder convention?** Tests currently in `tests/` flat. Prefer
   co-located (`modules/clock.test.mjs` alongside `modules/clock.mjs`) or
   mirrored tree (`tests/modules/clock.test.mjs`)? Co-located is simpler
   but grows the `modules/` directory.
3. **Module extension?** `.mjs` vs `.js` with `"type": "module"` in
   `package.json`? Current mix: `lib/fl-pure.mjs` uses `.mjs`. Continue
   with `.mjs` for clarity, or switch to `.js`? Recommend `.mjs` so
   future-me can tell at a glance which files are classic-script and
   which are modules.
4. **Dev-server ritual?** `python -m http.server 8080` is already
   convenient on Windows with Python installed. If not, VS Code "Live
   Server" extension. Document the chosen workflow in `PROJECT-LOG.md`.
5. **Release cadence during migration?** Deploy after every module, or
   batch 3-5 per release? Recommend: **after every module** if the smoke
   test is green. Users get small, reversible changes rather than one
   scary "everything moved" deploy.
6. **Minimum browser target?** Modules + top-level await require
   reasonably modern browsers (Chrome 89+, Safari 15+, Firefox 89+).
   Check the install base — any old Android WebView users? If so we
   can't safely go module-native without a bundler.

---

## 10. Phasing

### Phase 0 — prerequisites (≈1 hour)

- Install git locally; `git init` in repo; first commit.
- Pick answers to §9 questions.
- Confirm dev-server recipe works (`http.server` port 8080 → open
  `http://localhost:8080/diary.html` → sign in → browse).

### Phase 1 — Tier 0 & 1 (≈6 hours)

- `constants.mjs`, `clock.mjs`, `sw-bridge.mjs`, `supabase.mjs`,
  `state.mjs`, `ui.mjs`.
- `diary.html` flips to `type="module"` during this phase.
- Smoke-test after each, release after phase.

### Phase 2 — Tier 2 (≈8 hours)

- `auth.mjs`, `data.mjs`, `offline.mjs`, `photo.mjs`, `weather.mjs`,
  `grounds.mjs`. Core data layer.

### Phase 3 — Tier 3 views (≈10 hours)

- `list.mjs`, `form.mjs`, `quick.mjs`, `detail.mjs`, `map.mjs`,
  `stats.mjs`, `plan.mjs`, `syndicate.mjs`.

### Phase 4 — Tier 4 exports (≈3 hours)

- `csv.mjs`, `pdf.mjs` (may want to split later).

### Phase 5 — tidy-up (≈2 hours)

- Remove any remaining `diary.js` internal scaffolding.
- Final `diary.js` should be ~50-100 lines: imports + `DOMContentLoaded`
  wiring only.
- Add `docs/ARCHITECTURE.md` summarising the final module tree (probably
  automatic from this doc).
- Archive the zip backups.

**Total**: ~30 hours of work spread across ~15 sessions.

---

## 11. Not in scope

- Bundling / minification. Files are shipped as-is; HTTP/2 handles
  request parallelism.
- Source maps. With no transpilation, what you see is what ran.
- Code-splitting dynamic imports. Initial load is already the whole diary
  app; loading e.g. stats lazily is a separate optimisation.
- A UI framework migration. Happy to revisit post-modularisation if the
  DOM-direct style feels like a pain at that point.

---

## 12. Review / sign-off

Before starting Phase 1, the user (Sohaib) should:

- Read §9 and pick answers.
- Confirm the phasing & estimate are tolerable.
- Decide on git vs zip backups.

Then we kick off with Phase 0 and check in at the end of each phase.
