// =============================================================================
// Tests for lib/fl-pure.mjs
//
// Runtime: Node's built-in test runner + assert/strict. No dependencies,
// no package.json required, no node_modules installed.
//
// Run:
//   node --test tests/
//
// (Or: `npm test` once the minimal package.json is present.)
//
// Coverage targets the pure helpers that have behavioural edge cases worth
// pinning — season roll-over on 1-Aug, 2-digit / 4-digit season years, CSV
// quoting for Excel, abnormality summary phrasing across the none / codes /
// other combinations. Additions welcome as more helpers graduate from
// diary.js into lib/.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MONTH_NAMES,
  ABNORMALITY_OPTIONS,
  ABNORMALITY_LABEL_BY_CODE,
  seasonLabel,
  buildSeasonFromEntry,
  buildSeasonList,
  sexLabel,
  sexBadgeClass,
  parseEntryDateParts,
  csvField,
  esc,
  abnormalitySummaryText,
} from '../lib/fl-pure.mjs';

// ── data tables ────────────────────────────────────────────────────────────
test('MONTH_NAMES has 12 short-form entries in calendar order', () => {
  assert.equal(MONTH_NAMES.length, 12);
  assert.equal(MONTH_NAMES[0], 'Jan');
  assert.equal(MONTH_NAMES[11], 'Dec');
});

test('ABNORMALITY_LABEL_BY_CODE covers every option', () => {
  ABNORMALITY_OPTIONS.forEach((o) => {
    assert.equal(ABNORMALITY_LABEL_BY_CODE[o.code], o.label);
  });
  // Sanity: 12 options matches the chip grid layout in diary.css.
  assert.equal(ABNORMALITY_OPTIONS.length, 12);
});

// ── seasonLabel ────────────────────────────────────────────────────────────
test('seasonLabel expands 2-digit season end years', () => {
  assert.equal(seasonLabel('2025-26'), '2025–2026 Season');
  assert.equal(seasonLabel('1999-00'), '1999–2000 Season');
});

test('seasonLabel passes 4-digit end years through untouched', () => {
  assert.equal(seasonLabel('2025-2026'), '2025–2026 Season');
});

// ── buildSeasonFromEntry ──────────────────────────────────────────────────
test('buildSeasonFromEntry: Aug starts the new season', () => {
  assert.equal(buildSeasonFromEntry('2025-08-01'), '2025-26');
  assert.equal(buildSeasonFromEntry('2025-12-31'), '2025-26');
});

test('buildSeasonFromEntry: Jan-Jul roll into the prior season', () => {
  assert.equal(buildSeasonFromEntry('2026-01-15'), '2025-26');
  assert.equal(buildSeasonFromEntry('2026-07-31'), '2025-26');
});

test('buildSeasonFromEntry: 1-Aug is the exact hinge', () => {
  // 31-Jul = old season, 1-Aug = new.
  assert.equal(buildSeasonFromEntry('2026-07-31'), '2025-26');
  assert.equal(buildSeasonFromEntry('2026-08-01'), '2026-27');
});

test('buildSeasonFromEntry: returns null for junk input', () => {
  assert.equal(buildSeasonFromEntry(null), null);
  assert.equal(buildSeasonFromEntry(''), null);
  assert.equal(buildSeasonFromEntry('   '), null);
  assert.equal(buildSeasonFromEntry('banana'), null);
  assert.equal(buildSeasonFromEntry('2025'), null);     // missing month
  assert.equal(buildSeasonFromEntry('2025-13'), null);  // month out of range
  assert.equal(buildSeasonFromEntry('2025-00'), null);
});

// ── buildSeasonList ───────────────────────────────────────────────────────
test('buildSeasonList: one element when earliest is null', () => {
  assert.deepEqual(buildSeasonList('2025-26', null), ['2025-26']);
});

test('buildSeasonList: spans from current back to earliest inclusive', () => {
  assert.deepEqual(
    buildSeasonList('2025-26', '2022-23'),
    ['2025-26', '2024-25', '2023-24', '2022-23']
  );
});

test('buildSeasonList: caps at 10 seasons regardless of earliest', () => {
  const seasons = buildSeasonList('2025-26', '1990-91');
  assert.equal(seasons.length, 10);
  assert.equal(seasons[0], '2025-26');
  assert.equal(seasons[9], '2016-17');
});

// ── sexLabel / sexBadgeClass ──────────────────────────────────────────────
test('sexLabel: Buck/Doe for small-to-medium deer', () => {
  assert.equal(sexLabel('m', 'Roe Deer'), 'Buck');
  assert.equal(sexLabel('f', 'Roe Deer'), 'Doe');
  assert.equal(sexLabel('m', 'Muntjac'), 'Buck');
  assert.equal(sexLabel('f', 'CWD'), 'Doe');
  assert.equal(sexLabel('m', 'Fallow'), 'Buck');
});

test('sexLabel: Stag/Hind for large deer', () => {
  assert.equal(sexLabel('m', 'Red Deer'), 'Stag');
  assert.equal(sexLabel('f', 'Red Deer'), 'Hind');
  assert.equal(sexLabel('m', 'Sika'), 'Stag');
});

test('sexLabel: unknown species defaults to Stag/Hind', () => {
  assert.equal(sexLabel('m', 'Reindeer'), 'Stag');
  assert.equal(sexLabel('f', ''), 'Hind');
  assert.equal(sexLabel('f', undefined), 'Hind');
});

