# First Light — project log (decisions & changes)

This file is a **durable summary** of work discussed and implemented in Cursor. It is **not** a full chat transcript. For verbatim history, use **Cursor’s chat panel** (past conversations).

---

## 2026-04-16 — `<option>` dark-mode legibility fix (tiny CSS)

Spotted during the Commit I–K smoke-test prep: when the user opened the season selector, the currently-highlighted/selected option rendered near-invisibly (dark grey on dark grey) because Windows Chrome/Edge render the open `<select>` dropdown with OS-shell colours and ignore the `<select>`'s `color` inheritance for the option rows.

- **`diary.css`** — one rule near the top, applies to every `<select>` in the app (season selectors, ground filter, form selects, syndicate export dropdowns, summary season/ground selects):
  ```
  option         { background-color:#1a1a1a; color:rgba(255,255,255,0.92); }
  option:checked { background-color:var(--moss); color:#fff; }
  ```
- **`sw.js`** — `SW_VERSION` bumped `7.49` → `7.50` so the CSS propagates.

Not tied to the modularisation branch (pure CSS / SW). Landing on `feat/modularise-phase-2` alongside the PDF work since that's the active branch, but safe to cherry-pick if ever needed.

---

## 2026-04-16 — Modularisation Phase 2 — Commit K: game dealer + consignment Trained Hunter declarations

Third Phase-2 commit on `feat/modularise-phase-2`. Moves both Reg (EC) 853/2004 Trained Hunter declarations (per-carcass + per-consignment) into `modules/pdf.mjs`, introduces a shared `resolveHunterIdentity` helper, and de-duplicates the consignment PDF's green-filled header row.

