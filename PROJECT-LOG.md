# First Light — project log (decisions & changes)

This file is a **durable summary** of work discussed and implemented in Cursor. It is **not** a full chat transcript. For verbatim history, use **Cursor’s chat panel** (past conversations).

---

## 2026-04-18 — Diary stats: fix Season Statistics header overflow (Next season)

Long **season `<select>`** options (`… · Next season`) made the native control size to the longest label; with **`flex-shrink:0`** the **h2 + select** row exceeded the **430px** column → horizontal scroll / white edge on Safari (same class of bug as `.list-top`). **`.stats-hdr-row`** + **`min-width:0`**, capped **`.season-pill-sel`**, **`#v-stats { overflow-x: hidden }`**.

- `diary.html`, `diary.css`, `sw.js` `8.12 → 8.13`.
- `betav2/` rebuilt.

---

## 2026-04-18 — Diary stats: next season visible in season pill (iOS / sync)

**`#v-stats { overflow-x: hidden }`** could break **WebKit** native `<select>` so not all seasons appeared. Moved **`overflow-x: hidden`** to **`.stats-scroll`** only; **narrow screens** stack title + pill so the dropdown is **full width**. Option suffix **`· Next season` → `· Next`**. **`go(v-stats)`** / **`buildStats`** no longer sync stats from list when **`season-select` has no options** (avoids wiping the dropdown before `loadEntries` finishes).

- `diary.css`, `diary.js`, `sw.js` `8.13 → 8.14`.
- `betav2/` rebuilt.

---

## 2026-04-18 — Deploy bundle: `beta_v2/` for GitHub upload

Added **`beta_v2/`** — same minimal static bundle as `betav2/`, produced by **`node scripts/build-betav2.mjs beta_v2`** (optional output dir; default remains `betav2`). Includes `beta_v2/README.md` for standalone repo / Pages. `scripts/build-betav2.mjs` — CLI out dir.

---

## 2026-04-18 — Main site + diary: reverse-geocode label priority

`primaryPlaceFromAddress` previously preferred **village** over **town**, so Nominatim pairs such as Solihull + Hampton in Arden could show the village. Order is now **town/city/municipality before village**, except when `town` matches a **merged UK admin-style** name (`… and …`, long string, or Borough/District/… keywords) — then **village** still wins (West Acre–style cases). `looksLikeUkMergedAdminPlaceName` in `app.js` and `diary.js`.

- `app.js`, `diary.js`, `sw.js` `8.09 → 8.10`.
- `betav2/` rebuilt.

- **Follow-up:** Nominatim reverse now uses **`format=jsonv2`**, **`addressdetails=1`**, **`zoom=15`** (settlement-level match per Nominatim docs; default zoom 18 often resolves to road/building so `address.village` could be a wider parish). **`labelFromNominatimReverse`** prefers `address[addresstype]` when `addresstype` is place-like; merged-district strings still defer to `village`/`hamlet`/suburb when present (e.g. West Acre vs King’s Lynn and West Norfolk). `app.js`, `diary.js`, `sw.js` `8.10 → 8.11`, `betav2/` rebuilt.

- **Audit (same day):** `nominatimFetch` in `diary.js` now sends the same **`Accept-Language`** / **`User-Agent`** headers as `app.js` Nominatim calls (policy-friendly, consistent `display_name` language). `sw.js` `8.11 → 8.12`, `betav2/` rebuilt.

---

## 2026-04-18 — Privacy: partner logos — shorter third-party copy

Removed same-origin / localhost / IP–user-agent detail from the Field Guide logo subsection; kept org names, host for image files, link-out policy, and trademark non-endorsement line.

- `privacy.html`, `sw.js` `8.08 → 8.09`.
- `betav2/` rebuilt.

---

## 2026-04-18 — Legal: privacy / terms — partner logos

**Privacy Policy:** third-party section documents logo image requests to `firstlightdeer.co.uk` when using the Field Guide (including off-origin dev), and a short trademark / non-endorsement note for UKDTR, BDS, BASC.

**Terms of Use:** section 9 extended — third-party trademarks, no affiliation or endorsement, no responsibility for linked sites.

- `privacy.html`, `terms.html`, `sw.js` `8.07 → 8.08`.
- `betav2/` rebuilt.

---

## 2026-04-18 — Field Guide: BDS, BASC, UKDTR partner logos

Replaced inline SVG placeholders on the **UKDTR**, **British Deer Society**, and **BASC** cards with raster logos: `species/UKDTR_logo.JPG`, `species/bds_logo.jpg`, `species/basc_logo.png`. `betav2` build copies `species/` when present; `sw.js` precaches those paths.

- `index.html`, `scripts/build-betav2.mjs`, `sw.js` `8.04 → 8.05`.
- `betav2/` rebuilt (ensure the three files exist under `species/` locally or logos 404 until added).
- UKDTR asset path aligned with live host (case-sensitive): `species/UKDTR_logo.JPG`; `sw.js` `8.05 → 8.06`.
- Partner logos use absolute `https://firstlightdeer.co.uk/species/…` URLs so localhost dev loads the same assets; `sw.js` precache matches; `8.06 → 8.07`.

---

## 2026-04-18 — Main site: UK-only location — fix non-UK saved state

`fl_state` restore did not validate UK bounds, so stale non-UK coordinates (e.g. abroad) could show **Legal to Shoot** with local solar times. **Invalid saved coords** are now dropped; **`updateBanner`** / **`showOutsideUKMessage`** clear `bannerState` and weather caches so the per-minute tick cannot resurrect a non-UK location.

- `app.js` — `clearBannerStateLocation`, `initBanner` + `updateBanner` + `selectPreset` guards; `sw.js` `8.03 → 8.04`.
- `betav2/` rebuilt.

---

## 2026-04-18 — Field Guide: Sika Best — trim copy trimmed

Removed meat-chemistry “sweet amino acids” sentence and the “not unique to sika / suet” caveat; kept the practical line on milder trim in mince/burgers.

- `index.html`, `sw.js` `8.02 → 8.03`.
- `betav2/` rebuilt.

---

## 2026-04-18 — Field Guide: Sika venison & fat / mince (verified copy)

**Best** venison block: expanded with biochemistry-aligned note (sweet-taste amino acids in meat science), practical use of mild trim in mince/burgers when fat is clean, and explicit caveat that **usable fat in mince is not unique to sika** (CWD etc.); pork/beef suet still common for venison mince.

- `index.html` — Sika Venison Quality &rarr; Best; `sw.js` `8.01 → 8.02`.
- `betav2/` rebuilt.

---

## 2026-04-18 — Cursor: Git commit/push workflow rule

Agent rule **`git-commit-workflow.mdc`** (`alwaysApply`): after scoped code/doc edits, commit from repo root with a clear imperative message and push to `origin` when possible; never commit secrets; if git is unavailable in the environment, give copy-paste commands.

- `.cursor/rules/git-commit-workflow.mdc` — new.

---

## 2026-04-18 — Syndicate: demote manager to member

Manage sheet member list: **Demote to member** for other managers when there are **two or more** active managers (keeps at least one). Sole manager still shows **Only manager**. Your own row shows **Another manager can demote you** when a co-manager exists (RLS does not allow self-update from manager → member via the same policy path).

- `diary.js` — `syndDemoteMember`, `data-fl-action="synd-demote-member"`; `sw.js` `8.00 → 8.01`.
- `betav2/` rebuilt.

---

## 2026-04-18 — Diary: plan-ahead targets for next season (personal + syndicate)

Season dropdown now includes the **next** Aug–Jul season (label **· Next season**) before 1 August so stalkers and syndicate managers can set **personal** `cull_targets` / ground targets and **syndicate** targets for the upcoming year. `openTargetsSheet` and the Stats plan card allow editing when `seasonAllowsTargetEditing` — current season **or** next season only; past seasons stay read-only.

- `diary.js` — `getNextSeasonAfter`, `seasonAllowsTargetEditing`, `isPastSeasonForTargets`; `buildSeasonList`, `populateSeasonDropdown`, `renderPlanCard`, `openTargetsSheet`; `sw.js` `7.99 → 8.00`.
- `betav2/` rebuilt.

---

## 2026-04-18 — Diary list: multi-select bar compact layout

Select-mode bottom bar: actions use a **2×2 grid** (was `flex-wrap`, so long labels each took a full row and looked huge). Tighter padding/typography; consignment button label **Dealer PDF** with `title` + `aria-label` for the full meaning. List `padding-bottom` reduced slightly to match shorter bar.

- `diary.css`, `diary.html`, `sw.js` `7.98 → 7.99`.
- `betav2/` rebuilt.

---

## 2026-04-18 — Diary list: Newest/Oldest sort with All seasons

Month section headers were always ordered **newest calendar month first**, so with **All seasons** selected, toggling **Oldest** only reordered rows inside each month while year/month blocks stayed newest-first — looking like only the “current” months moved. Month keys now follow `listSortAsc` (oldest months first when Oldest). **Newest** mode also applies an explicit date/time **descending** sort so order does not depend only on the query.

- `diary.js` — `renderList`; `sw.js` `7.97 → 7.98`.
- `betav2/` rebuilt.

---

## 2026-04-18 — Diary detail: show syndicate name

Entry detail **When & where** card now includes a **Syndicate** row when `syndicate_id` is set, resolving the display name via the same membership list as the form (with fallback copy if the name cannot be loaded).

- `diary.js` — `resolveSyndicateDisplayName`, `openDetail`; `sw.js` `7.96 → 7.97`.
- `betav2/` rebuilt.

---

## 2026-04-18 — Diary Stats: Cull Map pins on first open

Leaflet was initialising while the Stats layout was still settling, so the map sometimes had wrong pixel geometry until the user panned (or revisited Stats — the fast-path already called `invalidateSize` + `renderCullMapPins` after 150ms). After a full `buildStats`, schedule the same refit (~180ms) so pins/clusters appear on first open without interaction.

- `diary.js` — `buildStats` map `setTimeout(0)` block; `sw.js` `7.95 → 7.96`.
- `betav2/` rebuilt.

---

## 2026-04-18 — Field Guide (`index.html`): Chinese Water Deer UK population

Distribution card updated: **3,000–4,000** replaced with **high tens of thousands** and a note that estimates vary widely (aligned with recent specialist commentary).

- `index.html`, `sw.js` `7.94 → 7.95`.
- `betav2/` rebuilt.

---

## 2026-04-18 — Diary: four new gralloch abnormality codes

Extended `ABNORMALITY_OPTIONS` / `ABNORMALITY_LABEL_BY_CODE` (Supabase `abnormalities` TEXT[]): **jaundice**, **generalised oedema** (distinct from arthritic joints), **pre-existing wounds/injuries/fractures**, **gralloch contamination** (rumen/faecal). Environmental contamination left for the existing trained-hunter declaration wording, not duplicated as a chip.

- `lib/fl-pure.mjs`, `diary.js`, `tests/fl-pure.test.mjs` (count 12 → 16), `sw.js` `7.93 → 7.94`.
- `betav2/` rebuilt.

---

## 2026-04-18 — Legal copy: assimilated Regulation (EC) No 853/2004 (GB post-Brexit)

User-facing references updated from “Regulation (EC) 853/2004” to **assimilated Regulation (EC) No 853/2004**, matching UK/FSA wording for GB (retained EU law as assimilated under the REUL framework). PDF subtitles, declaration footers, `terms.html`, and code comments adjusted.

- `modules/pdf.mjs`, `terms.html`, `diary.js` (comments), `sw.js` `7.92 → 7.93`.
- `betav2/` rebuilt.

---

## 2026-04-18 — Diary PDF: trained hunter declaration — drop duplicate checklist

Removed the **Before the kill and kill site** bullet block from per-carcass and consignment dealer PDFs; the signed declaration paragraph already states no abnormal behaviour before the kill and no suspicion of environmental contamination (Reg (EC) 853/2004).

- `modules/pdf.mjs` — `buildGameDealerDeclarationPDF`, `buildConsignmentDealerDeclarationPDF`.
- `sw.js` — `SW_VERSION` `7.91 → 7.92`.
- `betav2/` — rebuilt.

---

## 2026-04-18 — Diary PDF: trained hunter checklist encoding (jsPDF)

Checklist lines rendered as `&` between characters: **jsPDF** default fonts do not reliably encode **Unicode** (e.g. checkmark U+2713), and a raw **`&`** in the heading also broke text output. Replaced with **ASCII** `- ` bullets and **"Before the kill and kill site"** (no ampersand).

- `modules/pdf.mjs` — gralloch + pre-kill checklist lines.
- `sw.js` — `SW_VERSION` `7.90 → 7.91`.
- `betav2/` — rebuilt.

---

## 2026-04-18 — Diary PDF: trained hunter checklist (behaviour + contamination)

Per-carcass and consignment **Trained Hunter Declaration** PDFs now show explicit lines under **Before the kill & kill site:** — *No abnormal behaviour observed* and *No suspicion of environmental contamination at the kill site* — before the formal declaration sentence, and the sentence uses the same *no … observed* / *no suspicion of … contamination* wording (Reg (EC) 853/2004 Annex III reference unchanged).

- `modules/pdf.mjs` — `buildGameDealerDeclarationPDF`, `buildConsignmentDealerDeclarationPDF`.
- `sw.js` — `SW_VERSION` `7.89 → 7.90`.
- `betav2/` — rebuilt via `node scripts/build-betav2.mjs`.

