// =============================================================================
// Tests for modules/stats.mjs
//
// Runtime: Node's built-in test runner + assert/strict. Zero dependencies.
//
// Scope: all 5 data tables (shape + length invariants) and the 4 pure
// aggregators / the hour-bucket categoriser. The render-side code
// (buildShooterStats etc.) still lives in diary.js and is smoke-tested
// only — its interesting data logic lives here now.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CAL_COLORS, SP_COLORS_D,
  AGE_CLASSES, AGE_COLORS, AGE_GROUPS,
  TIME_OF_DAY_BUCKETS,
  aggregateShooterStats,
  aggregateDestinationStats,
  aggregateTimeOfDayStats,
  categorizeHourToBucket,
  buildShooterStats,
  buildDestinationStats,
  buildTimeOfDayStats,
  normalizeAgeClassLabel,
  buildCalibreDistanceStats,
  buildAgeStats,
  buildTrendsChart,
  buildGroundStats,
  renderStatsTabBody
} from '../modules/stats.mjs';

// ── Data-table invariants ──────────────────────────────────────────────────
test('CAL_COLORS has 6 gradient strings (one per top calibre slot)', () => {
  assert.equal(CAL_COLORS.length, 6);
  CAL_COLORS.forEach((c, i) => assert.match(c, /^linear-gradient/, `[${i}] not a gradient`));
});

test('SP_COLORS_D covers all 6 UK-relevant deer species', () => {
  assert.deepEqual(
    Object.keys(SP_COLORS_D).sort(),
    ['CWD', 'Fallow', 'Muntjac', 'Red Deer', 'Roe Deer', 'Sika']
  );
});

test('AGE_CLASSES and AGE_COLORS are parallel arrays of length 5', () => {
  assert.equal(AGE_CLASSES.length, 5);
  assert.equal(AGE_COLORS.length, 5);
});

test('AGE_GROUPS values only reference labels from AGE_CLASSES', () => {
  const set = new Set(AGE_CLASSES);
  Object.values(AGE_GROUPS).forEach(labels => {
    labels.forEach(l => assert.ok(set.has(l), `"${l}" not in AGE_CLASSES`));
  });
});

test('AGE_GROUPS cover every AGE_CLASSES label exactly once', () => {
  const all = Object.values(AGE_GROUPS).flat();
  assert.equal(all.length, AGE_CLASSES.length);
  assert.deepEqual(all.sort(), [...AGE_CLASSES].sort());
});

test('TIME_OF_DAY_BUCKETS has 6 entries with Night pinned last', () => {
  assert.equal(TIME_OF_DAY_BUCKETS.length, 6);
  assert.ok(TIME_OF_DAY_BUCKETS[5].label.startsWith('Night'));
});

// ── aggregateShooterStats ──────────────────────────────────────────────────
test('aggregateShooterStats: blank/missing shooter normalised to "Self"', () => {
  const r = aggregateShooterStats([
    { shooter: '' },
    { shooter: null },
    { shooter: undefined },
    {},
    { shooter: 'John' }
  ]);
  assert.equal(r.counts.Self, 4);
  assert.equal(r.counts.John, 1);
});

test('aggregateShooterStats: "Self" sorted first regardless of count', () => {
  const r = aggregateShooterStats([
    { shooter: 'John' }, { shooter: 'John' }, { shooter: 'John' },
    { shooter: 'Self' }
  ]);
  assert.equal(r.sortedNames[0], 'Self');
  assert.equal(r.sortedNames[1], 'John');
});

test('aggregateShooterStats: remaining shooters by count desc', () => {
  const r = aggregateShooterStats([
    { shooter: 'A' }, { shooter: 'B' }, { shooter: 'B' }, { shooter: 'C' }, { shooter: 'C' }, { shooter: 'C' }
  ]);
  assert.deepEqual(r.sortedNames, ['C', 'B', 'A']);
  assert.equal(r.maxCount, 3);
});

test('aggregateShooterStats: isAllSelf true when only Self present', () => {
  assert.equal(aggregateShooterStats([{ shooter: 'Self' }]).isAllSelf, true);
  assert.equal(aggregateShooterStats([{}]).isAllSelf, true);
  assert.equal(aggregateShooterStats([{ shooter: 'Self' }, { shooter: 'John' }]).isAllSelf, false);
});

test('aggregateShooterStats: empty input returns empty structure (no crash)', () => {
  const r = aggregateShooterStats([]);
  assert.deepEqual(r.sortedNames, []);
  assert.equal(r.maxCount, 0);
  assert.equal(r.isAllSelf, false); // names[0] is undefined, not 'Self'
});

test('aggregateShooterStats: trims whitespace from shooter names', () => {
  const r = aggregateShooterStats([{ shooter: '  John  ' }, { shooter: 'John' }]);
  assert.equal(r.counts.John, 2);
});