- **`modules/pdf.mjs`** (+360 lines) — two new builders + one private helper:
  - `buildGameDealerDeclarationPDF({ entry, user })` — per-carcass declaration. Keeps the AHVLA gralloch-checklist rendering (structured-codes → legacy-notes fall-through). Returns `{ filename }` on success.
  - `buildConsignmentDealerDeclarationPDF({ entries, user })` — per-consignment declaration. Does the "Left on hill" exclusion + chronological sort internally (non-mutating clone), and reports `excluded` count on the returned object so the PDF can show the "(N excluded…)" note under the summary strip.
    - Return shape: `null` for empty, `{ status: 'all-excluded', excluded }` for all-filtered-out, `{ filename, count, excluded }` on success. Caller drives the specific toast message + select-mode exit.
  - `resolveHunterIdentity(user)` — private helper. Returns `{ hunterName, accountEmail }` with try/catch for malformed user objects (a broken Supabase session shouldn't kill an export at "user clicks download"). Used by both declaration builders.
  - `drawConsignmentHeader(atY)` — inner closure inside `buildConsignmentDealerDeclarationPDF`. The initial-header and page-break-header draw identical 14-line green-filled rectangles; previously they were copy-pasted inline and had started to drift (different setFontSize ordering after the fill). Single source of truth now.
  - **Bonus fix**: both the `exportConsignmentDealerPdf` legacy code and its module successor now do a `.slice()` before sort, so the caller's entries array is no longer mutated.
- **`diary.js`** — two functions collapsed to shims:
  - `exportGameDealerDeclaration(id)` → 5-line shim that resolves the entry via `allEntries.find(id)` then delegates.
  - `exportConsignmentDealerPdf()` → 20-line shim. Keeps the empty-selection / all-excluded / success-toast fan-out + the `exitSelectMode()` call (UI concern, stays in diary.js).
  - Added imports from `./modules/pdf.mjs` for the two new builders.
  - **Net: −294 lines in `diary.js`** (git stat: 313 - / 19 +).
- **`sw.js`** — `SW_VERSION` bumped `7.48` → `7.49`.
- **`tests/pdf.test.mjs`** (+9 assertions → 37 in this file):
  - `buildGameDealerDeclarationPDF`: null-entry guard, filename convention (species slugged + date), missing-species fallback to "entry", structured-none + legacy-notes branches don't throw.
  - `buildConsignmentDealerDeclarationPDF`: empty guard, all-excluded status, success-with-excluded count, multi-day vs single-day filename, non-mutation regression guard.

**Tests: 126/126 green (was 117; +9).** No lint errors.

**Phase 2 cumulative so far** (Commits I + J + K): `diary.js` down **−553 lines** out of the ~1,500 PDF target (≈37%). Commit L is the final big one: `exportSeasonSummary` + `exportSyndicateSeasonSummaryPdf` (~680 lines), plus a `fmtEntryDate*` dedupe.

Pending browser smoke-test before Commit L.

---

## 2026-04-16 — Modularisation Phase 2 — Commit J: larder book + syndicate list/larder PDFs + shared `drawTableHeader`

Second Phase-2 commit on `feat/modularise-phase-2`. Three more PDFs moved into `modules/pdf.mjs`, plus the shared table-header helper.

- **`modules/pdf.mjs`** (+275 lines) — three new builders + two helpers:
  - `buildLarderBookPDF({ filteredEntries, user, season })` — single-user larder book. Caller passes the already-scoped list; module does the "Left on hill" exclusion, chronological sort, stalker-line resolution (calls `userProfileDisplayName(user)` internally), and season-vs-All-Seasons scope line.
  - `buildSyndicateListPDF({ rows, syndicateName, seasonLabelStr, filenameBase })` — simple culls list. Fully parameterised already; now returns `{ filename, count }` so the caller can toast consistently.
  - `buildSyndicateLarderBookPDF({ syndicate, season, rows })` — team larder book. Accepts server-side-filtered rows, uses `syndicateFileSlug` for the filename, totals-footer + manager signature block.
  - `syndicateFileSlug(name)` — pure name-to-slug helper exported from the module so it's the single source of truth. Was at L4469 of `diary.js`.
  - `drawTableHeader(doc, { headers, colX, y, pageW, fontSize })` — extracts the two byte-identical inner `drawHeader()` closures that lived inside `exportLarderBookPDF` and `exportSyndicateLarderBookPDF`. Returns the new y cursor.
  - Imports from `lib/fl-pure.mjs` extended: now also pulls `seasonLabel` and `ABNORMALITY_LABEL_BY_CODE` (was just `sexLabel`, `parseEntryDateParts`, `MONTH_NAMES`).
  - **Bonus fix**: `buildLarderBookPDF` clones before sorting, so it no longer mutates the caller's array. `exportLarderBookPDF` in `diary.js` was silently in-place-sorting `filteredEntries` — which is the same array backing the entries list UI. Order-sensitive views weren't triggering it in practice, but the bug was real.
- **`diary.js`** — four functions collapsed to thin shims:
  - `syndicateFileSlug(name)` → 1-line shim delegating to the module (kept for the one non-PDF caller at L~4760; inline once Phase 3 clears those).
  - `exportSyndicateListPDF(...)` → 3-line shim.
  - `exportLarderBookPDF()` → 10-line shim.
  - `exportSyndicateLarderBookPDF(...)` → 3-line shim.
  - Added imports from `./modules/pdf.mjs` for the new builders; aliased `syndicateFileSlug as flSyndicateFileSlug`.
  - **Net: −200 lines in `diary.js`** (git stat: 229 - / 29 +).
- **`sw.js`** — `SW_VERSION` bumped `7.47` → `7.48` (module file bytes changed). `PRECACHE_URLS` unchanged — `modules/pdf.mjs` was already added in Commit I.
- **`tests/pdf.test.mjs`** (+14 assertions → 28 total in this file):
  - `syndicateFileSlug`: alnum runs, hyphen trim, empty / punctuation fallback.
  - `drawTableHeader`: header text at each colX, font/draw-color calls, y advance, underline position.
  - `buildLarderBookPDF`: empty/null guard, "Left on hill" exclusion, filename uses earliest retained date, **non-mutation of caller's array** (regression guard for the bonus fix), `__all__` season → date-range scope line.
  - `buildSyndicateListPDF`: empty rows guard, filename + count.
  - `buildSyndicateLarderBookPDF`: empty rows guard, filename slugs syndicate name + appends season, fallback to "syndicate" when name missing.
  - `FakeDoc` stub expanded to cover `setTextColor`, `setDrawColor`, `setLineWidth`, `setFillColor`, `rect`, and `internal.pageSize.{getWidth,getHeight}`.

**Tests: 117/117 green (was 103; +14).** No lint errors.

Pending browser smoke-test before Commit K (game dealer + consignment dealer declarations ~335 lines).

---

## 2026-04-16 — Modularisation Phase 2 begun — Commit I: `modules/pdf.mjs` scaffold + 2 smallest PDF exports

New branch `feat/modularise-phase-2` off `main@0c2217b` (Phase 1 is safely merged + pushed). Phase-2 plan: migrate the 10 PDF export functions (~1,322 lines) out of `diary.js` across four commits (I → L), using **dependency injection via `opts` objects** so the module stays pure w.r.t. app globals.

**Commit I — scaffold + two smallest exports:**

- **`modules/pdf.mjs`** (new, 155 lines) — module scaffold with:
  - `buildSimpleDiaryPDF({ entries, label, season })` — all-entries list PDF (filename convention: `cull-diary-all-seasons.pdf` vs `cull-diary-<season>.pdf`).
  - `buildSingleEntryPDF({ entry })` — per-carcass one-pager (filename: `cull-record-<date>.pdf`).
  - `userProfileDisplayName(user)` — legal-name resolver (used by every PDF header). Kept pure; takes user as arg.
  - Private helpers `fmtEntryDateShort(d)` + `hasValue(v)` duplicated from `diary.js` rather than moving into `lib/fl-pure.mjs` — would have touched every caller. They'll consolidate once `diary.js` slims down further.
  - `getJsPDF()` guards access to `window.jspdf.jsPDF` so the module can be imported under Node for tests without a browser DOM.
- **`diary.js`** — 3 functions collapsed to thin shims:
  - `exportPDFData(entries, label)` → 6-line shim calling `buildSimpleDiaryPDF`, preserves existing toast UX.
  - `exportSinglePDF(id)` → 4-line shim doing the `allEntries.find` then calling `buildSingleEntryPDF`.
  - `userProfileDisplayName()` → zero-arg shim over the module's `flUserProfileDisplayName(currentUser)`. Kept because 3 remaining PDF functions (larder, game dealer, consignment) still live in `diary.js` and use the zero-arg form; they'll switch to the module import directly in Commits J–L.
  - Added imports from `./modules/pdf.mjs`; aliased the module export to `flUserProfileDisplayName` to dodge name collision with the shim.
  - **Net: −59 lines in `diary.js`** (git stat: 86 - / 27 +).
- **`sw.js`** — `SW_VERSION` bumped `7.46` → `7.47`; `./modules/pdf.mjs` added to `PRECACHE_URLS`.
- **`tests/pdf.test.mjs`** (new) — 14 assertions:
  - `userProfileDisplayName`: null/undefined, fallback chain (full_name → name → display_name), whitespace trim, empty-metadata guards.
  - `fmtEntryDateShort`: valid ISO rendering, empty/null, unparseable fallback.
  - `hasValue`: null/undefined/"" missing; 0/false/"x"/[] present.
  - `buildSimpleDiaryPDF` + `buildSingleEntryPDF`: empty-entries guard, "All Seasons" vs season-code filenames, entry-date encoded into single filename, jspdf-not-loaded error.
  - Smoke-tested with an in-memory `FakeDoc` stub so tests don't depend on jspdf.

**Tests: 103/103 green (was 89; +14).** No lint errors in touched files.

Pending browser smoke-test before Commit J (larder book + syndicate list/larder PDFs).

---

## 2026-04-16 — Modularisation Phase 1 begun — Commit A: diary.js → ES module

Working on branch `feat/modularise-phase-1` (main stays pristine). Backup = origin/main on GitHub.

**§9 open-question answers (locked in before first extraction):**

- **Tests** — flat `tests/*.test.mjs` (keep current pattern; no `tests/modules/` sub-tree).
- **Extension** — `.mjs` throughout `modules/` to match `lib/fl-pure.mjs` and stay visually distinct from classic scripts.
- **Dev server** — `npx serve` (Node already installed; Python stub on this machine launches the Microsoft Store).
- **Release cadence** — after every module if smoke-test green.
- **Browser target** — ES2020+ (Chrome 89+, Safari 15+, Firefox 89+). **No top-level await** — it pushes the target to Safari 15+ / Chrome 89+ and isn't needed for anything we're doing.

**Commit A — pure cutover, no extraction:**

- **`diary.html`** — `<script src="diary.js">` → `<script type="module" src="diary.js">`. Comment above explains what changes semantically (deferred execution, no `window.` attachment of `var`s). Vendor libs (Leaflet / MarkerCluster / Supabase / jsPDF) stay as classic scripts in `<head>` — they run first and attach `window.L`, `window.supabase`, `window.jspdf` before the module executes.
- **`diary.js`** — added `flOnReady(fn)` helper. Under `type="module"` the file is deferred, so DOMContentLoaded has already fired by the time we register listeners; `flOnReady` runs `fn` immediately if `document.readyState !== 'loading'`, otherwise falls back to the listener. Both `document.addEventListener('DOMContentLoaded', ...)` sites (form-dirty tracker at L1443 and the main init IIFE at L2005) now call `flOnReady(...)`.
- **`sw.js`** — cache bump to `v7.37` so the script-tag change propagates on next visit.

**Pre-flight checks (all green):**

- No module-level `this.` references (would change from `window` to `undefined` under modules).
- No external code reads `window.currentUser` / `window.allEntries` / `window.sb` etc. (`var`s losing `window` attachment is invisible).
- The only intentional `window.*` bridges (`_summarySeasonLabel`, `_summaryGroundOverride`, `FL_DEBUG`, `__flGlobalErrorInstalled`) use explicit assignment — unaffected by the scope change.
- `app.js` doesn't reach into `diary.js` globals.
- CSP `script-src 'self' …` already covers same-origin modules.

Tests: 31/31 green. No linter errors. Awaiting browser smoke-test before Commit B (first real extraction: `modules/clock.mjs`).

**Smoke-test result:** green. No red errors in DevTools; sign-in screen renders; form opens; abnormality chips render (the `renderAbnormalityGrid` → `ABNORMALITY_OPTIONS` path that crashed before). One fixup committed between A and B:

- **Commit A-fix** `fix(diary): defer flOnReady callback to microtask` — changed `flOnReady` from `fn()` (synchronous) to `queueMicrotask(fn)` because under `type="module"` the script runs mid-module before later `var`s are initialised; a synchronous callback at L1453 called `renderAbnormalityGrid()` which read `ABNORMALITY_OPTIONS` that didn't exist yet. `queueMicrotask` runs after the module's top-level completes. SW bumped to 7.38.

**Commit B — first real extraction: `modules/clock.mjs`.**

- **`modules/clock.mjs`** (NEW) — trusted UK clock extracted verbatim from diary.js L134-215. Exports `diaryNow()`, `syncDiaryTrustedUkClock({ supabaseUrl, supabaseKey })`, `isDiaryUkClockReady()`. The Supabase `Date` header fallback (third-tier after timeapi.io + worldtimeapi.org) now receives its URL / anon key as an explicit argument instead of reading globals — the module is portable. localStorage hydration runs at module init exactly as before, using the same `fl_uk_clock_*` keys so existing users' cached offsets survive.
- **`diary.js`** — added Tier-0/1 import block at the top: `import { diaryNow, isDiaryUkClockReady, syncDiaryTrustedUkClock as flClockSync } from './modules/clock.mjs';`. Deleted the 82-line inline clock block. Kept a 7-line `syncDiaryTrustedUkClock()` shim that forwards `{ supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY }` so the 5 call sites (`openNewEntry`, `openQuickEntry`, `saveQuickEntry`, init IIFE, online-sync listener) didn't need editing. Updated the 3 sites that read the old `diaryUkClockReady` flag to `isDiaryUkClockReady()`.
- **`sw.js`** — `./modules/clock.mjs` added to `PRECACHE_URLS`. `isStaticAsset()` already catches ES modules via `request.destination === 'script'`, so no other SW logic changes. Bumped to `v7.39`.

Tests: 31/31 green. No linter errors.

**Commit C — `modules/sw-bridge.mjs`.**

- **`modules/sw-bridge.mjs`** (NEW) — SW registration + update-banner wiring extracted verbatim from diary.js L2034-2113 (80 lines). Single exported `initSwBridge()` entry point; module-internal helpers (`showSwUpdateBar`, `swUpdateBarShown` flag) are no longer visible to diary.js. Idempotent — a second `initSwBridge()` call is a no-op, so hot reloads or accidental double-init don't attach duplicate listeners.
- **`diary.js`** — added `import { initSwBridge } from './modules/sw-bridge.mjs';`, deleted the 80-line SW block, replaced with a single `initSwBridge();` call. The block was entirely self-contained so no other call sites needed updating. Net -75 lines.
- **`sw.js`** — `./modules/sw-bridge.mjs` added to `PRECACHE_URLS`. Bumped to `v7.40`.

Tests: 31/31 green. No linter errors.

**Commit D — `modules/svg-icons.mjs`.**

- **`modules/svg-icons.mjs`** (NEW) — 32 inline-SVG icon blobs (target reticle, cloud / clipboard / camera / image / pin / GPS / pencil / PDF / trash / book / zap / signal / 3 toast tones, 3 weather metric icons, 10 sky-condition icons) extracted verbatim from diary.js L212-330. All exported `const`s; pure data, zero logic. Callers reference the same `SVG_*` names via a single named import.
- **`diary.js`** — one extended import block at the top brings the whole set into scope. Deleted ~120 lines of string-literal definitions (the biggest single block of pure data in the file). Callers at ~40 consumption sites (toast renderers, plan/target cards, form buttons, list cards, weather card, detail view) are unchanged — the imported names shadow the deleted `var`s with identical values.
- **`sw.js`** — `./modules/svg-icons.mjs` added to `PRECACHE_URLS`. Bumped to `v7.41`.

diary.js is now **9,707 lines** (was ~9,845 at the start of Phase 1). Total reduction to date: ~140 lines. Tests: 31/31 green.

**Commit E — `modules/supabase.mjs`.**

- **`modules/supabase.mjs`** (NEW) — thin wrapper over the `@supabase/supabase-js` UMD global. Exports the project URL / anon key as module constants, a `SUPABASE_CONFIGURED` boolean, the `sb` client as a **live binding** (`export let sb = null`), and an `initSupabase()` that returns a structured result (`{ ok: true } | { ok: false, reason: 'not-configured' | 'error' }`). DOM side-effects removed from the module — the caller (diary.js) now owns the two app-specific failure UIs (auth-card setup notice, error toast).
- **`diary.js`** — imports `SUPABASE_URL`, `SUPABASE_KEY`, `sb`, and the raw init function. The `initSupabase()` call site (`if (!initSupabase()) return;`) is unchanged — a thin shim maps the module's result object to the old boolean contract and to the DOM / toast UI. All 88 `sb.xxx` call sites unchanged — they now read the module's live binding. Dropped the defensive `typeof SUPABASE_URL === 'string'` guards in the clock shim (imports are typed and always in scope).
- **`sw.js`** — `./modules/supabase.mjs` added to `PRECACHE_URLS`. Bumped to `v7.42`.

The headline win here isn't lines (diary.js is 9,702 now, ~5 fewer than D) — it's **dependency direction**: future modules (`auth.mjs`, `data.mjs`) will import the Supabase client directly from one canonical place instead of reaching into `window.sb` via a shim. Tests: 31/31 green.

**Bugfix caught during Commit E smoke-test:** `SVG_WX_SKY_OVC` (overcast cloud weather icon) had a stray extra `0` in its `d` path — the arc command `a4 4 0 0 0 0-8 0h-.5` has 8 numeric params instead of the required 7, making Chromium reject the attribute with `<path> attribute d: Expected number`. The glyph just didn't render on any entry with overcast weather and the console logged one error per render. Pre-existing bug copied verbatim into `svg-icons.mjs` at Commit D; noticed when the user opened a detail view. Fixed by removing the stray `0 ` so the path matches the identical (working) cloud shape in `SVG_FL_CLOUD`. Comment added pointing at the fix so the pattern isn't re-introduced. SW bumped to `v7.43`.

**Commit H — `modules/stats.mjs` (partial — constants + 3 simplest aggregators).** Unlike weather/photos, the stats surface mixes aggregation, HTML building, and DOM writes in each `buildXStats` function, so a wholesale extraction would have been ~800+ lines of risky plumbing. Took a conservative slice instead: moved the 5 shared **data tables** (`CAL_COLORS`, `SP_COLORS_D`, `AGE_CLASSES`, `AGE_COLORS`, `AGE_GROUPS`) plus a new `TIME_OF_DAY_BUCKETS` table, and extracted **3 pure aggregators** (`aggregateShooterStats`, `aggregateDestinationStats`, `aggregateTimeOfDayStats`) + a `categorizeHourToBucket(hour)` helper into `modules/stats.mjs`. The three corresponding `buildXStats` functions in `diary.js` became thin DOM wrappers that call the aggregator then render HTML — turning ~48 lines of shooter logic into 22, ~48 destination → 28, ~43 time-of-day → 17. The render flags (`isAllSelf`, `total===0`) moved onto the aggregator return shape so the render callers stay declarative. Left `buildCalibreDistanceStats`, `buildAgeStats`, `buildTrendsChart`, and `buildGroundStats` in place — their pure halves are worth extracting but each has more cross-references (`normalizeAgeClassLabel`, `buildSeasonFromEntry`, `currentSeason`, Chart.js), so they belong in a follow-up commit. Added `tests/stats.test.mjs` with **24 new assertions** covering: every AGE_GROUP label matches an AGE_CLASSES label (caught duplicates / typos), TIME_OF_DAY_BUCKETS Night-last invariant, whitespace trim in shooter names, "Self" pinning first regardless of count, the 21→04 night wraparound for all 8 hours, and the NaN / junk-hour → Night fallback. `diary.js` -94/+37 net −57 lines; `sw.js` → `v7.46` with `./modules/stats.mjs` in `PRECACHE_URLS`. Test count 65 → 89, all green.

**Commit G — `modules/photos.mjs` extracted.** Pulled the 4 pure photo helpers and the canvas compression pipeline out of `diary.js` into a new module. Exports: `CULL_PHOTO_SIGN_EXPIRES` (the 24-hour signed-URL TTL constant, used at 3 call sites), `newCullPhotoPath(userId)` (collision-free storage path builder), `cullPhotoStoragePath(url)` (legacy URL / bucket-path normaliser used at 7 call sites — this one is the most-used photo helper in the codebase), `dataUrlToBlob(dataUrl)` (offline-queue drain helper), and a new `compressPhotoFile(file, opts)` that wraps the FileReader → Image → Canvas → Blob pipeline in a Promise with configurable max-dim and JPEG quality. `handlePhoto()` in `diary.js` is now a 15-line DOM wrapper around `compressPhotoFile()` instead of an 40-line nested-callback mess, which also means a future "HQ trophy shot" path can reuse the same pipeline at a different `maxDim`. Defaults held constant at 800px / 0.75 quality to avoid ballooning stored photo size on the free Supabase tier. Added `tests/photos.test.mjs` with **15 new assertions** covering: the TTL sanity, the path-builder shape + uniqueness-in-a-tick, all 3 URL-shape branches of `cullPhotoStoragePath` (bucket-relative, signed, public) including URL-decoding, every null/empty/garbage input path, and a JPEG-header round-trip through `dataUrlToBlob`. `compressPhotoFile` is smoke-tested only (it needs Image/Canvas/FileReader). `diary.js` -83/+33 net −50 lines; `sw.js` → `v7.45` with `./modules/photos.mjs` in `PRECACHE_URLS`. Test count 50 → 65, all green.

**Commit F — `modules/weather.mjs` extracted.** The weather-at-time-of-cull feature had the right split: the WMO-code table, wind-direction bucket, hourly-index lookup, London wall-clock → UTC epoch-ms converter, and the Open-Meteo fetch are all pure or near-pure; the DB write and the HTML render both touch app state (`sb`, `currentUser`, `allEntries`, `esc`). Kept that split intact — moved the five safe functions into `modules/weather.mjs` (183 lines) and left `attachWeatherToEntry` + `renderWeatherStrip` in `diary.js`. The module re-imports `diaryNow` from `clock.mjs` and the 11 sky-icon SVG blobs from `svg-icons.mjs`, so `wxCodeLabel` returns a ready-to-inline payload with no further plumbing. Also added `tests/weather.test.mjs` (141 lines, **19 new assertions**) covering every WMO bucket boundary, every 8-compass direction including the 22.5°/67.5° round-to-boundary edges, both Open-Meteo time formats the API has shipped, and the BST vs GMT offset in `diaryLondonWallMs`. Crucially one of the new tests pins the `SVG_WX_SKY_OVC` fix with an explicit `!.includes('0-8 0h-.5')` assertion so the malformed arc can never regress. `diary.js` -149/+16 lines (net −133); the weather code is also now unit-testable without a browser. `sw.js` → `v7.44` and `./modules/weather.mjs` added to `PRECACHE_URLS`. Total test count: 31 → 50, all green.



---

## 2026-04-16 — Audit round-2 sweep (11 items, all closed)

Sequential pass through the full re-audit backlog. Risk-ordered — safe infra first, tiny `diary.js` edits next, bigger structural work last. Tests stayed 31/31 green throughout.

- **`.gitignore`** (NEW) — node_modules, env/secrets, editor junk, build artefacts. Kept permissive so we don't accidentally ignore anything shipped (HTML/CSS/JS/SQL all tracked).
- **`.gitattributes`** (NEW) — normalises line endings to LF for all text assets so `diary.js` / `app.js` hash the same on Windows and CI. Binaries flagged so diff machinery skips them.
- **`.github/workflows/test.yml`** (NEW) — trivial GitHub Actions workflow that runs `npm test` (zero deps → no `npm install` step) on every push and PR. Starts producing results the moment the repo is on GitHub.
- **`GIT-BOOTSTRAP.md`** (NEW) — step-by-step install-git → init → push-to-private-GitHub → day-to-day commands. Includes a branch-etiquette suggestion (feature branches while `diary.js` is still a single file).
- **`previews/`** (NEW) — moved all 10 design-sandbox HTMLs (`banner-*`, `charts-*`, `deerschool-*`, `diary-detail-*`, `diary-emoji-*`, `diary-stats-*`, `legal-banner-*`) out of the repo root. Added `previews/README.md` explaining the folder's purpose. Root `Get-ChildItem` now reads cleanly. Previews were already not in the SW precache so no caching / behaviour change.
- **`diary.js`** — **SUPABASE_URL / SUPABASE_KEY single-sourced**. The clock-sync fallback block at L70-91 used to hard-code a duplicate URL string ("just in case" the `var`-hoisted config block wasn't in scope, which it always is). Replaced with direct refs to the hoisted constants and a short comment making the ordering explicit. A rotation accident can no longer leave one value stale.
- **`diary.js`** — **`flDebugLog()` gate** for object-dumping error logs. Photo-upload paths used to `console.error('Photo upload error:', upload.error)` — a curious user on a shared device opening devtools saw internal Supabase error shapes. The gated logger still prints a one-line label (so remote troubleshooting over screen-share works) but suppresses the object unless `localStorage.fl_debug = '1'` or `window.FL_DEBUG = true`. Only the 2 dumpy sites were converted; the other 32 one-liner warns are fine as-is.
- **`diary.js`** — **narrowed `select('*')` on cull_entries**. The "Export → All seasons" fetch at L4032 used to pull every column, including the chunky `weather_data` JSONB blob. Restricted to the 15 columns both `exportCSVData()` and `exportPDFData()` actually read (omits weather_data, photo_url, abnormalities, lat/lng, created_at). Meaningful bandwidth saving on a decade-long archive.
- **`diary.js`** — **top-level error safety net**. First-ever `window.addEventListener('unhandledrejection')` + global `'error'` handler. Each fires `flHapticError()` and a single toast ("Something went wrong — please try again") with a 3-second cooldown so runaway errors can't toast-spam. Noise filter: ignores `AbortError`, `ResizeObserver loop`, and extension-injected errors with no `message` / `filename`. Before this, a rejected promise in an async save / PDF / map / Nominatim path just vanished.
- **`diary.js`** — **SPEC breadcrumbs** on 12 inline copies of pure helpers (`seasonLabel`, `buildSeasonFromEntry`, `buildSeasonList`, `MONTH_NAMES`, `ABNORMALITY_OPTIONS`, `ABNORMALITY_LABEL_BY_CODE`, `abnormalitySummaryText`, `sexBadgeClass`, `sexLabel`, `parseEntryDateParts`, `esc`, `csvField`) pointing at `lib/fl-pure.mjs` and noting `keep in sync until modularisation`. Surfaces drift in code review — if someone edits the diary.js copy without the module, the breadcrumb is the warning flag.
- **`diary.html`** — **explicit `<label for="…">` associations** on all 19 primary-form inputs (email, password, name, recovery-passwords, date, time, location, ground, syndicate, calibre, distance, placement, shooter, weight, age-class, destination, tag, abnormalities-other, notes). Was 5/31, now 24/31 with the remaining 7 using valid implicit wrap (`<label class="abnorm-chip">…<input>…</label>`). Older iOS VoiceOver / Android TalkBack combos that mishandle implicit wrap now always announce the field name. Input IDs unchanged so no JS wiring touched.
- **`diary.js`** / **`diary.css`** — **offline-queue staleness signal**. `updateOfflineBadge()` now computes the oldest `_queuedAt` across the queue and appends "oldest 3h" / "oldest 2d" to the banner subtitle once anything is older than an hour. When the oldest queued entry crosses 24h the banner gains an `is-stale` class → deeper amber gradient + thicker border so "3 entries pending, oldest 2 days ago" visually reads as "needs attention" rather than "just pending".
- **`diary.js`** / **`diary.html`** / **`diary.css`** — **`flConfirm()` themed modal helper** replaces 7 of the 9 native `window.confirm()` calls. Single shared instance (`#fl-generic-confirm-modal`) mutated per call via `flConfirm({title, body, action, tone})` → returns a Promise. Three tones: **danger** (red trash icon, uses default red CTA — only for syndicate-delete), **warn** (amber halo + amber CTA — for revoke-invite / leave / promote / remove-member / remove-ground / low-storage-photo), **info** (moss-green halo — reserved for safety prompts like sign-out-all). Cancel button autofocuses so Enter doesn't accidentally confirm. Nested-confirm guard: a second `flConfirm()` call while a first is still open auto-cancels the first. Two sites deliberately kept native (`closeTargetsSheet()` unsaved-target guard, `confirmDiscardUnsavedForm()` form-close guard) — both live in sync return-boolean paths that would cascade-infect dozens of call sites if async-ified; commented with a SPEC note pointing at the form-editing state refactor that owns the conversion.
- **`diary.js`** — **GLOBALS INDEX** comment at the top of the file listing migrated (`flSelection`, `flQuickEntry`) vs still-free (`currentUser`, `allEntries`, `currentSeason`, `editingId`, `formDirty`, `pendingDeleteEntryId`, `photoFile`, `photoPreviewUrl`, `editingOriginalPhotoPath`, `formSpecies`, `formSex`, `cullTargets`, `prevSeasonTargets`) globals, with a rule that new cross-function state must extend one of the `flXxx` objects or use an `fl…` prefix. Prevents regression of the partial migration while the modularisation work is deferred.
- **`sw.js`** — cache bump to `v7.36`.

Tests: 31/31 green (`npm test`). No linter errors introduced.

## 2026-04-16 — Modularisation plan (design doc for P3 code-quality #1)

- **`MODULARISATION-PLAN.md`** (NEW) — scoping doc for splitting `diary.js` (~9,300 lines) into ~15 ES modules under `modules/`. Covers goals, target layout across 5 tiers, loader strategy (pure ESM, no window shim — verified `diary.html` has zero inline handlers), incremental extraction recipe, testing strategy, SW precache implications, backup protocol (no git in repo — flagged git install as a phase-0 prerequisite), open questions for review, and a ~30-hour phased estimate. No code changes yet. Awaiting user sign-off on §9 questions (git? dev server? release cadence?) before Phase 0.

## 2026-04-16 — Code quality: SW version constant, node:test suite, partial globals migration

- **`sw.js`** — introduced a single `SW_VERSION` constant that both cache names derive from (`first-light-static-v<ver>` / `first-light-runtime-v<ver>`). Previously the header comment drifted from the cache strings (`v7.33` vs `v7.34` was live simultaneously); now one bump updates everything. Expanded comments on `PRECACHE_URLS`, `CDN_URLS`, and `CACHEABLE_ORIGINS` to explain why each list exists and what must stay in lock-step.
- **`lib/fl-pure.mjs`** (NEW) — ES-module extraction of the pure, DOM-free helpers from `diary.js` as a behavioural spec: `seasonLabel`, `buildSeasonFromEntry`, `buildSeasonList`, `sexLabel`, `sexBadgeClass`, `parseEntryDateParts`, `csvField`, `esc`, `abnormalitySummaryText`, plus the `MONTH_NAMES` and `ABNORMALITY_OPTIONS` / `ABNORMALITY_LABEL_BY_CODE` tables. `diary.js` retains its inline copies for now — when it's modularised (P3 code-quality #1) it will import from here directly, at which point the tests become a runtime guard rather than a spec.
- **`tests/fl-pure.test.mjs`** (NEW) — 31 tests using Node's built-in `node:test` + `node:assert/strict` runner. Zero dependencies, zero `node_modules`. Covers the tricky edges: 1-Aug season hinge, 2-digit vs 4-digit season years, CSV RFC-4180 double-quote escape + CRLF-squashing, `esc()` across all five HTML entities, all three abnormality-summary shapes (none / codes / other).
- **`package.json`** (NEW) — minimal file (`"type"` left default, no deps) just to expose `npm test` → `node --test tests/*.test.mjs`.
- **`diary.js`** — **partial globals migration (~50 references)**: selection state (`selectMode` + `selectedEntryIds`) → `flSelection = { active, ids }`; quick-entry state (`qsSpecies` / `qsSexVal` / `qsLocation` / `qsLat` / `qsLng`) → `flQuickEntry = { species, sex, location, lat, lng }`. Both were self-contained sections with well-bounded call graphs. **Deliberately NOT migrated**: form-editing state (`editingId` / `formDirty` / `photoFile` / `photoPreviewUrl` / `editingOriginalPhotoPath` / `formSpecies` / `formSex` / `pendingDeleteEntryId` — 76 references across `saveEntry`, `openEditEntry`, photo upload, delete flow, offline queue) and the big singletons (`currentUser`, `allEntries`, `currentSeason` — hundreds of refs each). These will be migrated when diary.js is split into modules (P3 code-quality #1) so they only move once, under the cover of the test suite.
- **`sw.js`** — cache bump to `v7.35`.

## 2026-04-16 — Sign-out-all-devices, calibre presets, error haptics (P3 batch)

- **`diary.js`** — **Sign-out-all-devices**: `signOut()` now takes an optional `{ scope }` arg and forwards it to `sb.auth.signOut({ scope: 'global' })`, which invalidates every refresh token on the user record (only way to evict a lost/stolen phone). New themed confirm modal (`#signout-all-modal`, moss-green info halo — not destructive) and `confirmSignOutAll()` handler. Falls back to default `signOut()` on older supabase-js versions that reject the `scope` option.
- **`diary.js`** — **Calibre presets**: new per-user rolling list (`loadCalibrePresets` / `rememberCalibrePreset`) keyed to `currentUser.id` so a shared device doesn't leak one stalker's calibres into another's form. Up to 5 most-recent chips render above the calibre dropdown via `renderCalibrePresets()`; tapping a chip reuses the existing `setCalibreValue()` (auto-resolves to the native `<option>` or falls back to `__custom__`). Chips update on form open + on dropdown change (active one gets a `✓`). Remember-on-save hooks added to `saveEntry()` and the offline-sync drain so only calibres that actually shipped pollute the chip row. Stored `fl_calibre_presets_<uid>` (last 10, dedupe case-insensitive).
- **`diary.js`** — **Error haptics**: new `flHapticError()` — three-pulse `[40, 60, 40]` pattern (distinguishable by feel from the 12ms success buzz), respects `prefers-reduced-motion`, no-op on iOS Safari (no Vibration API). Wired into seven failure paths: form save, quick-entry save, offline queue save (storage-full), offline sync (any failed), entry delete, bulk delete, target save, and auth sign-in/up error.
- **`diary.html`** — `#signout-all-modal`, "Sign out of all devices" secondary link under the account row, new `#cal-presets` chip container in the calibre form slot.
- **`diary.css`** — `.account-row-sub` + `.signout-all-link` for the quiet secondary action, `.di-delete-icon-wrap--info` moss-green halo variant, `.cal-presets` + `.cal-preset-chip` chip styling (moss tint, `is-on` fills).
- **`sw.js`** — cache bump to `v7.34`.

## 2026-04-16 — Auto sign-in after signup when Supabase returns a session

- **`diary.js`** — `handleAuth()` previously always showed "Check your email to confirm your account" + flipped to the sign-in tab after a successful `sb.auth.signUp()`. That's wrong when the Supabase project has email-confirmation **disabled** — `signUp()` returns `result.data.session` in that case and the user is already authenticated, so the "check your email" copy is misleading and they have to manually sign in with the password they just entered. Now we inspect `result.data.session`: if present → treat as signed-in (`onSignedIn()`); if absent → original flow (the email-confirm path is unchanged).
- **`sw.js`** — cache bump to `v7.33`.

## 2026-04-16 — Bulk CSV and bulk delete on the diary list

- **`diary.html`** — two new buttons in `#select-bar`: CSV (`data-fl-action="bulk-csv-selected"`) and Delete (`data-fl-action="bulk-delete-selected"`, `.select-bar-btn-danger`). New `#delete-bulk-modal` mirrors the single-delete themed modal — shows count, species × count, total kg, and has its own confirm/cancel actions.
- **`diary.js`** — new `bulkCsvSelected()` runs `exportCSVData` over `allEntries.filter(selectedEntryIds)` using the same column schema as the full-list CSV (filename suffix `selection-N.csv`; does NOT strip "Left on hill" — if you picked it you want it). New `openBulkDeleteModal()` / `closeBulkDeleteModal()` / `confirmBulkDelete()` — the confirm path removes photo objects in one parallel `storage.remove([…])` call (best-effort), then one `DELETE … WHERE id IN (…) AND user_id = :me` with the belt-and-braces user_id filter matching the single-delete path. Successful delete invalidates the season cache and exits select mode. `updateSelectBar()` enables/disables all three action buttons in one shot.
- **`diary.css`** — `.select-bar-btn-danger` tonal red to differentiate bulk Delete from the neutral actions and prevent misclicks.
- **`sw.js`** — cache bump to `v7.32`.

## 2026-04-16 — Service worker update UX: persistent "Reload" banner

- **`diary.js`** — replaced the time-limited toast ("New version available — refresh the page…") with a persistent `#sw-update-bar` banner that has a real `Reload` button and a dismiss-×. Wired to both `controllerchange` (primary — fires when the new SW actually takes over thanks to `skipWaiting()` + `clients.claim()`) and `statechange === 'installed' && controller != null` (fallback for the "other tab holding old controller" edge case). First-install suppression: snapshot `navigator.serviceWorker.controller` at page load and only prompt on `controllerchange` when there was a prior controller — otherwise every fresh install would nag for a reload. Dismiss doesn't re-nag on the same page load but any future `controllerchange` re-surfaces it.
- **`diary.css`** — `.sw-update-bar` sits 64px above the viewport bottom (above the nav), `z-index:230` so it beats the map / fab, matches the dark-forest / gold system (amber accent button, muted subtitle).
- **`sw.js`** — cache bump to `v7.31`.

## 2026-04-16 — loadEntries season-cache: stop scanning every date on every reload

- **`diary.js`** — `loadEntries()` previously ran `SELECT date FROM cull_entries ORDER BY date ASC` (all rows) just to read `[0]` for the earliest entry. Replaced with an in-memory cache (`cachedEarliestEntryDate` + `cachedEarliestEntryDateForUserId`) and a `LIMIT 1` probe (`probeEarliestEntryDate`) that only runs when the cache is stale (different user / first load / explicit invalidate). On insert (`saveEntry`, quick-entry save, offline-sync drain) we call `extendSeasonCacheForDate(payload.date)` so a backdated save grows the dropdown without a re-probe. On delete we `invalidateSeasonCache()` because the deleted row might have been the sole entry in the earliest season (one LIMIT-1 probe beats a stale dropdown). Sign-out (explicit + `SIGNED_OUT` auth event) invalidates the cache. Net effect: save → 1 round-trip instead of 2; subsequent tab-switches / season-changes skip the probe entirely.
- **`sw.js`** — cache bump to `v7.30`.

## 2026-04-16 — Team Larder Book for syndicate managers

- **`scripts/syndicate-manager-larder.sql`** — new manager-only RPC `syndicate_member_larder_for_manager(p_syndicate_id, p_season)` returning full larder payload (entry_id, user_id, date, time, species, sex, tag, weight_kg, age_class, destination, ground, location, calibre, abnormalities, abnormalities_other) for every active member's cull in a season, scoped to the syndicate's `ground_filter` and excluding `'left on hill'` destinations. Does NOT include `syndicate_anonymous_culls` rows because retention only keeps species/sex/date — half-empty rows in a larder book would read as a compliance risk. Security definer + `is_syndicate_manager()` guard. **Requires `migrate-add-abnormalities.sql` to have been run first** (already deployed 2026-04-16).
- **`diary.js`** — new `fetchSyndicateLarderRows(syndicateId, season, nameMap)` wraps the RPC and decorates each row with the member's display name via the existing `fetchSyndicateMemberNameMap`. New `exportSyndicateLarderBookPDF(syndicate, season, rows)` renders a landscape A4 larder book matching `exportLarderBookPDF()` columns plus a SHOOTER column — same structured abnormalities cell as the single-user export (structured codes, `+N` overflow, "other" suffix, legacy fallback). Adds a totals footer (carcasses + kg sum) and a manager signature line. `openSyndicateExportModal('larder')` configures the modal for a per-season-only run (no "all seasons" scope — aggregating larder books across seasons isn't a real thing). `doSyndicateExport` dispatches on `syndicateExportFormat === 'larder'`.
- **`diary.html`** — new fourth button in the Manager Exports row: "Team Larder" sitting next to Team CSV / Team PDF / Team Summary. Larder-book icon.
- **`diary.css`** — `.exp-btn--syndicate-larder` border/colour (amber — matches the larder-book section throughout the app).
- **`scripts/SUPABASE-RECORD.md`** — added Pending entry for the new RPC + changelog row. **Must be deployed** before the Team Larder button will work.
- **`sw.js`** — cache bump to `v7.29`.

## 2026-04-16 — Abnormalities checkbox group (larder inspection)

- **`scripts/migrate-add-abnormalities.sql`** — new migration adding `abnormalities TEXT[]` and `abnormalities_other TEXT` columns to `cull_entries`. **Must be deployed in Supabase SQL Editor before the client-side code can persist abnormalities — the form/save code is safe against the old schema** (Supabase will return an error if you save with these fields and the columns are missing), so the PR will break saves until the migration is run. Idempotent (`ADD COLUMN IF NOT EXISTS`).
- **`diary.html`** — new form section 7 "Larder inspection": a primary "No abnormalities observed" toggle, a 2-column grid of chip-style checkboxes for 12 AHVLA trained-hunter checklist items (poor body condition, enlarged lymph nodes, abscess/pus, cysts, liver fluke, TB lesions, tumour, ecto-parasites, swollen joints, organ colour, behaviour, bruising), and a free-text "Other abnormalities" field. Notes section renumbered to 8.
- **`diary.css`** — styling for `.fsec-abnorm`, `.abnorm-none`, `.abnorm-grid`, `.abnorm-chip` (gold highlight when ticked), and a disabled/grey-out state on the grid when "None observed" is on. Responsive: grid collapses to one column below 380 px. Plus `.dd-abnorm-list` for the detail view card.
- **`diary.js`** — `ABNORMALITY_OPTIONS` constant + `ABNORMALITY_LABEL_BY_CODE` lookup. `renderAbnormalityGrid()` builds the chips on DOMContentLoaded and wires the "None observed" ↔ specific-checkbox mutual-exclusion (ticking any specific clears None; ticking None clears all specifics and the other-text field). `getAbnormalityValues()` returns `{abnormalities: [...]|['none']|null, abnormalities_other: string|null}` — the null-vs-`['none']` split lets aggregate reports later distinguish "confirmed clean" from "unchecked". `setAbnormalityValues(codes, other)` populates the form. Form reset (`openNewEntry`) and edit populate (`openEditEntry`) call the helpers. Save path includes both fields in both offline payload and online insert/update; offline-queue sync path also passes them through. Single Game Dealer PDF (`exportGameDealerDeclaration`) now renders the structured checklist — bullet list of observed items with "+ Other: …" for free-text, or a single "✓ No abnormalities observed" line when clean. Legacy entries without the new columns still fall back to free-text notes so old declarations still print. Consignment PDF's gralloch/notes column prefers structured data, showing 2 labels + "(+N)" overflow and "other: …" suffix. Detail view gains a new "Larder inspection" card with a bulleted list (or the affirmative sentence when all clear).
- **`sw.js`** — cache bump to `v7.28`.

## 2026-04-16 — Diary list search

- **`diary.html`** — new `#list-search` row above `#list-secondary-filters`: magnifier icon, search input with placeholder "Search species, ground, tag, notes…", and a clear (✕) chip that appears while a query is active.
- **`diary.css`** — styles for `.list-search`, `.list-search-ico`, `.list-search-input`, `.list-search-clear`, and `.list-search-empty` (the "no matches" state). Focus ring uses the existing gold accent, matching other form inputs.
- **`diary.js`** — new module var `currentSearch`, helper `entryMatchesSearch(e, query)` that does a case-insensitive AND-of-tokens match across `species`, sex label, `location_name`, `ground`, `shooter`, `tag_number`, `calibre`, `shot_placement`, `age_class`, `destination`, `notes`, and `date`. Multi-word queries narrow results (e.g. "roe buck larder"). `renderList()` applies the filter after species/ground filters. When a search yields zero rows, a tiny "No matches for 'xyz'" hint replaces the onboarding empty state so the user knows they still have entries. Clear button resets to a full list. Search row follows the same show/hide rule as `list-secondary-filters` — hidden when the diary is empty, visible the moment any entry exists. Wired in the action delegator as `clear-list-search`.
- **`sw.js`** — cache bump to `v7.27`.

## 2026-04-16 — Weather 7-day gate now uses Europe/London explicitly

- **`diary.js`** — new `diaryLondonWallMs(dateStr, timeStr)` parses the entry's `YYYY-MM-DD` + `HH:MM` as Europe/London wall-clock and returns a UTC epoch-ms. Uses `Intl.DateTimeFormat` with `timeZoneName: 'longOffset'` to query London's offset at that specific UTC moment so it works across BST/GMT transitions without hardcoding dates. Falls back to `new Date(...).getTime()` (device TZ) if Intl is unavailable — safe default since the vast majority of users are in the UK.
- **`diary.js`** — `fetchCullWeather` now uses `diaryLondonWallMs` to compute `ageDays`. Previously `new Date("YYYY-MM-DDTHH:MM:00")` was parsed in the device's local TZ; a user abroad could see the 7-day gate drift by an hour or two, occasionally skipping weather attach for a just-in-time 6.9-day-old entry or vice versa. The actual hour used for the Open-Meteo lookup is still the wall-clock hour (which is what the user entered and what we want the API to resolve in its `timezone=auto` response for the entry's lat/lng).
- **`sw.js`** — cache bump to `v7.26`.

## 2026-04-16 — Orphan photo cleanup on edit

- **`diary.js`** — new module var `editingOriginalPhotoPath` captures the storage path of whatever photo was on the entry when `openEditEntry` opened it. `openNewEntry` clears it (new entries have no original). After a successful UPDATE in `saveEntry`, if the payload set `photo_url` to anything different from the captured original, we call `sb.storage.from('cull-photos').remove([...])` on the old object. Skipped when the payload didn't touch `photo_url` (the upload-failed branch) because the row still points at the original. Best-effort removal — failure is swallowed in a try/catch so the save itself doesn't roll back on a storage hiccup. Covers three edit paths: "replace photo" (upload → new path), "remove photo" (preview cleared → photo_url=null), and a no-op on "keep photo" / "add to a row that had none" / "upload failed so nothing changed".
- Impact: with compressed ~100 KB photos the absolute savings are modest, but it keeps the `cull-photos` bucket honest — `cull_entries` rows will never again point at a path that's also shadowed by another "original" the user has already moved on from.
- **`sw.js`** — cache bump to `v7.25`.

## 2026-04-16 — CSV exports: UTF-8 BOM + CRLF (Excel-compat)

- **`diary.js`** — extracted `triggerCsvDownload(rowLines, filename)` and `csvField(v)` so every CSV export goes through one path. CSV output now includes a UTF-8 BOM (`\uFEFF`) so Excel on Windows detects the encoding and stops mangling accented characters / "Muntjac"-style multibyte glyphs, uses CRLF line endings (`\r\n`) which Excel's parser prefers, and the Blob MIME declares `charset=utf-8`. Applied to both `exportCSVData` (cull entries) and `exportSyndicateCSVData` (syndicate manager export) — the two csv sites previously duplicated their own `csvField` helper with subtly different regex. Also added a `setTimeout` `URL.revokeObjectURL` after the click so we don't leak object URLs.
- **`sw.js`** — cache bump to `v7.24`.

## 2026-04-16 — Select bar sits in the app column + hides main-nav

- **`diary.css`** — `.select-bar` was `left:0;right:0` (full viewport width) while the `.nav` is a 430px-max column centred on screen. On wider browser windows the select bar's content flew past the edges of the app column and the main-nav (`z-index: 200`) covered the middle where "All visible" would have been. Bar is now `left:50%;transform:translateX(-50%);max-width:430px` — same footprint as the main-nav — and `z-index: 260` so it sits above it regardless. Added `.nav` to the list of things hidden by `body.in-select-mode`, so the select bar cleanly replaces the nav while selecting (the bar's ✕ is the only way out — navigation elsewhere auto-exits select mode via `go()`).
- **`sw.js`** — cache bump to `v7.23`.