---

## 2026-04-18 — Field Guide: Sika rut calendar (activity forecast)

Aligned `RUT_CALENDAR` Sika scores with credible UK guidance: **October** now peak (**30**), **November** trimmed to **15** (late rut / continuation). Comment cites Scotland Wild Deer Best Practice (peak rutting mid Sep–end Oct) and BDS regional variability.

- `app.js` — `RUT_CALENDAR` months 10–11, third value (Sika).
- `sw.js` — `SW_VERSION` `7.88 → 7.89`.
- `betav2/` — rebuilt via `node scripts/build-betav2.mjs`.

---

## 2026-04-18 — Diary: Cull Map header stays visible when using Leaflet zoom (+/−)

Stats view scroll (`.stats-scroll`) could jump when tapping Leaflet’s zoom buttons (focus / scroll anchoring), scrolling the **Cull Map** title row off-screen so fullscreen and Map/Satellite looked like they “vanished”. Mitigation: capture `scrollTop` on `pointerdown`/`touchstart` (capture) on the zoom control and restore it after `zoomend`; `overflow-anchor: none` on `.stats-scroll`; stack `.cullmap-head` / `.cullmap-filter` above `#cull-map-container` with `z-index` + opaque `background`.

- `diary.js` — `attachCullMapStatsScrollLock()` in `initCullMap`.
- `diary.css` — cull map stacking + `overflow-anchor` on stats scroll.
- `sw.js` — `SW_VERSION` `7.86 → 7.87`.
- `betav2/` — rebuilt via `node scripts/build-betav2.mjs`.

**Follow-up (still repro):** Two extra causes: (1) **flex** — the title column had default `min-width: auto` with a long `#cullmap-sub` line, so `.cullmap-ctrl` could shrink to **zero width** on narrow viewports after reflow; fixed with `min-width: 0` / `flex: 1 1 0%` on the left column and `flex-shrink: 0` on `.cullmap-ctrl`, plus `overflow-wrap` on the subtitle. (2) **inline map height** — `initCullMap` forced `#cull-map-div` to **300px** while `#cull-map-container` is **248px**; removed the inline height so CSS `height: 100%` applies. (3) **Scroll lock** — `tabindex="-1"` on Leaflet zoom `<a>`s, `zoomstart` snapshot only if unset, restore **both** `.stats-scroll` and `window` scroll, delayed restores + `blur()` on zoom end.

- `diary.js` / `diary.css` — as above; `sw.js` `7.87 → 7.88`; `betav2/` rebuilt.

---

## 2026-04-18 — Diary: Mapbox token rotation

- `diary.html` — `meta[name="fl-mapbox-token"]` updated to the new Mapbox public token (URL-restricted token in dashboard).
- `sw.js` — `SW_VERSION` `7.85 → 7.86` so diary clients fetch the updated HTML.
- `betav2/` — rebuilt via `node scripts/build-betav2.mjs`.

---

## 2026-04-18 — Preview: iPhone 17 Pro Max viewport frame for Cull Diary

- `previews/iphone-17-pro-max-diary-preview.html` — wraps `diary.html` in a **440 × 956** CSS px frame (published logical resolution for iPhone 17 Pro Max). Notes in-page: diary `max-width: 430px` vs 440px viewport; real Safari has URL bar (shorter than full 956px). Open via local server if `file://` iframe is blocked.

---

## 2026-04-18 — Diary: list header flex overflow (looks “zoomed” vs focus-zoom)

The **16px minimum on inputs/selects/textareas** only stops Safari’s **focus-triggered** viewport zoom — it does not change how the **diary list** looks before any field is focused. A separate issue: `.list-top` (title + stats) is a horizontal flex row with default `min-width: auto` on children, so on narrow phones the row could **wider than the viewport**, producing a **clipped right edge / horizontal pan** that reads like the page is zoomed. Mitigation: `min-width: 0` + `gap` on `.list-top`, `flex` on the title column, slightly tighter `.hs` padding, and a small `max-width: 380px` tweak for stat numerals.

- `diary.css` — header row flex containment as above.
- `sw.js` — `SW_VERSION` `7.84 → 7.85`.

---

## 2026-04-18 — Diary: iOS Safari “zooms in” on field focus

**Not** caused by `body { max-width: 430px }` — that only centres the diary column. **Mobile Safari** (iPhone / iPad) automatically zooms the visual viewport when the user focuses an `<input>`, `<select>`, or `<textarea>` whose computed **font-size is below 16px**, so every tap on a 12–14px field felt like the page jumping back to a zoomed state.

- `diary.css` — `html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }` to reduce incidental text scaling; `@media (max-width: 900px)` rule sets `font-size: 16px !important` on text-like inputs / all selects / textareas (excludes checkbox, radio, button, hidden, file, etc.).
- `sw.js` — `SW_VERSION` `7.83 → 7.84` so PWA clients fetch the updated stylesheet.

---

## 2026-04-18 — Content audit: FAC age, stale AHVLA ref, trained-hunter declaration wording

Follow-up pass on user-facing content after the CSV-injection fix. I audited `privacy.html`, `terms.html`, species profiles / calibre tables in `index.html`, `diary-guide.html`, and the trained-hunter declaration PDFs. Seasons, calibre/energy minima (including the Scotland 2023 80-grain amendment and the Scotland Oct-2023 removal of male-deer close seasons), fallow palmation, roe delayed implantation, CWD tusks, and Mapbox/OS attribution all check out. Three real factual issues found and fixed.

- `questions.js` — Q260 *"What is the minimum age to hold a Firearms Certificate (FAC) in the UK?"* previously had `correctIndex: 2` (18) with the explanation *"You must be 18 or over to hold a Firearm Certificate in your own name"*. That conflates **holding** a certificate with **purchasing** one. Under Firearms Act 1968 s.22(2), a person under 14 cannot possess a Section 1 firearm (outside narrow exceptions), so the practical minimum for **holding** an FAC in Great Britain is **14**. Purchase/hire is restricted to 18+ under s.22(1) (raised from 17 in 2010). Northern Ireland operates a different scheme (minimum 16, SI 2004/702). Stem rewritten to *"In Great Britain, what is the minimum age at which a person can be granted a Firearm Certificate for a Section 1 rifle used for deer stalking?"*, `correctIndex: 0` (14), and the explanation now walks through hold vs. purchase vs. the NI scheme.
- `modules/pdf.mjs` — per-carcass Trained Hunter Declaration: *"Gralloch inspection (AHVLA trained-hunter checklist):"* updated to *"APHA / FSA trained-hunter checklist"*. **AHVLA** (Animal Health and Veterinary Laboratories Agency) was dissolved on 1 October 2014 and replaced by **APHA** — the PDF had been referencing a defunct agency for ~12 years.
- `modules/pdf.mjs` — both the per-carcass and per-consignment declaration bodies now explicitly attest to **(a) no abnormal behaviour before the kill** and **(b) no known environmental contamination** at the kill site, plus cite **Regulation (EC) 853/2004, Annex III, Section IV, Chapter II**. The previous wording covered only the gralloch examination — which is one of three elements the regulation's "trained person" declaration is supposed to cover per the FSA Wild Game Guide. Consignment-page break threshold raised from 110pt to 140pt to keep the now-longer declaration + signature block together.
- `sw.js` — `SW_VERSION` `7.82 → 7.83` so existing installs pull the corrected questions.js and declaration PDFs.
- `betav2/` rebuilt from source via `node scripts/build-betav2.mjs`.

No Supabase changes.

---

## 2026-04-18 — Security: CSV / formula-injection guard on diary exports

Audit flagged `csvField()` as the only launch-blocker: leading `=`, `+`, `-`, `@`, TAB, or CR in any exported cell can be interpreted as a formula by Excel / Sheets / LibreOffice (an attacker who gets any of their own text into a diary export row — notes, ground name, syndicate member display-name, tag number, etc. — could coerce the victim's spreadsheet into evaluating code on open).

- `lib/fl-pure.mjs` — `csvField()` now prepends a literal `'` inside the quoted cell when the raw value begins with any of `= + - @ \t \r`. RFC-4180 quoting, quote-doubling, and CR/LF-squash behaviour unchanged; apostrophe is hidden by spreadsheets on display and only visible in edit mode (OWASP-recommended mitigation).
- `diary.js` — shim `csvField()` near line 4274 patched identically (same contract as `lib/fl-pure.mjs#csvField`; the SPEC comment stays pinned to the library version).
- `tests/fl-pure.test.mjs` — two new cases: (a) leading `=`, `+`, `-`, `@`, TAB, CR all get the `'` guard (with CR-prefixed values still getting their CR squashed after the guard); (b) safe leading chars (letters, digits, space, mid-string `=`, and `"` which stays under RFC-4180 doubling) are unaffected. All **33** tests pass (`node --test tests/fl-pure.test.mjs`).
- `sw.js` — `SW_VERSION` `7.81 → 7.82` so existing clients pick up the patched diary.js.

No Supabase changes, no schema work.

---

## 2026-04-18 — Hosting: `betav2` static deploy bundle

Folder **`betav2/`** holds a copy of everything needed to upload to static web hosting for beta testing (HTML/CSS/JS, `modules/`, `lib/fl-pure.mjs`, `vendor/leaflet/`, manifests, icons, `questions.js`, `sw.js`). Excludes `tests/`, `scripts/` SQL, `exports/`, previews.

- `betav2/README.md` — upload notes (HTTPS, root vs subpath).
- `scripts/build-betav2.mjs` — regenerates `betav2/` from the repo; preserves `betav2/README.md` if present. Run: `node scripts/build-betav2.mjs`.

---

## 2026-04-17 — Deer School: distractors, option shuffle, bank-wide pass

Assessment-design: multiple-choice wrong answers were sometimes far shorter than the correct line (easy to guess by length). **Question stems, correct-option text, `correctIndex`, and explanations** were unchanged except where the **wrong** options were rewritten.

- `questions.js` — hand-tuned **three Legislation** distractors (land permission proof; Deer Act “night”; occupier out-of-season on enclosed land). A later **automated** bank-wide lengthening pass was **reverted**: it had appended generic “identification / textbook” tails to wrong options across Safety, Fieldcraft, etc., producing nonsense (e.g. FMJ described as an “identification answer”). File restored to commit `6b9f834` baseline (clean short distractors; shuffle unchanged in `deerschool.js`).
- `scripts/enhance-deer-distractors.mjs` — repeatable parser; preserves `//` section comments inside `QUESTION_BANK`. **Fix:** species/coat “Identification” tails apply only when `category === "Identification"`; other categories use separate short tails if the script is run again.
- `deerschool.js` — after each quiz session builds its question list, `shuffleQuestionOptions()` randomises the four answers and remaps `correctIndex`. Review-wrong mode still uses the order stored at answer time.
- `sw.js` — cache bumps `7.77 → 7.78` (shuffle + first distractor edits), `7.78 → 7.79` (superseded bank-wide pass), then `7.79 → 7.80` (revert bad tails + script guard).

Tests: `node --test` unchanged (Deer School not covered); manual: Quick Quiz and shuffle/review flows.

- `scripts/export-question-bank.mjs` + `exports/deer-school-question-bank.json` / `exports/deer-school-question-bank.md` — full **330-question** export (stems, four options, `correctIndex`, explanations) for offline editing; regenerate with `node scripts/export-question-bank.mjs`.
- `exports/deer-school-question-bank-improved.json` + `scripts/import-question-bank.mjs` — hand-edited bank merged into `questions.js` (330 items; `//` section comments preserved). Run: `node scripts/import-question-bank.mjs` (optional path to JSON).
- `sw.js` — `SW_VERSION` `7.80 → 7.81` after question-bank merge.

---

## 2026-04-17 — Bugfix pass: profile-save accuracy, password error messaging, calibre field state

Focused bug-hunt follow-up fixing three correctness issues found in `diary.js`.

- `diary.js` — `saveNameEdit()` now inspects the `syndicate_members` update response for `error` (not just thrown exceptions).  
  Before: we could show "Display name updated" even if syndicate display-name sync failed silently.  
  Now: non-schema failures surface as an error message so we don't claim full success while team labels remain stale. We still tolerate missing-schema cases on older deployments.
- `diary.js` — `savePasswordChange()` now distinguishes credential failure vs transport/session failure when re-authing current password:  
  - bad password → "Current password is incorrect."  
  - other auth/network failures → "Could not verify your current password. Check connection and try again."
- `diary.js` — `setCalibreValue()` now keeps the select's `.has-val` class in sync for programmatic set/reset paths (new/edit form opens), so border/background state matches whether a value is present.
- `sw.js` — `SW_VERSION` `7.76 → 7.77` so cached installs receive the bugfixes immediately.

No schema or API contract changes; this is behaviour/UX correctness only.

---

## 2026-04-17 — Main site footer: add feedback mailto link

Small launch-polish follow-up: added a direct email feedback route on the main site footer so users can reach us without entering the diary first.

- `index.html` — support-card footer links now include **Send feedback**:
  - `mailto:firstlightdeer@gmail.com?subject=First%20Light%20feedback`
  - inserted before Privacy/Terms to keep legal links intact while surfacing the action link.
- `sw.js` — `SW_VERSION` `7.75 → 7.76` so cached installs receive the updated footer promptly.

No behaviour or data-model changes; contact UX only.

---

## 2026-04-17 — Form UX: remove calibre chips, switch dropdown popup to light scheme

Quick polish request after visual review of the New Entry form:

- **Calibre chips removed** — user wanted calibre selection to be dropdown-only.
  - `diary.html`: removed the `#cal-presets` chip container from Shot Details.
  - `diary.css`: removed `.cal-presets` / `.cal-preset-chip*` styles.
  - `diary.js`: removed chip wiring and storage logic (`cal-preset-pick` action, recent-calibre localStorage helpers, chip render/pick functions, and save-time preset updates). New/edit flows now only set/read calibre through the existing select/custom field path.
- **Dropdown colour scheme fixed** — popup option rows were rendering as dark-on-dark in Windows.
  - `diary.css`: changed global native `option` styling from dark background to a light scheme (`white` rows with bark text, pale moss selected row), which keeps open dropdown menus readable and visually consistent with the light form controls.
- `sw.js`: `SW_VERSION` `7.74 → 7.75` so existing installs pick up the form/CSS changes immediately.

No behavior change to stored entry data; this is UI/interaction cleanup only.

---

## 2026-04-17 — Settings: self-serve display-name + password changes

User asked whether Cull Diary currently lets someone change their name after signup. It didn't: name was effectively write-once (`auth.user_metadata.full_name` at sign-up) and the settings card only had sign-out / delete actions. We shipped both requested profile actions in-app: **Edit display name** and **Change password**, with explicit confirmation that historical entry shooter text should not be rewritten.

### What changed

- `modules/profile.mjs` (new): pure validators for both flows:
  - `validateDisplayName(raw)` → trims + collapses whitespace, enforces 2–60 chars, allows real-world punctuation (`'` `-` `.`), supports Unicode letters, rejects punctuation-only names.
  - `validatePasswordChange(current, next, confirm)` → non-empty fields, new >= 8 chars (aligned to signup rule), new != current, confirm match.
- `tests/profile.test.mjs` (new): 16 unit tests covering happy paths + failure cases for both validators.
- `diary.html`: in Settings, added a **Profile** card with two rows:
  - Display name row + **Edit** button.
  - Password row + **Change** button.
  Also added two modal dialogs:
  - `#name-edit-modal` (save/cancel, guidance that historical shooter labels are unchanged).
  - `#password-change-modal` (current/new/confirm fields).
- `diary.css`: styles for the new profile card / row / buttons, aligned with the existing settings visual language (white card, compact controls, focus-visible parity).
- `diary.js`:
  - imports validator helpers from `modules/profile.mjs`.
  - updates `onSignedIn()` to populate `#profile-name-value`.
  - adds six action handlers: `open/close/save` for name and password modals.
  - name-save path:
    1) validates with `validateDisplayName`,
    2) `sb.auth.updateUser({ data: { full_name } })`,
    3) best-effort updates `syndicate_members.display_name` for all rows of the current user,
    4) refreshes account/profile UI labels and initials.
  - password-save path:
    1) validates with `validatePasswordChange`,
    2) re-authenticates via `signInWithPassword(email,currentPassword)`,
    3) updates via `sb.auth.updateUser({ password: newPassword })`.
  - Historical cull entry shooter text is intentionally untouched (user confirmed this behavior).
