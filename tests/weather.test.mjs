// =============================================================================
// Tests for modules/weather.mjs
//
// Runtime: Node's built-in test runner + assert/strict. Zero dependencies.
//
// Run:
//   node --test tests/
//   npm test
//
// Scope: the four pure helpers. `fetchCullWeather` is *not* covered here —
// it's a thin wrapper around global fetch, and mocking it in Node cleanly
// requires either undici intercepts or adding a fetch argument we'd only
// use in tests. The payload-shaping logic is trivially covered by eye via
// the smoke test after save.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  wxCodeLabel,
  windDirLabel,
  findOpenMeteoHourlyIndex,
  diaryLondonWallMs
} from '../modules/weather.mjs';

// ── wxCodeLabel ────────────────────────────────────────────────────────────
test('wxCodeLabel(0) → Clear (CLR)', () => {
  const r = wxCodeLabel(0);
  assert.equal(r.abbrev, 'CLR');
  assert.equal(r.label, 'Clear');
  assert.match(r.skySvg, /^<svg/);
});

test('wxCodeLabel(null) and (undefined) fall through to Clear', () => {
  assert.equal(wxCodeLabel(null).abbrev, 'CLR');
  assert.equal(wxCodeLabel(undefined).abbrev, 'CLR');
});

test('wxCodeLabel(1)/(2) → Partly cloudy (PTLY)', () => {
  assert.equal(wxCodeLabel(1).abbrev, 'PTLY');
  assert.equal(wxCodeLabel(2).abbrev, 'PTLY');
});

test('wxCodeLabel(3) → Overcast (OVC) — boundary that used to break', () => {
  const r = wxCodeLabel(3);
  assert.equal(r.abbrev, 'OVC');
  // The d= path for OVC had a stray extra param pre-2026-04-16; pin the
  // fix here so it never regresses. SVG arc commands take exactly 7 params.
  assert.ok(
    !r.skySvg.includes('0-8 0h-.5'),
    'SVG_WX_SKY_OVC must not contain the malformed 8-param arc'
  );
  assert.ok(r.skySvg.includes('0-8h-.5'), 'OVC path must use the valid 7-param arc');
});

test('wxCodeLabel bucket boundaries (fog, drizzle, rain, snow, showers, snow-showers, thunder)', () => {
  assert.equal(wxCodeLabel(45).abbrev, 'FG');
  assert.equal(wxCodeLabel(49).abbrev, 'FG');
  assert.equal(wxCodeLabel(51).abbrev, 'DZ');
  assert.equal(wxCodeLabel(57).abbrev, 'DZ');
  assert.equal(wxCodeLabel(61).abbrev, 'RA');
  assert.equal(wxCodeLabel(65).abbrev, 'RA');
  assert.equal(wxCodeLabel(71).abbrev, 'SN');
  assert.equal(wxCodeLabel(77).abbrev, 'SN');
  assert.equal(wxCodeLabel(80).abbrev, 'SHRA');
  assert.equal(wxCodeLabel(82).abbrev, 'SHRA');
  assert.equal(wxCodeLabel(85).abbrev, 'SHSN');
  assert.equal(wxCodeLabel(86).abbrev, 'SHSN');
  assert.equal(wxCodeLabel(95).abbrev, 'TS');
  assert.equal(wxCodeLabel(99).abbrev, 'TS');
});

test('wxCodeLabel(100) → Unknown (out of WMO range)', () => {
  assert.equal(wxCodeLabel(100).abbrev, '–');
  assert.equal(wxCodeLabel(100).label, 'Unknown');
});

// ── windDirLabel ───────────────────────────────────────────────────────────
test('windDirLabel cardinals and half-cardinals', () => {
  assert.equal(windDirLabel(0),   'N');
  assert.equal(windDirLabel(45),  'NE');
  assert.equal(windDirLabel(90),  'E');
  assert.equal(windDirLabel(135), 'SE');
  assert.equal(windDirLabel(180), 'S');
  assert.equal(windDirLabel(225), 'SW');
  assert.equal(windDirLabel(270), 'W');
  assert.equal(windDirLabel(315), 'NW');
});