## 2026-04-16 — Select button visibility fix

- **`diary.js`** — `populateGroundFilterDropdown` used to hide the entire `list-secondary-filters` row when fewer than 2 grounds were in use (ground-filter wasn't useful). The Select button was added to that row in the previous commit, so it was hidden for users without multiple grounds. Split the visibility: the row is now shown whenever there are any entries (so Sort + Select are always reachable), and only the `<select>` ground-filter itself is hidden when < 2 grounds.
- **`sw.js`** — cache bump to `v7.22`.

## 2026-04-16 — Defensive user_id scoping on cull_entries writes

- **`diary.js`** — `saveEntry` UPDATE path (edit) and `confirmDeleteEntry` DELETE now chain `.eq('user_id', currentUser.id)` on top of `.eq('id', …)`. RLS already blocks cross-user writes; the explicit filter is defence-in-depth — if a future migration drops or misconfigures a policy, these queries fail closed (match zero rows) instead of succeeding and exposing another user's record. Other writes that touch user-owned tables already had this scoping (weather attach, syndicates member ops, grounds delete, profile update).
- **`sw.js`** — cache bump to `v7.21`.

## 2026-04-16 — Weather attach for Quick entry

- **`diary.js`** — `saveQuickEntry` now calls `attachWeatherToEntry` in the background after a successful insert. Quick-entry users get the same weather strip on their carcass cards as full-form users — previously quick entries always had an empty `weather_data`. Uses the id returned from `.insert(...).select('id')`; no "most recent row" fallback (same hardening as the full form post-P0 fix) so a concurrent offline-sync drain can't mis-attach. Falls back to `lastGpsLat`/`lastGpsLng` when payload GPS is absent but a quick-entry "Capture GPS" tap has just happened. Non-fatal: any failure is swallowed in a try/catch — weather is decoration, not a save gate.
- **`sw.js`** — cache bump to `v7.20`.

## 2026-04-16 — Season Target KPI pace indicator

- **`diary.js`** — `computeSeasonTargetKpi` now also returns `{paceState, paceDelta, paceDaysToStart}`. States: `pre` (before Aug 1), `on` / `ahead` / `behind` (mid-season, linear trajectory with a 0.5-carcass dead band so the label doesn't flicker as the clock crosses midnight), `final-met` / `final-over` / `final-short` (after Jul 31). Uses `diaryNow()` (trusted UK clock) so device TZ can't lie about "today". Season window pulled from `seasonDates()` — Aug 1 → Jul 31 UK stalking season.
- **`diary.js`** — new `formatSeasonTargetSub(total, calc)` renders the KPI subtext. Mid-season sample: "3/12 targets · +2 ahead of pace" / "3/12 targets · 1 behind pace" / "3/12 targets · on pace". Pre-season: "0/12 targets · opens in 14 days". Post-season: "12/12 targets · target met" / "15/12 targets · +3 over target" / "8/12 targets · 4 short of target". Falls back gracefully to the old "N left / +N over" wording if the clock is unavailable.
- **`diary.js`** — both the synchronous write in `buildStats` and the later async refresh in `refreshSeasonTargetKpi` now go through the shared formatter, so the two paths can't drift. Unused `targetRemaining` / `targetOver` locals removed from `buildStats` since the formatter reads them off `targetCalc`.
- Wording choice: "behind pace" rather than "behind" because UK open seasons vary by species and sex; a stalker seemingly "behind" in October may still have most of Roe doe season ahead of them. The soft phrasing avoids crying wolf.
- **`sw.js`** — cache bump to `v7.19`.

## 2026-04-16 — Themed delete-entry confirm modal

- **`diary.html`** — new `#delete-entry-modal` reusing the `di-modal-*` class family (same style vocabulary as the account-delete modal) with a red-bin icon, destructive primary button and a tonal "Cancel". Includes a small summary chip showing the entry being deleted (species · sex · date · location) so it's harder to delete the wrong one.
- **`diary.js`** — replaced the native `window.confirm()` in `deleteEntry` with the themed modal. New helpers `deleteEntry` (opens modal + fills summary), `closeDeleteEntryModal`, `confirmDeleteEntry` (actually performs the delete), and a `pendingDeleteEntryId` module var so the list can refresh under us without losing the target. Confirm button disables + reads "Deleting…" while the request is in flight to stop double-taps on slow connections. Overlay click-to-dismiss wired same way as other modals.
- **`diary.css`** — `.di-del-entry-summary` chip (soft-red tinted) for the entry summary inside the modal. Reuses existing `.di-delete-hero`, `.di-btn-full`, etc.
- **`sw.js`** — cache bump to `v7.18`.

## 2026-04-16 — Multi-select mode + per-consignment Game Dealer PDF

- **`diary.js`** — added multi-select mode on the diary list: new state `selectMode` + `selectedEntryIds`, helpers `enterSelectMode` / `exitSelectMode` / `toggleEntrySelection` / `selectAllVisible` / `updateSelectBar`. `renderList` paints a `.gc-select-tick` overlay and an `is-selected` outline on picked cards. The global `open-detail` action is intercepted in select mode so a tap toggles selection instead of opening the detail sheet. `go()` now calls `exitSelectMode` whenever we leave the list view so the floating action bar doesn't linger on stats / detail / form.
- **`diary.js`** — new `exportConsignmentDealerPdf()` built on top of the single-entry `exportGameDealerDeclaration`. Landscape A4; one declaration header; one carcass table (#, tag, date, time, species, sex, weight, age, location, ground, gralloch notes) with zebra rows and page-break header repeat; one declaration paragraph; one signature block covering the whole consignment. Reg (EC) 853/2004 explicitly permits this — previously every carcass in a delivery needed its own declaration page. Entries with `destination === 'Left on hill'` are filtered out automatically with a line noting how many were excluded (a carcass that never entered the larder can't be declared to a dealer).
- **`diary.html`** — `#select-mode-toggle` in `list-secondary-filters` (Select chip with a ticked-checkbox icon). New `#select-bar` floating action bar with an exit ✕, a live-updated count, an "All visible" button, and the primary "Game dealer PDF" action. `role="toolbar"` + `aria-live="polite"` for screen readers.
- **`diary.css`** — `.gc-select-tick` circle overlay on cards (gold when selected), `.gc.is-selected` 3px gold outline, `.select-bar` fixed bottom strip with bark-green gradient and gold primary button, `body.in-select-mode` hides the FABs so they don't cover the bar and adds padding-bottom to `.entries` so the last row isn't masked.
- **`sw.js`** — cache bump to `v7.17`.

## 2026-04-16 — Photo upload path collision + weather-attach mis-attribution (P0 audit fix)

- **`diary.js`** — new helper `newCullPhotoPath(userId)` returns `"<userId>/<ms>-<rand6>.jpg"`. Previously both `saveEntry` and `syncOfflineQueue` used `userId + '/' + Date.now() + '.jpg'` with `upsert: true`. In the offline-sync drain loop two photos could upload in the same millisecond, the second silently overwriting the first, leaving two `cull_entries` rows pointing at the same file. Helper used everywhere a new photo is uploaded.
- **`diary.js` / `saveEntry`** — removed the "most recent row for this user" fallback that ran when `insert(…).select('id')` didn't return an id. During concurrent offline-sync drain that fallback could attach the current form's weather to a newer (unrelated) row. Safer to skip weather than guess wrong — a later edit can re-trigger the fetch.
- **`sw.js`** — cache bump to `v7.16`.

## 2026-04-16 — Summary + Syndicate PDF: species label no longer hard-coded to male row

- **`diary.js`** — in both `exportSeasonSummary` and the syndicate summary PDF, the species name was only drawn when the male row rendered (`if (sx === 'm') doc.text(sp.name, ML, y)`). Species with only-female data (e.g. Muntjac Doe with no Muntjac Buck target, CWD Doe without a Stag target) ended up as an orphan "Doe 1 (no target set)" line with no species label. Switched both call sites to a `spLabelDrawn` flag that paints the label on the first row that actually renders.
- **`sw.js`** — cache bump to `v7.15`.

## 2026-04-16 — Summary PDF: total rows for species breakdown and cull plan

- **`diary.js` / `exportSeasonSummary`** — added TOTAL rollup rows at the bottom of the Species breakdown and Cull plan vs actual sections, matching the "TOTAL x/y" line the Season Plan shows in the Stats tab. Species total shows grand count + grand weight; cull plan total shows actual/target with a gold progress bar (green when done) so a reader can see the season headline without counting rows.
- **`sw.js`** — cache bump to `v7.14`.

## 2026-04-16 — Summary PDF: landscape + Tag / Age / Destination columns

- **`diary.js` / `exportSeasonSummary`** — switched from portrait to landscape A4 (842 × 595 pt). Portrait's 559pt usable width couldn't fit the detail columns a deer manager needs for annual returns and carcass traceability. Landscape gives 806pt, enough for all 13 columns at 7pt without crushing Notes.
- **New columns** in the entries table: **Tag** (Reg 853/2004 traceability + dealer reconciliation), **Age** (BDS/AHDB annual returns), **Destination** (where the carcass went). Full column order is now: DATE, TIME, SPECIES, SEX, TAG, WT(kg), AGE, GROUND, PLACE, SHOOTER, DEST, LOCATION, NOTES.
- **Age label** collapsed to the first word ("Adult", "Yearling", "Calf") so it fits the 52pt column cleanly. Long combined labels like `Calf / Kid / Fawn` become just `Calf`.
- **Species breakdown bar** rescaled for landscape — was `bxBar=130, bwBar=210` tuned for portrait; now `180 / 450` with the count anchored just after the bar so the row no longer has a long empty gap between count and weight.
- **Cull plan vs actual bar** likewise rescaled (`bx=180, bw=520`).
- **`sw.js`** — cache bump to `v7.13`.

## 2026-04-16 — Summary PDF audit fixes (avg kg, plan section in All Seasons, labels)

- **`diary.js` / `exportSeasonSummary`** — three fixes after an audit:
  1. **Average kg was wrong.** `avgKg = totalKg / entries.length` divided by every entry even when only some had a weight, so a 5-entry season with 2 weighed carcasses summing to 104kg reported "21kg average" instead of the correct 52kg. Now averages only over entries with a recorded weight.
  2. **"Cull plan vs actual" rendered in All Seasons mode with "no target set" on every row.** Targets are per-season and the export flow deliberately blanks `cullTargets` for All Seasons (correct); the table then spammed "1 (no target set)" across every species/sex combo. Section now skipped entirely when `_summarySeasonLabel === 'All Seasons'`.
  3. **Labels tidied.** Stats row: `KG → Total kg`, `Average → Avg kg` (with a "(of N)" suffix when only some entries are weighed, so the reader sees it's a partial-coverage number). Entries table header: `SHOOT → SHOOTER`.
- **Open gaps flagged (not fixed):** Summary table does not yet include Tag number, Age class, or Destination — all routinely wanted for BDS/AHDB returns and Reg 853/2004 traceability. Portrait A4 is already tight at 10 columns; adding more would need landscape or a per-entry detail page.
- **`sw.js`** — cache bump to `v7.12`.

## 2026-04-16 — Larder Book: stop using destination as a filter

- **`diary.js`** — the Larder Book was excluding every entry whose destination was empty, `Self / personal use`, or `Left on hill`, so a user with 5 carcasses often saw only 2 exported. That reflected the wrong mental model (dealer-facing document). A larder book is the stalker's own register of what passed through the larder — self-consumption and gifted carcasses belong in it. Destination is useful as a **column** (audit trail, dealer reconciliation, Reg 853/2004 recall traceability) but must not gate what appears.
- **New rule**: include every filtered-season entry; exclude only `Left on hill` (carcass never retrieved → never entered the larder).
- **Row rendering** now shows `—` placeholders for missing date / tag / species / sex / weight / location / destination so the entry still appears when some fields are blank.
- **`sw.js`** — cache bump to `v7.11`.

## 2026-04-16 — Map chip filters scoped to map only

- **`diary.js`** — `filterCullMap()` previously called `buildStats(filter)` which meant picking a species chip above the cull map also rewrote the KPIs, Charts & breakdowns, Season Plan progress, and the `filteredEntries` that CSV/PDF/Summary/Larder Book exports consume. That was wrong — the chips are a map-only lens (Red Deer pins only, Roe pins only, etc.). Removed the `buildStats` call; the chips now just re-paint pins via `renderCullMapPins()`, which reads `cullFilter` directly. All downstream cards/exports stay on the full season set.
- **`sw.js`** — cache bump to `v7.10`.

## 2026-04-16 — Exports: game dealer helper line + Larder Book season in title

- **`diary.html`** — added a small footer hint under "My diary exports" explaining that per-carcass trained hunter declarations (game dealer PDFs) are on each diary entry, not in this panel. Prevents users assuming the feature is missing.
- **`diary.css`** — new `.exp-block-foot` style (muted caption inside a soft moss-tinted pill).
- **`diary.js`** — Larder Book PDF title now shows the explicit season (`Season 2025/26`) instead of a raw first-entry → last-entry date range, since a dealer/auditor needs the scope at a glance. Falls back to the date range when All Seasons is selected or the season label helper isn't available.
- **Deferred**: Team Larder Book button was requested but requires a backend change. The current syndicate manager export RPC (`syndicate_member_actuals_for_manager`) only returns `species / sex / cull_date / culled_by`; a Larder Book needs tag, weight, destination, location/ground, and abnormalities. Shipping it now with the limited column set would give managers a document that isn't audit-fit for a dealer. Plan: extend with a new `syndicate_member_larder_for_manager` RPC + matching RLS before wiring the UI.
- **`sw.js`** — cache bump to `v7.09`.

## 2026-04-16 — Season Plan / Syndicates corner bleed (white behind rounded toggle)

- **`diary.css`** — `.plan-card` has `background:white` (needed for its expanded body), but when the card is also a `.stats-section-wrap` the inner `.stats-section-toggle` has a cream gradient + 14px radius, so the white parent bled through at the four corners in the collapsed state. Added `.plan-card.stats-section-wrap { background:transparent }` so Season Plan and Syndicates now match Charts & breakdowns.
- **`sw.js`** — cache bump to `v7.08`.

## 2026-04-16 — Season target KPI blank despite ground-based targets

- **`diary.js`** — fixed Season target KPI showing `–` / "Set targets to track progress" when the user had per-ground targets (e.g. Woodland Block + Unassigned) but no season-wide `cullTargets`. The KPI sum only looked at `cullTargets`, while the Season Plan's "Overview" card aggregates across `groundTargets` too (that's why the plan below showed `5/21` while the KPI stayed empty). Extracted the calc into `computeSeasonTargetKpi()` which mirrors the plan's resolution order: prefer season-wide targets; otherwise fall back to `sumGroundTargetsAgg(groundTargets)` (all grounds incl. `__unassigned__`).
- **`diary.js`** — also fixed an ordering bug: `buildStats()` wrote the KPI synchronously before `Promise.all([loadTargets, loadGroundTargets])` resolved, so even with the right formula the KPI would paint with empty targets. Added `refreshSeasonTargetKpi()` which re-paints `#st-target` / `#st-target-sub` inside the `.then()` once targets are actually loaded (re-reads `#st-total` so a species chip filter stays consistent).
- **`sw.js`** — cache bump to `v7.07`.

## 2026-04-16 — Stats stale-cache fix (list shows entries, Stats shows 0)

- **`diary.js`** — fixed a race where `buildStats()` could run once with `allEntries=[]` (before the first `loadEntries()` resolved), then mark `statsNeedsFullRebuild=false`, causing subsequent Stats tab visits to take the fast-path and stay stuck at "Total cull 0" even after entries arrived. Added `statsLastBuildSize` snapshot; fast-path now only skips the rebuild when the last build size still matches `allEntries.length`.
- **`sw.js`** — cache bump to `v7.03` for the stats rebuild fix rollout.

## 2026-04-16 — Console noise cleanup (SVG path + UK clock endpoint order)

- **`diary.html`** — fixed malformed `<path d="…">` on the "Save targets" button icon (stray extra `0` between the first arc's end-y and the next h-command). Eliminates the `Error: <path> attribute d: Expected number …` console warning.
- **`diary.js` + `app.js`** — reordered `UK_CLOCK_ENDPOINTS` so `timeapi.io` is tried first and `worldtimeapi.org` is a secondary fallback. `worldtimeapi.org` has been returning `ERR_CONNECTION_RESET` intermittently, which the browser logs as a red console error regardless of `try/catch`. Clock sync still succeeds either way; this just removes the noise.
- **`sw.js`** — cache bump to `v7.06`.

## 2026-04-16 — Stats tab real bug: `SPECIES is not defined` in `buildStats()`

- **`diary.js`** — fixed `ReferenceError: SPECIES is not defined` at `buildStats()` (inside the new Season-target KPI sum). The constant is `PLAN_SPECIES`, not `SPECIES`. This was the root cause of Stats showing all zeros / empty charts after the KPI redesign: the throw aborted every subsequent DOM write in `buildStats()`. Null-safe helpers from the previous change kept the map controls alive, but the KPI values and chart bodies were silently skipped.
- **`diary.html`** — CSP `connect-src` extended with `https://unpkg.com` so the service worker can fetch the cached Leaflet.markercluster script over the network when the runtime cache miss path is hit (previously blocked, logged a CSP violation in console but did not break behaviour).
- **`sw.js`** — cache bump to `v7.05` for the fix rollout.

## 2026-04-16 — Stats tab map controls broken after KPI redesign (HTML/JS cache skew resilience)

- **`diary.js`** — made `buildStats()` null-safe for every DOM write it owns (KPIs, weight card, species/sex/month charts, season label). Introduced local `_setText` / `_setHtml` helpers so an older cached `diary.html` missing any of the new IDs (e.g. `#weight-chart`, `#st-total-sub`, `#st-target`, `#st-dist`) can no longer throw and abort the function.
- **`diary.js`** — scheduled `initCullMap()` + `renderCullMapPins()` at the very top of `buildStats()` inside a `try/catch` (0ms `setTimeout`) instead of at the bottom. Previously any throw above the old `setTimeout(initCullMap, 150)` line left `cullMap === null`, which silently disabled Map/Satellite toggle, fullscreen button, and species filter chips on the Stats tab. Now the map always wires up regardless of downstream errors.
- **`sw.js`** — cache bump to `v7.04` so clients pick up the new JS immediately (this also fixes the transient skew caused by an older cached HTML + new JS).

## 2026-04-16 — Diary hardening pass (data integrity + sync + CSP + a11y)

- **`diary.js`** — fixed numeric coercion for `weight_kg` / `distance_m` so valid `0` values are preserved (no `|| null` fallthrough). Applied to full-form save and quick entry save.
- **`diary.js`** — quick entry now follows offline-first flow (offline queue path runs before syndicate network resolution); online insert still resolves syndicate attribution.
- **`diary.js`** — added offline sync mutex (`offlineSyncInFlight`) to prevent overlapping sync runs and reduced duplicate-risk by persisting queue progress after each successful synced item.
- **`diary.js`** — hardened sync payload null handling (`== null` checks) so `0` values are not discarded during sync replay.
- **`diary.js`** — escaped `species` text in list/detail HTML render paths to avoid unescaped DB string interpolation.
- **`diary.js` + `diary.html`** — cull map species filters changed to semantic `<button>` controls with `aria-pressed` state updates.
- **`diary.html`** — CSP updated to allow `unpkg.com` in `script-src` and `style-src` (matches markercluster assets currently loaded from unpkg).
- **`sw.js`** — cache bump after hardening pass.
- **`diary.js`** — hardened offline queue isolation by stamping queued items with `_queued_user_id`, filtering queue badge/sync to the signed-in user, reconciling incompatible queue rows at sign-in, and clearing local queue/photo blobs on sign-out to prevent cross-account bleed.
- **`diary.js`** — added recent-sync fingerprint dedupe map (`fl_offline_synced_recent`) so entries already inserted during a partial sync do not reinsert on retry after local persistence issues.
- **`diary.js`** — fixed weather attach coordinates on full-form save to use form pin/GPS only (removed quick-entry coordinate fallback), preventing wrong weather metadata on saved entries.
- **`diary.js`** — completed remaining `0`-value correctness paths for weight/distance across edit populate, list/detail chips, stats labels, PDF/export rows, and map popups.
- **`diary.js`** — map pin and GPS counters now treat `0/0` as valid coordinates (`!= null` checks instead of truthy checks), avoiding dropped pins.
- **`diary.js`** — quick-entry date now uses `Europe/London` calendar date (matching time zone used for quick-entry time) to remove date/time skew around midnight.
- **`diary.html` + `diary.js`** — improved icon-button accessibility with explicit `aria-label` on toast status, header actions, back/close controls, fullscreen map controls, and detail-back control.
- **`sw.js`** — cache bump to `v6.93` for rollout of the latest diary hardening changes.
- **`app.js` + `diary.js`** — added trusted UK clock sync (`worldtimeapi`), with persisted offset cache and online re-sync. Current-time logic now uses server-synced UK time helper instead of direct device clock reads for legal-time calculations, banner/date rendering, diary season/time defaults, quick-entry timestamps, weather fetch timestamps, and offline queue timestamping.
- **`index.html` + `diary.html`** — CSP `connect-src` allowlist extended with `https://worldtimeapi.org` for trusted clock sync.
- **`sw.js`** — cache bump to `v6.94` for UK clock rollout.
- **`app.js` + `diary.js`** — added fallback UK time provider (`timeapi.io`) if `worldtimeapi` is unavailable, to avoid false “UK time sync unavailable” lockouts while still avoiding device-clock time.
- **`index.html` + `diary.html`** — CSP `connect-src` allowlist extended with `https://timeapi.io` for UK time fallback.
- **`app.js` + `diary.js`** — added Supabase-based UK time fallback (edge response `Date` header via `*.supabase.co`) as a third live source, keeping device clock out of legal/diary “current time” flow.
- **`sw.js`** — cache bump to `v6.95` for Supabase time fallback rollout.
- **`diary.js` + `diary.html`** — fixed malformed cloud icon SVG path used by “Save to Cloud” buttons (quick + full entry) so the icon renders correctly.
- **`diary.html` + `diary.css`** — quick-entry tag number input now uses a dedicated full-width class (`.qs-tag-input`) instead of inheriting compact weight input width.
- **`sw.js`** — cache bump to `v6.96` for quick-entry visual fix rollout.
- **`diary-stats-bold-preview-v1.html`** — created standalone stats redesign preview (map-first compact, KPI-first scanability, charts before planning, summary-first plan/syndicate blocks).
- **`diary-stats-bold-preview-v2.html`** — created alternate bold preview with stronger typography scale and cleaner section rhythm for side-by-side design comparison before production changes.
- **`diary.html`** — kept existing stats visual design but reordered content flow to: map → KPI grid → charts & breakdowns → Season Plan → Syndicates → exports/actions, per user direction.
- **`sw.js`** — cache bump to `v6.97` for stats content-order rollout.
- **`diary.html` + `diary.css`** — refreshed stats map block styling within existing design language: cleaner map header grouping, map control container normalization, rounded card shell, and compact map height for better first-screen balance.
- **`diary.html` + `diary.js` + `diary.css`** — made Season Plan collapsible (`Show/Hide` toggle in plan header) with persisted state (`fl-plan-collapsed`), defaulting to collapsed for quicker access to lower stats content.
- **`diary.js`** — Charts & breakdowns collapsible remains optional but now defaults expanded on first visit (unless user preference exists in `fl-stats-more`).
- **`sw.js`** — cache bump to `v6.98` for map/plan/charts behavior rollout.
- **`diary.html` + `diary.css`** — Season Plan and Syndicates now use the same collapsible header/toggle visual language as Charts & breakdowns (matching title/meta/CTA rhythm and chevron control), while keeping each section’s existing internal card content.
- **`diary.js`** — unified plan/syndicate collapse behavior via shared binding logic with persisted open state keys (`fl-plan-open`, `fl-syndicate-open`), both defaulting collapsed; CTA copy and aria labels update with state.
- **`sw.js`** — cache bump to `v6.99` for shared-collapsible stats rollout.
- **`diary.js`** — Charts & breakdowns now force-open on load (expanded by default every time) while still allowing manual collapse in-session.
- **`diary.html` + `diary.js` + `diary.css`** — Season Plan and Syndicates now toggle from the whole header row (keyboard accessible), with chevron click retained; `Tap to show/hide` copy now reflects state across both sections.
- **`diary.html` + `diary.css`** — moved Season `Edit` and Syndicate `New` actions inside each expanded body (out of the header), and swapped the header-right decoration for section-relevant mini icons (target/group) above the chevron.
- **`sw.js`** — cache bump to `v7.00` for stats collapsible interaction/layout polish rollout.
- **`diary.html` + `diary.js`** — rebalanced stats KPI headline away from weight-first metrics to stalking-ops metrics: `Total cull`, `Mapped coverage`, `Missing GPS`, and `Species`; total cull now includes mapped ratio copy (`Mapped x/y · z%`) for immediate data-quality visibility.
- **`diary.html` + `diary.js`** — moved weight emphasis into Charts & breakdowns via a dedicated `Weight overview` card (total kg, average kg, heaviest, and missing-weight count), replacing the previous three headline weight KPIs.
- **`sw.js`** — cache bump to `v7.01` for stats KPI/weight-layout rollout.
- **`diary.html` + `diary.js`** — replaced repetitive map-quality KPIs with `Season target` progress and `Avg distance` while keeping `Total cull` and `Species`; total cull still carries mapped ratio context (`Mapped x/y · z%`).
- **`diary.html`** — moved `Carcass destination` card above `Age class breakdown` in Charts & breakdowns order.
- **`diary.html` + `diary.js`** — age-class juvenile label now consistently includes fawn (`Calf / Kid / Fawn`): updated form option value/display, edit-form normalization for legacy `Calf / Kid` records, and age breakdown normalization so old entries are counted under the new label.
- **`sw.js`** — cache bump to `v7.02` for KPI/order/age-label rollout.

---

## 2026-04-15 — Mapbox primary map with free fallback

- **`diary.js`** — Added provider abstraction for map tiles. If `window.FL_MAPBOX_TOKEN` is set, pin map + cull map use Mapbox (`outdoors-v12` and `satellite-streets-v12`) with a browser-local monthly map-load estimate and warning thresholds. If Mapbox is unavailable or tile errors stack up, the app auto-falls back to the existing free stack (OS Road + Esri World Imagery) without breaking the map UX.
- **`diary.html`** — Added optional `window.FL_MAPBOX_TOKEN` bootstrap before `diary.js` loads; blank by default so production remains on the free fallback stack until a token is supplied.
- **`sw.js`** — Cache bump for rollout.

## 2026-04-16 — Configure Mapbox token for tiles

- **`diary.html`** — set `window.FL_MAPBOX_TOKEN` to enable Mapbox tile rendering (pin + cull map).

- **`sw.js`** — cache bump to ensure deployed clients fetch the updated `diary.html`.
- **`diary.html`** — updated CSP `connect-src` and `img-src` allowlists to include Mapbox domains (`api.mapbox.com`, `events.mapbox.com`, `*.tiles.mapbox.com`), fixing tile load failures that triggered automatic fallback.
- **`sw.js`** — additional cache bump after CSP fix.
- **`diary.js`** — fullscreen cull map now shows its own floating Map/Satellite toggle (`#map-fs-layer-tog`) and keeps layer button state synced between header controls and fullscreen controls.
- **`sw.js`** — cache bump after fullscreen map control update.
- **`diary.js`** — moved fullscreen layer toggle down (`top: 64px`) so it no longer overlaps Leaflet zoom (+/−) controls.
- **`sw.js`** — cache bump after fullscreen spacing fix.
- **`diary.js`** — repositioned fullscreen layer toggle to the top row beside Leaflet zoom controls (`top: 12px`, `left: 58px`) per UX preference.
- **`sw.js`** — cache bump after fullscreen control repositioning.

---

## 2026-04-15 — Diary load fallback for schema drift

- **`diary.js`** — `loadEntries()` now retries with a legacy column list if `tag_number` is missing in the connected Supabase schema. This prevents hard failure (“Could not load entries”) and keeps diary entries visible in environments where the migration has not landed yet; missing tag values are set to `null` in compatibility mode.

---

## 2026-04-15 — Detail view: clearer “declaration” button

- **`diary.js`** — Entry detail action renamed from “Declaration” to “Game dealer PDF” with `title` / `aria-label` explaining trained hunter declaration for dealers and wild game food safety. Toast text updated.

---

## 2026-04-15 — PDF: trained hunter name vs email

- **`diary.js`** — `userProfileDisplayName()` reads `user_metadata.full_name`, `name`, then `display_name` (never email). Game Dealer Declaration uses that for “Trained hunter name”; if empty, a blank line plus optional “First Light account (reference):” email line. Larder Book header still uses profile name or email when no name is set.

---

## 2026-04-15 — Feature Pack: Diary Enhancements + UX Improvements

Six features implemented across four phases:

### Phase 1 — Tag Number field
- **`scripts/migrate-add-tag-number.sql`** — `ALTER TABLE cull_entries ADD COLUMN IF NOT EXISTS tag_number TEXT;` **Supabase manual deploy required.**
- **`diary.html`** — Tag/carcass number input added to full form (section 6, after destination) and quick entry (below weight).
- **`diary.js`** — `tag_number` added to `CULL_ENTRY_LIST_COLUMNS`, both save payloads (online + offline), edit populate, new-entry clear, quick entry save + reset, detail view (chip + weight/distance card tile), list cards (`gc-tag`), CSV headers + rows, PDF list export meta line, single-entry PDF fields, map popup, syndicate shared entry display.
- **`diary-guide.html`** — Tag number field added to form mock with explanatory text.
- **`diary.css`** — `.dc-t` chip style (gold, mono font), `.gc-tag` list card style.

### Phase 2a — List View: Ground Filter + Sort
- **`diary.html`** — Secondary filter bar with ground dropdown (`#ground-filter`) and sort toggle button (`#sort-toggle`).
- **`diary.js`** — `populateGroundFilterDropdown()` builds options from distinct ground values. `currentGroundFilter` and `listSortAsc` state vars. `renderList()` applies ground filter and sort. Change listener on dropdown; action handlers for `filter-ground` and `toggle-sort`.
- **`diary.css`** — `.list-secondary-filters`, `.ground-filter-sel`, `.sort-toggle-btn` styles.

### Phase 2b — Stats: Time-of-Day Chart
- **`diary.html`** — New `#time-card` chart card in stats-more-body.
- **`diary.js`** — `buildTimeOfDayStats(entries)`: parses entry times into 6 buckets (Dawn/Morning/Midday/Afternoon/Dusk/Night), renders horizontal bar chart. Wired into `buildStats`.

### Phase 2c — Map: Fullscreen + Clustering
- **`diary.html`** — Leaflet.markercluster CDN CSS + JS added. Fullscreen toggle button beside the Map/Satellite toggle.
- **`diary.js`** — `toggleMapFullscreen()`: toggles `#cull-map-container` between inline and fixed fullscreen with close button. `renderCullMapPins()` refactored to use `L.markerClusterGroup` when available (graceful fallback). Tag number shown in map popups.
- **`diary.css`** — `.map-fs-btn`, `#cull-map-container.map-fullscreen`, `.map-fs-close` styles.
- **`sw.js`** — Markercluster CDN assets added to `CDN_URLS` and `unpkg.com` to `CACHEABLE_ORIGINS`.

### Phase 2d — Calendar: Compact At-a-Glance Matrix
- **`index.html`** — `#cal-matrix-ew` and `#cal-matrix-sc` divs added above species cards in both E&W and Scotland calendar views.
- **`app.js`** — `buildCalendarMatrix(containerId, cardSelector)`: reads `data-open` attributes from existing species cards, builds a compact HTML table with species/sex rows × 12 month columns, colour-coded cells (green open, muted closed, gold outline for current month). Called from `initCalendar`.
- **`styles.css`** — `.cal-matrix` table, header, label, and cell styles.

### Phase 3 — Larder Book + Game Dealer Declaration
- **`diary.html`** — "Larder Book" export button in personal exports row.
- **`diary.js`** — `exportLarderBookPDF()`: filters entries by dealer/third-party destination, produces landscape A4 PDF table (Date, Tag, Species, Sex, Weight, Location/Ground, Destination, Abnormalities) with stalker name, date range, signature line. `exportGameDealerDeclaration(id)`: single-entry portrait A4 PDF in formal "Trained Hunter Declaration" format with all entry fields, abnormalities section, and declaration text with signature line.
- **`diary.css`** — `.a-dec` button style, `.exp-larder` button style.

### Phase 4 — Multi-Season Stats / Trends
- **`diary.js`** — "All seasons" option added to `populateSeasonDropdown` (shown when 2+ seasons exist). `changeSeason` and `loadEntries` handle `__all__` value (fetches all entries without date filter). `buildStats` hides cull plan card and shows "All Seasons" label when active. `buildTrendsChart(entries)`: groups entries by season, shows total cull per season bar chart with avg weight and species count (last 5 seasons max). Only visible in "All seasons" mode.
- **`diary.html`** — `#trends-card` chart card in stats-more-body.

### Finishing
- **`sw.js` v6.78** — Cache bump.

---

## 2026-04-15 — Consolidate to single "Carcass weight" field

- **Database migration** — `scripts/migrate-single-weight.sql`: renames `weight_gralloch` to `weight_kg`, drops `weight_clean` and `weight_larder`. **Supabase manual deploy required** (run in SQL Editor).
- **`diary.html`** — Full form weight section (section 5) simplified from three-field `fr3` grid (Gralloch / Clean / Larder with auto-badges and reset buttons) to a single "Carcass Weight (kg)" input (`id="f-wt"`). Quick entry label changed from "Gralloch weight" to "Carcass weight". Stats strip subtitle changed from "kg gralloch" to "kg".
- **`diary.js`** — Removed `initWeightCalc`, `showAutoBadge`, `resetWeightField`, `resetWeightAutoState`, `wtcManual`, `wtlManual`, `weightCalcBound`, and `case 'reset-wt'` handler. Column list changed to `weight_kg`. All save payloads (online, offline, quick entry) now write `weight_kg` only. Edit populate, new-entry clear, detail view, list cards, stats, CSV/PDF exports, single-entry PDF, map popups, and syndicate shared entry display all updated from three weight fields to `weight_kg`.
- **`diary.css`** — Removed `.fr3` grid rule, `.auto-badge` styles, `.weight-note` styles, and `.weight-label-row`. Weight section comment simplified.
- **`diary-guide.html`** — Weight section mock replaced with single-field layout. Quick entry mock label changed to "Carcass weight". Detail mock chip changed from "45 kg gralloch" to "45 kg". Removed `.m-auto` style.
- **`app.js`** — Cull diary teaser query and sum changed from `weight_gralloch` to `weight_kg`.
- **`sw.js` v6.77** — Cache bump.

## 2026-04-15 — Species-adaptive form labels (sex buttons + age class)

- **`diary.js`** — Added `updateFormSexLabels(species)` and `updateQuickSexLabels(species)`: when a species is picked, sex buttons now show the correct term (e.g. Red Deer → "♂ Stag" / "♀ Hind"; Roe → "♂ Buck" / "♀ Doe"). Resets to generic "Stag / Buck" when no species selected. Wired into `pickSpecies`, `qsPick`, `openNewEntry` (reset), and `openEditEntry` (restore). Age class juvenile option also adapts: Red/Sika → "Calf", Roe → "Kid", Fallow/Muntjac/CWD → "Fawn". Stored `value` stays `"Calf / Kid"` for backward compatibility with existing entries.
- **`diary.html`** — Age class first option changed from `<option>Calf / Kid</option>` to `<option value="Calf / Kid">Calf / Kid / Fawn</option>` (explicit value preserves DB compatibility; display text is overridden by JS when species is selected).
- **`sw.js` v6.76** — Cache bump.

## 2026-04-15 — Diary audit: bug fixes, export labels, guide corrections

- **`diary.js`** — `initWeightCalc`: added `weightCalcBound` guard so listeners are only attached once (previously stacked on each re-login in the same session). Removed dead variables `SEX_BADGE` and `SEX_LABEL` (replaced by `sexBadgeClass()`/`sexLabel()`). PDF/CSV exports now use `sexLabel(e.sex, e.species)` instead of generic "Male"/"Female" — affects list PDF, season summary table, plan-vs-actual section, single-entry PDF, syndicate CSV, and syndicate PDF (8 call sites). Plan-vs-actual section restructured to use `sp.mLbl`/`sp.fLbl` from `PLAN_SPECIES`.
- **`diary.html`** — Added `id="offline-banner-s"` to the offline banner subtitle element so JS can update it with storage/photo queue info (was silently broken — JS guarded with `if (bannerS)` but element only had the class).
- **`diary-guide.html`** — Weight mock corrected: Clean 34→36.9, Larder 27→33.8 (matching 45 × 0.82 / 0.75). List header mock labels corrected: "Animals"→"Total", "kg gralloch"→"kg" (matching live `diary.html`).
- **`sw.js` v6.75** — Cache bump.

## 2026-04-15 — Content audit: factual corrections across app

- **`questions.js`** — CWD closed season: corrected answer from "no statutory closed season" to "1st April to 31st October" (correctIndex 3→1) and rewrote explanation to cite Deer Act 1991 Schedule 1. Estate rifle age: option text changed from "Over 17" to "17 or over". Ageing method: explanation changed from "only reliable" to "most practical field method".
- **`index.html`** — Scotland Legal Times: replaced "civil twilight" with "sunrise / sunset" (matches Deer Act definition and rest of app). Core Rule card: law badge now cites both Deer Act 1991 (E&W) and Deer (Scotland) Act 1996. Hours disclaimer: offence text now names both Acts. Fallow habitat: changed "Originally introduced by the Normans" to "Introduced by Romans, re-introduced by the Normans" (matches card note).
- **`diary.js`** — Sika sex labels: `sexLabel()` and `sexBadgeClass()` now return Stag/Hind for Sika (was Buck/Doe), matching `PLAN_SPECIES` and correct deer terminology (Sika are *Cervus nippon*, same genus as Red).
- **`sw.js` v6.74** — Cache bump (**`questions.js`**, **`index.html`**, **`diary.js`**).

## 2026-04-15 — Audit cleanup: dead code removal, HTML fix, guide corrections

- **`index.html`** — Removed duplicate `id` attribute on location search input (had both `id="loc-search"` and `id="loc-search-input"` on the same element — invalid HTML).
- **`app.js`** — Removed dead `roe-buck-sc` and `muntjac-en` entries from `updateSeasonStatuses` (no matching DOM elements; Scotland male deer rows use static "No close season" markup). Removed empty `renderTodayGlance()` stub and its two call sites (was called every 60s doing nothing). Removed dead `header-dayname`/`header-datenum`/`header-month` boot block (elements don't exist in `index.html`; banner-date block retained).
- **`diary.js`** — Removed 4 empty no-op ground pill functions (`renderGroundPills`, `showGroundPills`, `hideGroundPills`, `selectGroundPill`) — no callers existed.
- **`sw.js` v6.72** — Added `icon-152.png` and `icon-167.png` to precache list (referenced in `index.html` Apple touch icons but were missing from SW). Cache bump for all changed files.
- **`diary-guide.html`** — Step 2 mock: removed extra "avg weight" stat cell (live UI shows 3 cells: Animals, kg, species). Step 3: corrected "species-specific ratios" to "standard BDS ratios (×0.82 and ×0.75)". Step 10: corrected summary filter description from "dates, species, etc." to "season and ground".

## 2026-04-15 — Syndicate polish: invite filtering + attribution note

- **`diary.js`** — Manager invite list now filters active invites with parsed timestamps (`Date.parse`) instead of ISO string compare, and validates expiry display dates before rendering.
- **`diary.js` / `diary.html`** — Add/Edit entry now shows an inline attribution note under **Syndicate attribution** when ground-based auto-selection occurs (or when multiple syndicates share a ground and manual selection is required); note clears on manual selection/open form reset.
- **`sw.js` v6.71** — Cache bump (**`diary.js`** / **`diary.html`**).

## 2026-04-15 — Syndicate invites: safer defaults + revoke controls

- **`diary.js`** — Manager sheet now lists active invite links with **Copy** and **Revoke** actions. Added handlers `synd-copy-existing-invite` / `synd-revoke-invite`; revoke deletes the invite row immediately.
- **`diary.js`** — New invite defaults hardened: **7 days** with **10 max uses** (was broad default); generated-link copy text now shows these limits.
- **`diary-guide.html`** — Step 13 now notes invite links are limited by default and can be revoked from manage sheet.
- **`sw.js` v6.70** — Cache bump (**`diary.js`** / **`diary-guide.html`**).

## 2026-04-15 — Supabase drift checks: function-body assertions

- **`scripts/supabase-verify-drift.sql`** — Added `weak_function` checks (not just presence) for critical syndicate RPC behavior: `redeem_syndicate_invite` already-member short-circuit, `leave_syndicate_member` manager handoff guard, `syndicate_season_summary` explicit attribution filter, and `syndicate_member_actuals_for_manager` anonymous-union shape.
- **`scripts/SUPABASE-RECORD.md`** — Changelog updated and pending items cleared after clean rerun.
- **Supabase verification complete** — re-ran `scripts/supabase-verify-drift.sql`; no rows returned.

## 2026-04-15 — Syndicate manager leave transfer flow

- **`diary.js`** — Syndicate manage modal now supports **Promote** for member rows; **Leave syndicate** uses RPC `leave_syndicate_member` and blocks manager leave unless another active manager exists (clear toast guidance).
- **`scripts/syndicate-manager-leave-transfer.sql`** — New Supabase migration adding `leave_syndicate_member(uuid)` security-definer RPC.
- **`scripts/syndicate-schema.sql`** — Baseline schema includes `leave_syndicate_member` for fresh installs.
- **`scripts/supabase-verify-drift.sql`** — Expected functions list now includes `leave_syndicate_member`.
- **`scripts/SUPABASE-RECORD.md`** — Changelog + pending SQL run items for manager-leave migration.
- **`diary-guide.html`** — Step 13 copy: managers should promote another manager before leaving.
- **`sw.js` v6.69** — Cache bump (**`diary.js`** / **`diary-guide.html`**).

## 2026-04-15 — Syndicate export: all seasons from syndicate data

- **`diary.js`** — Manager syndicate export (`All seasons`) now derives seasons from syndicate sources (`syndicate_targets`, `syndicate_member_allocations`, `cull_entries.syndicate_id`, `syndicate_anonymous_culls`) via `getSyndicateSeasonValues`, instead of using the manager’s personal season dropdown. Prevents missing seasons where the syndicate has data but the manager has no personal entries.
- **`sw.js` v6.68** — Cache bump (**`diary.js`**).

## 2026-04-15 — Supabase: syndicate self-leave RLS hardening

- **`scripts/syndicate-rls-self-leave-hardening.sql`** — New migration to lock self-update on `syndicate_members` to member leave only (`active -> left`) and add trigger guard `tr_syndicate_members_self_leave_guard` to block role/syndicate/user/membership metadata tampering.
- **`scripts/syndicate-schema.sql`** — Baseline schema updated with same hardened policy + trigger so fresh installs inherit the fix.
- **`scripts/supabase-verify-drift.sql`** — Added checks for missing trigger and weak self-leave policy shape.
- **`scripts/SUPABASE-RECORD.md`** — Changelog + pending SQL run items for this hardening.
- **Supabase manual deploy required** — run `scripts/syndicate-rls-self-leave-hardening.sql`, then run `scripts/supabase-verify-drift.sql`.

## 2026-04-15 — Diary: auto-select syndicate from unique ground

- **`diary.js`** — Add/Edit entry: when **Permission / Ground** matches exactly one active syndicate `ground_filter`, **Syndicate attribution** auto-selects that syndicate (personal-only still available to override). Added ground→syndicate owner map from active memberships + custom-ground blur/change checks.
- **`diary-guide.html`** — Step 13 copy: unique ground match can auto-set attribution.
- **`sw.js` v6.67** — Cache bump (**`diary.js`** / **`diary-guide.html`**).

## 2026-04-15 — Syndicate explicit cull attribution (one cull, one syndicate)

- **`diary.html` / `diary.js`** — Add entry now includes **Syndicate attribution (optional)** (`#f-syndicate`): per-cull selection of one active syndicate or personal-only. Save/edit/offline/quick-entry payloads now carry **`syndicate_id`**.
- **`scripts/syndicate-explicit-attribution.sql`** — Supabase migration: adds **`cull_entries.syndicate_id`** + indexes and replaces syndicate aggregate / manager breakdown / member actuals / summary + anonymous retention functions to count by explicit attribution instead of ground-filter matching.
- **`scripts/supabase-verify-drift.sql`** — Drift check now flags missing **`cull_entries.syndicate_id`** column.
- **`scripts/SUPABASE-RECORD.md`** — Changelog + Pending updated to run explicit-attribution SQL and verify drift.
- **`diary-guide.html`** — Step 13 copy updated for per-entry syndicate attribution.
- **`sw.js` v6.66** — Cache bump (**`diary.js`** / **`diary.html`** / **`diary-guide.html`**).

## 2026-04-15 — Legal banner colors: sun vs legal times

- **`styles.css`** — During **legal/day** state, timeline text now differentiates fields: **Legal start/end** remain green while **Sunrise/Sunset** use amber/orange solar colors (sunrise brighter amber, sunset deeper orange). **`v2beta/styles.css`** — same.
- **`sw.js` v6.65** — Cache bump (**`styles.css`**). **`v2beta/sw.js`** v6.65.

## 2026-04-14 — Legal banner theme: dawn vs dusk split

- **`app.js`** — Banner twilight state now applies to **dusk only** (`sunset → legal end`). The **first legal hour** (`legal start → sunrise`) now uses normal **legal/day** theme, while the **last legal hour** remains **twilight**. **`v2beta/app.js`** — same.
- **`sw.js` v6.64** — Cache bump (**`app.js`**). **`v2beta/sw.js`** v6.64.

## 2026-04-14 — Diary: Gallery photo button styling

- **`diary.html`** / **`diary.css`** — **Gallery** uses **`photo-opt--gallery`** (moss border/text, light green fill) so it matches **Camera** as an active choice, not muted grey. **`v2beta/diary.html`** / **`v2beta/diary.css`** — same.
- **`diary-guide.html`** — Photo mock: **Gallery** button colours match shipped **`photo-opt--gallery`**.
- **`sw.js` v6.63** — Cache bump (**`diary.html`** / **`diary.css`** / **`diary-guide.html`**). **`v2beta/sw.js`** v6.63.

## 2026-04-14 — Diary: syndicate create ground list (no optgroups)

- **`diary.js`** — **Create syndicate** ground filter: **flat sorted** list of **`savedGrounds`** + **Other / new ground…** (removed **Syndicate permissions** / **My permissions** optgroups on this screen only — **Add entry** unchanged). Helper copy: filter applies **only** to the syndicate being created, not others. **`v2beta/diary.js`** — same helper copy under create.
- **`diary-guide.html`** — Step 13: create vs Add entry optgroups; **new team only** wording.
- **`sw.js` v6.62** — Cache bump (**`diary.js`** / **`diary-guide.html`**). **`v2beta/sw.js`** v6.62.

## 2026-04-14 — Diary: syndicate create — new ground from setup

- **`diary.js`** — **Create syndicate** ground filter: **Other / new ground…** (`__custom__`) + **`syn-inp-ground-custom`** (same idea as Add entry); **`saveSyndicateCreate`** resolves label + **`saveGround`** before **`create_syndicate`** RPC. **`buildSyndicateCreateGroundSelectInnerHtml`** — append **Other / new ground…**. **`v2beta/diary.js`** — same for v2beta bundle.
- **`diary-guide.html`** — Step 13: note **new label** at syndicate create.
- **`sw.js` v6.61** — Cache bump (**`diary.js`** / **`diary-guide.html`**). **`v2beta/sw.js`** v6.61 — align deploy bundle.

## 2026-04-14 — Species: deer card toggle only on header

- **`app.js`** — Species **`.deer-card`** expand/collapse: bind **click** to **`.card-header`** only (was whole card), so **gallery / lightbox** taps no longer **bubble** and **collapse** the card. **`v2beta/app.js`** — same.
- **`sw.js` v6.60** — Cache bump (**`app.js`**).

## 2026-04-14 — Species: CWD row season status IDs

- **`index.html`** — Chinese Water Deer **Buck/Doe** row **`season-status`** ids **`cwd-buck-en`** / **`cwd-doe-en`** (was **`cwd-buck`** / **`cwd-doe`**) so **`app.js` `updateSeasonStatuses`** / **`setStatus`** populate **Open** / **Closed** like other species. **`v2beta/index.html`** — same fix.
- **`sw.js` v6.59** — Cache bump (**`index.html`**).

## 2026-04-13 — Diary: Permission / Ground optgroups (syndicate vs mine)

- **`diary.js`** — **`syndicateGroundFilterSet`** + **`rebuildSyndicateGroundFilterSet`** / **`refreshSyndicateGroundFilterSetFromNetwork`**; **`loadGrounds({ skipSyndicateRefresh })`** to avoid duplicate syndicate fetch during sync; **`populateGroundDropdown`** uses **`<optgroup>`** “Syndicate permissions” / “My permissions”; **`buildSyndicateCreateGroundSelectInnerHtml`** for **Create syndicate** ground filter; **`openSyndicateCreateSheet`** refreshes labels before building options; **`signOut`** clears the set.
- **`diary.css`** — **`optgroup`** / option typography under **`#v-form .ground-input`**; **`.loc-ground-note-line`** for two-line hint.
- **`diary.html`** — Ground field note: syndicate **exact match** + auto-save line.
- **`diary-guide.html`** — Step 13: optgroup behaviour.
- **`sw.js` v6.58** — Cache bump (**`diary.js`** / **`diary.css`** / **`diary.html`** / **`diary-guide.html`**).

## 2026-04-13 — Syndicate: re-sync ground_filter for members

- **`diary.js`** — **`syncSyndicateGroundFiltersFromRows`** / **`syncSyndicateGroundFiltersForCurrentUser`**: upsert every active syndicate’s **`ground_filter`** into the user’s **`grounds`**; runs after **sign-in** (with invite redeem), when **Stats → syndicate** section loads, and before **Add / Edit entry** ground dropdown. So if a manager **changes** the syndicate ground name, members pick up the **new** canonical string on next sync (existing diary rows are not rewritten).
- **`diary-guide.html`** — Step 13: describe **re-sync** on sign-in / Stats / add-edit entry; **rename** note.
- **`sw.js` v6.57** — Cache bump (**`diary.js`** / **`diary-guide.html`**).

## 2026-04-13 — Syndicate: auto-add ground on invite redeem

- Superseded by **“re-sync ground_filter”** above: invite redeem still runs **`renderSyndicateSection`**, which now applies the same **ground list** sync for all syndicates.

## 2026-04-13 — Deploy bundle: `v2beta/`

- **`v2beta/`** — Copy of **production static assets** for upload to **`firstlightdeer.co.uk/v2beta`** (main app, diary, Deer School, privacy, guide, manifests, icons, **`vendor/leaflet`**, **`sw.js`**). Excludes **`scripts/`** SQL, **`*-preview.html`**, and Cursor config. Includes **`README.txt`** with upload notes.

## 2026-04-13 — Diary: entry detail “dense dashboard” (Option D shipped)

- **`diary.js`** — `openDetail()`: **Option D** layout — shorter **`detail-hero--dense`** hero; **`detail-dash`** with **`dd-card`** blocks (**Photo** thumb + tap hint + **Edit entry**, **When & where**, **Weights & distance** 2×2 tiles, **Shot & stalking**, **Notes** if present, **weather** card); bottom **Edit / PDF / Delete** unchanged; **`open-photo-lb`** still on thumb only.
- **`diary.css`** — Dashboard tokens (`.detail-dash`, `.dd-card`, `.dd-kv`, `.dd-grid2`, `.dd-tile`, `.dd-photo-*`, `.action-row--dash`, weather-in-card margins). **Photo** card: **`photo-change-btn`** no longer **`flex:1`** — compact padding / type / pencil icon so **Edit entry** does not dominate the row.
- **`diary-guide.html`** — Step 5 mock + copy aligned with card-based detail (removed old 3-column stat strip mock); **Edit entry** mock sized to match the compact photo-row button.
- **`sw.js` v6.55** — Cache bump (**`diary.css`** / **`diary-guide.html`**).

## 2026-04-13 — Diary entry detail (redesign previews)

- **`diary-detail-view-redesign-preview.html`** — Standalone **A–E** layout options for **saved entry detail** (hero, facts, weather, actions); **Option D** is now **implemented** in `openDetail()` / `diary.css` (preview remains for A/B/C/E). **Revised** mocks for a **fully filled** seven-section entry (weights, shot, notes, shooter, destination, ground, location, weather) aligned with real screenshots. **Option D** preview: **hero** photo mock + **Photo** card (**thumb** + “Tap to expand” + compact **Edit entry** control, aligned with ship).

## 2026-04-13 — PWA “New version” Refresh (CSP)

- **`app.js`** — Service-worker update toast: **Refresh** uses **`addEventListener('click', …)`** instead of inline **`onclick`**, because **`index.html` CSP** (`script-src` without **`'unsafe-inline'`**) blocks inline handlers, so the button did nothing.
- **`sw.js` v6.53** — Cache bump so **`app.js`** refresh ships to precache.

## 2026-04-13 — Diary: emoji removal (shipped UI)

- **`diary.js`** — Central **SVG** constants + **`diaryCloudSaveInner`**, **`diaryNoPhotoListHtml`**, **`diaryHeroNoPhotoHtml`**, **`diaryPhotoThumbEmptyHtml`**; **`flToastParse`** + **`showToast`** builds **icon + plain text** (no `innerHTML` for user strings); **list/detail** no-photo = image-off + “No photo” (+ species initial on cards); **photo** badge + **location** chips + **map popups** + **action row** use stroke icons; **Save** / **targets** / **quick** buttons use cloud icon via `innerHTML`; **`wxCodeLabel`** / **`renderWeatherStrip`**: WMO-style **abbrev + bar + stroke SVGs** (sky / temp / wind / pressure); fixed **female `dchip`** class (**`dc-f`**) and **`sw.js` v6.52** cache bump.
- **`diary.css`** — **`.toast`** layout (wrap, max-width), **`.toast--*`** icon tints, **`.di-ic` / `.di-btn-ic`**, no-photo + hero + thumb blocks, **`.gc-photo-badge`**, **`.dc-f`**, **`.wx-sky-*`** / strip icon sizing, **offline / fab / pin / GPS / copy / tsheet / photo-opt`** flex + SVG sizing.
- **`diary.html`** — Replaced remaining **emoji** in auth link, guide header, offline banner, **Quick**, **qs-save**, photo row, pin/GPS, pinned strip, main save, pinmap row, **copy targets**, **Save targets** with inline **SVG + text** (**Save to Cloud** casing unchanged).
- **`diary-guide.html`** — Mockups and copy aligned with shipped diary (nav/photo/location/save/detail/exports; **Quick** text; **Save targets** tip).

## 2026-04-13 — Diary emoji replacement preview

- **`diary-emoji-replacements-preview.html`** — **Single “In the app after update” column** per emoji (SVG + text as one control); **Where in the diary** column; weather = full strip mock + per-sky mini cells + Temp/Wind/Pressure cells; removed duplicate pictogram/replacement columns and gallery/mapper tables to avoid confusion. **Cloud** mocks: pills are **illustrative** (ship with real `diary.css` buttons); **Save to Cloud** casing matches `diary.html`; **“Copied”** note only in **Where** column (not inside the button mock). **Media / no photo:** abstract deer SVG → **image-off** icon + **“No photo”** + note on species-initial alternative (`.app-ph`).

## 2026-04-13 — Ground-led season plan (headline = sum)

- **`diary-guide.html` / `sw.js` v6.51** — **Cull Diary Guide**: **forgot password**; **offline Sync now**; **form progress** chip; **grounds** via Set targets / By ground / Add ground; **targets** (Season total vs By ground, Unassigned, copy prev, unsaved close, save, read-only past seasons, plan chips); **Stats** (**Cull map** layers + map species chips vs diary list filter, **Charts & breakdowns** list, headline counters vs plan chips); **Summary** filter note; new **§13 Syndicates & team exports** (managers); signup mock **Privacy Policy** → **`privacy.html`**.
- **`diary.html` / `diary.css` / `sw.js` v6.50** — **Account / stats footer** link row: **`.diary-footer-links`** with **`align-items: center`**, shared **`.diary-footer-link`** (replaces mixed inline flex + plain anchors + **`.stats-foot-link`**), **`.diary-footer-sep`** for middots; **`.diary-footer-copy`** for copyright spacing.
- **`styles.css` / `sw.js` v6.49** — Legal banner **glass meta grid** (legal start/end · sunrise/sunset): each **`.banner-glass-cell`** is a **centred flex column** so labels and times sit in the **middle of each half** instead of hugging the far left/right (removes the wide empty band between columns).
- **`index.html` / `styles.css` / `sw.js` v6.48** — Legal banner **moon / activity row**: **`.banner-moon-row-right`** wraps **activity badge + forecast link** so they **line up on one vertical axis**; main row uses **`justify-content: space-between`** + **`align-items: center`** so the **right column is centred against** the moon + phase text block (fixes badge sitting high vs two-line copy).
- **`styles.css` / `sw.js` v6.47** — Legal banner **location**: **no `flex-grow`** on **`.banner-location--top`** (v6.46 had stretched the row so the pin/name sat beside the date); **`.banner-top-actions`** still uses **`flex: 1` + `justify-content: flex-end`** so the **location + info** cluster stays **on the right**; **`#banner-location-text`** **`max-width: min(46vw, 200px)`** + ellipsis.
- **`styles.css` / `sw.js` v6.46** — Legal banner **top row**: **date + location + info** kept on **one line** (`flex-wrap: nowrap`, date `white-space: nowrap`, location uses **flex + ellipsis** instead of a fixed `42vw` cap).
- **`index.html` / `styles.css` / `sw.js` v6.45** — Legal **glass banner**: **status pill + countdown + sublabel** grouped in **`.banner-hero-stack`** and **horizontally centred**; glass countdown **text-align: center** (was left).
- **`diary.html` / `diary.css` / `sw.js` v6.44** — Stats **“Charts & breakdowns”** collapsed toggle: **option A** decorative **micro histogram** (moss + gold bars) above the chevron.
- **`charts-breakdown-toggle-preview.html`** — Standalone **UI preview** for stats **“Charts & breakdowns”** collapsed toggle: six graphic directions (micro bars, sparkline, donut + bars, icons, teaser stats, full-width band) before shipping a choice in `diary.html` / `diary.css`.
- **`diary.js` / `sw.js` v6.43** — **Set targets**: **Escape** closes the sheet (same unsaved confirm as ✕ / backdrop); **main nav** `go()` asks to close the sheet first if it is open; **Season total** edits (with named grounds) **live-refresh Unassigned** steppers in the DOM so dirty state matches the split model; **`closeTargetsSheet`** returns **false** when the user cancels the discard confirm.
- **`diary.css`** — **`.tstep-val`**: hide native **number spinners** (only custom ± remain); slightly wider field + **tabular nums** to avoid cramped digits.
- **`sw.js` v6.42** — Cache bump for stepper CSS refresh.
- **`diary.js`** — **By ground** edits (with named grounds) **live-update** **Season total** steppers + footer from DOM sum; **Set targets** **prerenders** By ground on open for snapshot + sync; **close** confirms if **unsaved** (`captureTargetsSheetSnapshot` / `isTargetsSheetDirty`); save uses **`closeTargetsSheet({ force: true })`**.
- **`sw.js` v6.41** — Cache bump for targets live sync + unsaved-close guard.
- **`diary.html` / `diary.css` / `diary.js`** — **Season total** tab: **live footer** sums all ♂ / ♀ steppers + grand total (`updateSeasonTotalFooter` on step, input, tab open, copy-from-prev).
- **`sw.js` v6.40** — Cache bump for season-total footer refresh.
- **`diary.js`** — **By ground** tab: **Unassigned** steppers **preview** from current **Season total** inputs minus saved **named ground** totals when switching tab (no save needed to see it); save still persists.
- **`sw.js` v6.39** — Cache bump for targets preview + hint refresh.
- **`diary.js`** — **Set targets** sheet always opens on **Season total** (no auto-switch to **By ground**); **Season** hint no longer mentions **Unassigned** (that row only on **By ground**).
- **`sw.js` v6.38** — Cache bump for targets sheet default + hint refresh.
- **`diary.js` / `diary.html` / `diary.css`** — Targets sheet hints rewritten in **short plain English** (less jargon) for stalkers; slightly **larger hint type** on season + by-ground notes.
- **`diary.js`** — **Season total** hint tone: neutral **same plan / two views** copy (less “hand-holding” wording).
- **`sw.js` v6.37** — Cache bump for season-hint copy refresh.
- **`sw.js` v6.36** — Cache bump for targets copy refresh.
- **`diary.js`** — With **saved permissions** (`savedGrounds.length > 0`): **Overview** uses **sum(ground_targets)** when that sum has any target; **By ground** save **upserts `cull_targets`** to the same aggregate; **Season total** save **rebalances `__unassigned__`** = headline minus named permissions (blocked if headline is less than named). **First permission** added seeds **Unassigned** from existing season row when both were empty.
- **`diary.js`** — **Plan ground chips** whenever permissions exist (not only when `hasGroundTargets()`). **Per-ground filter** when `savedGrounds` or legacy `ground_targets` only.
- **`diary.html` / `diary.css`** — **`tseason-led-hint`** on Season tab when permissions exist; **Unassigned** subcopy aligned with sync model.
- **`sw.js` v6.35** — Cache bump for targets/plan behaviour refresh.

---

## 2026-04-13 — Development-only audience (plan / targets refactors)

- **Project posture:** The app is **not** in general public use yet—effectively **single developer / tester** only. Advice and refactors for **season vs ground / unassigned / Overview** can prioritise a **clean, single model** and **ship without** heavy **legacy migration** or multi-user backwards-compat paths **until** a broader release.

---

## 2026-04-13 — Targets sheet: By ground vs Season total clarity

- **`diary.html` / `diary.js` / `diary.css`** — **By ground** tab: **`tground-mode-hint`** + **Unassigned buffer** subcopy (not a mirror of Season total). **Unassigned buffer** row is **collapsible** (closed by default; auto-opens if saved buffer totals > 0); chevron header + live summary; **rollup** moved to **`tground-rollup-wrap`** below so ground totals stay visible when the buffer is collapsed; **no grounds** path still fills buffer steppers + rollup.
- **`sw.js` v6.32** — Cache name bump for targets-sheet copy refresh.
- **`diary.js`** — **`renderGroundSections`**: when there are **no grounds yet**, still call **`refreshTgroundModeHint()`** so the By ground explanation appears on that path too.
- **`diary.html`** — **Unassigned buffer** subcopy shortened (explicit “not copied from Season total”).
- **`sw.js` v6.33** — Cache name bump for hint-on-empty-grounds + copy tweak refresh.
- **`sw.js` v6.34** — Cache name bump for collapsible unassigned buffer + rollup layout refresh.

---

## 2026-04-13 — Diary publish fixes (audit follow-up)

- **`diary.js`** — Supabase-not-configured notice now points to **`diary.js`** (`SUPABASE_URL` / `SUPABASE_KEY`), not `diary.html`.
- **`diary.js`** — Registers **`./sw.js`** on **`load`** when the diary is opened directly (duplicate registration from `index.html` is harmless); shows toast when a new service worker is ready.
- **`sw.js` v6.30** — Cache name bump for diary SW + copy fix refresh.
- **`diary.js` / `diary.css`** — Targets **By ground** rows: **Remove** control separated from expand (`tground-bar`), larger chevron affordance + **Remove** button (44px min touch); **`aria-expanded`** on expand row; focus rings for hdr/delete.
- **`manifest-diary.json`** — PWA manifest with **`start_url` / `id`** → **`./diary.html`** for install-to-diary; **`diary.html`** links it; **`sw.js` v6.31** precaches the new manifest.
- **`.cursor/rules/project-log.mdc`** — Tracked paths include **`manifest-diary.json`**.

---

## 2026-04-13 — Diary: shared modal / sheet primitives (step 1)

- **`diary.css`** — Added reusable **di-modal-*** classes (centered + bottom overlays, cards, sheet handle/body, titles, inputs, export option rows, primary/secondary/outline buttons, delete-account layout, syndicate export labels/selects/radios, photo lightbox) so modal chrome is no longer duplicated inline.
- **`diary.html`** — Refactored **forgot password**, **delete account**, **export**, **syndicate export**, **summary filter**, and **photo lightbox** markup to use those classes; syndicate sheet uses **`tsheet--scroll`** instead of inline max-height.
- **`diary.js`** — Delete confirmation uses **CSS `:disabled`** styling only (removed redundant inline colour/cursor toggles in `confirmDeleteAccount` / `checkDeleteInput`).
- **`sw.js` v6.10** — Cache name bump for diary asset refresh.
- **`diary.html`** — Removed Supabase URL-configuration advice from forgot-password modal copy; reset guidance is now user-only (email + spam retry).
- **`diary.css`** — Step 2 accessibility pass: added consistent `:focus-visible` rings for nav/FAB/chips/buttons and increased key touch targets (`.hdr-btn`, species/sex cards, location/photo actions, target steppers) for easier field use.
- **`sw.js` v6.11** — Cache name bump for diary CSS refresh.
- **`diary.html` / `diary.css` / `diary.js`** — Added a lightweight form progress chip under the form date label (e.g. `Section 3 of 7 · Date & Time`) and wired scroll-based updates so long entry forms are easier to navigate.
- **`sw.js` v6.12** — Cache name bump for form-progress UI refresh.
- **`diary.css`** — Made the form header sticky in `v-form` and constrained the form view to viewport height so the header/progress chip remain visible while scrolling long entry sections.
- **`sw.js` v6.13** — Cache name bump for sticky-form-header refresh.
- **`diary.js`** — Fixed form progress chip section detection to use viewport-relative section positions inside `.form-scroll` (resolves stale/off-by-one labels while scrolling through sections).
- **`sw.js` v6.14** — Cache name bump for progress-chip logic refresh.
- **`diary.css` / `diary.js`** — Added active-section spotlight while scrolling form entries: current section now gets a subtle numbered-badge highlight and title tint, synced with the progress chip.
- **`sw.js` v6.15** — Cache name bump for active-section highlight refresh.
- **`diary.html` / `diary.css`** — Applied a light-density pass to form **Shot Details** only: section wrapped as `fsec-shot`, with subtle row grouping cards, spacing, and cleaner visual separation for calibre/distance, placement/age, and shooter rows (no logic or field changes).
- **`sw.js` v6.16** — Cache name bump for Shot Details layout refresh.
- **`diary.html` / `diary.css`** — Applied the same light-density treatment to form **Location** section: grouped place/pin/GPS row and permission/ground row into subtle cards, added dedicated classes (`fsec-loc`, `loc-ground-wrap`, `ground-custom-input`, `loc-ground-note`) and removed inline presentation styles.
- **`sw.js` v6.17** — Cache name bump for Location layout refresh.
- **`diary.html` / `diary.css`** — Applied matching light-density treatment to form **Weight (kg)** section: grouped the 3-column weight inputs into a subtle card, replaced inline label/help text styles with dedicated classes (`fsec-weight`, `weight-label-row`, `weight-note`) for cleaner rhythm and consistency.
- **`sw.js` v6.18** — Cache name bump for Weight layout refresh.
- **`diary.html` / `diary.css`** — Applied the same grouped-card treatment to **Date & Time** and **Notes** sections (`fsec-datetime`, `fsec-notes`) so the full mid/late form has consistent spacing and visual rhythm.
- **`sw.js` v6.19** — Cache name bump for Date/Notes layout refresh.
- **`diary.html` / `diary.css`** — Final coherence sweep: brought **Species** and **Sex** sections into grouped-card parity (`fsec-species`, `fsec-sex`), added short-screen sticky-header tuning, made Save CTA more reachable with sticky anchoring, and normalized helper microcopy punctuation in Weight/Save notes.
- **`sw.js` v6.20** — Cache name bump for final form-coherence refresh.
- **`diary.css`** — QA follow-up: adjusted sticky Save CTA offset and form bottom padding so the button consistently sits above fixed bottom nav across viewport sizes/safe areas.
- **`sw.js` v6.21** — Cache name bump for sticky-save positioning refresh.
- **`diary.css`** — QA refinement: removed sticky Save CTA behavior (it visually interrupted section flow), restored a standard in-flow save button with lighter shadow, and tuned form bottom padding for nav clearance.
- **`sw.js` v6.22** — Cache name bump for save-CTA flow refinement.
- **`diary.js`** — Strengthened unsaved-entry protection: centralized form-dirty guard now blocks in-app route changes, back action, direct anchor navigation, and browser/tab unload without confirmation when `v-form` has unsaved changes.
- **`sw.js` v6.23** — Cache name bump for unsaved-warning logic refresh.
- **`diary.html` / `diary.css`** — Stats/account clarity pass: split exports into clearly titled personal vs syndicate blocks (with syndicate visual differentiation and helper copy), and moved account deletion into a labeled **Danger zone** card to reduce accidental-risk proximity.
- **`sw.js` v6.24** — Cache name bump for stats/account clarity refresh.
- **`diary.html` / `diary.css` / `diary.js`** — Syndicate exports: same header pattern as personal block; syndicate actions use **outline “Team …”** buttons (not filled CSV/PDF/Summary tiles) so team vs personal export rows read clearly at a glance; visibility wrapper uses **`display:block`**.
- **`sw.js` v6.25** — Cache name bump for syndicate export button differentiation.
- **`diary.html` / `diary.css` / `diary.js`** — Stats **Charts & breakdowns**: card-style toggle, circular chevron control, **Tap to show / Tap to hide** line, and `aria-label` synced with expand state so the section reads as interactive; syndicate export buttons use **stacked Team + format** labels to avoid cramped wrapping on narrow widths.
- **`sw.js` v6.26** — Cache name bump for stats charts affordance + syndicate label layout.
- **`diary.css`** — Stats **Charts & breakdowns** and **Danger zone**: removed extra horizontal margins so their width matches full-bleed rows (plan, exports, account) instead of appearing inset.
- **`sw.js` v6.27** — Cache name bump for stats width alignment.
- **`diary.html` / `diary.css`** — Stats exports: shared **`exp-block--stats-export`** card shell on **My diary** and **Syndicate** blocks (same margin, radius, border weight) so both button rows share outer geometry; personal stays neutral white, syndicate keeps tinted fill + moss border.
- **`sw.js` v6.28** — Cache name bump for stats export card parity.
- **`diary.js`** — **Delete ground**: matching **`cull_entries`** rows now get **`ground` cleared** (entries kept); confirm copy explains targets removed + ground tag cleared; resets plan ground filter if it matched the removed name; refreshes entries, plan card, stats when visible, and ground dropdown.
- **`sw.js` v6.29** — Cache name bump for delete-ground behaviour refresh.

- **`scripts/SUPABASE-RECORD.md`** — Canonical **Supabase runbook**: what’s already verified in-repo, changelog, pending gaps, query library; workflow “paste results → agent stores → next time read first”.
- **`.cursor/rules/supabase.mdc`** — **Always apply:** before Supabase tasks read **`SUPABASE-RECORD.md`** + snapshots; don’t re-ask for already-recorded results; append changelog when new pastes arrive. (Replaces glob-only `supabase-rls-audit.mdc`.)
- **`.cursor/rules/project-log.mdc`** — Tracked paths table now includes **`scripts/SUPABASE-RECORD.md`** and **`scripts/supabase-audit-rls-snapshot.json`** so log updates stay mandatory when those change.
- **`scripts/validate-rls-snapshot.mjs`** — Node validator for snapshot shape, required public tables + RLS on, storage policies mention **`cull-photos`**; optional **`--max-age-days=N`** for stale **`_meta.captured`**.
- **`.github/workflows/rls-snapshot-validate.yml`** — Runs validator on **push to main/master**; on **PRs** when `scripts/**` or this workflow changes; **weekly schedule** runs validator with **`--max-age-days=75`** so an outdated snapshot fails until re-audited in Supabase SQL Editor.
- **`scripts/supabase-rls-audit-queries.sql`** — Header comment links validator + workflow.

---

## 2026-04-13 — Deer School UI audit preview (no runtime changes)

- **`deerschool-design-concepts-preview.html`** — Added a standalone visual mock preview (dashboard path strip + readiness donut, lettered quiz options with stepped progress, results hero) to illustrate considerable design directions without changing Deer School runtime.
- **`deerschool-ui-audit-preview.html`** — Added a standalone preview document listing a full Deer School UI audit with prioritized recommendations (high/medium/low impact, estimated effort, and phased rollout guidance). This is review-only and does not modify Deer School behavior.
- **`deerschool.html`** — Quiz header now includes `#quiz-session-chip` to display mode context (e.g., quick/mock/drill/weak areas/review) during questions.
- **`deerschool.css`** — Phase 1 UI pass: added consistent `:focus-visible` outlines for key interactive controls, improved option-state visual separation (`selected-correct`, `selected-incorrect`, `reveal-correct`) with stronger borders/left accent, and increased touch target sizing for compact controls (quiz/back arrows and small chips/tabs).
- **`deerschool.js`** — Added `sessionModeMetaLabel(total)` and wired `renderQuestion()` to update `#quiz-session-chip`; `sessionModeLabel()` now includes review mode text.
- **`deerschool.html`** — Phase 2: quiz now has a bottom action rail with **Quit Session** (`#btn-quit-quiz-rail`) and the primary next action button (`#next-btn`), plus a new results panel `#results-next-card` (“What to revise next”) with follow-up actions for Drill and Weak Areas.
- **`deerschool.css`** — Added `quiz-action-rail`/`quiz-quit-rail` styles (including safe-area padding), reduced quiz scroll bottom padding to avoid duplicate whitespace, and added results-next panel row/action styles (`.results-next-row`, `.results-next-actions`).
- **`deerschool.js`** — Bound new rail quit button and results follow-up buttons (`btn-next-open-drill`, `btn-next-open-weak`), and added session-specific “What to revise next” rendering in `finishQuiz()` using weakest category scores from the current run.
- **`deerschool.js`** — Readiness wording softened: replaced symbol-led fail cues in readiness summary/pills with text labels (`Strong`, `Developing`, `Needs work`; pills now `Pass 85%` / `Needs work 45%`) while keeping score logic and thresholds unchanged.
- **`deerschool.css`** — Removed legacy `.score-pill.pass::before` and `.score-pill.fail::before` prefixes so readiness pills no longer prepend `✓` / `✕` before the new text labels.
- **`deerschool.html` / `deerschool.css`** — Phase 3 UI cleanup: extracted repeated inline dashboard UI into reusable classes (`.dash-kicker`, `.tool-grid`, `.tool-btn*`, `.dash-round-back-btn`, `.spaced-badge-dot`) for Study/Tools tiles and drill/reference back buttons.
- **`deerschool.css`** — Removed duplicate Quick Reference table-style definitions from the secondary block so `.ref-table`/`.ref-note` have one canonical styling path.
- **`deerschool.js`** — Merged duplicated `DOMContentLoaded` setup into one initializer (keyboard enhancement, static actions, ref tab wiring, spaced badge boot, dashboard restoration) to simplify lifecycle without behavior changes.
- **`sw.js` v6.9** — Fixed Deer School first-load stale styling mismatch: added `isDeerSchoolAsset()` and switched Deer School assets (`deerschool.html/.css/.js`, `questions.js`) to **network-first** in fetch strategy so HTML/CSS/JS stay in sync after updates; bumped cache names to `v6.9`.
- **`deerschool.css`** — Final polish pass (visual only): improved vertical rhythm (`.dash-scroll`, `.dash-kicker`), normalized card/button sizing (`.mode-btn`, `.tool-btn`, `.r-btn`, rail next button), added consistent pressed/disabled treatment for tool tiles, and tightened action affordance consistency without logic changes.

---

## 2026-04-13 — Field mode coverage expansion (safe UI pass)

- **`styles.css`** — Expanded `html[data-field-mode="on"]` coverage to more of the main UI while keeping manual toggle behaviour unchanged: core card surfaces (`.deer-card`, `.info-card`, `.fg-category`, `.legal-picker-card`), key typography contrast (`.species-name`, `.fg-cat-title`, top-level `.info-card` copy, captions), and note styling (`.card-note`) now shift consistently in field mode.
- **`styles.css`** — Added field-mode modal surface/theme styling for `#location-modal`, `#hours-disclaimer-modal`, `#changelog-modal`, and `#first-launch-modal` including location search input, preset buttons, and result hover states for better low-light consistency.
- **`app.js`** — In `legal-banner--no-solar` (“Location Required”) state, `#banner-status-pill` now becomes an accessible location trigger (`data-fl-action="banner-status-open-location"`, `role="button"`, `tabindex="0"`) that opens the existing location picker; trigger is removed again during normal banner rendering. Prompt sublabel updated to **“Tap location or badge”**.
- Scope intentionally conservative: no JS changes, no toggle logic changes, and no global `*` overrides to avoid regressions in inline-styled warning/info blocks.

---

## 2026-04-11 — Diary auth: forgot password & reset link

- **`diary.html`** — **Forgot password?** on sign-in; modal to send **`resetPasswordForEmail`** (redirect to same origin/path); **`#auth-recovery-panel`** to set a new password after email link (`PASSWORD_RECOVERY` / hash `type=recovery`).
- **`diary.js`** — **`openForgotPasswordModal`**, **`sendPasswordResetEmail`**, **`submitPasswordRecovery`** (`updateUser({ password })`), **`cancelPasswordRecovery`** (sign out); auth listener registered **before** initial **`getSession`**; deferred apply + **`diaryApplyAuthSession`** duplicate-user guard to avoid list flash during recovery.
- **`diary.css`** — Styles for forgot link and recovery panel.
- **`sw.js` v6.8** — Precache bump.
- **Supabase (manual):** add site URL(s) under **Authentication → URL configuration → Redirect URLs** so the reset email link is allowed.

---

## 2026-04-11 — Cursor rule: project log (strict)

- **`.cursor/rules/project-log.mdc`** — **Strict mode:** read **`PROJECT-LOG.md`** before editing **tracked paths** (`diary.*`, `app.js`, `index.html`, `styles.css`, `sw.js`, Deer School, `privacy.html`, `diary-guide.html`, `manifest.json`, `scripts/**/*.sql`, etc.); **always** append/extend the log in the **same session** after any such edit — **no “too small to log”** (even one-line / cache bump gets a bullet). Opt-out only if the user explicitly says not to log. Preview-only HTML may omit trivial tweaks unless behaviour/copy changes.

---

## 2026-04-11 — Cull Diary: syndicate manager exports & Stats bottom padding

- **`diary.html`** — Second export row **Syndicate (managers)** with CSV / PDF / Summary; **`#syndicate-export-modal`** (syndicate + season + list scope for CSV/PDF). Row hidden unless the user is a **manager** of at least one syndicate.
- **`diary.js`** — **`updateSyndicateExportVisibility`**, **`openSyndicateExportModal`**, **`doSyndicateExport`**; list data from RPC **`syndicate_member_actuals_for_manager`** plus **`syndicate_members.display_name`**; null **`user_id`** labelled **Anonymous (retained)** in exports. **Summary PDF** uses **`syndicate_season_summary`** with **`fetchSyndicateSummaryFallback`** when needed (species breakdown, cull plan vs actual, all-entries table with species / sex / date / culled-by only). Manager role re-checked before export.
- **`diary.css`** — **`.stats-scroll`** `padding-bottom` increased to **`calc(120px + env(safe-area-inset-bottom, 0px))`** so export controls (especially the taller syndicate row) are not trapped under the **fixed bottom nav** (`z-index: 200`). **`#syndicate-export-row`** given **`position: relative`**, **`z-index: 10`**, small **`margin-bottom`**.
- **`sw.js` v6.7** — Precache bump for **`diary.html`** / **`diary.css`** / **`diary.js`** (v6.6–v6.7 during iteration).

---

## 2026-04-11 — Field mode (dim UI for low light)

- **`index.html`** — Moon icon button next to “About these times” toggles **Field mode**. **`styles.css`** — `html[data-field-mode="on"]` overrides tokens, **`.bg-layer`**, glass banner rims/inner, **top nav pills**, **bottom tab bar**, **`#forecast-card`**. **`app.js`** — `applyFieldMode` / `initFieldMode`, **`localStorage`** key **`fl_field_mode`**, early apply at top of bundle (CSP-safe, no inline script), **`theme-color`** meta. **`sw.js` v5.7**.

---

## 2026-04-11 — Bottom tab bar active state

- **`app.js`** — **`switchMainTab`** now sets **`active`** on the bottom **`.tab-item[data-maintab=…]`** whenever the main tab changes (including from the **top** nav), not only when the bottom bar was clicked. **`sw.js` v5.6**.

---

## 2026-04-11 — Legal glass banner (F1): meta layout, twilight cues, compact height

- **`index.html` / `styles.css`** — Glass meta grid: **Legal start | Legal end** on row 1, **Sunrise | Sunset** on row 2 (bookend alignment). Twilight: **status pill dot** stays **green** (legal to shoot); **timeline sun “now” marker** stays **amber/orange** (twilight sun cue). **Tighter vertical rhythm**: reduced inner padding, top row / pill / countdown / meta / moon-row spacing, slightly smaller countdown clamp and meta times, shorter timeline track + ticks + sun marker. **`sw.js` v5.0** cache bump (was v4.9; v4.6–v4.8 covered earlier glass iterations in session work).
- **`app.js`** — Banner meta times always **today’s** legal start/end and sunrise/sunset again (reverted next-day display experiment). **`sw.js` v5.3**.
- **`app.js`** — Legal Times tab **today** hero + first 7-day row + deer week panel **today** hourly window use **`bannerState` / `computeBannerState`** sun & legal instants so they match the main banner (avoids a few minutes’ drift from calling **`calcSunTime`** with midnight `Date` vs “now”). **`sw.js` v5.4**.
- **`app.js`** — **`calcSunTime`** now keys off **Europe/London calendar Y/M/D** (not device-local `Date` getters) and a consistent UTC day-of-year; **`utcMs`** uses that same `y/m/d` anchor. **`computeBannerState`** “tomorrow” uses **`ymdAddCalendarDays` + `londonWallClockToDate`** (London noon) instead of device-local `Date` math. **`maybeRecalcSolar`** day-change uses **`ukTodayYmdLondon()`**. **`sw.js` v5.5**.

---

## 2026-04-12 — Legal hours banner: timeline layout (Option F)

- **`index.html`** — Removed hunter SVG templates and sun-arc layout. New banner: top row (date · location + info), status dot + title, large **DM Mono** countdown + **Remaining** / **Until legal**, legal-window **timeline** (zones, sunrise/sunset ticks, sun/moon marker), moon row + **View deer activity forecast ›**. **`sw.js` v4.0** cache bump.
- **`styles.css`** — State styling (legal / twilight / outside) aligned to reference gradients; timeline, badges, focus-visible on controls.
- **`app.js`** — Removed **`drawSunArc`**, **`HUNTER_SVG`**, hunter injection; added **`updateTimelineBar()`** (window-aware % positions), split **`updateBannerClock()`** (time vs sublabel); copy **Outside of Legal Hours** / **Legal to Shoot** (incl. twilight); **`showLocationPrompt`** uses **`legal-banner--no-solar`** and hides clock stack.

---

## 2026-04 — Supabase, storage, syndicates, audit trail

### Audit / inventory (repo)

- **`scripts/supabase-audit-queries.sql`** — Tables, RPCs, optional row counts (includes **`syndicate_anonymous_culls`** in the 4-table count union), `display_name` check, storage helpers in comments.
- **`scripts/supabase-verify-drift.sql`** — **Drift-only**: returns rows **only** when something expected is missing (tables, functions, `display_name`, `cull-photos` bucket, RLS on anonymous table). Empty = OK; use this for routine checks instead of re-diffing the full audit snapshot.
- **`scripts/supabase-audit-snapshot.json`** — Baseline inventory; `_meta.migrations_on_record`, `row_counts_verified`, storage bucket sample.
- **`scripts/supabase-rls-audit-queries.sql`** — RLS flags, `pg_policies` for listed `public` tables + `storage.objects` / `buckets`; includes **`syndicate_anonymous_culls`** in queries 1–2.
- **`scripts/supabase-audit-rls-snapshot.json`** — Frozen RLS + storage policy text for comparison.

### Storage (`cull-photos`)

- **Private bucket + owner-only reads:** `scripts/cull-photos-private-storage.sql` — `public = false`, drop public SELECT, add authenticated SELECT matching own path prefix (`split_part(name,'/',1) = auth.uid()`).
- **App (`diary.js`):** Store **`photo_url`** as object **path** where appropriate; **`createSignedUrl`** for display; **`resolveCullPhotoDisplayUrls`** after load; path helpers for delete/bulk delete; **`openDetail`** refreshes signed URL when opening.

### Syndicate — anonymous tallies after account deletion

- **Problem:** Deleting a user’s `cull_entries` dropped syndicate totals even though deer were still culled in reality.
- **Approach:** Before deleting entries, RPC **`retain_syndicate_anonymous_culls()`** copies **minimal** rows into **`syndicate_anonymous_culls`** (syndicate, season, species, sex, cull_date only — no full diary row, no user id).
- **SQL:** `scripts/syndicate-anonymous-retention.sql` — table, **`fl_date_to_season`**, RLS SELECT for members/managers, **`retain_syndicate_anonymous_culls`**, updated **`syndicate_aggregate_actuals_for_user`**, **`syndicate_member_actuals_for_manager`** (NULL `user_id` bucket = “Former members (account removed)”), **`syndicate_season_summary`**.
- **App:** `deleteAccount` calls **`retain_syndicate_anonymous_culls`** before **`cull_entries`** delete; manager breakdown label for anonymous rows.

### Syndicate — manager member list & remove

- **`diary.js` — `openSyndicateManageSheet`:** Managers get a **Members** block at the top of the manage modal: all **active** members with **role**, **joined** date (when `joined_at` is set), **(you)** for self.
- **Remove:** **`syndRemoveMember`** — sets **`syndicate_members.status = 'left'`** for **`role === 'member'`** only (not managers). Uses existing RLS **`syndicate_members_update_manager`**. Self-removal still via **Leave syndicate** at the bottom.
- **Action:** `data-fl-action="synd-remove-member"` + `data-member-user-id`.

### Syndicate — manager breakdown by date

- **Issue:** “Manager · culled by member” was **aggregated** (no cull dates).
- **Change:** RPC **`syndicate_member_actuals_for_manager`** now returns **one row per cull** with **`cull_date`** (newest first), including anonymised rows from **`syndicate_anonymous_culls`** where deployed.
- **SQL:** `scripts/syndicate-schema.sql` (live-only baseline), `scripts/syndicate-anonymous-retention.sql`, patch **`scripts/syndicate-manager-breakdown-by-date.sql`** for existing DBs. Upgrading from the old aggregated RPC requires **`DROP FUNCTION IF EXISTS syndicate_member_actuals_for_manager(uuid, text)`** before the new definition (included in those scripts).
- **App:** `diary.js` shows **name · species · sex label · formatted date** per line.
- **Verified on live Supabase:** `syndicate-manager-breakdown-by-date.sql` succeeded; **`supabase-verify-drift.sql`** returned **no rows** (no drift). Recorded in `scripts/supabase-audit-snapshot.json` `_meta`.

### Deploy (when you go live)

- Apply all SQL on the **production** Supabase project in dependency order (schema → summary RPC → anonymous retention → storage private script, etc.).
- Deploy **`diary.js`** (and static assets) so behaviour matches DB.
- Re-run audit SQL and refresh JSON snapshots if you use them as baseline.

### Local status (as of last update)

- Development on laptop; **public website not deployed yet** — ship when feature set and testing are complete.

---

## 2026-04-11 — Field Guide: holdover & ballistics

- **`index.html`** — Under **Field Guide → Legal Calibres**, added **Holdover & ballistics (100 m zero)**: approximate drop table for **.243 / 6.5 Creedmoor / .308 / .270** at 150–250 m, short tips on holdover vs dialling and wind, plus a callout for **.222 / .223** where legal for small deer. Field Guide intro copy updated to mention holdover reference.
- **`sw.js`** — Cache bumped to **v3.1** so offline users pick up the updated `index.html`.

---

## 2026-04-11 — Service worker: invalid Response (deerschool / favicon)

- **Symptom (Edge console):** `Uncaught (in promise) TypeError: Failed to convert value to 'Response'.` from **`sw.js`**, plus **`favicon.ico`** fetch failures.
- **Cause:** **`staleWhileRevalidate`** could resolve to **`null`** when there was no cache entry and **`fetch` rejected** (Promise was truthy in `cached || networkPromise || offline`, so the fallback never ran; awaiting the inner promise yielded `null`, not a `Response`).
- **Fix:** **`sw.js` v3.2** — await `fetch` in try/catch, then **`return cached || networkResponse || new Response(..., 503)`** so **`respondWith` always gets a `Response`**. Cache names bumped so clients pick up the new worker.
- **Follow-up (`sw.js` v3.3):** **`/favicon.ico` not intercepted** (no file in repo — avoids SW path entirely). **`cache.put` failures** no longer wipe a good network response. **`respondWith` path** wrapped in try/catch + **`instanceof Response`** guards so a bad value never reaches **`respondWith`**. If the console still showed **`sw.js` v3.2** errors, **unregister** the old worker once (Edge → F12 → **Application** → **Service Workers** → **Unregister** for `localhost`) then hard-refresh.
- **Verified:** Deer School at `127.0.0.1:5173` — console clean (no red **`Failed to convert value to 'Response'`**); **`sw.js` v3.4** cache bump after removing temporary **`[FL-DEBUG]`** instrumentation from **`app.js`**, **`diary.js`**, **`deerschool.js`**.
- **Favicon 404:** **`deerschool.html`**, **`diary.html`**, **`privacy.html`**, **`diary-guide.html`** now include **`<link rel="icon" href="icon-192.png">`** (same as **`index.html`**) so Edge stops requesting missing **`/favicon.ico`**. **`sw.js` v3.5** precache bump.

---

## 2026-04-11 — Legal time banner: design alternatives (preview only)

- **`legal-banner-preview.html`** — Standalone page with **current** banner (reference) plus **A** Editorial, **B** Dashboard, **C** Soft glass, **D** Typography-first. Open locally to compare before changing **`index.html`** / **`styles.css`**.

---

## 2026-04-12 — Diary list: photos not showing after upload

- **Cause:** Signed Supabase URLs contain **`&`** in the query string; unescaped **`src="…&…"`** in **`innerHTML`** breaks HTML parsing so the browser requests a **truncated** URL → image fails; list fell back to **no-photo** deer. **Fix:** wrap all dynamic **`img src`** values with **`esc()`**; **`resolveCullPhotoDisplayUrls`** retries **`createSignedUrl`** up to 3 times; list thumbnails use **`loading="eager"`** + **`decoding="async"`**; wide-card layout keys off **`e.photo_url`** in DB instead of display URL. **`sw.js` v3.8**.

---

## 2026-04-12 — Diary CSP: inline image handlers blocked

- **Symptom:** Editing an entry / photo on **`diary.html`** — console: inline **`onload` / `onerror`** on injected **`<img>`** violated **`script-src`** (no `'unsafe-inline'`).
- **Fix:** **`diary.js`** — removed inline handlers; added **`bindDiaryImgHandlers`** + **`diaryWireDiaryImages`** to attach **load/error** in script after DOM insert; wire list, detail, and photo slot. **`sw.js` v3.7**.

---

## 2026-04-12 — CSP: console noise on `index` / `diary`

- **`frame-ancestors`** removed from **meta** CSP (browsers ignore it in `<meta>`; use HTTP headers in production if you need clickjacking protection).
- **`connect-src`** extended with **`https://cdn.jsdelivr.net`** and **`https://cdnjs.cloudflare.com`** so devtools source-map fetches are not blocked.
- **`index.html`:** added **`<meta name="mobile-web-app-capable" content="yes">`** (alongside Apple tag) to address deprecation warning.
- **`sw.js` v3.6** — cache bump for updated HTML.

---

## 2026-04-12 — Stats: `syndicate_season_summary` 400 / ambiguous `species`

- **Symptom:** Opening **Stats** — RPC **`syndicate_season_summary`** returns **400**; Postgres: **`column reference "species" is ambiguous`**.
- **Cause:** **`RETURNS TABLE (species, sex, …)`** defines PL/pgSQL variables with those names; in the **`all_keys`** CTE, unqualified **`species` / `sex`** in **`SELECT … FROM syndicate_targets` / `syndicate_member_allocations`** conflicted with those output parameters.
- **Fix:** Use table aliases (**`st`**, **`ma`**) and qualify columns in **`scripts/syndicate-anonymous-retention.sql`** and **`scripts/syndicate-summary-rpc.sql`**. Re-run the **`CREATE OR REPLACE FUNCTION syndicate_season_summary`** block on Supabase (the version that matches your DB — anonymous retention if you deployed that).

---

## 2026-04-12 — Leaflet self-hosted (Edge Tracking Prevention on diary refresh)

- **Symptom:** Hard refresh (**Ctrl+F5**) on **`diary.html`** — Microsoft Edge **Tracking Prevention** console messages tied to loading **Leaflet** from **cdnjs.cloudflare.com** (third-party storage / cross-site context).
- **Change:** **Leaflet 1.9.4** is **vendored** under **`vendor/leaflet/`** (CSS, JS, default marker + layers images). **`diary.html`** uses relative **`vendor/leaflet/...`** URLs instead of the CDN. **`sw.js` v3.9** precaches those assets and no longer precaches Leaflet from cdnjs. **jsPDF** remains on cdnjs until optionally self-hosted; if Tracking Prevention still mentions cdnjs, that script is the next candidate to vendor.

---

## How to update this log

After significant Cursor sessions, append a dated section or ask the assistant to merge a short summary into this file.


