// =============================================================================
// First Light — fl-ammo + fl-deer-law test suite
//
// Run with: node tests/fl-ammo-and-law.test.mjs
//
// Unlike the ballistics tests, these check structural correctness and
// function behaviour, not numeric accuracy of reference data — the
// per-load ballistic data and per-jurisdiction legal thresholds are
// flagged as VERIFY BEFORE SHIPPING in their respective files.
// =============================================================================

import fs from 'node:fs';
import {
  getCalibres, getManufacturers, getAllLoads,
  getLoadById, getCalibreById, getManufacturerById,
  getCalibresWithLoads, getManufacturersForCalibre, getLoadsFor,
  searchLoads, loadDisplayName, preferredBcFor,
} from '../lib/fl-ammo.mjs';
import {
  flUkDeerLawVerified,
  DEER_SPECIES, JURISDICTIONS,
  thresholdFor, minMuzzleEnergyFor, citationFor,
  classifyEnergy, isKnownJurisdiction, isKnownSpecies,
} from '../lib/fl-deer-law.mjs';

// ── Tiny test harness (same shape as fl-ballistics.test.mjs) ─────────────

let passed = 0;
let failed = 0;
const failures = [];

function ok(condition, label) {
  if (condition) passed++;
  else { failed++; failures.push(label); }
}
function eq(actual, expected, label) {
  if (actual === expected) passed++;
  else { failed++; failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}
function group(name, fn) {
  console.log(`\n── ${name} ──`);
  const before = passed + failed;
  fn();
  console.log(`   ${(passed + failed) - before} checks`);
}

// ── Load the JSON database ───────────────────────────────────────────────

const dbRaw = fs.readFileSync(new URL('../data/ammo-loads.json', import.meta.url), 'utf8');
const db = JSON.parse(dbRaw);

// ── 1. Database structural sanity ────────────────────────────────────────

group('Database structure', () => {
  ok(typeof db === 'object', 'db parses as object');
  ok(Array.isArray(db.calibres) && db.calibres.length > 0, 'calibres present');
  ok(Array.isArray(db.manufacturers) && db.manufacturers.length > 0, 'manufacturers present');
  ok(Array.isArray(db.loads) && db.loads.length > 0, 'loads present');
  // verified flag must be explicitly present (true OR false; we don't
  // care which, but it must exist so consumers can decide whether to
  // surface a warning).
  ok(typeof db.verified === 'boolean', 'db.verified is a boolean');

  // Every load references a known calibre and manufacturer.
  const calIds = new Set(db.calibres.map(c => c.id));
  const mfrIds = new Set(db.manufacturers.map(m => m.id));
  const seenIds = new Set();
  let allRefsValid = true;
  let allIdsUnique = true;
  for (const l of db.loads) {
    if (!calIds.has(l.calibre)) { allRefsValid = false; failures.push(`load ${l.id} has unknown calibre ${l.calibre}`); }
    if (!mfrIds.has(l.manufacturer)) { allRefsValid = false; failures.push(`load ${l.id} has unknown manufacturer ${l.manufacturer}`); }
    if (seenIds.has(l.id)) { allIdsUnique = false; failures.push(`duplicate load id ${l.id}`); }
    seenIds.add(l.id);
  }
  ok(allRefsValid, 'every load references a known calibre + manufacturer');
  ok(allIdsUnique, 'every load id is unique');

  // Required ballistic fields on every load.
  let allBallistic = true;
  for (const l of db.loads) {
    if (!(l.muzzleVelocityFps > 0)) { allBallistic = false; failures.push(`load ${l.id}: muzzleVelocityFps missing/zero`); }
    if (!(l.weightGrains > 0))      { allBallistic = false; failures.push(`load ${l.id}: weightGrains missing/zero`); }
    const hasBc = (l.bcG1 != null && l.bcG1 > 0) || (l.bcG7 != null && l.bcG7 > 0);
    if (!hasBc)                     { allBallistic = false; failures.push(`load ${l.id}: no bcG1 or bcG7`); }
  }
  ok(allBallistic, 'every load has muzzleVelocityFps, weightGrains, and at least one BC');
});

// ── 2. fl-ammo lookup helpers ────────────────────────────────────────────

group('fl-ammo lookups', () => {
  // Bare passthrough getters.
  eq(getCalibres(db).length, db.calibres.length, 'getCalibres returns all');
  eq(getManufacturers(db).length, db.manufacturers.length, 'getManufacturers returns all');
  eq(getAllLoads(db).length, db.loads.length, 'getAllLoads returns all');

  // getLoadById / getCalibreById / getManufacturerById find existing items.
  const someLoad = db.loads[0];
  eq(getLoadById(db, someLoad.id)?.id, someLoad.id, 'getLoadById finds existing load');
  eq(getLoadById(db, 'nonsense-id'), null, 'getLoadById returns null for unknown');
  eq(getCalibreById(db, '308win')?.name, '.308 Winchester', 'getCalibreById finds .308 Winchester');
  eq(getCalibreById(db, 'made-up'), null, 'getCalibreById returns null for unknown');
  eq(getManufacturerById(db, 'federal')?.name, 'Federal', 'getManufacturerById finds Federal');

  // Defensive: bad inputs don't throw.
  eq(getCalibres(null).length, 0, 'getCalibres(null) returns []');
  eq(getAllLoads(undefined).length, 0, 'getAllLoads(undefined) returns []');
  eq(getLoadById(db, ''), null, 'getLoadById empty string returns null');
});

// ── 3. fl-ammo cascading filters ─────────────────────────────────────────

group('fl-ammo cascading filters (calibre → manufacturer → load)', () => {
  // Calibres with at least one load.
  const calsWithLoads = getCalibresWithLoads(db);
  ok(calsWithLoads.length > 0, 'at least one calibre has loads');
  ok(calsWithLoads.length <= db.calibres.length, 'calibres-with-loads is a subset of all calibres');
  // Every calibre returned must have at least one load referencing it.
  let allHaveLoads = true;
  for (const c of calsWithLoads) {
    const has = db.loads.some(l => l.calibre === c.id);
    if (!has) { allHaveLoads = false; failures.push(`calibre ${c.id} returned but has no loads`); }
  }
  ok(allHaveLoads, 'every "calibre with loads" actually has at least one load');

  // .308 has multiple manufacturers (Federal, Hornady, Sako, etc.).
  const mfrsFor308 = getManufacturersForCalibre(db, '308win');
  ok(mfrsFor308.length >= 3, '.308 Win has ≥3 manufacturers in seed DB');
  // All returned manufacturers actually produce a .308 load.
  let allMakeIt = true;
  for (const m of mfrsFor308) {
    const has = db.loads.some(l => l.calibre === '308win' && l.manufacturer === m.id);
    if (!has) { allMakeIt = false; failures.push(`mfr ${m.id} returned for .308 but makes no .308 load`); }
  }
  ok(allMakeIt, 'every returned manufacturer actually makes the calibre');
  eq(getManufacturersForCalibre(db, 'unknown-cal').length, 0, 'unknown calibre returns no manufacturers');
  eq(getManufacturersForCalibre(db, '').length, 0, 'empty calibre returns no manufacturers');

  // Loads for Federal .308.
  const fed308 = getLoadsFor(db, '308win', 'federal');
  ok(fed308.length >= 1, 'Federal .308 has at least one load');
  // Sorted by bullet weight ascending.
  for (let i = 1; i < fed308.length; i++) {
    ok(fed308[i].weightGrains >= fed308[i-1].weightGrains,
       `Federal .308 loads sorted by weight at i=${i}`);
  }
});

// ── 4. fl-ammo search ────────────────────────────────────────────────────

group('fl-ammo searchLoads', () => {
  // Exact-ish matches.
  const r1 = searchLoads(db, 'federal 308 150');
  ok(r1.length >= 1, '"federal 308 150" finds at least one load');
  ok(r1.some(l => l.id === 'federal-308win-150gr-power-shok-sp'), 'finds the Federal .308 150gr Power-Shok');

  // Tokens in any order.
  const r2 = searchLoads(db, '150 308 federal');
  ok(r2.some(l => l.id === 'federal-308win-150gr-power-shok-sp'), 'token order does not matter');

  // Case insensitive.
  ok(searchLoads(db, 'FEDERAL 308').length >= 1, 'case insensitive');

  // Query with no tokens returns empty.
  eq(searchLoads(db, '').length, 0, 'empty query returns []');
  eq(searchLoads(db, '   ').length, 0, 'whitespace-only query returns []');

  // Limit respected.
  const limited = searchLoads(db, '308', 3);
  ok(limited.length <= 3, 'limit honoured');

  // Nonsense query returns empty.
  eq(searchLoads(db, 'zxcvbnmasdfg').length, 0, 'nonsense query returns []');
});

// ── 5. fl-ammo display + BC selection ────────────────────────────────────

group('fl-ammo display helpers', () => {
  // Use the verified Federal .308 Win 150gr Power-Shok — present in the
  // user-supplied verified ammo list (1.0.0-bc-verified).
  const load = getLoadById(db, 'federal-308win-150gr-power-shok-sp');
  ok(load !== null, 'load found');
  const name = loadDisplayName(db, load);
  ok(name.includes('Federal'),    'display name includes manufacturer');
  ok(name.includes('.308'),       'display name includes calibre');
  ok(name.includes('150gr'),      'display name includes weight');
  ok(name.includes('Power-Shok'), 'display name includes product line');
  // Pass id instead of object — same result.
  eq(loadDisplayName(db, 'federal-308win-150gr-power-shok-sp'), name, 'display name accepts id or object');
  eq(loadDisplayName(db, 'no-such-id'), '', 'unknown id returns empty string');

  // BC selection: G1-only load (the verified list contains only G1 BCs).
  const bc1 = preferredBcFor(load);
  eq(bc1.model, 'G1', 'G1-only load returns G1');
  eq(bc1.bc, 0.313, 'G1 value passed through (verified)');

  // BC selection: some loads now carry both G1 and G7 (e.g. Hornady
  // ELD-X loads were updated with G7 BCs from manufacturer data). For
  // these, preferredBcFor should pick G7. Confirm the integration works
  // when both are present.
  const dual = db.loads.find(l => l.bcG1 != null && l.bcG1 > 0 && l.bcG7 != null && l.bcG7 > 0);
  if (dual) {
    const dualBc = preferredBcFor(dual);
    eq(dualBc.model, 'G7', 'load with both G1 and G7 prefers G7');
    eq(dualBc.bc, dual.bcG7, 'G7 value passed through');
  } else {
    ok(true, 'no dual-BC loads in DB (acceptable)');
  }

  // Defensive: null in, null out.
  eq(preferredBcFor(null), null, 'null load returns null');
});

// ── 6. fl-deer-law structural ────────────────────────────────────────────

group('fl-deer-law structure', () => {
  // The verified flag must default to false until a human flips it.
  eq(flUkDeerLawVerified, false, 'flUkDeerLawVerified defaults to false');

  // Species and jurisdiction lists.
  ok(DEER_SPECIES.length === 6, '6 UK deer species');
  ok(JURISDICTIONS.length === 3, '3 UK jurisdictions');

  // Lookup helpers.
  ok(isKnownJurisdiction('england-wales'), 'E&W is known');
  ok(isKnownJurisdiction('scotland'),      'Scotland is known');
  ok(isKnownJurisdiction('northern-ireland'), 'NI is known');
  ok(!isKnownJurisdiction('atlantis'),     'unknown jurisdiction is not known');
  ok(isKnownSpecies('roe'), 'roe is known');
  ok(!isKnownSpecies('reindeer'), 'reindeer is not known');
});

// ── 7. fl-deer-law thresholds ────────────────────────────────────────────

group('fl-deer-law threshold lookups', () => {
  // Every (jurisdiction, species) pair should resolve to a threshold OBJECT
  // — but the energy value within may legitimately be null where the
  // statute doesn't cover that species (Scotland: muntjac/CWD).
  for (const j of JURISDICTIONS) {
    for (const s of DEER_SPECIES) {
      const t = thresholdFor(j.code, s.code);
      ok(t !== null, `threshold object exists for ${j.code} / ${s.code}`);
      ok(typeof t.citation === 'string' && t.citation.length > 0,
         `${j.code}/${s.code} has a citation string`);
    }
  }

  // Specific verified values (cross-checked against statutory texts
  // 2026-04-26):
  //   E&W larger species (roe/red/fallow/sika): 1,700 ft-lb, .240"
  eq(minMuzzleEnergyFor('england-wales', 'red'), 1700, 'E&W red: 1700 ft-lb');
  eq(thresholdFor('england-wales', 'red').minCalibreInches, 0.240, 'E&W red: .240" cal');
  //   E&W muntjac/CWD: 1,000 ft-lb, .220", 50gr
  eq(minMuzzleEnergyFor('england-wales', 'muntjac'), 1000, 'E&W muntjac: 1000 ft-lb');
  eq(thresholdFor('england-wales', 'muntjac').minCalibreInches, 0.220, 'E&W muntjac: .220" cal');
  eq(thresholdFor('england-wales', 'muntjac').minBulletWeightGrains, 50, 'E&W muntjac: 50gr');
  //   Scotland larger species: 1,750 ft-lb, 80gr (post-Nov 2023), 2450 fps
  eq(minMuzzleEnergyFor('scotland', 'red'), 1750, 'Scotland red: 1750 ft-lb');
  eq(thresholdFor('scotland', 'red').minBulletWeightGrains, 80, 'Scotland red: 80gr (post-2023)');
  eq(thresholdFor('scotland', 'red').minMuzzleVelocityFps, 2450, 'Scotland red: 2450 fps');
  //   Scotland roe: 1,000 ft-lb, 50gr
  eq(minMuzzleEnergyFor('scotland', 'roe'), 1000, 'Scotland roe: 1000 ft-lb');
  eq(thresholdFor('scotland', 'roe').minBulletWeightGrains, 50, 'Scotland roe: 50gr');
  //   Scotland muntjac: legitimately null (species not naturalised)
  eq(minMuzzleEnergyFor('scotland', 'muntjac'), null, 'Scotland muntjac: null (not naturalised)');
  //   NI larger species: 1,700 ft-lb, 100gr, no calibre min
  eq(minMuzzleEnergyFor('northern-ireland', 'red'), 1700, 'NI red: 1700 ft-lb');
  eq(thresholdFor('northern-ireland', 'red').minBulletWeightGrains, 100, 'NI red: 100gr');
  eq(thresholdFor('northern-ireland', 'red').minCalibreInches, null, 'NI red: no calibre min');

  // Every jurisdiction requires expanding bullets.
  for (const j of JURISDICTIONS) {
    for (const s of DEER_SPECIES) {
      const t = thresholdFor(j.code, s.code);
      eq(t.expandingBulletRequired, true,
         `${j.code}/${s.code} requires expanding bullet`);
    }
  }

  // Convenience helpers agree with the underlying object.
  eq(minMuzzleEnergyFor('england-wales', 'roe'),
     thresholdFor('england-wales', 'roe').minMuzzleEnergyFtLb,
     'minMuzzleEnergyFor matches thresholdFor');
  eq(citationFor('england-wales', 'roe'),
     thresholdFor('england-wales', 'roe').citation,
     'citationFor matches thresholdFor');

  // Unknown combinations return null.
  eq(thresholdFor('atlantis', 'roe'), null, 'unknown jurisdiction → null');
  eq(thresholdFor('england-wales', 'reindeer'), null, 'unknown species → null');
  eq(minMuzzleEnergyFor('atlantis', 'roe'), null, 'unknown jurisdiction → null muzzle energy');
});

// ── 8. fl-deer-law classifyEnergy ────────────────────────────────────────

group('fl-deer-law classifyEnergy (red/amber/green)', () => {
  // E&W roe minimum is 1700 ft-lb (verified Deer Act 1991 Schedule 2).
  const min = minMuzzleEnergyFor('england-wales', 'roe');
  ok(min === 1700, 'E&W roe minimum is 1700 ft-lb');

  eq(classifyEnergy(min - 1, 'england-wales', 'roe'), 'red',
     'just below minimum is red');
  eq(classifyEnergy(min, 'england-wales', 'roe'), 'amber',
     'exactly at minimum is amber');
  eq(classifyEnergy(min * 1.05, 'england-wales', 'roe'), 'amber',
     '5% above minimum is amber');
  eq(classifyEnergy(min * 1.10, 'england-wales', 'roe'), 'green',
     '10% above minimum is green');
  eq(classifyEnergy(min * 2, 'england-wales', 'roe'), 'green',
     '2× minimum is green');

  // Unknown inputs.
  eq(classifyEnergy(NaN, 'england-wales', 'roe'), 'unknown',
     'NaN energy → unknown');
  eq(classifyEnergy(2000, 'atlantis', 'roe'), 'unknown',
     'unknown jurisdiction → unknown');
  eq(classifyEnergy(2000, 'england-wales', 'reindeer'), 'unknown',
     'unknown species → unknown');
  // Scotland muntjac has null threshold (verified — species not naturalised)
  eq(classifyEnergy(1500, 'scotland', 'muntjac'), 'unknown',
     'Scotland muntjac → unknown (no statutory threshold)');
});

// ── Summary ───────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════');
console.log(`  Total: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
} else {
  console.log('  All checks passed ✓');
}
