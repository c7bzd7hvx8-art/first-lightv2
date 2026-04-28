# First Light — Ballistic Calculator integration

Drop the new ballistic calculator into the live site. All the heavy lifting
is done — the maths is validated against a published reference solver, the
seed ammo database is in place, and the UI is built. Your job is small:
add the files to the repo, wire them into the service worker and home
screen, and verify the data flagged as unverified before deploy.

## Files to add (drop in place from the artefact set)

```
ballistics.html                    ← root, sibling to index.html
lib/fl-ballistics.mjs              ← pure trajectory maths
lib/fl-ammo.mjs                    ← ammo database helpers
lib/fl-deer-law.mjs                ← UK statutory thresholds (UNVERIFIED)
data/ammo-loads.json               ← seed factory ammo (UNVERIFIED)
modules/ballistics-ui.mjs          ← calculator UI orchestration
modules/dope-card.mjs              ← printable dope card PDF builder
tests/fl-ballistics.test.mjs       ← already passing (444 checks)
tests/fl-ammo-and-law.test.mjs     ← already passing (124 checks)
```

These are self-contained: no edits required to any existing diary or
deerschool file. The calculator does not touch Supabase, does not require
sign-in, and does not share state with the cull diary.

## Service worker (sw.js)

Bump SW_VERSION and add the new files to PRECACHE_URLS. The provided
`sw.js` in this artefact set is already patched — diff it against the
live `sw.js` and apply the changes:

  * SW_VERSION goes from '8.75' → '8.76'
  * PRECACHE_URLS gains 7 new entries:
      ./ballistics.html
      ./lib/fl-ballistics.mjs
      ./lib/fl-ammo.mjs
      ./lib/fl-deer-law.mjs
      ./data/ammo-loads.json
      ./modules/ballistics-ui.mjs
      ./modules/dope-card.mjs

The `cdn.jsdelivr.net` and `cdnjs.cloudflare.com` CDN URLs are already in
the SW's CDN_URLS list, so jsPDF (which the dope card module needs) is
already cached. No additional CDN entries needed.

## diary.js — version lockstep

While you're bumping SW_VERSION, also bump FL_APP_VERSION in diary.js
from '7.76' to '8.76' so the two stay in lockstep. The comment on
FL_APP_VERSION (around line 26) says they should be bumped together; they
have drifted, and this is the right moment to fix it.

## index.html — home-screen tile

Paste the snippet from `index-tile-snippet.html` into index.html alongside
the existing Deer School card. Same visual pattern (gradient card, gold
icon block, Open ›  CTA). Place it immediately after the Cull Diary card
or after the Deer School card — wherever it fits the reading flow best.

## TWO things you MUST verify before deploying

These are flagged in the source files themselves and the calculator UI
shows a pre-release banner until they are addressed:

### 1. UK statutory energy thresholds (lib/fl-deer-law.mjs)

Every numeric threshold in this file is currently flagged
`verified: false`. The values were assembled from training-data sources
and need cross-checking against current UK legislation:

  * Deer Act 1991 Schedule 2 (E&W, as amended by the Deer (Firearms etc.)
    (England & Wales) Order 2007)
  * Deer (Firearms etc.) (Scotland) Order 2011 (SSI 2011/186)
  * Wildlife (NI) Order 1985 + Wildlife and Natural Environment Act
    (Northern Ireland) 2011

Cross-check every number with current legislation.gov.uk text or a
qualified DSC/BASC/legal source. Calibre and bullet-weight minimums also
apply alongside energy thresholds in some jurisdictions and are NOT yet
encoded — add them.

When verified, set `flUkDeerLawVerified = true` at the top of the file.
This suppresses the pre-release banner in the UI.

### 2. Factory ammunition data (data/ammo-loads.json)

Every load in the JSON has `verified: false` and a `source` field
recording where the values came from ("training data, unverified").
Cross-check against current manufacturer data sheets — Federal, Hornady,
Sako, RWS, Norma, Winchester, Remington, Sellier & Bellot, GECO. Some
loads in the seed may be discontinued; remove them. Some BC values may
have been republished; correct them.

When verifying each load, set `verified: true` and replace `source`
with the URL or document reference you checked against. Bump the top-level
`version` and set `verified: true` once all loads are done.

The seed has 28 loads. A comfortable production set is 100–150 loads
covering all UK-relevant calibres and the major UK-imported manufacturers.

## Tests (optional but recommended)

The two test files run with plain Node, no test framework needed:

    node tests/fl-ballistics.test.mjs    # 444 checks, all should pass
    node tests/fl-ammo-and-law.test.mjs  # 124 checks, all should pass

If you add new ammo loads, the second suite will validate that they have
all required fields. If anyone touches lib/fl-ballistics.mjs, the first
suite re-validates the trajectory output against a captured reference for
Federal .308 Win 150gr Power-Shok at multiple ranges.

## What's done that you don't need to redo

* The maths is correct. Solver output matches js-ballistics 2.2.0 to
  within 0.1 inches at 400 yards for Federal .308 150gr Power-Shok at
  100yd zero, ICAO standard. See tests/fl-ballistics.test.mjs.
* The UI is structurally complete: setup wizard, profile editor,
  conditions editor, drop chart, dope card export (A6 + A4), reticle
  range estimator. All controls wired and working.
* All 58 element IDs the UI module references are present in the HTML
  (or created dynamically by the UI's own templates).
* CSP allows the necessary CDN (cdnjs.cloudflare.com for jsPDF) and the
  Open-Meteo API for weather auto-fill. Nothing else permitted.
* No telemetry, no analytics, no Supabase, no diary cross-talk. This is
  a standalone tool inside the same PWA shell.

## Risk notes for the deploy

* The pre-release banner will be visible until both verification tasks
  above are complete. That's intentional. Don't suppress it before
  verification.
* The reticle range estimator gives ±20% accuracy. The UI says so.
  Stalkers using a real rangefinder should ignore this feature.
* The dope card PDF assumes ICAO standard atmosphere and the user's
  current conditions snapshot. It is NOT auto-updating — a card printed
  in summer may be off in winter. The card itself states the conditions
  it was generated under.