// ── aggregateDestinationStats ──────────────────────────────────────────────
test('aggregateDestinationStats: entries without destination skipped', () => {
  const r = aggregateDestinationStats([
    { destination: 'Game dealer' },
    { destination: '' },
    { destination: null },
    {},
    { destination: 'Game dealer' }
  ]);
  assert.equal(r.counts['Game dealer'], 2);
  assert.equal(Object.keys(r.counts).length, 1);
});

test('aggregateDestinationStats: sorted by count desc', () => {
  const r = aggregateDestinationStats([
    { destination: 'A' }, { destination: 'B' }, { destination: 'B' }, { destination: 'C' }, { destination: 'C' }, { destination: 'C' }
  ]);
  assert.deepEqual(r.sortedNames, ['C', 'B', 'A']);
  assert.equal(r.maxCount, 3);
});

test('aggregateDestinationStats: empty input → empty structure', () => {
  const r = aggregateDestinationStats([]);
  assert.deepEqual(r.sortedNames, []);
  assert.equal(r.maxCount, 0);
});

// ── categorizeHourToBucket ─────────────────────────────────────────────────
test('categorizeHourToBucket: cardinal hours map to expected buckets', () => {
  assert.equal(categorizeHourToBucket(5),  0); // Dawn
  assert.equal(categorizeHourToBucket(7),  0); // Dawn (boundary)
  assert.equal(categorizeHourToBucket(8),  1); // Morning
  assert.equal(categorizeHourToBucket(10), 1); // Morning (boundary)
  assert.equal(categorizeHourToBucket(11), 2); // Midday
  assert.equal(categorizeHourToBucket(14), 2); // Midday (boundary)
  assert.equal(categorizeHourToBucket(15), 3); // Afternoon
  assert.equal(categorizeHourToBucket(17), 3); // Afternoon (boundary)
  assert.equal(categorizeHourToBucket(18), 4); // Dusk
  assert.equal(categorizeHourToBucket(20), 4); // Dusk (boundary)
});

test('categorizeHourToBucket: wrap-around hours (21-04) fall into Night (index 5)', () => {
  [21, 22, 23, 0, 1, 2, 3, 4].forEach(h => {
    assert.equal(categorizeHourToBucket(h), 5, `hour ${h} should be Night`);
  });
});

test('categorizeHourToBucket: NaN / junk → Night (index 5)', () => {
  assert.equal(categorizeHourToBucket(NaN), 5);
  assert.equal(categorizeHourToBucket('not a number'), 5);
  assert.equal(categorizeHourToBucket(undefined), 5);
});

test('categorizeHourToBucket: accepts string hours (from "HH:MM" parse)', () => {
  assert.equal(categorizeHourToBucket('06'), 0);
  assert.equal(categorizeHourToBucket('12'), 2);
});

// ── aggregateTimeOfDayStats ────────────────────────────────────────────────
test('aggregateTimeOfDayStats: entries without time field skipped', () => {
  const r = aggregateTimeOfDayStats([
    { time: '06:30' },
    { time: null },
    { time: '' },
    {},
    { time: '09:00' }
  ]);
  assert.equal(r.total, 2);
  assert.equal(r.counts[0], 1); // Dawn
  assert.equal(r.counts[1], 1); // Morning
});

test('aggregateTimeOfDayStats: HH:MM:SS times parse correctly', () => {
  const r = aggregateTimeOfDayStats([{ time: '12:30:45' }]);
  assert.equal(r.counts[2], 1); // Midday
});

test('aggregateTimeOfDayStats: unparseable time strings skipped (not bucketed to Night)', () => {
  const r = aggregateTimeOfDayStats([{ time: 'bad' }, { time: ':30' }]);
  // ':30' parseInt('', 10) is NaN → skipped, total stays 0
  assert.equal(r.total, 0);
});

test('aggregateTimeOfDayStats: counts[] has length 6 even when empty', () => {
  const r = aggregateTimeOfDayStats([]);
  assert.equal(r.counts.length, 6);
  assert.equal(r.total, 0);
  assert.equal(r.maxCount, 0);
});

test('aggregateTimeOfDayStats: maxCount is the top bucket count', () => {
  const r = aggregateTimeOfDayStats([
    { time: '06:00' },
    { time: '06:30' },
    { time: '06:45' },
    { time: '12:00' }
  ]);
  assert.equal(r.counts[0], 3); // Dawn
  assert.equal(r.counts[2], 1); // Midday
  assert.equal(r.maxCount, 3);
});

// ── DOM paint wrappers (Commit M) ──────────────────────────────────────────
// The three build*Stats functions touch `document.getElementById` and assign
// to `innerHTML`. A tiny DOM stub keeps tests fast and dependency-free; we
// only need `getElementById(id) → { style, innerHTML }` to exercise every
// code path. Restored on every test to avoid cross-test pollution.
function installDomStub(ids) {
  const els = {};
  for (const id of ids) {
    els[id] = { style: { display: '' }, innerHTML: '' };
  }
  const prev = globalThis.document;
  globalThis.document = {
    getElementById(id) { return els[id] || null; },
  };
  const restore = () => { globalThis.document = prev; };
  restore.els = els;
  return restore;
}

