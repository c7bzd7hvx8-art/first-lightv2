# Ammo Verification — 150/150 Complete

## Status

- **150 of 150 loads** have `mvVerified: true` with `mvSource` and `bcSource` populated.
- **587 tests passing** (444 ballistics solver + 143 ammo + law).
- Top-level flag `verified: false` and `flUkAmmoVerified: false` remain set — flip these only after personal spot-check.

## What I did

For each load I cross-referenced the manufacturer's published muzzle velocity and ballistic coefficient against:

- Manufacturer product pages where available (federal.com, hornady.com, norma-ammunition.com, sako.global, foxbullets.eu, lapua.com, sellier-bellot.cz, ppu-usa.com, winchester.com, etc.)
- Manufacturer-issued ballistics charts (Hornady's official 2022 Standard Ballistics Chart PDF)
- Reputable distributor listings that quote manufacturer SKUs (Optics Planet, Palmetto State Armory, Brownells)
- Independent test articles (Strobl.cz, NRA SSUSA, Bladet Jakt, all4shooters.com) for cross-checks

The `mvSource` and `bcSource` fields on every load name the source.

## Significant corrections applied

Loads where the original data was wrong by more than a small margin:

- **Federal Power-Shok BCs** were Hornady-Hi-Shok component BCs, not loaded ammo BCs. Corrected upward across multiple loads (P243TC1 0.339→0.391; P270TC1 0.401→0.459; P65CRDTC1 0.435→0.497; P308TC3 0.408→0.469).
- **Norma Oryx .223 55gr**: 3240 fps → 3117 fps (significant — Norma's bonded jacket runs slower than typical .223).
- **Norma Tipstrike .243 76gr**: flagged in notes as classified by Norma as **Varmint, not deer**.
- **Sako Powerhead Blade .308 162gr**: 2724 fps → 2674 fps, BC 0.439 → 0.415 (2024 product redesign — Sako's BC was upgraded from 0.390 to 0.415).
- **Hornady .308 150gr SST Superformance**: 2820 → 3000 fps (was the standard load value; Superformance is faster).
- **Hornady Outfitter line CX loads**: corrected MVs downward where the database had standard SKU velocities (Outfitter is reduced-charge).
- **Fox Classic Hunter .308 150gr**: BC 0.388 → 0.307 (database had a lead-bullet BC; Fox's monolithic Cu-Zn is lower).
- **Lapua TRX line** (new lead-free product): added BCs from official Lapua/SSUSA data — 6.5mm 120gr G1 0.428 / G7 0.212; .308 150gr G1 0.384 / G7 0.190; .308 165gr G1 0.490 / G7 0.243.
- **Federal "155gr Terminal Ascent .308"**: Federal does not catalogue this. Replaced with the actual P308TA1 175gr Terminal Ascent at 2600 fps / BC 0.520.
- **Sako Hammerhead .270 156gr**: noted as possibly discontinued.
- **G7 BCs added** to several long-range hunting loads (Hornady ELD-X line; Lapua TRX line) where only G1 was previously present.

## What still needs your sign-off

1. **Spot-check a sample of 10–15 loads** against the cited sources, particularly:
   - The big-correction ones above
   - Any load you actually shoot (you'll know if the published MV looks right)
2. Once satisfied, set both flags at the top of `data/ammo-loads.json`:
   ```json
   "verified": true,
   "flUkAmmoVerified": true,
   ```
3. The **statutory law** flag (`flUkDeerLawVerified`) is independent — flip it only after reading the three legislation.gov.uk sources cited in `lib/fl-deer-law.mjs`.

## Files staged in this directory

- `data/ammo-loads.json` — 150 loads with verification metadata
- `lib/fl-ballistics.mjs` — pure G1/G7 solver (verified to within 0.1 in/400yd vs js-ballistics reference)
- `lib/fl-ammo.mjs` — pure ammo helpers
- `lib/fl-deer-law.mjs` — UK statutory thresholds, primary-source-cited
- `modules/ballistics-ui.mjs` — calculator UI with compliance checks and absolute-floor warnings
- `modules/dope-card.mjs` — A6/A4 PDF dope card builder
- `tests/` — 587 passing tests
- `ballistics.html`, `sw.js`, `index-tile-snippet.html`, `CURSOR-INTEGRATION-PROMPT.md`
- `sample-dope-card-a6.pdf`, `sample-dope-card-a4.pdf`