test('windDirLabel(360) wraps back to N (modulo 8 buckets)', () => {
  assert.equal(windDirLabel(360), 'N');
});

test('windDirLabel rounds to the nearest bucket', () => {
  assert.equal(windDirLabel(22),  'N');  // < 22.5 → N
  assert.equal(windDirLabel(23),  'NE'); // ≥ 22.5 → NE
  assert.equal(windDirLabel(67),  'NE'); // < 67.5 → NE
  assert.equal(windDirLabel(68),  'E');  // ≥ 67.5 → E
});

test('windDirLabel null/undefined → empty string', () => {
  assert.equal(windDirLabel(null), '');
  assert.equal(windDirLabel(undefined), '');
});

// ── findOpenMeteoHourlyIndex ───────────────────────────────────────────────
test('findOpenMeteoHourlyIndex exact match (HH:00 variant)', () => {
  const times = ['2026-04-15T10:00', '2026-04-15T11:00', '2026-04-15T12:00'];
  assert.equal(findOpenMeteoHourlyIndex(times, '2026-04-15', 11), 1);
});

test('findOpenMeteoHourlyIndex prefix match (HH:00:00 variant)', () => {
  const times = ['2026-04-15T10:00:00', '2026-04-15T11:00:00', '2026-04-15T12:00:00'];
  assert.equal(findOpenMeteoHourlyIndex(times, '2026-04-15', 11), 1);
});

test('findOpenMeteoHourlyIndex zero-pads single-digit hours', () => {
  const times = ['2026-04-15T08:00', '2026-04-15T09:00'];
  assert.equal(findOpenMeteoHourlyIndex(times, '2026-04-15', 9), 1);
});

test('findOpenMeteoHourlyIndex returns -1 for unknown date/hour', () => {
  const times = ['2026-04-15T10:00', '2026-04-15T11:00'];
  assert.equal(findOpenMeteoHourlyIndex(times, '2026-04-15', 23), -1);
  assert.equal(findOpenMeteoHourlyIndex(times, '1999-01-01', 10), -1);
});

test('findOpenMeteoHourlyIndex returns -1 on empty/null input', () => {
  assert.equal(findOpenMeteoHourlyIndex([], '2026-04-15', 10), -1);
  assert.equal(findOpenMeteoHourlyIndex(null, '2026-04-15', 10), -1);
});

// ── diaryLondonWallMs ──────────────────────────────────────────────────────
// We assert the function returns the UTC epoch-ms for the given London
// wall-clock moment. Since tests can run in any host TZ (CI boxes are UTC,
// dev boxes often local), we verify against UTC anchors.

test('diaryLondonWallMs: midwinter (GMT = UTC, offset 0)', () => {
  // 2026-01-15 12:00 London = 2026-01-15 12:00 UTC
  const got = diaryLondonWallMs('2026-01-15', '12:00');
  const expected = Date.UTC(2026, 0, 15, 12, 0);
  assert.equal(got, expected);
});

test('diaryLondonWallMs: midsummer (BST = UTC+1)', () => {
  // 2026-07-15 12:00 London (BST) = 2026-07-15 11:00 UTC
  const got = diaryLondonWallMs('2026-07-15', '12:00');
  const expected = Date.UTC(2026, 6, 15, 11, 0);
  assert.equal(got, expected);
});

test('diaryLondonWallMs: default time is noon when omitted', () => {
  const noon = diaryLondonWallMs('2026-01-15', '');
  const explicit = diaryLondonWallMs('2026-01-15', '12:00');
  assert.equal(noon, explicit);
});

test('diaryLondonWallMs: handles 00:00 and 23:59 edges', () => {
  const midnight = diaryLondonWallMs('2026-01-15', '00:00');
  const almostNext = diaryLondonWallMs('2026-01-15', '23:59');
  assert.equal(almostNext - midnight, 23 * 3600_000 + 59 * 60_000);
});