// ── buildShooterStats ──────────────────────────────────────────────────────
test('buildShooterStats hides card when every entry was shot by Self', () => {
  const restore = installDomStub(['shooter-card', 'shooter-chart']);
  try {
    buildShooterStats([{ shooter: 'Self' }, { shooter: 'Self' }]);
    assert.equal(restore.els['shooter-card'].style.display, 'none');
    assert.equal(restore.els['shooter-chart'].innerHTML, '');
  } finally { restore(); }
});

test('buildShooterStats paints a bar row per distinct shooter with correct count', () => {
  const restore = installDomStub(['shooter-card', 'shooter-chart']);
  try {
    buildShooterStats([
      { shooter: 'Self' },
      { shooter: 'Self' },
      { shooter: 'Alice' },
    ]);
    assert.equal(restore.els['shooter-card'].style.display, 'block');
    const html = restore.els['shooter-chart'].innerHTML;
    // Two bar-rows (Self + Alice).
    assert.equal((html.match(/class="bar-row"/g) || []).length, 2);
    // Counts present.
    assert.match(html, /<div class="bar-cnt">2<\/div>/);
    assert.match(html, /<div class="bar-cnt">1<\/div>/);
    // Alice is non-Self → gold gradient.
    assert.match(html, /Alice[\s\S]*?#c8a84b/);
    // Self → green gradient.
    assert.match(html, /Self[\s\S]*?#5a7a30/);
  } finally { restore(); }
});

test('buildShooterStats escapes shooter names into HTML', () => {
  const restore = installDomStub(['shooter-card', 'shooter-chart']);
  try {
    buildShooterStats([
      { shooter: 'Self' },
      { shooter: '<script>alert(1)</script>' },
    ]);
    const html = restore.els['shooter-chart'].innerHTML;
    // Raw <script> must be escaped into &lt;script&gt;.
    assert.equal(html.includes('<script>alert(1)</script>'), false);
    assert.match(html, /&lt;script&gt;/);
  } finally { restore(); }
});

// ── buildDestinationStats ─────────────────────────────────────────────────
test('buildDestinationStats hides card when no entries carry a destination', () => {
  const restore = installDomStub(['destination-card', 'destination-chart']);
  try {
    buildDestinationStats([{ foo: 'bar' }, { species: 'Roe Deer' }]);
    assert.equal(restore.els['destination-card'].style.display, 'none');
  } finally { restore(); }
});

test('buildDestinationStats paints one row per distinct destination with palette colour', () => {
  const restore = installDomStub(['destination-card', 'destination-chart']);
  try {
    buildDestinationStats([
      { destination: 'Game dealer' },
      { destination: 'Game dealer' },
      { destination: 'Self / personal use' },
      { destination: 'Condemned' },
    ]);
    assert.equal(restore.els['destination-card'].style.display, 'block');
    const html = restore.els['destination-chart'].innerHTML;
    assert.equal((html.match(/class="bar-row"/g) || []).length, 3);
    // Game dealer → gold (#c8a84b) palette entry.
    assert.match(html, /Game dealer[\s\S]*?#c8a84b/);
    // Condemned → red (#c62828).
    assert.match(html, /Condemned[\s\S]*?#c62828/);
  } finally { restore(); }
});

test('buildDestinationStats falls back to Self/green for unknown destinations', () => {
  const restore = installDomStub(['destination-card', 'destination-chart']);
  try {
    buildDestinationStats([{ destination: 'Exotic Butcher X' }]);
    const html = restore.els['destination-chart'].innerHTML;
    assert.match(html, /Exotic Butcher X[\s\S]*?#5a7a30/);
  } finally { restore(); }
});

// ── buildTimeOfDayStats ────────────────────────────────────────────────────
test('buildTimeOfDayStats early-returns when card or chart element is missing', () => {
  const restore = installDomStub([]);   // no elements registered
  try {
    // Should not throw.
    buildTimeOfDayStats([{ time: '06:30' }]);
  } finally { restore(); }
});

test('buildTimeOfDayStats hides card when zero entries carry a parseable time', () => {
  const restore = installDomStub(['time-card', 'time-chart']);
  try {
    buildTimeOfDayStats([{ foo: 'bar' }, { time: null }]);
    assert.equal(restore.els['time-card'].style.display, 'none');
  } finally { restore(); }
});

test('buildTimeOfDayStats skips zero-count buckets and paints the rest', () => {
  const restore = installDomStub(['time-card', 'time-chart']);
  try {
    buildTimeOfDayStats([
      { time: '06:00' },   // Dawn
      { time: '06:30' },   // Dawn
      { time: '12:00' },   // Midday
    ]);
    assert.equal(restore.els['time-card'].style.display, 'block');
    const html = restore.els['time-chart'].innerHTML;
    // Exactly 2 rows (Dawn, Midday) — no Morning/Afternoon/Evening/Night.
    assert.equal((html.match(/class="bar-row"/g) || []).length, 2);
    // Bucket labels from TIME_OF_DAY_BUCKETS survive untouched (they are
    // known-safe constants so the function does not re-escape them).
    assert.match(html, /Dawn/);
    assert.match(html, /Midday/);
  } finally { restore(); }
});

// ═════════════════════════════════════════════════════════════════════════
// Commit N — normalizeAgeClassLabel + four larger paint wrappers
// ═════════════════════════════════════════════════════════════════════════

// ── normalizeAgeClassLabel ─────────────────────────────────────────────────
test('normalizeAgeClassLabel widens legacy "Calf / Kid" to the canonical Fawn label', () => {
  assert.equal(normalizeAgeClassLabel('Calf / Kid'), 'Calf / Kid / Fawn');
});

test('normalizeAgeClassLabel passes all canonical AGE_CLASSES through untouched', () => {
  for (const ac of AGE_CLASSES) {
    assert.equal(normalizeAgeClassLabel(ac), ac);
  }
});

test('normalizeAgeClassLabel leaves unknown / empty / null labels unchanged', () => {
  assert.equal(normalizeAgeClassLabel(''), '');
  assert.equal(normalizeAgeClassLabel('Some Other Label'), 'Some Other Label');
  assert.equal(normalizeAgeClassLabel(null), null);
  assert.equal(normalizeAgeClassLabel(undefined), undefined);
});

// ── buildCalibreDistanceStats ──────────────────────────────────────────────
test('buildCalibreDistanceStats hides both cards when no calibre or distance data', () => {
  const restore = installDomStub(['calibre-card', 'calibre-chart', 'distance-card', 'distance-chart']);
  try {
    buildCalibreDistanceStats([{ species: 'Roe Deer' }]);
    assert.equal(restore.els['calibre-card'].style.display, 'none');
    assert.equal(restore.els['distance-card'].style.display, 'none');
  } finally { restore(); }
});

test('buildCalibreDistanceStats paints calibre rows sorted by count desc, top-6 only', () => {
  const restore = installDomStub(['calibre-card', 'calibre-chart', 'distance-card', 'distance-chart']);
  try {
    // 7 distinct calibres, uneven counts → top-6 must render in desc count order.
    const entries = [];
    const counts = [['.308', 5], ['.243', 4], ['6.5CM', 3], ['.270', 2], ['.223', 1], ['.22-250', 1], ['.30-06', 1]];
    for (const [c, n] of counts) for (let i = 0; i < n; i++) entries.push({ calibre: c });
    buildCalibreDistanceStats(entries);
    assert.equal(restore.els['calibre-card'].style.display, 'block');
    const html = restore.els['calibre-chart'].innerHTML;
    const rows = html.match(/class="cal-row"/g) || [];
    assert.equal(rows.length, 6, 'expected top-6 slice');
    // First row should be .308 (highest count).
    const first = html.slice(0, html.indexOf('</div>', html.indexOf('cal-name')) + 6);
    assert.match(first, /\.308/);
  } finally { restore(); }
});

test('buildCalibreDistanceStats shows per-calibre average distance when any entry has one', () => {
  const restore = installDomStub(['calibre-card', 'calibre-chart', 'distance-card', 'distance-chart']);
  try {
    buildCalibreDistanceStats([
      { calibre: '.308', distance_m: 100 },
      { calibre: '.308', distance_m: 200 },
      { calibre: '.243' }, // no distance — should render with '–'
    ]);
    const html = restore.els['calibre-chart'].innerHTML;
    // Avg for .308 is 150m.
    assert.match(html, /\.308[\s\S]*?150m/);
    // .243 row gets the em-dash fallback.
    assert.match(html, /\.243[\s\S]*?–/);
  } finally { restore(); }
});

test('buildCalibreDistanceStats paints overall avg + distance bands when distances present', () => {
  const restore = installDomStub(['calibre-card', 'calibre-chart', 'distance-card', 'distance-chart']);
  try {
    buildCalibreDistanceStats([
      { species: 'Roe Deer', calibre: '.243', distance_m: 40 },   // 0-50m band
      { species: 'Roe Deer', calibre: '.243', distance_m: 80 },   // 51-100m band
      { species: 'Roe Deer', calibre: '.243', distance_m: 180 },  // 150m+ band
    ]);
    assert.equal(restore.els['distance-card'].style.display, 'block');
    const html = restore.els['distance-chart'].innerHTML;
    // Overall avg = round((40+80+180)/3) = 100.
    assert.match(html, /dist-avg-val">100</);
    // All four band labels present.
    assert.match(html, /0 – 50m/);
    assert.match(html, /51 – 100m/);
    assert.match(html, /101 – 150m/);
    assert.match(html, /150m\+/);
  } finally { restore(); }
});

test('buildCalibreDistanceStats shows per-species distance section only when >1 species', () => {
  const restore = installDomStub(['calibre-card', 'calibre-chart', 'distance-card', 'distance-chart']);
  try {
    // Single species → no "By species" section.
    buildCalibreDistanceStats([
      { species: 'Roe Deer', calibre: '.243', distance_m: 100 },
      { species: 'Roe Deer', calibre: '.243', distance_m: 50 },
    ]);
    assert.equal(restore.els['distance-chart'].innerHTML.includes('By species'), false);
    // Multi species → section appears.
    buildCalibreDistanceStats([
      { species: 'Roe Deer',  calibre: '.243', distance_m: 50 },
      { species: 'Fallow',    calibre: '.308', distance_m: 150 },
    ]);
    assert.match(restore.els['distance-chart'].innerHTML, /By species/);
  } finally { restore(); }
});

// ── buildAgeStats ──────────────────────────────────────────────────────────
test('buildAgeStats hides card when no entry carries an age_class', () => {
  const restore = installDomStub(['age-card', 'age-chart']);
  try {
    buildAgeStats([{ species: 'Roe Deer' }, { species: 'Fallow' }]);
    assert.equal(restore.els['age-card'].style.display, 'none');
  } finally { restore(); }
});

test('buildAgeStats paints one bar row per AGE_CLASSES entry in canonical order', () => {
  const restore = installDomStub(['age-card', 'age-chart']);
  try {
    buildAgeStats([
      { species: 'Roe Deer', age_class: 'Yearling' },
      { species: 'Roe Deer', age_class: '2-4 years' },
      { species: 'Roe Deer', age_class: '9+ years' },
    ]);
    assert.equal(restore.els['age-card'].style.display, 'block');
    const html = restore.els['age-chart'].innerHTML;
    const rows = html.match(/class="age-row"/g) || [];
    assert.equal(rows.length, AGE_CLASSES.length,
      'expected one row per canonical age class even when some have 0 count');
  } finally { restore(); }
});

test('buildAgeStats bucketises legacy "Calf / Kid" as "Calf / Kid / Fawn"', () => {
  const restore = installDomStub(['age-card', 'age-chart']);
  try {
    buildAgeStats([
      { species: 'Roe Deer', age_class: 'Calf / Kid' },     // legacy
      { species: 'Roe Deer', age_class: 'Calf / Kid / Fawn' },
    ]);
    const html = restore.els['age-chart'].innerHTML;
    // The Calf-row count must be 2 (both entries collapsed into the canonical bucket).
    // Find the first age-row which is the Calf row (index 0 in AGE_CLASSES).
    const firstRowEnd = html.indexOf('</div>', html.indexOf('class="age-row"'));
    const firstRow = html.slice(0, firstRowEnd + 6);
    // More robust: pick the age-cnt for the Calf row specifically.
    assert.match(html, /Calf \/ Kid \/ Fawn[\s\S]*?class="age-cnt">2</);
  } finally { restore(); }
});

test('buildAgeStats renders Juvenile / Adult / Mature summary pills plus "Not recorded" when applicable', () => {
  const restore = installDomStub(['age-card', 'age-chart']);
  try {
    buildAgeStats([
      { species: 'Roe Deer', age_class: 'Yearling' },     // Juvenile
      { species: 'Roe Deer', age_class: '2-4 years' },    // Adult
      { species: 'Roe Deer', age_class: '9+ years' },     // Mature
      { species: 'Roe Deer' },                            // Not recorded
    ]);
    const html = restore.els['age-chart'].innerHTML;
    for (const grp of Object.keys(AGE_GROUPS)) {
      assert.match(html, new RegExp('age-pill-txt">' + grp + '<'));
    }
    assert.match(html, /Not recorded/);
  } finally { restore(); }
});

test('buildAgeStats hides "By species" mini-section when only one species has age data', () => {
  const restore = installDomStub(['age-card', 'age-chart']);
  try {
    buildAgeStats([
      { species: 'Roe Deer', age_class: 'Yearling' },
      { species: 'Roe Deer', age_class: '2-4 years' },
    ]);
    assert.equal(restore.els['age-chart'].innerHTML.includes('By species'), false);
  } finally { restore(); }
});

test('buildAgeStats shows "By species" mini-section when >1 species has age data', () => {
  const restore = installDomStub(['age-card', 'age-chart']);
  try {
    buildAgeStats([
      { species: 'Roe Deer', age_class: 'Yearling' },
      { species: 'Fallow',   age_class: '2-4 years' },
    ]);
    const html = restore.els['age-chart'].innerHTML;
    assert.match(html, /By species/);
    assert.match(html, /class="age-sp-nm">Roe Deer</);
    assert.match(html, /class="age-sp-nm">Fallow</);
  } finally { restore(); }
});

// ── buildTrendsChart ───────────────────────────────────────────────────────
test('buildTrendsChart hides card when currentSeason is not __all__', () => {
  const restore = installDomStub(['trends-card', 'trends-chart']);
  try {
    buildTrendsChart([{ date: '2024-08-15' }], { currentSeason: '2024-25' });
    assert.equal(restore.els['trends-card'].style.display, 'none');
  } finally { restore(); }
});

test('buildTrendsChart hides card when fewer than 2 seasons of data', () => {
  const restore = installDomStub(['trends-card', 'trends-chart']);
  try {
    buildTrendsChart(
      [{ date: '2024-08-15' }, { date: '2024-09-01' }],
      { currentSeason: '__all__' }
    );
    assert.equal(restore.els['trends-card'].style.display, 'none');
  } finally { restore(); }
});

test('buildTrendsChart paints a row per season when >=2 seasons present, last-5 window', () => {
  const restore = installDomStub(['trends-card', 'trends-chart']);
  try {
    // 7 seasons of data, one entry each. Should render exactly 5 rows
    // (the most recent 5) and each row should have a follow-up meta line.
    const entries = [
      { date: '2019-08-15', species: 'Roe Deer' },
      { date: '2020-08-15', species: 'Roe Deer' },
      { date: '2021-08-15', species: 'Roe Deer' },
      { date: '2022-08-15', species: 'Roe Deer', weight_kg: '15.5' },
      { date: '2023-08-15', species: 'Roe Deer', weight_kg: '16.2' },
      { date: '2024-08-15', species: 'Fallow',   weight_kg: '40.0' },
      { date: '2025-08-15', species: 'Roe Deer' },
    ];
    buildTrendsChart(entries, { currentSeason: '__all__' });
    assert.equal(restore.els['trends-card'].style.display, 'block');
    const html = restore.els['trends-chart'].innerHTML;
    const rows = html.match(/class="bar-row"/g) || [];
    assert.equal(rows.length, 5, 'should cap at most-recent 5 seasons');
    // Avg weight line fallback (no weight_kg recorded) shows –.
    assert.match(html, /Avg weight: – kg/);
    // Entries with weight_kg show the numeric average.
    assert.match(html, /Avg weight: 15\.5 kg/);
  } finally { restore(); }
});

// ── buildGroundStats ───────────────────────────────────────────────────────
test('buildGroundStats early-returns when card or chart element is missing', () => {
  const restore = installDomStub([]);
  try {
    buildGroundStats([{ ground: 'Farm A' }]);  // must not throw
  } finally { restore(); }
});

test('buildGroundStats hides card when every entry is untagged', () => {
  const restore = installDomStub(['ground-card', 'ground-chart']);
  try {
    buildGroundStats([{}, { ground: '' }, { ground: '  ' }]);
    assert.equal(restore.els['ground-card'].style.display, 'none');
  } finally { restore(); }
});

test('buildGroundStats paints rows sorted desc by count, top ground in green', () => {
  const restore = installDomStub(['ground-card', 'ground-chart']);
  try {
    buildGroundStats([
      { ground: 'Farm A' }, { ground: 'Farm A' }, { ground: 'Farm A' },  // 3
      { ground: 'Farm B' }, { ground: 'Farm B' },                         // 2
      { ground: 'Farm C' },                                               // 1
    ]);
    assert.equal(restore.els['ground-card'].style.display, 'block');
    const html = restore.els['ground-chart'].innerHTML;
    const rows = html.match(/class="bar-row"/g) || [];
    assert.equal(rows.length, 3);
    // Farm A should appear first (top-1), using the green gradient.
    const firstRowStart = html.indexOf('bar-row');
    const firstRow = html.slice(firstRowStart, html.indexOf('</div>', html.indexOf('bar-cnt', firstRowStart)) + 6);
    assert.match(firstRow, /Farm A/);
    assert.match(firstRow, /#5a7a30/);
    // Farm B and C are "other", should use the gold gradient.
    assert.match(html, /Farm B[\s\S]*?#c8a84b/);
  } finally { restore(); }
});

test('buildGroundStats renders Untagged row last in grey when untagged entries exist', () => {
  const restore = installDomStub(['ground-card', 'ground-chart']);
  try {
    buildGroundStats([
      { ground: 'Farm A' },
      { ground: 'Farm A' },
      {},
      { ground: '' },
    ]);
    const html = restore.els['ground-chart'].innerHTML;
    assert.match(html, /Untagged/);
    // Untagged comes after Farm A in source order.
    assert.ok(html.indexOf('Untagged') > html.indexOf('Farm A'));
    // Grey fill colour.
    assert.match(html, /Untagged[\s\S]*?#e0dcd6/);
  } finally { restore(); }
});

test('buildGroundStats escapes hostile ground names', () => {
  const restore = installDomStub(['ground-card', 'ground-chart']);
  try {
    buildGroundStats([{ ground: '<script>x</script>' }]);
    const html = restore.els['ground-chart'].innerHTML;
    assert.equal(html.includes('<script>x</script>'), false);
    assert.match(html, /&lt;script&gt;/);
  } finally { restore(); }
});

// ═════════════════════════════════════════════════════════════════════════
// Commit O — renderStatsTabBody orchestrator
// ═════════════════════════════════════════════════════════════════════════

// Every DOM id that renderStatsTabBody reaches for. Kept as a module-level
// constant so each test registers the same set with its stub.
const STATS_TAB_IDS = [
  // top KPI cells
  'st-total', 'st-total-sub',
  'st-target', 'st-target-sub',
  'st-dist', 'st-dist-sub',
  'st-species',
  // main charts
  'weight-chart', 'species-chart', 'sex-chart', 'month-chart',
  // sub-card elements (the fan-out builders all touch these)
  'calibre-card', 'calibre-chart',
  'distance-card', 'distance-chart',
  'age-card', 'age-chart',
  'shooter-card', 'shooter-chart',
  'destination-card', 'destination-chart',
  'time-card', 'time-chart',
  'trends-card', 'trends-chart',
  'ground-card', 'ground-chart',
];

// Default opts bag — overridable per-test. Matches the real DI contract
// from diary.js's buildStats wrapper:
//   computeSeasonTargetKpi(total)           → { targetPct, ... }
//   formatSeasonTargetSub(total, calc)      → string
//   hasValue(v)                             → bool
//   statsChartEmpty(msg)                    → html
function makeOpts(overrides) {
  const base = {
    currentSeason: '2025-26',
    computeSeasonTargetKpi: () => ({ targetPct: 42 }),
    formatSeasonTargetSub:  (n, c) => n + ' culls · ' + (c.targetPct == null ? '–' : c.targetPct + '%'),
    hasValue: v => !(v === null || v === undefined || v === ''),
    statsChartEmpty: msg => '<div class="stats-empty">' + msg + '</div>',
  };
  return Object.assign(base, overrides || {});
}

test('renderStatsTabBody paints top KPIs from entries + opts DI', () => {
  const restore = installDomStub(STATS_TAB_IDS);
  try {
    renderStatsTabBody(
      [
        { species: 'Roe Deer', weight_kg: '15',  distance_m: 80, lat: 52, lng: 1 },
        { species: 'Fallow',   weight_kg: '40',  distance_m: 120 },
        { species: 'Roe Deer' },
      ],
      makeOpts()
    );
    // Total entries = 3.
    assert.equal(restore.els['st-total'].textContent, 3);
    // 1/3 mapped → 33%.
    assert.match(restore.els['st-total-sub'].textContent, /Mapped 1\/3 · 33%/);
    // Target pill mirrors the DI'd calc (42%).
    assert.equal(restore.els['st-target'].textContent, '42%');
    assert.match(restore.els['st-target-sub'].textContent, /3 culls · 42%/);
    // Distance avg = round((80+120)/2) = 100m.
    assert.equal(restore.els['st-dist'].textContent, '100m');
    assert.match(restore.els['st-dist-sub'].textContent, /2 entries with distance/);
    // 2 distinct species.
    assert.equal(restore.els['st-species'].textContent, 2);
  } finally { restore(); }
});

test('renderStatsTabBody renders the em-dash fallback when targetPct is null', () => {
  const restore = installDomStub(STATS_TAB_IDS);
  try {
    renderStatsTabBody(
      [{ species: 'Roe Deer' }],
      makeOpts({ computeSeasonTargetKpi: () => ({ targetPct: null }) })
    );
    assert.equal(restore.els['st-target'].textContent, '–');
  } finally { restore(); }
});

test('renderStatsTabBody renders weight grid with total / average / heaviest / missing', () => {
  const restore = installDomStub(STATS_TAB_IDS);
  try {
    renderStatsTabBody(
      [
        { species: 'Roe Deer', weight_kg: '20', date: '2024-08-15' },
        { species: 'Fallow',   weight_kg: '50', date: '2024-09-01' },
        { species: 'Roe Deer' },
      ],
      makeOpts()
    );
    const html = restore.els['weight-chart'].innerHTML;
    // Total kg = 70.
    assert.match(html, /Total kg[\s\S]*?70</);
    // Average = 35.0.
    assert.match(html, /Average kg[\s\S]*?35\.0</);
    // Heaviest entry — Fallow at 50 kg, dated 2024-09.
    assert.match(html, /Heaviest[\s\S]*?50<[\s\S]*?Fallow · 2024-09/);
    // Missing weight = 1.
    assert.match(html, /Missing weight[\s\S]*?1</);
  } finally { restore(); }
});

test('renderStatsTabBody species chart paints bar + sex sub-rows per species, sorted desc', () => {
  const restore = installDomStub(STATS_TAB_IDS);
  try {
    renderStatsTabBody(
      [
        { species: 'Roe Deer', sex: 'm' },
        { species: 'Roe Deer', sex: 'f' },
        { species: 'Roe Deer', sex: 'f' },
        { species: 'Fallow',   sex: 'm' },
      ],
      makeOpts()
    );
    const html = restore.els['species-chart'].innerHTML;
    // Roe Deer appears before Fallow (higher count).
    assert.ok(html.indexOf('Roe Deer') < html.indexOf('Fallow'));
    // Male sub-label for Roe Deer is "Buck".
    assert.match(html, /Roe Deer[\s\S]*?♂ Buck/);
    // Female sub-label for Roe Deer is "Doe".
    assert.match(html, /Roe Deer[\s\S]*?♀ Doe/);
  } finally { restore(); }
});

test('renderStatsTabBody species chart falls back to statsChartEmpty on zero entries', () => {
  const restore = installDomStub(STATS_TAB_IDS);
  try {
    renderStatsTabBody([], makeOpts({
      statsChartEmpty: msg => '<div class="EMPTY">' + msg + '</div>',
    }));
    assert.match(restore.els['species-chart'].innerHTML, /class="EMPTY"[\s\S]*?No culls this season/);
  } finally { restore(); }
});

test('renderStatsTabBody sex chart always paints both Male and Female rows', () => {
  const restore = installDomStub(STATS_TAB_IDS);
  try {
    renderStatsTabBody([{ species: 'Roe Deer', sex: 'm' }], makeOpts());
    const html = restore.els['sex-chart'].innerHTML;
    assert.match(html, /♂ Male/);
    assert.match(html, /♀ Female/);
  } finally { restore(); }
});

test('renderStatsTabBody monthly chart emits 12 columns in UK season order (Aug→Jul)', () => {
  const restore = installDomStub(STATS_TAB_IDS);
  try {
    renderStatsTabBody(
      [
        { species: 'Roe Deer', date: '2024-08-15' },
        { species: 'Roe Deer', date: '2024-08-20' },
        { species: 'Roe Deer', date: '2025-01-05' },
      ],
      makeOpts()
    );
    const html = restore.els['month-chart'].innerHTML;
    const cols = html.match(/class="mc-col"/g) || [];
    assert.equal(cols.length, 12);
    // Aug is the first column rendered.
    const firstLblIdx = html.indexOf('class="mc-lbl">');
    assert.match(html.slice(firstLblIdx, firstLblIdx + 40), /Aug/);
    // Aug has 2 entries → peak month, should get the `.pk` class.
    assert.match(html, /mc-bar pk[\s\S]*?Aug/);
  } finally { restore(); }
});

test('renderStatsTabBody fans out to the seven sub-builders (they touch their own cards)', () => {
  const restore = installDomStub(STATS_TAB_IDS);
  try {
    renderStatsTabBody(
      [
        { species: 'Roe Deer', calibre: '.243', distance_m: 80, age_class: 'Yearling',
          shooter: 'Self', destination: 'Game dealer', time: '06:30', ground: 'Farm A',
          date: '2024-08-15' },
      ],
      makeOpts({ currentSeason: '__all__' })   // trends will still hide (<2 seasons)
    );
    // Each sub-card has had its card-element touched (display was set to 'block'
    // or 'none' — and since we prime style.display = '' in the stub, any change
    // away from '' means the builder ran).
    const touched = [
      'calibre-card','distance-card','age-card','shooter-card',
      'destination-card','time-card','trends-card','ground-card'
    ];
    for (const id of touched) {
      assert.notEqual(restore.els[id].style.display, '',
        id + ' not touched by a sub-builder');
    }
  } finally { restore(); }
});

test('renderStatsTabBody top-KPI + chart writes are null-safe when KPI ids are missing', () => {
  // Register only the sub-card ids (the sub-builders pre-date the null-safe
  // _setText / _setHtml helpers and still assume their own cards exist).
  // The top-KPI cells / weight-chart / species-chart / sex-chart / month-chart
  // MUST survive a missing node without throwing — that is the protection the
  // _setText / _setHtml helpers in this body provide against stale-cache skew.
  const restore = installDomStub([
    'calibre-card', 'calibre-chart', 'distance-card', 'distance-chart',
    'age-card', 'age-chart', 'shooter-card', 'shooter-chart',
    'destination-card', 'destination-chart', 'time-card', 'time-chart',
    'trends-card', 'trends-chart', 'ground-card', 'ground-chart',
  ]);
  try {
    renderStatsTabBody(
      [{ species: 'Roe Deer', weight_kg: '20', distance_m: 80 }],
      makeOpts()
    );
    // Did not throw despite every top-KPI / weight / species / sex / month
    // element being absent — the null-safety contract held.
  } finally { restore(); }
});

test('renderStatsTabBody routes opts.currentSeason to buildTrendsChart', () => {
  const restore = installDomStub(STATS_TAB_IDS);
  try {
    // With __all__ and ≥2 seasons, trends should be visible.
    renderStatsTabBody(
      [
        { species: 'Roe Deer', date: '2023-08-15' },
        { species: 'Roe Deer', date: '2024-08-15' },
        { species: 'Roe Deer', date: '2025-08-15' },
      ],
      makeOpts({ currentSeason: '__all__' })
    );
    assert.equal(restore.els['trends-card'].style.display, 'block');
    assert.match(restore.els['trends-chart'].innerHTML, /bar-row/);
  } finally { restore(); }
});