- `sw.js`: `SW_VERSION` `7.73 → 7.74`; pre-cache now includes `./modules/profile.mjs`.

Tests now **230/230 passing**.

---

## 2026-04-17 — Launch-readiness blocker #6: client-side error logger

Closing out the last open item on the pre-launch scorecard. Before shipping to the tight beta group we wanted a way to see what breaks in the wild without setting up a full crash-reporting stack — a single table of recent errors in the Supabase dashboard is plenty for the scale we're at.

### What shipped

- **New SQL:** `scripts/fl-app-errors-table.sql` — creates `public.app_errors` with one row per distinct client error. Columns: `id`, `created_at`, `user_id` (FK to `auth.users`, nullable for anon-auth-screen crashes), `app_version`, `url`, `user_agent`, `source` (`'error' | 'unhandledrejection' | 'manual'`), `message`, `stack`, `lineno`, `colno`, `extra jsonb`. Indexes on `created_at desc` and `user_id`.
- **RLS model:** `enable row level security` on, one policy `app_errors_insert_anyone` that grants **insert** to `anon, authenticated` with `with check (true)`. No SELECT / UPDATE / DELETE policies exist, so the anon key cannot read back what it wrote. Rows are inspected via the Supabase dashboard (service_role). This keeps the table write-only from the client's perspective while still allowing error capture before sign-in.
- **New module:** `modules/error-logger.mjs`. Public API: `installErrorLogger(sb, { appVersion, getUserId })` and `logErrorManually(err, extra)`. Wires `window.addEventListener('error', …)` and `('unhandledrejection', …)`. Dedupes identical errors within a 5-minute window (djb2 hash of `message` + first 200 chars of `stack`) and hard-caps at 25 rows per session. Truncates `message` (500), `stack` (4000), `url` (500), `user_agent` (300) so a single pathological error can't fill the table. Every failure path (auth lookup, `sb.from().insert()`, handler body) is wrapped in `try { … } catch { /* swallow */ }` — the logger must never recurse or be louder than the bug it reports.
- **Tests:** `tests/error-logger.test.mjs` — 15 tests covering listener registration (exactly once, idempotent), error-event capture shape, unhandledrejection with both `Error` and primitive reasons, dedupe (positive + negative), the 25-row session cap, `getUserId` success + throwing paths, `sb.insert` throwing swallowed silently, message/stack/url clipping, `logErrorManually`, no-Supabase no-op, and the `_resetErrorLoggerForTests` hook. Uses `Object.defineProperty` to stomp Node 22's built-in `navigator` / `location` globals since they're non-writable by default.
- **Wiring in `diary.js`:** new import + `FL_APP_VERSION = '7.73'` constant (kept in sync with `sw.js` `SW_VERSION` — documented convention). Install is called from the DOM-ready init path right after `initSupabase()` returns true, inside a `try/catch` so a broken logger can never block boot. `getUserId` closure reads the existing `currentUser` global so rows are attributed whenever the user is signed in.
- **SW:** pre-cache list includes `./modules/error-logger.mjs`; `SW_VERSION` 7.72 → 7.73.
- **Supabase pending:** `SUPABASE-RECORD.md` Pending now lists `fl-app-errors-table.sql` with full run instructions; the Changelog notes the file has shipped as source but the SQL hasn't run yet. I'll tick both off once the user pastes it into SQL Editor.

### Not done

- No in-dashboard "errors this week" panel — not worth building until we have rows to look at.
- No manual `logErrorManually` calls added anywhere yet; that's a per-site decision and we can sprinkle them in if particular code paths need explicit tagging.

Tests now 214/214 (199 previous + 15 new).

---

## 2026-04-17 — Retired launch blocker #5 (beta-gate decision)

Scorecard item #5 was *"decide whether to gate the app behind a waitlist / invite code before letting general signups in"*. With the removal of all beta-language in yesterday's pass, that blocker is largely superseded — the app is already taking the "soft-open, open signup, don't promote" stance implied by that gate. No code change, logging for accuracy so the remaining-work list reflects reality: **#6 error logger was the only outstanding scorecard item**, and it landed in the entry above.

---

## 2026-04-17 — Privacy / Terms: simplify Contact sections to email only

User screenshot of the privacy *Contact & data controller* section prompted: *"should be just the email?"* They're right — the `firstlightdeer.co.uk` line was redundant (it loops back to the same site the policy is hosted on), and anyone exercising a GDPR right or reporting an issue will use the email, not the website.

- `privacy.html` Contact section: dropped the `firstlightdeer.co.uk` line; kept the `firstlightdeer@gmail.com` mailto.
- `terms.html` Section 15 Contact: same — dropped "*· firstlightdeer.co.uk*", kept the email.
- `sw.js`: `SW_VERSION` 7.71 → 7.72.

The `firstlightdeer.co.uk` reference remains in Section 1 of `terms.html` ("*the First Light app … at firstlightdeer.co.uk*") because there it identifies the **scope** of the terms, not a contact route.

Tests still 199/199.

---

## 2026-04-17 — Terms: allow commercial stalking activity (sale of venison, declarations)

User flagged a meaningful licensing gap after reading the new Terms of Use: *"it says that stalkers cannot use the app for commercial purposes, surely a deer manager will be using the records when making commercial transactions by selling venison to dealers and giving larder books/hunter declarations?"*

They're right. The app is designed around exactly those commercial moments — the trained-hunter declaration, consignment-dealer PDF, and larder book are tools used in the sale of venison, and professional deer managers / paid stalkers are a core user group. The previous "*personal, non-commercial*" framing would have made every one of those uses technically off-side.

### What changed

`terms.html`:
- **Summary box**: "*You may use it for personal, non-commercial stalking; you may not redistribute it*" → "*You may use it for your own stalking activity — including any lawful commercial side such as selling venison to game dealers or issuing trained-hunter declarations — but you may not resell access to the app itself or redistribute any part of it*".
- **Section 5 Acceptable use**: the one bullet that said "*lawful purposes related to your own personal or syndicate stalking activity*" now reads "*lawful purposes related to your own stalking activity — recreational, syndicate, or professional*".
- **Section 8 Licence to use the app**: rewritten from a single sentence into a two-part structure. **What's covered**: recreational stalking, syndicate stalking, professional deer management, paid stalking work, and specifically the commercial activities that follow from stalking (venison sales, issuing trained-hunter / consignment declarations, larder records for food-business purposes — "*the PDFs the app generates are designed for exactly this*"). **What's not covered (without permission)**: reselling access to the app, running a hosted version for third parties, using the app as a paid record-keeping service on behalf of other stalkers, or building a product / competing service on the app's code, design, content, question bank, or PDFs.

`privacy.html` Copyright section: "*You may use the app for personal, non-commercial purposes*" → "*You may use the app for your own stalking activity, including the lawful commercial side of it (selling venison to game dealers, issuing declarations, and so on)*". Kept the IP-rights sentence and the pointer at `terms.html`.

`sw.js`: `SW_VERSION` 7.70 → 7.71 to flush the cached pages for existing installs.

### What didn't change

- The phrase "*personal, non-exclusive, non-transferable, revocable licence*" at the top of Section 8 — that's boilerplate describing the **licence form** (granted to the individual user, not held exclusively, not assignable), not a commercial-use restriction. Standard across every software EULA.
- The carcass-destination dropdown option "*Self / personal use*" in `diary.html` 415 and its mention in `diary-guide.html` 338 — that's a UI category for where the meat went (e.g. own freezer vs game dealer), not a licensing statement.

Tests still 199/199.

---

## 2026-04-17 — Remove "beta" language from user-facing copy

User feedback after the Terms of Use commit: "*do not say anything about app being beta, remove references*". All user-visible references to the word *beta* have been stripped:

