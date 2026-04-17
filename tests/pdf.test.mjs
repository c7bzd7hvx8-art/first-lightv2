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
  syndicateFileSlug,
  drawTableHeader,
  buildSimpleDiaryPDF,
  buildSingleEntryPDF,
  buildLarderBookPDF,
  buildSyndicateListPDF,
  buildSyndicateLarderBookPDF,
  buildGameDealerDeclarationPDF,
  buildConsignmentDealerDeclarationPDF,
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
  // Minimal jspdf surface used by the builders. A4 landscape size (842×595)
  // is hard-coded into `internal` so the builders' page-break maths works.
  class FakeDoc {
    constructor(orientation) {
      this.saved = null;
      this.calls = [];
      const isLandscape = orientation === 'landscape';
      this.internal = {
        pageSize: {
          getWidth:  () => isLandscape ? 842 : 595,
          getHeight: () => isLandscape ? 595 : 842,
        },
      };
    }
    setFontSize(n)     { this.calls.push(['setFontSize', n]); }
    setFont(...a)      { this.calls.push(['setFont', ...a]); }
    setDrawColor(...a) { this.calls.push(['setDrawColor', ...a]); }
    setTextColor(...a) { this.calls.push(['setTextColor', ...a]); }
    setLineWidth(n)    { this.calls.push(['setLineWidth', n]); }
    setFillColor(...a) { this.calls.push(['setFillColor', ...a]); }
    text(...a)         { this.calls.push(['text', ...a]); }
    line(...a)         { this.calls.push(['line', ...a]); }
    rect(...a)         { this.calls.push(['rect', ...a]); }
    addPage()          { this.calls.push(['addPage']); }
    splitTextToSize(s) { return [String(s)]; }
    save(name)         { this.saved = name; }
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

// ── syndicateFileSlug (Commit J) ───────────────────────────────────────────
test('syndicateFileSlug: lowercase alnum runs separated by hyphens', () => {
  assert.equal(syndicateFileSlug('The Quarry Estate!'), 'the-quarry-estate');
  assert.equal(syndicateFileSlug('Blair  Atholl   North'), 'blair-atholl-north');
  assert.equal(syndicateFileSlug('ABC 123'), 'abc-123');
});

test('syndicateFileSlug: trims leading / trailing hyphens', () => {
  assert.equal(syndicateFileSlug('  -- Lochside -- '), 'lochside');
});

test('syndicateFileSlug: empty / punctuation-only falls back to "syndicate"', () => {
  assert.equal(syndicateFileSlug(''), 'syndicate');
  assert.equal(syndicateFileSlug(null), 'syndicate');
  assert.equal(syndicateFileSlug(undefined), 'syndicate');
  assert.equal(syndicateFileSlug('---'), 'syndicate');
  assert.equal(syndicateFileSlug('!@#$%'), 'syndicate');
});

// ── drawTableHeader (Commit J) ─────────────────────────────────────────────
test('drawTableHeader draws headers at colX, advances y by 6, draws underline', () => {
  const calls = [];
  const fakeDoc = {
    setFontSize: (n) => calls.push(['setFontSize', n]),
    setFont:     (...a) => calls.push(['setFont', ...a]),
    text:        (...a) => calls.push(['text', ...a]),
    setDrawColor: (n) => calls.push(['setDrawColor', n]),
    line:        (...a) => calls.push(['line', ...a]),
  };
  const newY = drawTableHeader(fakeDoc, {
    headers: ['A', 'B', 'C'],
    colX:    [14, 50, 100],
    y:       30,
    pageW:   297,
  });
  assert.equal(newY, 36);
  // First/last meaningful calls: bold on, 3 text draws, bold off, hairline.
  assert.deepEqual(calls[0], ['setFontSize', 8]);
  assert.deepEqual(calls[1], ['setFont', undefined, 'bold']);
  assert.deepEqual(calls[2], ['text', 'A', 14, 30]);
  assert.deepEqual(calls[3], ['text', 'B', 50, 30]);
  assert.deepEqual(calls[4], ['text', 'C', 100, 30]);
  assert.deepEqual(calls[5], ['setFont', undefined, 'normal']);
  assert.deepEqual(calls[6], ['setDrawColor', 200]);
  // Underline sits 3pt above the new y (at y-3) and runs margin to margin.
  assert.deepEqual(calls[7], ['line', 14, 33, 283, 33]);
});

// ── buildLarderBookPDF (Commit J) ──────────────────────────────────────────
test('buildLarderBookPDF: null for empty / null input', () => {
  const restore = installJsPdfStub();
  try {
    assert.equal(buildLarderBookPDF({ filteredEntries: [], user: null, season: '2025-26' }), null);
    assert.equal(buildLarderBookPDF({ filteredEntries: null, user: null, season: '2025-26' }), null);
  } finally { restore(); }
});

test('buildLarderBookPDF: "Left on hill" rows are excluded', () => {
  const restore = installJsPdfStub();
  try {
    // Only "Left on hill" entries → after filtering, entries.length === 0 → null.
    const res = buildLarderBookPDF({
      filteredEntries: [
        { species: 'Roe', sex: 'male', date: '2025-10-15', destination: 'Left on hill' },
        { species: 'Roe', sex: 'male', date: '2025-10-16', destination: 'LEFT ON HILL' },
      ],
      user: null,
      season: '2025-26',
    });
    assert.equal(res, null);
  } finally { restore(); }
});

test('buildLarderBookPDF: filename uses earliest retained entry date', () => {
  const restore = installJsPdfStub();
  try {
    const res = buildLarderBookPDF({
      // Deliberately out-of-order so we verify the sort is applied.
      filteredEntries: [
        { species: 'Roe', sex: 'male', date: '2025-10-20', destination: 'Own use' },
        { species: 'Roe', sex: 'male', date: '2025-10-05', destination: 'Own use' },
        { species: 'Roe', sex: 'male', date: '2025-10-12', destination: 'Left on hill' },
      ],
      user: null,
      season: '2025-26',
    });
    assert.equal(res.count, 2);
    assert.equal(res.filename, 'larder-book-2025-10-05.pdf');
  } finally { restore(); }
});

test('buildLarderBookPDF: does NOT mutate the caller\'s array', () => {
  const restore = installJsPdfStub();
  try {
    const input = [
      { species: 'Roe', sex: 'male', date: '2025-10-20', destination: 'Own use' },
      { species: 'Roe', sex: 'male', date: '2025-10-05', destination: 'Own use' },
    ];
    const snapshot = input.map(e => e.date);
    buildLarderBookPDF({ filteredEntries: input, user: null, season: '2025-26' });
    assert.deepEqual(input.map(e => e.date), snapshot, 'input order must be preserved');
  } finally { restore(); }
});

test('buildLarderBookPDF: "__all__" season renders date-range scope line (not seasonLabel)', () => {
  const restore = installJsPdfStub();
  try {
    // If season === '__all__', the scope line should fall back to
    // "All seasons · first to last" instead of trying seasonLabel('__all__').
    const res = buildLarderBookPDF({
      filteredEntries: [
        { species: 'Roe', sex: 'male', date: '2024-08-01', destination: 'Own use' },
        { species: 'Roe', sex: 'male', date: '2025-10-20', destination: 'Own use' },
      ],
      user: null,
      season: '__all__',
    });
    assert.equal(res.count, 2);
    assert.equal(res.filename, 'larder-book-2024-08-01.pdf');
  } finally { restore(); }
});

// ── buildSyndicateListPDF (Commit J) ───────────────────────────────────────
test('buildSyndicateListPDF: null for empty rows', () => {
  const restore = installJsPdfStub();
  try {
    assert.equal(buildSyndicateListPDF({ rows: [], syndicateName: 'X', seasonLabelStr: '2025/26', filenameBase: 'x' }), null);
    assert.equal(buildSyndicateListPDF({ rows: null, syndicateName: 'X', seasonLabelStr: '2025/26', filenameBase: 'x' }), null);
  } finally { restore(); }
});

test('buildSyndicateListPDF: filename honours filenameBase + returns count', () => {
  const restore = installJsPdfStub();
  try {
    const res = buildSyndicateListPDF({
      rows: [{ species: 'Roe', sex: 'male', cull_date: '2025-10-15', culledBy: 'A' }],
      syndicateName: 'The Estate',
      seasonLabelStr: '2025/26',
      filenameBase: 'syndicate-the-estate-list-2025',
    });
    assert.equal(res.count, 1);
    assert.equal(res.filename, 'syndicate-the-estate-list-2025.pdf');
  } finally { restore(); }
});

// ── buildSyndicateLarderBookPDF (Commit J) ─────────────────────────────────
test('buildSyndicateLarderBookPDF: null for empty rows', () => {
  const restore = installJsPdfStub();
  try {
    assert.equal(buildSyndicateLarderBookPDF({ syndicate: { name: 'X' }, season: '2025-26', rows: [] }), null);
    assert.equal(buildSyndicateLarderBookPDF({ syndicate: { name: 'X' }, season: '2025-26', rows: null }), null);
  } finally { restore(); }
});

test('buildSyndicateLarderBookPDF: filename slugs the syndicate name + appends season', () => {
  const restore = installJsPdfStub();
  try {
    const res = buildSyndicateLarderBookPDF({
      syndicate: { name: 'The Quarry Estate!' },
      season: '2025-26',
      rows: [
        { species: 'Roe', sex: 'male', date: '2025-10-15', weight_kg: 18.5 },
        { species: 'Roe', sex: 'female', date: '2025-10-16', weight_kg: 15.0 },
      ],
    });
    assert.equal(res.count, 2);
    assert.equal(res.filename, 'team-larder-book-the-quarry-estate-2025-26.pdf');
  } finally { restore(); }
});

test('buildSyndicateLarderBookPDF: falls back to "Syndicate" when name missing', () => {
  const restore = installJsPdfStub();
  try {
    const res = buildSyndicateLarderBookPDF({
      syndicate: null,
      season: '2025-26',
      rows: [{ species: 'Roe', sex: 'male', date: '2025-10-15' }],
    });
    assert.equal(res.filename, 'team-larder-book-syndicate-2025-26.pdf');
  } finally { restore(); }
});

// ── buildGameDealerDeclarationPDF (Commit K) ────────────────────────────────
test('buildGameDealerDeclarationPDF: null for missing entry', () => {
  const restore = installJsPdfStub();
  try {
    assert.equal(buildGameDealerDeclarationPDF({ entry: null, user: null }), null);
    assert.equal(buildGameDealerDeclarationPDF({ entry: undefined, user: null }), null);
  } finally { restore(); }
});

test('buildGameDealerDeclarationPDF: filename includes lowercased species + date', () => {
  const restore = installJsPdfStub();
  try {
    const res = buildGameDealerDeclarationPDF({
      entry: { species: 'Red Deer', sex: 'male', date: '2025-10-15' },
      user: null,
    });
    assert.equal(res.filename, 'declaration-red-deer-2025-10-15.pdf');
  } finally { restore(); }
});

test('buildGameDealerDeclarationPDF: missing species → "entry" slug', () => {
  const restore = installJsPdfStub();
  try {
    const res = buildGameDealerDeclarationPDF({
      entry: { sex: 'male', date: '2025-10-15' },
      user: null,
    });
    assert.equal(res.filename, 'declaration-entry-2025-10-15.pdf');
  } finally { restore(); }
});

test('buildGameDealerDeclarationPDF: handles structured "none" abnormalities + free-text legacy fallback', () => {
  const restore = installJsPdfStub();
  try {
    // Structured none — the PDF shows "✓ No abnormalities observed". We can't
    // easily inspect the rendered text from the stub (no x-scanning), so we
    // just verify these two branches don't throw. The rendering shape is
    // covered by manual smoke-test.
    const r1 = buildGameDealerDeclarationPDF({
      entry: { species: 'Roe', sex: 'male', date: '2025-10-15', abnormalities: ['none'] },
      user: null,
    });
    const r2 = buildGameDealerDeclarationPDF({
      entry: { species: 'Roe', sex: 'male', date: '2025-10-15', notes: 'Legacy note text' },
      user: null,
    });
    assert.ok(r1 && r1.filename);
    assert.ok(r2 && r2.filename);
  } finally { restore(); }
});

// ── buildConsignmentDealerDeclarationPDF (Commit K) ─────────────────────────
test('buildConsignmentDealerDeclarationPDF: null for no entries passed', () => {
  const restore = installJsPdfStub();
  try {
    assert.equal(buildConsignmentDealerDeclarationPDF({ entries: [], user: null }), null);
    assert.equal(buildConsignmentDealerDeclarationPDF({ entries: null, user: null }), null);
  } finally { restore(); }
});

test('buildConsignmentDealerDeclarationPDF: all "Left on hill" → status: all-excluded', () => {
  const restore = installJsPdfStub();
  try {
    const res = buildConsignmentDealerDeclarationPDF({
      entries: [
        { species: 'Roe', sex: 'male', date: '2025-10-15', destination: 'Left on hill' },
        { species: 'Roe', sex: 'male', date: '2025-10-16', destination: 'LEFT ON HILL' },
      ],
      user: null,
    });
    assert.deepEqual(res, { status: 'all-excluded', excluded: 2 });
  } finally { restore(); }
});

test('buildConsignmentDealerDeclarationPDF: excluded count reported alongside success', () => {
  const restore = installJsPdfStub();
  try {
    const res = buildConsignmentDealerDeclarationPDF({
      entries: [
        { species: 'Roe', sex: 'male', date: '2025-10-15', destination: 'Own use' },
        { species: 'Roe', sex: 'male', date: '2025-10-16', destination: 'Left on hill' },
        { species: 'Roe', sex: 'male', date: '2025-10-17', destination: 'Dealer' },
      ],
      user: null,
    });
    assert.equal(res.count, 2);
    assert.equal(res.excluded, 1);
  } finally { restore(); }
});

test('buildConsignmentDealerDeclarationPDF: filename uses date range for multi-day, single date for single-day', () => {
  const restore = installJsPdfStub();
  try {
    // Multi-day (after sort, earliest → latest)
    const multi = buildConsignmentDealerDeclarationPDF({
      entries: [
        { species: 'Roe', sex: 'male', date: '2025-10-20', destination: 'Dealer' },
        { species: 'Roe', sex: 'male', date: '2025-10-05', destination: 'Dealer' },
      ],
      user: null,
    });
    assert.equal(multi.filename, 'consignment-declaration-2025-10-05-to-2025-10-20.pdf');
    // Single-day: no range suffix.
    const single = buildConsignmentDealerDeclarationPDF({
      entries: [{ species: 'Roe', sex: 'male', date: '2025-10-15', destination: 'Dealer' }],
      user: null,
    });
    assert.equal(single.filename, 'consignment-declaration-2025-10-15.pdf');
  } finally { restore(); }
});

test('buildConsignmentDealerDeclarationPDF: does NOT mutate the caller\'s array', () => {
  const restore = installJsPdfStub();
  try {
    const input = [
      { species: 'Roe', sex: 'male', date: '2025-10-20', destination: 'Dealer' },
      { species: 'Roe', sex: 'male', date: '2025-10-05', destination: 'Dealer' },
    ];
    const snapshot = input.map(e => e.date);
    buildConsignmentDealerDeclarationPDF({ entries: input, user: null });
    assert.deepEqual(input.map(e => e.date), snapshot, 'input order must be preserved');
  } finally { restore(); }
});