test('sexBadgeClass: Buck/Doe species map to sx-bu / sx-do', () => {
  assert.equal(sexBadgeClass('m', 'Roe Deer'), 'sx-bu');
  assert.equal(sexBadgeClass('f', 'Muntjac'), 'sx-do');
});

test('sexBadgeClass: Stag/Hind species map to sx-st / sx-hi', () => {
  assert.equal(sexBadgeClass('m', 'Red Deer'), 'sx-st');
  assert.equal(sexBadgeClass('f', 'Sika'), 'sx-hi');
});

// ── parseEntryDateParts ───────────────────────────────────────────────────
test('parseEntryDateParts splits a YYYY-MM-DD without a TZ shift', () => {
  // Classic bug: `new Date('2025-08-01')` gives 31-Jul in BST.
  const p = parseEntryDateParts('2025-08-01');
  assert.deepEqual(p, { y: 2025, m: 8, day: 1 });
});

test('parseEntryDateParts rejects nonsense', () => {
  assert.equal(parseEntryDateParts(null), null);
  assert.equal(parseEntryDateParts(''), null);
  assert.equal(parseEntryDateParts('2025-08'), null);
  assert.equal(parseEntryDateParts('2025-13-01'), null);
  assert.equal(parseEntryDateParts('2025-00-15'), null);
  assert.equal(parseEntryDateParts('2025-08-00'), null);
  assert.equal(parseEntryDateParts('2025-08-32'), null);
  assert.equal(parseEntryDateParts('abc-08-01'), null);
});

// ── csvField ──────────────────────────────────────────────────────────────
test('csvField wraps every value in double quotes', () => {
  assert.equal(csvField('hello'), '"hello"');
  assert.equal(csvField(42), '"42"');
  assert.equal(csvField(0), '"0"');
  assert.equal(csvField(null), '""');
  assert.equal(csvField(undefined), '""');
  assert.equal(csvField(''), '""');
});

test('csvField doubles internal double quotes (RFC 4180)', () => {
  assert.equal(csvField('a "b" c'), '"a ""b"" c"');
  assert.equal(csvField('"lead'), '"""lead"');
});

test('csvField squashes CR/LF to a single space so Excel never splits a row', () => {
  assert.equal(csvField('line1\nline2'),   '"line1 line2"');
  assert.equal(csvField('line1\r\nline2'), '"line1 line2"');
  assert.equal(csvField('line1\rline2'),   '"line1 line2"');
});

// ── esc ───────────────────────────────────────────────────────────────────
test('esc escapes the five critical HTML entities', () => {
  assert.equal(esc('<script>'),      '&lt;script&gt;');
  assert.equal(esc('a & b'),         'a &amp; b');
  assert.equal(esc('"quoted"'),      '&quot;quoted&quot;');
  assert.equal(esc("O'Reilly"),      'O&#x27;Reilly');
  assert.equal(esc('<a href="x">'),  '&lt;a href=&quot;x&quot;&gt;');
});

test('esc returns empty string for null / undefined', () => {
  assert.equal(esc(null),      '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(''),        '');
});

// ── abnormalitySummaryText ────────────────────────────────────────────────
test('abnormalitySummaryText: ["none"] + no free-text → confirmed-clear message', () => {
  assert.equal(
    abnormalitySummaryText(['none'], null),
    'No abnormalities observed at gralloch'
  );
});

test('abnormalitySummaryText: ["none"] + free-text → "additional note" suffix', () => {
  assert.equal(
    abnormalitySummaryText(['none'], 'slight bruise, quickly dressed'),
    'No structural abnormalities observed (additional note: slight bruise, quickly dressed)'
  );
});

test('abnormalitySummaryText: codes map to labels joined by semicolon', () => {
  assert.equal(
    abnormalitySummaryText(['fluke', 'tb-lesions'], null),
    'Liver fluke visible; Lung lesions (possible TB)'
  );
});

test('abnormalitySummaryText: codes + free-text appended with "plus:"', () => {
  assert.equal(
    abnormalitySummaryText(['fluke'], 'unusual pale liver'),
    'Liver fluke visible; plus: unusual pale liver'
  );
});

test('abnormalitySummaryText: "none" is filtered from a multi-code list', () => {
  // Defensive — UI should never produce this, but stored data could.
  assert.equal(
    abnormalitySummaryText(['none', 'fluke'], null),
    'Liver fluke visible'
  );
});

test('abnormalitySummaryText: empty codes + no free-text → null', () => {
  assert.equal(abnormalitySummaryText(null, null), null);
  assert.equal(abnormalitySummaryText([], null), null);
  assert.equal(abnormalitySummaryText(null, ''), null);
  assert.equal(abnormalitySummaryText(null, '   '), null);
});

test('abnormalitySummaryText: empty codes + free-text → free-text alone', () => {
  assert.equal(abnormalitySummaryText(null, 'something odd'), 'something odd');
  assert.equal(abnormalitySummaryText([],   'something odd'), 'something odd');
});

test('abnormalitySummaryText: unknown codes fall back to the raw code', () => {
  assert.equal(
    abnormalitySummaryText(['fluke', 'invented-code'], null),
    'Liver fluke visible; invented-code'
  );
});