- `terms.html` summary box: "*It is currently in beta — things may change, break, or be withdrawn*" → "*Features may change or be withdrawn at any time, and you are responsible for the accuracy and legality of the records you keep in it*". Same substantive disclaimer, neutral framing.
- `terms.html` Section 3 heading **"Beta software"** → **"Service availability and changes"**, with lead-in "*First Light is currently in a closed or limited beta*" → "*First Light is an evolving, independently developed service*". The four-bullet list (features may change, bugs possible, features may be removed, don't rely as sole record) is preserved verbatim — it's the legally useful part.
- `diary.html` footer mailto: `subject=Cull%20Diary%20beta%20feedback` → `subject=Cull%20Diary%20feedback`.
- `sw.js`: `SW_VERSION` 7.69 → 7.70 so existing installs pick up the new wording and the new mailto.

Scope note: this only changes **user-facing** copy. `PROJECT-LOG.md` entries above — which refer to the app being in a tight beta group of stalkers — remain as dated-history decision logs and are not rewritten.

Verified: `rg -i beta` across `*.html *.js *.css *.mjs` returns zero matches after the change.

Tests still 199/199.

---

## 2026-04-17 — Launch-readiness blocker #2: Terms of Use page

Fourth launch-readiness blocker shipped — and the last of the pure-content pair. A new `terms.html` now sits alongside `privacy.html` and is linked from every place a user could be expected to look: the **auth consent checkbox** in the diary, the **diary footer** in the Stats/account view, the **marketing site footer** on `index.html`, and the **Copyright** section of the privacy policy. The file is pre-cached by the service worker so it's available offline immediately after the next SW update.

### `terms.html` — contents
15 sections with a short summary box at the top. The tone is "plain-language, UK-law-aware, explicitly a beta app":

1. **About these terms** — names Sohaib Mengal as the operator, points to `firstlightdeer@gmail.com`.
2. **What First Light is (and isn't)** — stalking aid, not legal/veterinary/food-hygiene advice; user-generated declarations (trained hunter, consignment, larder book) record the user's own declaration and are not issued or endorsed by us.
3. **Beta software** — features may change, bugs possible, don't rely on the app as the *sole* record for legal needs; CSV/PDF export is the intended backup path.
4. **Your account** — accurate info, keep password secure, lawful use, notify us of unauthorised access, delete anytime.
5. **Acceptable use** — no unlawful use, no scraping/bulk download, no reverse engineering, no bots, no uploading content that infringes others' rights.
6. **Your content** — user owns their records; we don't use it for training / ads / resale; syndicate sharing is explicitly called out.
7. **Syndicate tools** — only invite people you have the right to share with; manager responsibilities; members-must-be-told-of-sharing.
8. **Licence to use the app** — personal, non-exclusive, non-transferable, revocable; no resale / sublicence without permission; points at the privacy policy's copyright line.
9. **Third-party services** — depends on Supabase/Mapbox/OS/etc.; users accept those providers' own terms; list maintained in the privacy policy.
10. **No warranty** — "as is / as available"; no guarantee of accuracy for shooting times, weather, map tiles, species data, quiz answers, statistics, or generated documents.
11. **Limitation of liability** — excludes indirect/consequential loss; reliance-on-information loss; third-party-service loss. Explicitly preserves non-excludable UK liabilities (death/personal injury, fraud).
12. **Suspension and termination** — we can suspend/terminate; user can stop and delete any time.
13. **Changes to these terms** — material changes flagged in the app's *What's new* notes; continued use = acceptance.
14. **Governing law** — England and Wales; preserves consumer mandatory local-law protections for other UK nations.
15. **Contact** — `firstlightdeer@gmail.com` + `firstlightdeer.co.uk`.

Styling re-uses the `privacy.html` design system (same inline CSS block — dark background, gold-accented h2, ✓-bulleted lists). The summary-box is tinted gold rather than green to visually distinguish it from the privacy policy's cheerful "we store nothing" green.

### Wiring

- `diary.html` 48 (**auth consent**): "*I agree to the Privacy Policy*" → "*I agree to the Privacy Policy and Terms of Use*". Both links open in a new tab.
- `diary.html` 680–684 (**diary footer**): new "*Terms of Use*" link between *Privacy Policy* and *← First Light*, with the existing `diary-footer-sep` separator style.
- `index.html` 2739–2742 (**marketing footer**): new "*Terms of Use*" link between *Privacy Policy* and *Cull Diary*.
- `privacy.html` Copyright section: existing "personal, non-commercial purposes" paragraph now ends with "*the full licence and acceptable-use terms are in the Terms of Use*".
- `sw.js` 37–38: `terms.html` added to the `STATIC_CACHE` pre-cache list alongside `privacy.html`. `SW_VERSION` 7.68 → 7.69 so existing installs pick up the new auth-consent wording, the new footer link, and the new file.

### Deliberate choices

- **Two documents, not one.** The privacy policy remains data-focused; the Terms remain licence/use-focused. They cross-link where a user might want the other. Easier to maintain, easier to read.
- **No click-to-accept dialog.** The existing auth-consent checkbox is kept as the single "*I agree*" surface — adding a modal would slow down sign-up for no material gain in a tight beta. The consent is now explicitly for both documents.
- **No separate `deerschool.html` footer link**. Deer School is currently auth-less and its footer already lives inside `deerschool.html`; a follow-up pass can add Terms/Privacy links there if we decide to require them pre-launch (low priority — no user content is created in Deer School).
- **Regulation (EC) 853/2004** already named in the trained-hunter declaration PDF; deliberately *not* repeated verbatim in the Terms to avoid implying endorsement — we point at it in the "What First Light is (and isn't)" context instead.

### Launch-readiness progress
**4 / 6 blockers shipped** (#1 feedback link, #2 Terms of Use, #3 privacy refresh, #4 FAB aria-label). Still open: **#5** beta-gate decision, **#6** lightweight error logger.

Tests still 199/199; no JS module code touched.

---

## 2026-04-17 — Launch-readiness blocker #3: privacy policy third-party refresh

Third of the six launch blockers from the scorecard. `privacy.html` was last meaningfully updated before the diary grew its current map stack (Mapbox / OS / Esri / OSM tiles) and the time-zone fallback chain (timeapi.io / worldtimeapi.org), so the policy's third-party list was out of sync with the diary CSP (`diary.html` L5). It also had no named data controller, no data-retention statement, and no structured list of UK GDPR rights. All of that is now fixed in one pass; no code changes.

### Changes to `privacy.html`

- **Last-updated** date: *April 2026* → **17 April 2026** (explicit, for this refresh).
- **Your location** section: removed the single-paragraph "Nominatim only" claim and replaced with the accurate picture — Nominatim + Open-Meteo are the two anonymous external calls for core-app location, and a new paragraph explains that Cull Diary map-pin coordinates are stored with the entry in Supabase and tiles come from the providers listed below.
- **Third-party services** section: restructured into three bands — *used by all features* (Google Fonts, jsDelivr/cdnjs CDNs), *used by the core app* (Open-Meteo, Nominatim, timeapi.io / worldtimeapi.org), and *used by the Cull Diary only* (Supabase, Mapbox, Ordnance Survey, Esri/ArcGIS, OpenStreetMap tiles). Each entry links out to the provider's own privacy policy and, where relevant, names the hostname (`events.mapbox.com`, `api.os.uk`, `server.arcgisonline.com`, `tile.openstreetmap.org`) so a power-user can match the listing against what they see in DevTools or a CSP report.
- **Data storage** section: added one sentence on the offline IndexedDB queue (it previously wasn't mentioned despite being a real on-device data store).
- **New "Data retention" section**: states explicitly that entry / photo / account deletion is immediate and server-side (the existing `deleteAccount()` → `delete_user` RPC flow in `diary.js` 3833–3894), with a caveat about Supabase's own backup-retention window.
- **"UK GDPR" section renamed to "Your rights under UK GDPR"**: now lists the seven rights as a bullet list — access, rectification, erasure, portability, restrict/object, complain to ICO — with a direct link to `ico.org.uk/make-a-complaint`. Portability line notes that CSV + PDF export exists today and a full-JSON export is planned (scorecard item #8).
- **Contact section** renamed to **Contact &amp; data controller**: names the data controller (*Sohaib Mengal, operating from the United Kingdom*) and adds `firstlightdeer@gmail.com` as a clickable `mailto:` alongside the existing site link.

Final heading flow: What we collect · Your location · Third-party services · Data storage · Data retention · Your rights under UK GDPR · Children · Changes · Copyright &amp; Ownership · Contact &amp; data controller.

### Other files
- `sw.js`: `SW_VERSION` 7.67 → 7.68 (needed because `privacy.html` is in the `STATIC_CACHE` pre-cache list at `sw.js` 37 — without a bump, existing installs would keep serving the old wording).

### Launch-readiness progress
3 / 6 blockers shipped (#1 feedback link, #3 privacy refresh, #4 FAB aria-label). Still open: **#2** Terms of Use page, **#5** beta-gate decision, **#6** lightweight error logger.

Tests still 199/199; no module code touched.

---

## 2026-04-17 — Launch-readiness blockers #1 + #4: feedback mailto + FAB aria-label

First pass at the launch-readiness blocker list from the scorecard below. Two of the six blockers fit in a single `diary.html` change:

- **Blocker #1 — in-app feedback channel.** Added a "*Send feedback*" link to the diary footer (`diary.html` 677–685) pointing at `mailto:firstlightdeer@gmail.com?subject=Cull%20Diary%20beta%20feedback`. Uses the same footer link styling as Diary Guide / Privacy Policy, with a small envelope SVG. Beta testers now have a one-tap path to report problems; the pre-filled subject makes triage easier.
- **Blocker #4 — FAB a11y.** Added `aria-label="New entry"` to the primary `+` FAB at `diary.html` 155. Screen readers previously announced it as "plus, button" with no context.

### Changes
- `diary.html` — one new footer link, one aria-label attribute (~2 lines net).
- `sw.js` — `SW_VERSION` 7.66 → 7.67 so existing installs pick up the new markup.

### Not done in this pass
- Auth-screen (`v-auth`) does not yet carry the feedback link — keeping the auth surface minimal for now. If beta testers surface sign-up issues it can be added there with a `mailto:` tweak.
- No mailto prefill of app version / SW version in the body. Can add later if triage needs it.

### Remaining launch blockers (from the scorecard)
2. Minimal Terms of Use page.
3. Privacy policy third-party refresh (Mapbox, OS, Esri/ArcGIS, timeapi.io, worldtimeapi.org) + retention line.
5. Beta-gate decision (recommendation: keep open registration, don't promote URL).
6. Lightweight error logger (`window.onerror` + `unhandledrejection` → Supabase `app_errors` table).

Tests still 199/199; no module code touched.

---

## 2026-04-17 — Launch-readiness scorecard (pre-beta)

Triggered by: "*Would you advise conducting a comprehensive audit…?*" → re-scoped to **launch-readiness review** given the app is not yet public. First users are "*a tight beta group of stalkers*" and the ship date is "*when ready*". This is a decision-log entry, not a code change — no SW bump.

The scorecard covers what's actually in the repo (see file:line evidence below) across five areas: **Code & technical**, **Product & feature completeness**, **Content**, **UX & design**, **Launch ops**. Grades are relative to "*ship to a private beta of ~5–20 stalkers you know*" — not to a public app store launch.

Grade key: **A** fine to ship · **B** fine to ship, worth revisiting post-beta · **C** ship with a known caveat · **D** fix before opening the beta · **F** fix before *anyone* uses it.

### Scorecard (18 items)

#### Code & technical
| # | Item | Grade | Evidence / note |
|---|------|:---:|---|
| 1 | **Test coverage** — unit tests on the hard-to-eyeball maths | **A** | 199/199 green; `lib/fl-pure.mjs` + `modules/{pdf,stats,weather}.mjs` test suites catch the classes of bug that used to surface weeks late in screenshots. |
| 2 | **Modularisation / code health** | **A** | Closed as of the next section below — `diary.js` at 8,000 LOC with the calculation-heavy ~1,300 lines factored out. |
| 3 | **Service-worker update flow** | **A** | `sw.js` 164 (`skipWaiting`), 177 (`clients.claim`); Diary shows a "*New version available*" bar via `modules/sw-bridge.mjs` 31–66, 103–119; index.html shows an equivalent toast via `app.js` 3392–3409. Cache is bumped per change. |
| 4 | **Error reporting / crash visibility** | **F** | Nothing. No Sentry, no `window.onerror` handler, no uncaught-promise logger. In a beta you *will* get "it just didn't work" reports with no reproduction path. |
| 5 | **Client-side abuse / rate-limit posture** | **C** | CSP on `diary.html` L5 + `index.html` L5 is tight (no inline scripts, locked connect-src). Nominatim uses an `AbortController` timeout (`diary.js` 3246–3251). No client throttling on auth or entry save — low risk in a tight beta, worth revisiting pre-public. **`privacy.html` and `deerschool.html` have no CSP meta** — minor; they're public-read static pages, but adding a matching CSP is cheap. |

#### Product & feature completeness
| # | Item | Grade | Evidence / note |
|---|------|:---:|---|
| 6 | **Core stalker workflow** — entry → list → stats → PDFs → larder | **A** | Full entry form (`diary.html` 170–452), Stats + Map + Plan (472–606), CSV / PDF / season-summary / larder-book / trained-hunter / consignment-dealer exports (632–643 + `modules/pdf.mjs`). This is the product; it's strong. |
| 7 | **Syndicate / team features** | **A** | Invites, manager exports (team CSV, team PDF, team summary, team larder), RPCs all shipped and drift-clear (`SUPABASE-RECORD.md` 45–49). |
| 8 | **Data portability** — backup / export / import | **C** | CSV export works (`diary.js` `exportCSVData` ~4098). **No full-JSON backup**, **no CSV import**. For a beta where users might clear data or switch accounts, a "*Download all my data (JSON)*" button is a 30-min add and worth it. |
| 9 | **Beta gate / invite system** | **D** | Sign-up is open email + password (`diary.html` 36–52). No invite code, allow-list, or "*closed beta, email us for access*" screen. If the intent is "*tight beta group*" you want **one** of: (a) a known-emails allow-list, (b) a shared invite code, or (c) just don't link the diary URL from the public site until ready. Currently the diary link on `index.html` is live (2738–2745). |

#### Content
| # | Item | Grade | Evidence / note |
|---|------|:---:|---|
| 10 | **Marketing home (`index.html`)** | **B** | Rich: hero, species, legal times, calendar, field guide, org cards (BDS/BASC), install cards, changelog modal, first-launch legal modal. **Missing**: FAQ, screenshots in `manifest.json` (empty — `manifest.json` 18), stalker-facing testimonial/"who it's for" copy. OK for beta; worth filling before public. |
| 11 | **User guide (`diary-guide.html`)** | **A** | ~13 numbered sections covering account, views, entry form, quick entry, editing, seasons/grounds, targets/plan, stats, map, exports, offline, privacy, syndicates (headings 183–564). Genuinely comprehensive. Only miss: no mention of Mapbox/OS tiles in the privacy sub-step, but that's really a `privacy.html` issue. |
| 12 | **Privacy policy (`privacy.html`)** | **C** | Names Open-Meteo, Nominatim, Google Fonts, Supabase (233–251). **Does not name**: Mapbox, Ordnance Survey (`api.os.uk`), Esri/ArcGIS (`server.arcgisonline.com`), timeapi.io / worldtimeapi.org — all present in the diary CSP (`diary.html` L5). Also missing: named **data controller** / contact address (currently just "*reach out via support link*", 287–290), structured **data-subject rights** (access, erasure, portability, ICO complaint), explicit **retention period** for account data. For a UK private beta this is borderline fine; for public launch it needs tightening. |
| 13 | **Terms of Use / EULA** | **F** | **Absent.** No `terms.html`, no disclaimer page, no "by signing up you agree to…" link. For a beta app that produces legally-adjacent documents (trained-hunter declaration, consignment-dealer PDF, larder book) you want a short page covering: personal-use licence, no-warranty / beta notice, user is responsible for the accuracy of their records, you can revoke accounts, UK law. 1–2 hours of copy. |

#### UX & design
| # | Item | Grade | Evidence / note |
|---|------|:---:|---|
| 14 | **First-run / empty state** | **B** | Illustrated empty state + copy + guide link (`diary.html` 132–152). No in-app tour, no "*create your first entry*" coach-mark, no sample data. Fine for beta stalkers (they're motivated); worth a 15-minute dismissible callout before wider launch. |
| 15 | **Accessibility** | **B** | Most icon buttons have `aria-label` (`diary.html` 102–117, 481, 514); reduced-motion respected in skeleton CSS (`diary.css` 323–325). **Notable gap**: the primary **`+` FAB** at `diary.html` 155 has no `aria-label` (`<button class="fab" …>+</button>`) — one-line fix. The sort button (121) relies on `title=` only. |
| 16 | **Loading / error states** | **A** | List skeleton + stats loading overlay (`diary.css` 791–815 wired in `diary.js` 1429–1475), offline banner (`diary.html` 124–131), per-action toasts. Good for a PWA that expects patchy signal. |
| 17 | **PWA install UX** | **A** | Main site has full iOS Safari + Android Chrome install instructions (`index.html` 2661–2717). Both manifests have 152/180/192/512 icons (192/512 maskable). Only nit: `manifest.json.screenshots: []` and no `apple-touch-startup-image` splash. |

#### Launch ops
| # | Item | Grade | Evidence / note |
|---|------|:---:|---|
| 18 | **In-app feedback channel** | **F** | Nothing in the diary footer (`diary.html` 677–682) or anywhere else. Support paths are "Buy me a coffee" and `firstlightdeer.co.uk` on the marketing site. **For a private beta this is the single most important miss** — without it testers either email random addresses or don't report at all. A `mailto:` link labelled "*Report a bug / send feedback*" in the diary footer is a ~5-minute fix. |
| 19 | **Analytics / cookie posture** | **A** | Honestly none, and the privacy policy (`privacy.html` 206–208) accurately states that. No cookie banner is needed because nothing non-essential is set. This is a feature, not a gap — keep it. |
| 20 | **Supabase RLS / security snapshot freshness** | **A** | `supabase-audit-rls-snapshot.json._meta.captured` = **2026-04-12**, well under the 75-day weekly-CI staleness window. `SUPABASE-RECORD.md` 77–79 shows all **Pending** items closed. No service-role keys in client code (`modules/supabase.mjs` 36–37 uses the anon key, as intended). |

### Launch-blocker list (do before opening the beta URL to anyone)

In priority order, with rough effort:

1. **In-app feedback link** (item 18). `mailto:firstlight@…?subject=Cull+Diary+beta+feedback` on the auth footer and the diary footer. ~10 minutes. Single most important item on this list.
2. **Minimal Terms of Use** page (item 13). `terms.html` with: personal-use licence, no-warranty / beta disclaimer, user is responsible for record accuracy, you can revoke accounts, UK law + contact. Link from the auth-screen consent text ("*I agree to the Privacy Policy and Terms*") and from `diary.html` 677–682. ~1–2 hours.
3. **Privacy policy third-party refresh** (item 12). Add Mapbox, Ordnance Survey, Esri/ArcGIS, timeapi.io/worldtimeapi.org sections; add a retention / "*data deleted immediately on account deletion*" line (the delete flow already does this — `diary.js` 3833–3894). ~30 minutes of copy.
4. **`+` FAB aria-label** (item 15). `aria-label="New entry"` on `diary.html` 155. Literal 1-line fix.
5. **Beta gate decision** (item 9). Either (a) keep the diary link but accept anyone who signs up, and just trust that nobody will find it yet (fine if the URL isn't promoted), or (b) add a server-side allow-list via an RLS policy on `cull_entries` / `auth.users` metadata. Recommend **(a)** — simplest; revisit if the URL gets traction. Document the decision either way.
6. **Lightweight error logger** (item 4). Cheapest path: `window.addEventListener('error', e => …)` + `addEventListener('unhandledrejection', …)` that POSTs `{message, stack, url, userId, appVersion}` to a new `app_errors` Supabase table with an insert-only RLS policy. ~1–2 hours. Makes beta feedback 10× more actionable.

Total effort for blockers 1–6: **~1 half-day of work.**

### Launch polish (worth before wider / public launch, not before beta)

- **JSON export** of a user's full diary (item 8) — "Download my data" page for GDPR portability and user peace-of-mind.
- **CSV import** / "paste rows to add" (item 8) — so a stalker with an existing spreadsheet can migrate in.
- Marketing homepage (item 10): add FAQ, a screenshots row, populate `manifest.json.screenshots` for the Android install prompt, add short "*Who this is for*" block.
- First-run coach-mark / sample entry (item 14).
- Accessibility sweep: add `aria-label` to every icon-only button (not just the FAB); verify tap targets ≥44px; check focus-visible rings.
- Tighter privacy policy: named data controller + address, explicit data-subject rights, explicit retention periods, ICO complaint pathway (item 12).
- Add CSP meta to `privacy.html` and `deerschool.html` (item 5).
- Syndicate invite-only **registration** gate if you want a harder closed beta (item 9, option (b)).

### Explicitly *not* doing now

- **Analytics / telemetry.** Aligns with the privacy pitch; keep it off.
- **Cookie banner.** Not needed — nothing non-essential is set. Privacy policy already states this.
- **Paid tier / billing.** Out of scope; the ask is free for stalkers.
- **Further modularisation of `diary.js`.** Decided separately below.
- **Admin / reports dashboard** for the developer side.
- **Push notifications.** Not a stalker-workflow need; PWAs on iOS are only just gaining solid support anyway.

### First recommended step

Item **18** (`mailto:` feedback link) — it's the highest-value, lowest-effort change on the board and it makes every subsequent beta report actionable. Pair it with item **15** (FAB aria-label) in the same small commit since they're both `diary.html` one-liners.

---



Declaring victory on the `diary.js` modularisation work and closing the P3 code-quality item it was tracking. The three highest-leverage modules are shipped, unit-tested, and on `main`:

- **`lib/fl-pure.mjs`** — pure helpers (season maths, CSV quoting, date parsing).
- **`modules/pdf.mjs`** — all jsPDF renderers + shared design primitives (Commits H–L).
- **`modules/stats.mjs`** — KPI maths + stats-tab rendering (Commits H, M, N, O).
- Plus: `modules/photos.mjs`, `modules/weather.mjs`, already previously extracted.

Combined test payoff: ~300 unit tests across these modules now run on every `npm test`, catching regressions in the exact kind of calculation-heavy code (PDF layout maths, age bucketising, distance-band sums, season summary aggregation) where bugs used to surface only as ugly screenshots weeks later.

### What we deliberately are NOT extracting

The remaining Tier 2–3 modules from `MODULARISATION-PLAN.md` (`data.mjs`, `map.mjs`, `list.mjs`, `auth.mjs`, `offline.mjs`, `syndicate.mjs`) would be an aesthetic tidy rather than an engineering win:

- **`data.mjs`** would hit the same ~15-slot dependency-injection problem we dodged in Commit O. The code is mostly "call Supabase, handle errors" — unit tests would mock the client, not validate real behaviour. Manual E2E-style testing (which you already do on every release) catches more than unit tests would here.
- **`map.mjs`** is Leaflet globals + tile-URL constants + fullscreen DOM choreography. Rare changes, low defect rate, extraction cost > benefit.
- **`list.mjs`** is DOM-heavy but algorithmically simple. The only parts with real logic (filter / search / sort) are small.
- **`auth.mjs` / `offline.mjs` / `syndicate.mjs`** are orchestration around Supabase / IndexedDB. Same argument as `data.mjs`.

### If priorities change

`MODULARISATION-PLAN.md` is kept as-is — it's still a good roadmap if the situation changes: a second developer joining, `data.mjs` starting to accumulate real bugs, or the app growing a feature that genuinely needs a cleaner module boundary. The decision to stop is a local-maximum call, not a permanent close.

### Where the modularisation pass finished

- `diary.js`: ~9,300 lines (plan-doc baseline) → **8,000 lines** (−1,300, ~14%).
- `modules/*.mjs`: 8 modules, **3,611 lines total** (`pdf.mjs` 1,903 · `stats.mjs` 843 · `weather.mjs` 198 · `photos.mjs` 174 · `clock.mjs` 152 · `svg-icons.mjs` 143 · `sw-bridge.mjs` 125 · `supabase.mjs` 73).
- Tests: the pre-existing fl-pure suite grew alongside the new module tests to **199 total** in `npm test`.

The line-count delta under-sells the refactor's value: the 1,300 lines that left `diary.js` are overwhelmingly the calculation-heavy / hard-to-eyeball ones (PDF layout, stats maths, season-summary aggregation). The 6,700 lines that remain are mostly DOM wiring, event handlers, and orchestration glue — simpler code that reads fine in one file.

No code changed in this entry; it's a decision log. No SW bump.

---

## 2026-04-17 — Phase 2 / Commit O: Stats-tab body renderer → `modules/stats.mjs`

Third and final stats-side extraction. The pure render half of `buildStats` — top KPIs, weight grid, species+sex chart, sex chart, fan-out to the seven sub-cards, and the seasonal-month chart — now lives in `modules/stats.mjs` as `renderStatsTabBody(entries, opts)`. The orchestration half (map init, season-pill sync, plan-card visibility, targets async chain, season date label, state flag writes) stays in diary.js — it needs live access to ~10 diary-side globals/functions and there's no clean way to move it without importing most of diary.js into the module.

### Why this split rather than moving `buildStats` wholesale
A literal move would need ~15 dependency-injection slots (`initCullMap`, `renderCullMapPins`, `loadTargets`, `loadGroundTargets`, `loadPrevTargets`, `renderPlanGroundFilter`, `renderPlanCard`, `refreshSeasonTargetKpi`, `renderSyndicateSection`, `updateSyndicateExportVisibility`, `seasonDates`, `allEntries`, `cullMap`, `statsNeedsFullRebuild`, `statsLastBuildSize`). That's 169 lines of logic for 169+ lines of DI plumbing — no net win. Splitting the function at the natural boundary (orchestration vs. rendering) gives the module the part that genuinely belongs there while leaving the side-effectful glue in diary.js. The plan doc already flagged this tier as "views" — diary.js's `buildStats` is now a thin view wrapper.

### What moved
- `renderStatsTabBody(entries, opts)` — exported from `modules/stats.mjs`.
  - `opts.currentSeason` — threaded into `buildTrendsChart`.
  - `opts.computeSeasonTargetKpi(total)` — DI (reads diary-side `cullTargets`).
  - `opts.formatSeasonTargetSub(total, calc)` — DI.
  - `opts.hasValue(v)` — DI (shared 3-line helper).
  - `opts.statsChartEmpty(msg)` — DI (renders the "No data" placeholder).
  - `esc`, `seasonLabel`, `buildSeasonFromEntry`, `MONTH_NAMES` — imported from `lib/fl-pure.mjs` directly; no DI needed.

### Changes
- `modules/stats.mjs` (+158 lines → now 820 lines; 19 exports total). Header comment updated to describe the Commit O addition and the explicit list of concerns that are deliberately NOT in the function.
- `diary.js`: `buildStats(speciesFilter)` shrinks **169 → 71 lines** (−98, ~58%). The remaining body is exactly the orchestration: map init, season-pill sync, plan-card visibility, async targets chain, season date label, entries filter, delegate to `renderStatsTabBody`, state flag writes. Import block gets `renderStatsTabBody` added.
- `tests/stats.test.mjs` (+10 tests, 65 total): covers top KPIs + DI target-pct fallback, weight grid (total/avg/heaviest/missing), species chart sort desc + sex sub-rows, species chart empty-fallback via DI, sex chart always renders both rows, monthly chart 12 columns in Aug→Jul order + peak `.pk` accent, fan-out to all seven sub-builders (assertion: every sub-card style.display was touched), top-KPI null-safety when KPI ids are missing, `opts.currentSeason` actually reaches `buildTrendsChart`.
- `sw.js`: SW_VERSION 7.65 → 7.66.

### Tests
199/199 green across the whole suite. `stats.test.mjs` alone: 65 tests (was 55; +10 new). No lint errors.

### Phase-2-stats progress
3/3 — **Commit O shipped; phase complete.** Full branch arc `M → N → O`: +~550 lines in `modules/stats.mjs`, −~470 lines in `diary.js`, +43 new tests (22 → 65). `feat/modularise-phase-2-stats` ready for push + fast-forward merge into main.

---

## 2026-04-17 — Phase 2 / Commit N: age / calibre+distance / trends / ground paint wrappers → `modules/stats.mjs`

Second stats-side extraction. The four larger DOM paint wrappers from the Stats tab's "More" section now live in the stats module alongside the small wrappers from Commit M. Also moves the tiny legacy-label helper (`normalizeAgeClassLabel`) since it's effectively a member of the age-class family.

### What moved
- `buildCalibreDistanceStats(entries)` — renders two cards in one function (calibre top-6 + distance overall-avg / per-species / bands).
- `buildAgeStats(entries)` — renders per-age-class bars, J/A/M summary pills, optional "By species" mini-breakdown. Uses `normalizeAgeClassLabel` internally to fold legacy "Calf / Kid" entries into the canonical "Calf / Kid / Fawn" bucket.
- `buildTrendsChart(entries, { currentSeason })` — only renders when currentSeason === '__all__' and ≥2 seasons of data are present; otherwise hides. **New signature** — `currentSeason` is now a dependency-injected opts arg rather than a closure over the diary.js global (the module reads zero diary.js state). One diary.js call site updated to pass it explicitly.
- `buildGroundStats(entries)` — one row per tagged ground sorted by count desc, untagged entries rendered grey at the bottom.
- `normalizeAgeClassLabel(label)` — pure 2-line helper.

### Changes
- `modules/stats.mjs` (+296 lines → now 660 lines): 5 new exports (total 18). Imports `esc`, `seasonLabel`, `buildSeasonFromEntry` from `lib/fl-pure.mjs`. Header comment updated to reflect the Commit N additions and the DI signature on trends.
- `diary.js` (~300 lines removed): four `function build*Stats` + `function normalizeAgeClassLabel` bodies deleted; 5 new names added to the existing stats.mjs import block. Call sites at L~3868 unchanged except `buildTrendsChart(entries)` → `buildTrendsChart(entries, { currentSeason: currentSeason })`. The other existing call site (`document.getElementById('f-age').value = normalizeAgeClassLabel(...)` at L~2940) now resolves via the new import. Two orphan section-header comments folded into breadcrumb comments pointing at the module.
- `tests/stats.test.mjs` (+22 tests, 55 total): covers `normalizeAgeClassLabel` (legacy widening, canonical passthrough, null / empty / unknown), `buildCalibreDistanceStats` (hide empty, top-6 slice + desc sort, per-calibre avg, overall-avg + bands, per-species section visibility), `buildAgeStats` (hide empty, canonical-order rows, legacy label bucketising, pills + not-recorded, by-species visibility rules), `buildTrendsChart` (hide per-season, hide <2 seasons, 5-row cap + weight fallback), `buildGroundStats` (missing-element early-return, all-untagged hide, sort + palette, untagged row ordering, XSS escape).
- `sw.js`: SW_VERSION 7.64 → 7.65.

### Tests
189/189 green across the whole suite. `stats.test.mjs` alone: 55 tests (was 33; +22 new). No lint errors.

### Phase-2-stats progress
2/3 — **Commit N shipped.** Only `buildStats` orchestrator (~169 lines at L~3721) remains. Branch `feat/modularise-phase-2-stats` still local; push happens after Commit O.

---

## 2026-04-16 — Phase 2 / Commit M: shooter / destination / time-of-day paint wrappers → `modules/stats.mjs`

First of three stats-side commits in the new `feat/modularise-phase-2-stats` branch. The three smallest DOM paint wrappers from the Stats tab's "More" section are now in the stats module alongside their aggregators (which were extracted back in Commit H). The bodies used to live at ~L6237 in `diary.js`.

### Why these three first
They were already aggregator-backed — each one called `aggregateShooterStats` / `aggregateDestinationStats` / `aggregateTimeOfDayStats` and did nothing but iterate the result into HTML. Moving them is a mechanical lift with no cross-references to extract: the only diary.js dep was `esc` (already in `lib/fl-pure.mjs`). They establish the pattern for the larger wrappers (`buildAgeStats`, `buildCalibreDistanceStats`, `buildTrendsChart`, `buildGroundStats`) queued for Commit N.

### Changes
- `modules/stats.mjs` (+107 lines): `buildShooterStats`, `buildDestinationStats`, `buildTimeOfDayStats` exported; now imports `esc` from `lib/fl-pure.mjs`. Header comment updated to reflect the new DOM-paint section (purity guarantee now confined to the data tables + aggregators).
- `diary.js` (−77 lines): three `function build*Stats(entries)` definitions removed; replaced with a 3-line breadcrumb comment pointing at the module. The three names added to the existing stats.mjs import block. Call sites at L~3865 are unchanged.
- `tests/stats.test.mjs` (+11 tests, 33 total): tiny in-memory DOM stub (`installDomStub(ids) → { getElementById, els, restore }`) covers the all-Self hide branch, bar-row rendering, HTML escaping of shooter names, destination palette + fallback for unknown destinations, and zero-bucket skipping on the time card.
- `sw.js`: SW_VERSION 7.63 → 7.64.

### Tests
167/167 green across the whole suite. `stats.test.mjs` alone: 33 tests (was 22; +11 new). No lint errors.

### Phase-2-stats progress
1/3 — **Commit M shipped.** Commit N will move the four larger paint wrappers (age / calibre-distance / trends / ground, ~296 lines); Commit O will move the `buildStats` orchestrator (~169 lines). Branch: `feat/modularise-phase-2-stats`.

---

## 2026-04-16 — Phase 2 / Commit L: Season Summary builders moved into `modules/pdf.mjs`

Final chunk of the Phase-2 PDF modularisation. Both remaining renderers — `exportSeasonSummary` (378 lines, A4 landscape, 13-column entries table) and `exportSyndicateSeasonSummaryPdf` (295 lines, A4 portrait, 4-column entries table) — now live as `buildSeasonSummaryPDF` / `buildSyndicateSeasonSummaryPDF` in `modules/pdf.mjs`. The diary.js wrappers shrank from 673 lines total to ~30 and just forward the globals (`allEntries`, `currentSeason`, `cullTargets`, `PLAN_SPECIES`, `planSpeciesMeta`, `diaryNow()`) plus the `window._summarySeasonLabel` / `window._summaryGroundOverride` UI state the old renderer consulted via closure.

### Deduplication wins
Both old renderers had their own inline copies of the palette object (`C.deep`, `C.gold`, …), `rgb`/`setFill`/`setStroke`/`setFont` helpers, and a bespoke `secHdr` + `newPageIfNeeded`. New builders consume `PDF_PALETTE` + the shared `setPdfFill` / `setPdfStroke` / `setPdfText` / `drawRichHeaderBand` primitives — ~60 lines of boilerplate gone per builder. Header bands now match the rest of the rich family visually (same duotone, same gold eyebrow spacing).

### Filename contract preserved
- Season Summary: `first-light-season-<code>.pdf` (current season), `first-light-all-seasons.pdf` (label override), `…-<slugged-ground>.pdf` appended when a single ground is selected. `"All Grounds"` does not append a suffix. *Locked by 4 tests.*
- Syndicate summary: `syndicate-<slug>-summary-<code>.pdf`. Safe-slug fallback when the syndicate name is missing. *Locked by a test.*

### Tests (+10 new, 69 total in pdf.test.mjs, 158 in the full suite)
Extended `FakeDoc` with `circle` / `roundedRect` / `internal.getNumberOfPages` (the Season Summary footer loop uses the legacy `doc.internal.getNumberOfPages()` path) and fixed the constructor to read `{orientation}` from the options object instead of treating the first arg as a raw string. New tests cover: empty-guard, filename for season / all-seasons / ground / "All Grounds" / syndicate slug, Cull Plan section suppressed for "All Seasons", Cull Plan progress bar (`2/5`, `1/4`) rendered when targets exist, "No culls recorded" fallback for empty syndicate summaries, and null-syndicate-name safety.

Files: `diary.js` (two thin wrappers + one extra import), `modules/pdf.mjs` (two new builders at the tail), `tests/pdf.test.mjs` (FakeDoc extension + 10 new tests), `sw.js` v7.63.

### What's left in the modularisation plan
Only the remaining stats builders in diary.js — the age, calibre/distance, trends, and ground breakdowns (~800 lines across ~4 smaller commits). PDF side is complete for Phase 2.

---

## 2026-04-16 — Trained Hunter Declaration: declaration body now wraps to page

Smoke test flagged the declaration line `"I, the undersigned trained hunter, declare that I have examined this carcass and"` overflowing past the right margin before breaking. Root cause: three hard-coded `doc.text(..., 20, y)` calls with pre-chosen break points, and the first line was ~200mm wide at 10pt on a 210mm page (182mm usable after 14mm margins) — it simply didn't fit. Fixed by joining the three lines into one sentence and running it through `doc.splitTextToSize(text, pageW - 40)`, matching the pattern already used in the Consignment Declaration. File: `modules/pdf.mjs` → `buildGameDealerDeclarationPDF`. `sw.js` v7.62.

---

## 2026-04-16 — PDF design system: Stage 2 (rich) + Stage 3 (professional) propagation

User confirmed calibration: *"some colour in professional but not overly colourful"*. Then **go ahead** — propagated the new design language across five more PDFs in one pass.

### Scale-aware helpers
Both `drawRichHeaderBand` and `drawProfessionalHeader` (plus `drawPdfFooter` and `drawSignatureBlock`) now accept an optional `{ scale }` so a single implementation serves both **mm-unit** docs (jspdf default: Simple Diary, Single Entry, Solo Larder, Team Larder, Trained Hunter Declaration) and **pt-unit** docs (Consignment Declaration, Season Summary). `scale = 25.4/72 ≈ 0.353` for the rich helper on mm docs, `scale = 72/25.4 ≈ 2.83` for the professional helper + footer + signature on the pt-unit consignment doc. Font sizes are left unscaled — jspdf measures those in points regardless of doc unit.

### Stage 3 — Professional family (restrained colour)
All four now use `drawProfessionalHeader`: thin 4pt moss rule across the top edge, gold `FIRST LIGHT · CULL DIARY` eyebrow, black title, grey subtitle / scope. No fills, no zebra, no coloured column headers.
- **Team Larder Book** — already done in the reference pass.
- **Solo Larder Book** — replaced bespoke `setFontSize(16)` title + grey subtitle with the shared helper; added totals bar (thin-ruled frame, no fill), shared `drawSignatureBlock` (was typewriter underscores), shared `drawPdfFooter` (was a single centred `Produced by…` line, now with `Page N of M`).
- **Trained Hunter Declaration (per-carcass)** — swapped the centred 18pt title + horizontal rule for the shared professional header; replaced typewriter signature line with `drawSignatureBlock`; added `drawPdfFooter`. Subtitle now names the regulation (`Regulation (EC) 853/2004`).
- **Consignment Dealer Declaration** — swapped the filled-green table-header bar for bold-black caps on a hairline rule (same calibration as the other tables); removed the parchment zebra stripe; replaced the centred title block with the shared professional header (scaled to pt); `drawSignatureBlock` + `drawPdfFooter` now produce the trained-hunter signature + page footer in pt units.

### Stage 2 — Rich family (stalker-facing)
Both now use `drawRichHeaderBand`: full-width duotone dark-green band, gold eyebrow, white title, optional gold subtitle + muted meta line. Same band the user already approved on Season Summary.
- **Simple Diary PDF** (`buildSimpleDiaryPDF`) — dropped the ad-hoc `Cull Diary - <label>` / `First Light · firstlightdeer.co.uk · N entries` pair for the full rich band with title, subtitle (`N entries`), brand URL and `Generated <date - time>` stamp. Row dividers switched from the default black hairline to a soft stone-coloured rule matching the palette. Added `drawPdfFooter` for multi-page safety. Page-break threshold now driven by `pageH - 24` instead of the hard-coded `270`.
- **Single-entry Cull Record** (`buildSingleEntryPDF`) — dropped the two-tone plain-text title for a proper rich header whose subtitle carries *species · sex · long-form date*. Added `drawPdfFooter`. Page break driven by `pageH - 24` for long-notes safety.

### Consistency fixes
- "1 carcass" / "1 carcasses" pluralisation corrected everywhere via `plural(n, singular, pluralForm)`.
- Every PDF now finishes with the same `Produced by First Light Cull Diary — firstlightdeer.co.uk  ·  Page N of M` footer.
- Every signature rule is now a real 0.3pt grey line rather than typewriter `___________` underscores.

### Files
- `modules/pdf.mjs` — `drawRichHeaderBand`, `drawProfessionalHeader`, `drawPdfFooter`, `drawSignatureBlock` all take `{ scale }`; `buildSimpleDiaryPDF`, `buildSingleEntryPDF`, `buildLarderBookPDF`, `buildGameDealerDeclarationPDF`, `buildConsignmentDealerDeclarationPDF` rewritten to use the shared primitives.
- `tests/pdf.test.mjs` — all 59 tests still pass (no test changes needed beyond the 5 added in the previous pass).
- `sw.js` — cache v7.61.

### Pending
- **Stage 4** — still to move `exportSeasonSummary` + `exportSyndicateSeasonSummaryPdf` from `diary.js` into `modules/pdf.mjs` (Commit L). Now that the rich primitives exist in the module, that move will deduplicate ~120 lines of palette + header drawing that currently sits inline in `diary.js`.
- Smoke-test the six refreshed PDFs in-browser before committing.

---

## 2026-04-16 — PDF design system: shared primitives + professional header (Team Larder reference)

Feedback on the first Team Larder refresh was *"I like the season summary design, can the others not be closer to it. However, the trained hunter declaration, larder book, consignment dealer declaration need to have that professional look to it."* — and later *"some colour but not overly colourful"*. So split the PDF catalogue into two families and extracted the design primitives into shared helpers.

### Families
- **Rich family** (stalker-facing): Simple Diary PDF, Single-entry Cull Record, Season Summary, Syndicate Season Summary. Dark-green band + gold eyebrow + white title + muted meta, as per the Season Summary the user already approved.
- **Professional family** (audit / dealer-facing): Solo Larder, Team Larder, Trained Hunter Declaration, Consignment Dealer Declaration. Single thin moss-green rule at top + small gold eyebrow + black title + grey subtitle / scope line. No fill bands, no zebra, no coloured rows — restrained branding that still identifies the artefact as a First Light document.

### New shared primitives — `modules/pdf.mjs`
- **`PDF_PALETTE`**: brand hexes (`deep / forest / moss / gold / bark / muted / stone / white` + `spColours` map). Extracted from the inline `C` object that had lived inside `exportSeasonSummary` in `diary.js`. First time the palette is genuinely shared rather than duplicated.
- **`setPdfFill / setPdfStroke / setPdfText`**: thin hex→rgb wrappers so callers can say `setPdfFill(doc, PDF_PALETTE.gold)` instead of hand-rolling `setFillColor(200, 168, 75)` every time.
- **`drawRichHeaderBand(doc, { pageW, title, eyebrow, subtitle, meta })`**: the full-width dark-green duotone band + gold underline + white title from Season Summary. Returns the y-coordinate below the band for easy chaining.
- **`drawProfessionalHeader(doc, { pageW, title, subtitle, scope, eyebrow })`**: the new compliance-style header — 4pt moss rule across the top, gold eyebrow, black title, optional grey subtitle + scope lines. Returns y below the header.

### Reference pass — Team Larder Book
Swapped the first-pass "green accent bar + beige header + zebra + filled totals" treatment for the new `drawProfessionalHeader`. Also:
- Stripped zebra striping (reading as decorative, not functional).
- Table header now unfilled (default `drawTableHeader` path — just bold text + hairline rule).
- Totals bar: thin-ruled frame (no fill) instead of beige block.
- Signature block unchanged (already using `drawSignatureBlock`).
- Page footer unchanged (already using `drawPdfFooter`).

Result: Team Larder now reads like a formal larder book (think DEFRA food-business paperwork) with just enough First Light identity (the gold eyebrow + moss rule) that a dealer can tell where it came from. Pending Stage 2/3 propagation to the other three professional PDFs + full rich refresh on the stalker-facing set.

### Tests
- `tests/pdf.test.mjs`: +5 tests. Palette exports, hex→rgb wrappers, `drawProfessionalHeader` (full form + minimal form), `drawRichHeaderBand` two-tone fill + returned height. All 59 tests pass.

### Files
- `modules/pdf.mjs` — new exports (`PDF_PALETTE`, `setPdfFill/Stroke/Text`, `drawRichHeaderBand`, `drawProfessionalHeader`); Team Larder uses the new professional header.
- `tests/pdf.test.mjs` — expanded import list + 5 new tests.
- `sw.js` — cache v7.60.

---

## 2026-04-16 — PDF visual refresh (reference pass on Team Larder Book)

With the Team Larder SQL bug fixed, user asked "maybe you can improve the design of pdfs?" Open prompt — rather than guess a scope I proposed a scope/direction/consistency form; user skipped it so proceeded with a default: *polish the two visible copy bugs across both larders + apply a restrained visual refresh to the Team Larder Book as a reference PDF*. Stop there and get user buy-in before propagating to the other four PDFs (Solo Larder, Single Entry, Game Dealer, Consignment, Simple Diary, Season Summary).

### Bug fixes (both larders)
- **"1 carcasses"** → **"1 carcass"**. Fixed via new `plural(n, singular, pluralForm)` helper. Default rule is suffix-'s' for regular words ("shooter" → "shooters"); `carcass` needs the explicit plural because suffix-'s' yields the mangled `carcasss`.
- **"Total weight: 0 kg"** when no row carries a weight → **"Total weight: —"**. New `formatTotalKg(weights[])` helper: sums parseable floats, tracks `contributed` count, emits em-dash when nothing contributed. Prevents the misleading "I weighed them all and they came to zero" reading.

### Visual refresh (Team Larder Book only this pass)
- **Branded header**: thin dark moss-green accent bar (10mm tall, 3mm wide) to the left of the title. Reads as "from First Light" without being loud.
- **Table header row**: `drawTableHeader` got an optional `{ filled: true }` variant that paints a light-beige (RGB 233/228/215) band behind the header text. Existing callers unchanged (default `filled=false` keeps the old thin-rule look for non-refreshed PDFs).
- **Zebra rows**: very light warm-grey (247/245/239) fill on alternate rows — barely visible on-screen, aids eye-tracking across the 12-column landscape layout, still prints clean on B&W.
- **Totals bar**: framed block (beige fill + grey border) replacing the inline "Total carcasses: N · Total weight: X kg" line. Clearer hierarchy, harder to miss when skimming a multi-page book.
- **Signature block**: new `drawSignatureBlock` helper draws actual thin rules (0.5pt grey) instead of typewriter `___________`. Aligns better and doesn't shift when fonts change width.
- **Page footer**: new `drawPdfFooter` helper. Drawn retrospectively after the body is fully laid out (using `doc.getNumberOfPages()` + `doc.setPage(p)` loop) so each page carries `Produced by First Light Cull Diary — firstlightdeer.co.uk` on the left and `Page N of M` on the right. Consistent footer positioning regardless of body length.

Header rule softened from 200-grey to 180-grey so the new accent bar and filled header row have more visual weight than the hairline.

### Files
- **`modules/pdf.mjs`**:
  - New exports: `plural`, `formatTotalKg`, `drawPdfFooter`, `drawSignatureBlock`.
  - `drawTableHeader` extended with `filled` flag; unconditional `setTextColor(0)` reset guards against leftover grey text state from a preceding call.
  - `buildSyndicateLarderBookPDF` rewritten to use the new helpers. Line-count delta +~35 but most of it is comments documenting the visual choices.
  - `buildLarderBookPDF` (solo): minimal — just switched the inline `'carcasses'` concat to `plural(n, 'carcass', 'carcasses')`. Visual refresh deferred until user approves the Team Larder direction.
- **`tests/pdf.test.mjs`**:
  - `FakeDoc` stub extended with `setPage`, `getNumberOfPages`, `getTextWidth`, plus `pageCount` / `currentPage` state tracking for the retrospective footer loop.
  - `drawTableHeader` test updated: now expects `setTextColor(0)` + `setDrawColor(180)` instead of the old `setDrawColor(200)` shape. +1 new test for the `filled=true` band.
  - +5 new tests for `plural` (singular / plural / default-rule) and `formatTotalKg` (sum / empty / all-null / mixed).
- **`sw.js`** — `SW_VERSION` bumped `7.58` → `7.59`.

### Deliberately deferred
- Propagating the refresh to Solo Larder, Single Entry Cull Record, Game Dealer Declaration, Consignment Declaration, Simple Diary, Season Summary. Want user to eyeball the Team Larder first — if the direction's wrong, rewinding one PDF is cheap; rewinding six is expensive.
- Column order / "Location / Ground" header ambiguity. Flipping the displayed order would match stalker intuition but conflicts with the DB column naming; rename is out of scope.
- Cover pages for long documents. Would add polish for 20+ page books but none of this user's exports currently run that long — premature.

Test run: **143/143 pass** (was 139; +4). No lint regressions.

---

## 2026-04-16 — Team Larder Book: real bug found & fixed (explicit-attribution filter missing)

Follow-up to the previous "visible scope line" entry. After the user re-tagged every 2025-26 entry to either **West Acre** or **Castle Acre** (via `cull_entries.syndicate_id`), the Castle Acre team larder was still pulling West Acre's entries. That made this a genuine filter bug — not a data coincidence — in the Team Larder RPC.

Root cause: `scripts/syndicate-manager-larder.sql` (shipped 2026-04-16 v1) filters only by member roster + ground_filter. The **other three** syndicate RPCs (`syndicate_season_summary`, `syndicate_member_actuals_for_manager`, aggregate) already had `WHERE e.syndicate_id = p_syndicate_id` added by the 2026-04-15 explicit-attribution migration — the larder RPC was added the following day and never got the same treatment. With no ground filter (Castle Acre) and the explicit filter missing, every entry by any active member landed in Castle Acre's book regardless of what syndicate the shooter tagged it to.

- **`scripts/syndicate-manager-larder.sql`** — v2:
  - Added `WHERE e.syndicate_id = p_syndicate_id` as the first WHERE clause.
  - Kept `ground_filter` match as belt-and-braces: if a manager has a ground_filter set, rows that carry the syndicate_id but a mismatching ground are still excluded — protects against an entry with a mistyped syndicate_id leaking in.
  - Header comment rewritten to document the attribution model and add a v1→v2 changelog.
- **`scripts/supabase-verify-drift.sql`** — drift check **3i** added:
  - `weak_function` assertion on `syndicate_member_larder_for_manager(uuid,text)` requires `pg_get_functiondef` to contain `'e.syndicate_id = p_syndicate_id'`. Mirrors the existing assertions on the other three syndicate RPCs. This regression class can't silently ship again.
- **`scripts/SUPABASE-RECORD.md`** — new **Pending** section (run the v2 SQL in Supabase SQL Editor) + changelog entry documenting v1 superseded.

**No client-side change was needed** (the client passes `p_syndicate_id` correctly; the scope line added earlier today already tells the manager what filter was applied). The SW bump from 7.57 → 7.58 is purely to flush stale Team Larder PDFs a user may have cached today under v1 — the cached PDFs aren't in the SW cache but a copy-paste safety bump is cheap.

- **`sw.js`** — `SW_VERSION` bumped `7.57` → `7.58`.

Test run: **139/139 pass** (no client-side change — existing scope-line tests from the previous entry still cover the PDF builder). No lint regressions. SQL deploy **confirmed** 2026-04-16: user ran both the v2 RPC SQL and `supabase-verify-drift.sql` → no rows returned on either. See `scripts/SUPABASE-RECORD.md` changelog.

---

## 2026-04-16 — Team Larder Book: visible scope line (no SQL change)

User reported "whatever syndicate I pick, Team Larder generates the same entries, only the title changes." We thought this was a filter leak in the RPC but after a diagnostic run through `syndicate_member_larder_for_manager` with both syndicates' IDs (pasted results in chat):

| Syndicate | ground_filter | Rows | Distinct `e.ground` |
|---|---|---|---|
| Castle Acre | NULL | 5 | `["Woodland Block"]` |
| West Acre | `"Woodland Block"` | 5 | `["Woodland Block"]` |

The RPC **is** filtering correctly — every single one of this user's 2025-26 entries legitimately has `ground = "Woodland Block"` in the DB, so both syndicates return identical rows (Castle Acre via no-filter, West Acre via matched-filter). The "Thetford Forest" / "Castle Acre" text that appears mid-row lives in `location_name`, not `ground` — the builder renders `location_name + " / " + ground`, which made "Thetford Forest / Woodland Block" look like a ground mismatch when it actually documents a Woodland Block compartment of the Thetford Forest permission.

No SQL change. The fix is **making the applied scope visible on the PDF** so identical output across two syndicates doesn't read as a bug.

- **`modules/pdf.mjs`** — `buildSyndicateLarderBookPDF`:
  - New third header line below the existing subtitle (9pt grey):
    - Ground filter set: `Ground filter: "Woodland Block"  ·  1 contributing shooter`
    - Ground filter absent: `Ground filter: none (all grounds)  ·  N contributing shooter(s)`
  - Distinct shooter count computed from `rows[].culledBy` (trimmed; empty → `(unnamed)`). Singular / plural handled.
  - Table `y` start nudged 32 → 37 to make room. Column layout unchanged.
  - `syndicate.ground_filter` read defensively — the solo-user path (no syndicate object) isn't affected since this builder is syndicate-only.
- **`tests/pdf.test.mjs`** — helper + 2 new assertions:
  - `installJsPdfStub()` now attaches a `spy.lastDoc` handle so tests can inspect `doc.calls` without changing builders' return surface. Backwards-compatible (existing tests still use `restore()`; the spy is attached on the returned restore fn).
  - New: `buildSyndicateLarderBookPDF: scope line shows "Ground filter" when set` — asserts the quoted filter + singular shooter phrase for N=1.
  - New: `buildSyndicateLarderBookPDF: scope line reads "none (all grounds)" when no filter` — asserts the no-filter copy + plural for N=2.
- **`sw.js`** — `SW_VERSION` bumped `7.56` → `7.57`.

Deliberately **not** changed (considered and rejected):
- Column order / header "Location / Ground". Flipping to "Ground / Location" would have matched common stalker intuition (big → small) but the underlying DB columns are named the opposite way: `ground` is the small, reusable, filterable tag (the thing syndicates filter on), `location_name` is the free-text larger-scope description. Renaming DB columns is out of scope; the new scope line already clarifies which field drove the filter.
- Hiding the "Team Larder Book" button for single-member syndicates. The export is still a valid audit artefact even for a single-person syndicate (the shooter column clarifies that) — the confusion was purely about *why* two syndicates returned the same rows, not about whether the export makes sense.
- Plumbing the ground filter through to the single-user Larder Book too. Solo path uses the unified Export modal which doesn't surface its ground filter on the PDF either — leave both the same for now. Can be added as a consistency pass later if needed.

Test run: **139/139 pass** (was 137; +2). No lint regressions.

---

## 2026-04-16 — Larder Book: Season + Ground picker (cross-season access)

User smoke-testing C1 flagged that the **Larder Book** button generated a PDF for whatever `currentSeason` happened to be selected in the global selector, with no way to pick a different season. Concrete broken flow: on 1st August 2026 the app rolls to the 2026-27 season; a dealer calls asking for the 2025-26 Larder Book; the user has to switch the global season selector back just to export, then switch forward again. That's the same gap the CSV / PDF exports had before today's Season + Ground modal rebuild.

Fix: route Larder Book through the **same unified export modal** (`openExportModal` → `doExportFiltered`) as a third format (`'larder'`) alongside `'csv'` and `'pdf'`. One modal, three outputs, same filter controls (Season dropdown + Ground dropdown + live count).

- **`diary.html`** — Larder Book button:
  - Was: `data-fl-action="export-larder-book"` (dispatched straight to `exportLarderBookPDF()` using global `filteredEntries` + `currentSeason`).
  - Now: `data-fl-action="open-export" data-export-fmt="larder"` — opens the unified picker.
- **`diary.js`** — `openExportModal(format)`:
  - Copy table extended: `{ csv: 'Export CSV / Generate CSV', pdf: 'Export PDF / Generate PDF', larder: 'Export Larder Book / Generate Larder Book' }`. Everything else (pool fetch, Season/Ground selects, live count, empty-state toasts) is shared code.
- **`diary.js`** — `doExportFiltered()`:
  - New `larder` branch calls `buildLarderBookPDF({ filteredEntries: entries, user: currentUser, season: isAllSeasons ? '__all__' : season })` with the modal's filtered result, then toasts on success. Builder's own "Left on hill" exclusion still runs, so an all-"Left on hill" selection gets a specific "No larder entries in this selection (all 'Left on hill')" toast rather than a misleading "no entries" (the modal count was non-zero).
  - The `__all__` season marker is already understood by `buildLarderBookPDF` — it renders a date-range scope line instead of the season-label line (pinned by existing test `buildLarderBookPDF: "__all__" season renders date-range scope line`).
- **`diary.js`** — dead code removal:
  - Deleted the `case 'export-larder-book'` dispatcher branch (no button emits it any more).
  - Deleted the `exportLarderBookPDF()` zero-arg shim — the unified modal now calls `buildLarderBookPDF` directly. Left a short comment marker where it used to live so future readers understand the rename. Net `-12 lines`.
- **`sw.js`** — `SW_VERSION` bumped `7.55` → `7.56`.

Behaviour change worth flagging: the Larder Book used to honour the **list view's** filters (species filter, search term, ground filter chosen in the list header). It now honours only the **modal's** Season + Ground selection, independent of list state. This is intentional and more predictable — the output is a pure function of the two dropdown values — but if a user relied on "filter the list to Roe, click Larder Book, get a Roe-only larder book" that flow is gone. It's not a documented contract; the list-filter leak was arguably a bug.

Test run: **137/137 pass** (no new tests needed — the larder builder contract was already pinned). No lint regressions.

---

## 2026-04-16 — Trained Hunter declaration: same-day-safe filename + long-form date

Consistency follow-up to the B2 smoke test. `buildGameDealerDeclarationPDF` was showing `Date of kill: 2026-04-11` (raw ISO) and producing filenames like `declaration-fallow-2026-04-11.pdf` which would collide for two same-day kills of the same species. Both per-carcass artefacts (cull record + dealer declaration) now follow the same naming scheme so they cluster alphabetically in the downloads folder.

- **`modules/pdf.mjs`** — `buildGameDealerDeclarationPDF`:
  - `Date of kill` row renders as "Sat 11 Apr 2026 (2026-04-11)" via `fmtEntryDateLong`. ISO retained in parens for audit cross-reference.
  - `Time` row passed through `fmtEntryTimeShort` (strips seconds, zero-pads single-digit hours).
  - Filename now `declaration-<species-slug>-<YYYY-MM-DD>[-<HHMM>].pdf`. Back-compat: no time on the entry → no `-HHMM` suffix, matching the legacy shape.
- **`tests/pdf.test.mjs`** — +1 assertion:
  - Existing filename test (species + date, no time) kept unchanged — proves the back-compat path.
  - New: entry with `time: '01:31:00'` produces `declaration-fallow-2026-04-11-0131.pdf`.
- **`sw.js`** — `SW_VERSION` bumped `7.54` → `7.55`.

Deliberately **not** changed:
- Email suppression: `accountEmail` is only rendered when `hunterName` is missing (the existing fallback). Sohaib's profile has a name → email correctly suppressed. Confirmed during B2 smoke test.
- Always-rendered empty field labels (e.g. `Tag / carcass number:` when blank). Kept because audit artefacts benefit from showing every field was considered (vs silently dropped). Different from the single-entry "cull record" which skips blanks.

Test run: **137/137 pass** (was 136; +1). No lint regressions.

---

## 2026-04-16 — Single-entry PDF: same-day-safe filename + long-form date

User smoke-testing B1 noticed `cull-record-2026-04-11.pdf` — two entries on the same date collide in the downloads folder (browser just appends "(1)"). Also the `Date:` row rendered the raw ISO string, unlike the list PDF which now uses the long form.

- **`modules/pdf.mjs`** — `buildSingleEntryPDF`:
  - Filename now `cull-record-<species-slug>-<YYYY-MM-DD>[-<HHMM>].pdf`:
    - Species slugged (same convention as the game-dealer declaration, so both per-carcass artefacts cluster together alphabetically in the downloads folder).
    - Time appended as `HHMM` (no colons — Windows-safe) when the entry has one. Same-day, same-species entries with different times now produce distinct filenames.
    - Missing species falls back to the slug `entry`. Missing time simply drops the `-HHMM` suffix.
  - `Date:` row now renders "Sat 11 Apr 2026 (2026-04-11)" — long form for humans, ISO in parens for database cross-reference. Falls back to the raw value if the date is unparseable.
  - `Time:` row now passed through `fmtEntryTimeShort` so `14:30:00` reads as `14:30` (matches the list PDF).
- **`tests/pdf.test.mjs`** — replaced the single old filename test with 3 more targeted ones:
  - species-slug-only filename when no time.
  - species + time-suffix filename for the same-day case ("Roe Deer" + `06:05:00` → `cull-record-roe-deer-2025-10-15-0605.pdf`).
  - empty species falls back to the `entry` slug.
- **`sw.js`** — `SW_VERSION` bumped `7.53` → `7.54`.

No change to the set of fields rendered in the body — the builder already handles Location / Age class / Weight / Tag / Calibre / Distance / Placement / Destination / Notes, silently skipping any that are blank. The user's screenshot showed only Date/Time/Ground because those were the only populated fields on that particular entry; confirmed with them.

Test run: **136/136 pass** (was 134; +2 net: 3 new filename tests replacing 1 old).

---

## 2026-04-16 — Simple diary PDF: year on date + richer per-entry fields

User exported the 2024-25 season from the new filter modal and correctly called out two issues with the resulting PDF:

1. Date read "Wed 29 Jan" with no year — ambiguous in multi-season exports.
2. Only 7 fields rendered per entry; `time`, `ground`, `age_class`, `shooter` were silently dropped even when populated (which is why that one 2024-25 entry looked empty in the PDF despite having data).

Both fixed in `buildSimpleDiaryPDF` + two new pure helpers:

- **`modules/pdf.mjs`**
  - New `fmtEntryDateLong(d)` — e.g. `"Wed 29 Jan 2025"`. Sibling of `fmtEntryDateShort`, added rather than extending the existing helper so call sites / tests stay pinned.
  - New `fmtEntryTimeShort(t)` — accepts `HH:MM` / `HH:MM:SS` / zero-pads single-digit hours, returns `""` for null/junk so it composes cleanly with `if (timeStr) …`.
  - `buildSimpleDiaryPDF`:
    - Title line now reads `"N. Species (Sex) · Wed 29 Jan 2025 · 14:30"` — date long form + optional time. Changed joiner from `" - "` to `" · "` to match the meta row below.
    - Meta row grew to 10 possible fields in a logical order: **Ground, Location, Weight, Tag, Calibre, Distance, Placement, Age, Shooter, Destination**. Shooter is only shown when not the default "Self" (case-insensitive), so the common case stays clean.
    - Meta row now `splitTextToSize`-wrapped to page width — with 10 potential fields it could otherwise overflow. Each wrapped line also respects the page-break guard.
- **`tests/pdf.test.mjs`** +7 assertions:
  - `fmtEntryDateLong`: year appended for two different years, null/empty fallthrough, unparseable input falls through to raw.
  - `fmtEntryTimeShort`: strips seconds, passes `HH:MM` through, zero-pads `H:MM`, returns `""` for null/undefined/""/junk.
- **`sw.js`** — `SW_VERSION` bumped `7.52` → `7.53`.

No visual change for entries that only had `species / sex / date` — they just pick up the year now. Entries with any of ground / time / age / non-Self shooter populated will show noticeably more.

Test run: **134/134 pass** (was 127; +7 for the two new helpers). No lint regressions.

---

## 2026-04-16 — Export PDF/CSV modal: unified season+ground filter (matches Summary)

Follow-up to the per-season-tiles attempt earlier today. User pointed out that the tile list would get ugly fast for anyone with 10 seasons of data (12-row modal, Cancel pushed off-screen) and — more importantly — we already have a clean pattern for this: the **Season Summary** modal uses a `<select>` for Season (+ "All Seasons") and another for Ground, with a live "Entries matching selection" preview. Export should just mirror that so users get the same UX in both flows.

Rebuilt the Export modal from scratch to be a mirror of the Summary modal:

- **`diary.html`** — `#export-modal` now uses `di-modal-sheet-body` chrome with:
  - `<select id="export-season-sel">` (All Seasons + every season the user has entries in, newest first; `currentSeason` preselected).
  - `<select id="export-ground-sel">` (All grounds + every ground referenced in any entry).
  - Live `#export-match-count` preview.
  - One primary button (`di-btn-pdf` gradient) whose label swaps between "Generate PDF" and "Generate CSV" based on `exportFormat`.
  - Cancel (`di-btn-outline`).
  - Dispatcher wires the primary button to a new `do-export-filtered` action.
- **`diary.js`**
  - New `exportEntryPool` state variable (sibling of `summaryEntryPool`, kept separate to avoid cross-modal state bleed).
  - `openExportModal(format)` rewritten to mirror `openSummaryFilter`: loads the full cross-season pool from Supabase (fetches `date, time, species, sex, location_name, ground, weight_kg, tag_number, calibre, distance_m, shot_placement, age_class, shooter, destination, notes` so both CSV and PDF paths have everything they need); falls back to `allEntries.slice()` on offline / fetch error with an informative toast. Populates both selects, runs `updateCount()` on change, then shows the modal.
  - `closeExportModal` nulls out `exportEntryPool` on close (matches the Summary pattern's pool-hygiene).
  - New `getFilteredExportEntries()` — identical filter semantics to `getFilteredSummaryEntries` so "2025-26 Season + Woodland A" means the same thing in both modals.
  - New `doExportFiltered()`:
    - Builds a human-readable `titleLabel` for the PDF title / toast ("All Seasons" / `seasonLabel(s)`, with " — <Ground>" appended when ground is filtered).
    - Builds a `filenameSlug` for the filename: `cull-diary-<seasonSlug>[-<groundSlug>].{pdf,csv}`. E.g. `cull-diary-2025-26-woodland-a.pdf` or `cull-diary-all-seasons-woodland-a.pdf`.
    - Delegates to `exportCSVData(entries, filenameSlug)` or `exportPDFData(entries, titleLabel, seasonOrNull, filenameSlug)`.
  - New `exportFilenameSlug(str)` helper (local to diary.js) — lowercase, alnum-or-hyphen, trimmed. Used only in the export-modal path.
  - `exportPDFData(entries, label, seasonOverride, filenameSlug)` grew a 4th arg — forwarded into `buildSimpleDiaryPDF` so ground-filtered exports get the right filename without touching the legacy all-seasons-vs-season branching. Back-compat default: `filenameSlug || null`.
  - Removed the short-lived `EXPORT_SEASON_TILE_ICON_SVG` / `renderExportSeasonTile()` / `doExport(scope, seasonKey)` code from earlier today — superseded.
  - Removed references to `#export-season-list`, `#export-season-lbl`, `#export-season-count`, `#export-all-count`, `data-export-scope`, `data-export-season` — all gone.
- **`modules/pdf.mjs`** — `buildSimpleDiaryPDF({ entries, label, season, filenameSlug })` accepts an optional `filenameSlug` that overrides the `label === 'All Seasons' ? 'cull-diary-all-seasons' : 'cull-diary-' + season` branching. When present, filename is simply `cull-diary-<filenameSlug>.pdf`. Pure addition; existing call sites continue to work unchanged (they pass no slug).
- **`tests/pdf.test.mjs`** — +1 assertion pinning the new branch:
  - `filenameSlug` wins over a single-season `season` value.
  - `filenameSlug` wins over the `label === 'All Seasons'` branch.
  - Empty-string `filenameSlug` is treated as falsy and falls through to the legacy branch.
- **`sw.js`** — `SW_VERSION` bumped `7.51` → `7.52`.

Test run: **127/127 pass** (was 126; one new test for the `filenameSlug` override).

Syndicate export modal (`openSyndicateExportModal`) already had its own independent season dropdown — untouched. Summary modal — untouched (stays the reference implementation).

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


