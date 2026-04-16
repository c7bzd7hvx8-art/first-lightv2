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
  categorizeHourToBucket
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
