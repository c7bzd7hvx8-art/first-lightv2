// =============================================================================
// Tests for modules/pdf.mjs
//
// Runtime: Node's built-in test runner + assert/strict. Zero dependencies.
//
// Scope of this file (Phase 2 / Commit I):
//   • userProfileDisplayName(user)  — all fallback branches
//   • fmtEntryDateShort(d)          — weekday + month rendering, invalid input
//   • hasValue(v)                   — null / undefined / '' vs truthy
//   • buildSimpleDiaryPDF / buildSingleEntryPDF
//       smoke-tested with a tiny in-memory jspdf stub so we verify
//         - filename convention (season code vs 'All Seasons')
//         - empty-entries guard
//         - return shape { filename, count }
//       without pulling a real PDF engine into the test runtime.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  userProfileDisplayName,
  fmtEntryDateShort,
  hasValue,
  buildSimpleDiaryPDF,
  buildSingleEntryPDF,
} from '../modules/pdf.mjs';

// ── userProfileDisplayName ─────────────────────────────────────────────────
test('userProfileDisplayName returns "" for null / undefined', () => {
  assert.equal(userProfileDisplayName(null), '');
  assert.equal(userProfileDisplayName(undefined), '');
});

test('userProfileDisplayName prefers full_name over name over display_name', () => {
  assert.equal(
    userProfileDisplayName({ user_metadata: { full_name: 'Jane Doe', name: 'J', display_name: 'JD' } }),
    'Jane Doe'
  );
  assert.equal(
    userProfileDisplayName({ user_metadata: { name: 'Jane' } }),
    'Jane'
  );
  assert.equal(
    userProfileDisplayName({ user_metadata: { display_name: 'JD' } }),
    'JD'
  );
});

test('userProfileDisplayName trims whitespace and returns "" when empty', () => {
  assert.equal(userProfileDisplayName({ user_metadata: { full_name: '  Jane  ' } }), 'Jane');
  assert.equal(userProfileDisplayName({ user_metadata: { full_name: '   ' } }), '');
  assert.equal(userProfileDisplayName({}), '');
  assert.equal(userProfileDisplayName({ user_metadata: null }), '');
});

// ── fmtEntryDateShort ──────────────────────────────────────────────────────
test('fmtEntryDateShort renders "Wed 15 Oct" style for valid ISO dates', () => {
  // 2025-10-15 is a Wednesday (local calendar).
  const out = fmtEntryDateShort('2025-10-15');
  assert.match(out, /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) 15 Oct$/);
  assert.equal(out, 'Wed 15 Oct');
});

test('fmtEntryDateShort returns "" for empty / null', () => {
  assert.equal(fmtEntryDateShort(''), '');
  assert.equal(fmtEntryDateShort(null), '');
  assert.equal(fmtEntryDateShort(undefined), '');
});

test('fmtEntryDateShort falls back to the raw string for unparseable input', () => {
  assert.equal(fmtEntryDateShort('garbage'), 'garbage');
});

// ── hasValue ───────────────────────────────────────────────────────────────
test('hasValue treats null / undefined / "" as missing', () => {
  assert.equal(hasValue(null), false);
  assert.equal(hasValue(undefined), false);
  assert.equal(hasValue(''), false);
});

test('hasValue treats 0, false, and non-empty strings as present', () => {
  assert.equal(hasValue(0), true);
  assert.equal(hasValue(false), true);
  assert.equal(hasValue('x'), true);
  assert.equal(hasValue([]), true);
});

// ── PDF builders (with jspdf stub) ─────────────────────────────────────────
function installJsPdfStub() {
  // Minimal surface that the two builders call.
  class FakeDoc {
    constructor() { this.saved = null; this.calls = []; }
    setFontSize(n) { this.calls.push(['setFontSize', n]); }
    setFont(...a)  { this.calls.push(['setFont', ...a]); }
    text(...a)     { this.calls.push(['text', ...a]); }
    line(...a)     { this.calls.push(['line', ...a]); }
    addPage()      { this.calls.push(['addPage']); }
    splitTextToSize(s) { return [String(s)]; }
    save(name)     { this.saved = name; }
  }
  const prev = globalThis.window;
  globalThis.window = { jspdf: { jsPDF: FakeDoc } };
  return () => { globalThis.window = prev; };
}

test('buildSimpleDiaryPDF returns null for empty entries (no save called)', () => {
  const restore = installJsPdfStub();
  try {
    const res1 = buildSimpleDiaryPDF({ entries: [], label: '2025', season: '2025' });
    const res2 = buildSimpleDiaryPDF({ entries: null, label: '2025', season: '2025' });
    assert.equal(res1, null);
    assert.equal(res2, null);
  } finally { restore(); }
});

test('buildSimpleDiaryPDF uses season code in filename for a single season', () => {
  const restore = installJsPdfStub();
  try {
    const entries = [{ species: 'Roe', sex: 'male', date: '2025-10-15' }];
    const res = buildSimpleDiaryPDF({ entries, label: '2025/26', season: '2025' });
    assert.equal(res.count, 1);
    assert.equal(res.filename, 'cull-diary-2025.pdf');
  } finally { restore(); }
});

test('buildSimpleDiaryPDF uses "all-seasons" filename when label is "All Seasons"', () => {
  const restore = installJsPdfStub();
  try {
    const entries = [{ species: 'Roe', sex: 'male', date: '2025-10-15' }];
    const res = buildSimpleDiaryPDF({ entries, label: 'All Seasons', season: '2025' });
    assert.equal(res.filename, 'cull-diary-all-seasons.pdf');
  } finally { restore(); }
});

test('buildSingleEntryPDF returns null for missing entry', () => {
  const restore = installJsPdfStub();
  try {
    assert.equal(buildSingleEntryPDF({ entry: null }), null);
    assert.equal(buildSingleEntryPDF({ entry: undefined }), null);
  } finally { restore(); }
});

test('buildSingleEntryPDF encodes the entry date into the filename', () => {
  const restore = installJsPdfStub();
  try {
    const res = buildSingleEntryPDF({
      entry: { species: 'Roe', sex: 'male', date: '2025-10-15' }
    });
    assert.equal(res.filename, 'cull-record-2025-10-15.pdf');
  } finally { restore(); }
});

test('pdf builders throw a clear error when jspdf is not loaded', () => {
  const prev = globalThis.window;
  globalThis.window = {}; // no jspdf
  try {
    assert.throws(
      () => buildSimpleDiaryPDF({ entries: [{ species: 'Roe', sex: 'male', date: '2025-10-15' }], label: 'X', season: 'X' }),
      /jspdf not loaded/
    );
  } finally { globalThis.window = prev; }
});
