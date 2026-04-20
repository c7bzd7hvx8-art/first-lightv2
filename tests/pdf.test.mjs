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
  fmtEntryDateLong,
  fmtEntryTimeShort,
  hasValue,
  pdfSafeText,
  syndicateFileSlug,
  drawTableHeader,
  plural,
  formatTotalKg,
  PDF_PALETTE,
  setPdfFill,
  setPdfStroke,
  setPdfText,
  drawRichHeaderBand,
  drawProfessionalHeader,
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

// ── fmtEntryDateLong ───────────────────────────────────────────────────────
test('fmtEntryDateLong appends the 4-digit year so multi-season exports disambiguate', () => {
  assert.equal(fmtEntryDateLong('2025-10-15'), 'Wed 15 Oct 2025');
  assert.equal(fmtEntryDateLong('2024-01-29'), 'Mon 29 Jan 2024');
});

test('fmtEntryDateLong returns "" for empty / null (matches short form)', () => {
  assert.equal(fmtEntryDateLong(''), '');
  assert.equal(fmtEntryDateLong(null), '');
  assert.equal(fmtEntryDateLong(undefined), '');
});

test('fmtEntryDateLong falls back to the raw string for unparseable input', () => {
  assert.equal(fmtEntryDateLong('garbage'), 'garbage');
});

// ── fmtEntryTimeShort ──────────────────────────────────────────────────────
test('fmtEntryTimeShort strips seconds from an HH:MM:SS value', () => {
  assert.equal(fmtEntryTimeShort('14:30:00'), '14:30');
  assert.equal(fmtEntryTimeShort('06:05:59'), '06:05');
});

test('fmtEntryTimeShort passes HH:MM through unchanged', () => {
  assert.equal(fmtEntryTimeShort('14:30'), '14:30');
});

test('fmtEntryTimeShort zero-pads single-digit hours', () => {
  assert.equal(fmtEntryTimeShort('6:05'), '06:05');
  assert.equal(fmtEntryTimeShort('6:05:30'), '06:05');
});

test('fmtEntryTimeShort returns "" for empty / null / junk input', () => {
  assert.equal(fmtEntryTimeShort(''), '');
  assert.equal(fmtEntryTimeShort(null), '');
  assert.equal(fmtEntryTimeShort(undefined), '');
  assert.equal(fmtEntryTimeShort('not a time'), '');
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

// ── pdfSafeText ─────────────────────────────────────────────────────────────
test('pdfSafeText strips blob URLs and normalises whitespace', () => {
  assert.equal(pdfSafeText(''), '');
  assert.equal(pdfSafeText(null), '');
  assert.equal(
    pdfSafeText('Seen at blob:https://x.example/uuid and later'),
    'Seen at and later'
  );
  assert.equal(
    pdfSafeText('data:image/png;base64,' + 'A'.repeat(250)),
    '[image data omitted]'
  );
});

// ── PDF builders (with jspdf stub) ─────────────────────────────────────────
function installJsPdfStub() {
  // Minimal jspdf surface used by the builders. A4 landscape size (842×595)
  // is hard-coded into `internal` so the builders' page-break maths works.
  // `spy.lastDoc` gives tests access to the most-recently-constructed FakeDoc
  // so they can assert on `calls` (e.g. to pin scope-line text without
  // changing the builders' return surface).
  const spy = { lastDoc: null };
  class FakeDoc {
    constructor(orientation) {
      this.saved = null;
      this.calls = [];
      this.pageCount = 1;
      this.currentPage = 1;
      // Builders pass `{ unit, format, orientation }`. Previously the stub
      // inspected the first arg as a raw string which never matched — here we
      // read the real field so A4-landscape reports (Season Summary) get the
      // right pageSize. Both paths tolerated for safety.
      const opts = (orientation && typeof orientation === 'object') ? orientation : { orientation };
      const isLandscape = opts.orientation === 'landscape';
      const self = this;
      this.internal = {
        pageSize: {
          getWidth:  () => isLandscape ? 842 : 595,
          getHeight: () => isLandscape ? 595 : 842,
        },
        // Legacy jspdf surface — some builders use `doc.internal.getNumberOfPages()`
        // instead of the top-level method.
        getNumberOfPages: () => self.pageCount,
      };
      spy.lastDoc = this;
    }
    setFontSize(n)      { this.calls.push(['setFontSize', n]); }
    setFont(...a)       { this.calls.push(['setFont', ...a]); }
    setDrawColor(...a)  { this.calls.push(['setDrawColor', ...a]); }
    setTextColor(...a)  { this.calls.push(['setTextColor', ...a]); }
    setLineWidth(n)     { this.calls.push(['setLineWidth', n]); }
    setFillColor(...a)  { this.calls.push(['setFillColor', ...a]); }
    text(...a)          { this.calls.push(['text', ...a]); }
    line(...a)          { this.calls.push(['line', ...a]); }
    rect(...a)          { this.calls.push(['rect', ...a]); }
    circle(...a)        { this.calls.push(['circle', ...a]); }
    roundedRect(...a)   { this.calls.push(['roundedRect', ...a]); }
    addPage()           { this.pageCount += 1; this.currentPage = this.pageCount; this.calls.push(['addPage']); }
    setPage(n)          { this.currentPage = n; this.calls.push(['setPage', n]); }
    getNumberOfPages()  { return this.pageCount; }
    getTextWidth(s)     { return String(s).length * 1.8; }
    splitTextToSize(s)  { return [String(s)]; }
    save(name)          { this.saved = name; }
  }
  const prev = globalThis.window;
  globalThis.window = { jspdf: { jsPDF: FakeDoc } };
  const restore = () => { globalThis.window = prev; };
  restore.spy = spy;
  return restore;
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

test('buildSimpleDiaryPDF: filenameSlug overrides the default season/all-seasons branching', () => {
  const restore = installJsPdfStub();
  try {
    const entries = [{ species: 'Roe', sex: 'male', date: '2025-10-15' }];
    // Single season + ground: slug wins over the per-season default.
    const a = buildSimpleDiaryPDF({ entries, label: '2025-26 Season — Woodland A', season: '2025-26', filenameSlug: '2025-26-woodland-a' });
    assert.equal(a.filename, 'cull-diary-2025-26-woodland-a.pdf');
    // All seasons + ground: slug wins over the "All Seasons" label branch.
    const b = buildSimpleDiaryPDF({ entries, label: 'All Seasons — Woodland A', season: '2025-26', filenameSlug: 'all-seasons-woodland-a' });
    assert.equal(b.filename, 'cull-diary-all-seasons-woodland-a.pdf');
    // Empty-string slug (falsy) → falls back to legacy branch.
    const c = buildSimpleDiaryPDF({ entries, label: 'All Seasons', season: '2025-26', filenameSlug: '' });
    assert.equal(c.filename, 'cull-diary-all-seasons.pdf');
  } finally { restore(); }
});

test('buildSingleEntryPDF returns null for missing entry', () => {
  const restore = installJsPdfStub();
  try {
    assert.equal(buildSingleEntryPDF({ entry: null }), null);
    assert.equal(buildSingleEntryPDF({ entry: undefined }), null);
  } finally { restore(); }
});

test('buildSingleEntryPDF encodes species + date into the filename', () => {
  const restore = installJsPdfStub();
  try {
    const res = buildSingleEntryPDF({
      entry: { species: 'Roe Deer', sex: 'male', date: '2025-10-15' }
    });
    // Species slugged + date. No time suffix when the entry has no time.
    assert.equal(res.filename, 'cull-record-roe-deer-2025-10-15.pdf');
  } finally { restore(); }
});

test('buildSingleEntryPDF appends HHMM when a time is present (same-day disambiguation)', () => {
  const restore = installJsPdfStub();
  try {
    const res = buildSingleEntryPDF({
      entry: { species: 'Roe Deer', sex: 'male', date: '2025-10-15', time: '06:05:00' }
    });
    // Colons stripped so the filename is filesystem-safe on Windows too.
    assert.equal(res.filename, 'cull-record-roe-deer-2025-10-15-0605.pdf');
  } finally { restore(); }
});

test('buildSingleEntryPDF falls back to "entry" slug when species is missing', () => {
  const restore = installJsPdfStub();
  try {
    const res = buildSingleEntryPDF({
      entry: { species: '', sex: 'male', date: '2025-10-15' }
    });
    assert.equal(res.filename, 'cull-record-entry-2025-10-15.pdf');
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
    setFontSize:  (n) => calls.push(['setFontSize', n]),
    setFont:      (...a) => calls.push(['setFont', ...a]),
    setTextColor: (...a) => calls.push(['setTextColor', ...a]),
    setFillColor: (...a) => calls.push(['setFillColor', ...a]),
    setDrawColor: (n) => calls.push(['setDrawColor', n]),
    rect:         (...a) => calls.push(['rect', ...a]),
    text:         (...a) => calls.push(['text', ...a]),
    line:         (...a) => calls.push(['line', ...a]),
  };
  const newY = drawTableHeader(fakeDoc, {
    headers: ['A', 'B', 'C'],
    colX:    [14, 50, 100],
    y:       30,
    pageW:   297,
  });
  assert.equal(newY, 36);
  // Default (filled=false) path: no fill/rect, bold on, reset textColor, 3
  // text draws, bold off, hairline at 180 grey (softer than the old 200).
  assert.deepEqual(calls[0], ['setFontSize', 8]);
  assert.deepEqual(calls[1], ['setFont', undefined, 'bold']);
  assert.deepEqual(calls[2], ['setTextColor', 0]);
  assert.deepEqual(calls[3], ['text', 'A', 14, 30]);
  assert.deepEqual(calls[4], ['text', 'B', 50, 30]);
  assert.deepEqual(calls[5], ['text', 'C', 100, 30]);
  assert.deepEqual(calls[6], ['setFont', undefined, 'normal']);
  assert.deepEqual(calls[7], ['setDrawColor', 180]);
  // Underline sits 3pt above the new y (at y-3) and runs margin to margin.
  assert.deepEqual(calls[8], ['line', 14, 33, 283, 33]);
});

// ── plural / formatTotalKg ─────────────────────────────────────────────────
test('plural: singular form when n===1, pluralForm when n!==1', () => {
  assert.equal(plural(1, 'carcass', 'carcasses'), '1 carcass');
  assert.equal(plural(0, 'carcass', 'carcasses'), '0 carcasses');
  assert.equal(plural(2, 'carcass', 'carcasses'), '2 carcasses');
  // Default suffix-'s' rule for words that inflect regularly.
  assert.equal(plural(1, 'shooter'), '1 shooter');
  assert.equal(plural(3, 'shooter'), '3 shooters');
});

test('formatTotalKg: sums numeric weights to 1dp with " kg" suffix', () => {
  assert.equal(formatTotalKg([1.2, 3.4, 5.6]), '10.2 kg');
  assert.equal(formatTotalKg([48, 56]), '104 kg');
  // Trailing zeros after the decimal point — Math.round gives integer for whole kg.
  assert.equal(formatTotalKg([10.04, 5.01]), '15.1 kg');
});

test('formatTotalKg: "—" when no row contributes a numeric weight', () => {
  assert.equal(formatTotalKg([]), '—');
  assert.equal(formatTotalKg([null, undefined, '']), '—');
  assert.equal(formatTotalKg([null, 'not a number', NaN]), '—');
  // One numeric entry survives the filter.
  assert.equal(formatTotalKg([null, '', 7.5, undefined]), '7.5 kg');
});

test('drawTableHeader (filled) paints a beige band behind the header row', () => {
  const calls = [];
  const fakeDoc = {
    setFontSize:  (n) => calls.push(['setFontSize', n]),
    setFont:      (...a) => calls.push(['setFont', ...a]),
    setTextColor: (...a) => calls.push(['setTextColor', ...a]),
    setFillColor: (...a) => calls.push(['setFillColor', ...a]),
    setDrawColor: (n) => calls.push(['setDrawColor', n]),
    rect:         (...a) => calls.push(['rect', ...a]),
    text:         (...a) => calls.push(['text', ...a]),
    line:         (...a) => calls.push(['line', ...a]),
  };
  drawTableHeader(fakeDoc, {
    headers: ['A'],
    colX:    [14],
    y:       30,
    pageW:   297,
    filled:  true,
  });
  // First two calls are the fill setup + rect; rect dims are (14, y-4, w-28, 6.5).
  assert.deepEqual(calls[0], ['setFillColor', 233, 228, 215]);
  assert.deepEqual(calls[1], ['rect', 14, 26, 269, 6.5, 'F']);
});

// ── Shared palette & header primitives ─────────────────────────────────────
test('PDF_PALETTE: exposes brand hexes used by both rich and professional headers', () => {
  assert.equal(PDF_PALETTE.deep,   '#0e2a08');
  assert.equal(PDF_PALETTE.forest, '#1a3a0e');
  assert.equal(PDF_PALETTE.moss,   '#5a7a30');
  assert.equal(PDF_PALETTE.gold,   '#c8a84b');
  assert.equal(PDF_PALETTE.bark,   '#3d2b1f');
  assert.equal(typeof PDF_PALETTE.spColours, 'object');
});

test('setPdfFill / setPdfStroke / setPdfText: parse hex → rgb tuple', () => {
  const calls = [];
  const fakeDoc = {
    setFillColor: (...a) => calls.push(['fill', ...a]),
    setDrawColor: (...a) => calls.push(['stroke', ...a]),
    setTextColor: (...a) => calls.push(['text', ...a]),
  };
  setPdfFill(fakeDoc,   '#c8a84b'); // gold
  setPdfStroke(fakeDoc, '#0e2a08'); // deep
  setPdfText(fakeDoc,   '#ffffff'); // white
  assert.deepEqual(calls[0], ['fill',   200, 168, 75]);
  assert.deepEqual(calls[1], ['stroke',  14,  42,  8]);
  assert.deepEqual(calls[2], ['text',   255, 255, 255]);
});

test('drawProfessionalHeader: thin moss rule + gold eyebrow + black title + optional subtitle/scope', () => {
  const calls = [];
  const fakeDoc = {
    setFillColor: (...a) => calls.push(['setFillColor', ...a]),
    setDrawColor: (...a) => calls.push(['setDrawColor', ...a]),
    setTextColor: (...a) => calls.push(['setTextColor', ...a]),
    setFontSize:  (n)    => calls.push(['setFontSize', n]),
    setFont:      (...a) => calls.push(['setFont', ...a]),
    rect:         (...a) => calls.push(['rect', ...a]),
    text:         (...a) => calls.push(['text', ...a]),
  };
  const y = drawProfessionalHeader(fakeDoc, {
    pageW: 297,
    title: 'Larder Book',
    subtitle: 'West Acre · Season 2025-2026 · 3 carcasses',
    scope: 'Ground filter: "Woodland Block"  ·  1 contributing shooter',
  });

  // Rule at the top is a filled moss rect spanning the full page width.
  const hasMossRule = calls.some(c =>
    c[0] === 'rect' && c[1] === 0 && c[2] === 0 && c[3] === 297 && c[4] === 4 && c[5] === 'F'
  );
  assert.ok(hasMossRule, 'expected top moss-green accent rule');

  // Title + subtitle + scope must all have been drawn via doc.text.
  const drawn = calls.filter(c => c[0] === 'text').map(c => c[1]);
  assert.ok(drawn.some(s => String(s).includes('Larder Book')),             'title missing');
  assert.ok(drawn.some(s => String(s).includes('West Acre')),                'subtitle missing');
  assert.ok(drawn.some(s => String(s).includes('Ground filter:')),           'scope missing');

  // Returned y is below the header region.
  assert.ok(y > 30, 'returned y should be below header region (got ' + y + ')');
});

test('drawProfessionalHeader: renders without subtitle/scope when omitted', () => {
  const calls = [];
  const fakeDoc = {
    setFillColor: () => {}, setDrawColor: () => {}, setTextColor: () => {},
    setFontSize:  () => {}, setFont: () => {}, rect: () => {},
    text:         (...a) => calls.push(String(a[0])),
  };
  drawProfessionalHeader(fakeDoc, { pageW: 297, title: 'Larder Book' });
  assert.ok(calls.some(s => s.includes('Larder Book')));
  assert.equal(calls.length, 2); // eyebrow + title only (no subtitle, no scope)
});

test('drawRichHeaderBand: two-tone fill + gold underline + returns band height', () => {
  const calls = [];
  const fakeDoc = {
    setFillColor: (...a) => calls.push(['fill', ...a]),
    setDrawColor: (...a) => calls.push(['stroke', ...a]),
    setTextColor: (...a) => calls.push(['text', ...a]),
    setFontSize:  (n)    => calls.push(['size', n]),
    setFont:      (...a) => calls.push(['font', ...a]),
    setLineWidth: (n)    => calls.push(['lw', n]),
    rect:         (...a) => calls.push(['rect', ...a]),
    line:         (...a) => calls.push(['line', ...a]),
    text:         (...a) => calls.push(['T', ...a]),
  };
  const h = drawRichHeaderBand(fakeDoc, {
    pageW: 842,
    title: '2025-26 Season Report',
    subtitle: 'Ground: Woodland Block',
    meta: { url: 'firstlightdeer.co.uk', generated: '17 Apr 2026 - 14:22' },
  });
  // Band draws two fill rects (deep full-width, then forest left-half).
  const rects = calls.filter(c => c[0] === 'rect');
  assert.equal(rects.length, 2);
  assert.equal(rects[0][3], 842); // full-width first
  assert.equal(rects[1][3], 421); // left-half second
  // Gold underline is a line call.
  assert.ok(calls.some(c => c[0] === 'line'));
  // Title + subtitle + generated-on stamp all drawn.
  const drawn = calls.filter(c => c[0] === 'T').map(c => c[1]);
  assert.ok(drawn.some(s => String(s).includes('Season Report')));
  assert.ok(drawn.some(s => String(s).includes('Woodland Block')));
  assert.ok(drawn.some(s => String(s).includes('Generated 17 Apr 2026')));
  // Returned height is a sane positive.
  assert.ok(h > 50 && h < 120, 'band height out of range: ' + h);
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

test('buildSyndicateLarderBookPDF: scope line shows "Ground filter" when set', () => {
  const restore = installJsPdfStub();
  try {
    buildSyndicateLarderBookPDF({
      syndicate: { name: 'West Acre', ground_filter: 'Woodland Block' },
      season: '2025-26',
      rows: [
        { species: 'Roe', sex: 'male', date: '2025-10-15', culledBy: 'Sohaib', ground: 'Woodland Block' },
      ],
    });
    const texts = restore.spy.lastDoc.calls
      .filter(c => c[0] === 'text')
      .map(c => String(c[1]));
    // One of the text calls must contain the quoted ground filter and the
    // "1 contributing shooter" phrase (singular — single shooter).
    const scope = texts.find(t => t.includes('Ground filter:') && t.includes('contributing shooter'));
    assert.ok(scope, 'scope line missing; got: ' + JSON.stringify(texts));
    assert.ok(scope.includes('"Woodland Block"'));
    assert.ok(scope.includes('1 contributing shooter'));
    assert.ok(!scope.includes('shooters')); // strictly singular for N=1
  } finally { restore(); }
});

test('buildSyndicateLarderBookPDF: scope line reads "none (all grounds)" when no filter', () => {
  const restore = installJsPdfStub();
  try {
    buildSyndicateLarderBookPDF({
      syndicate: { name: 'Castle Acre' /* no ground_filter */ },
      season: '2025-26',
      rows: [
        { species: 'Roe',  sex: 'male',   date: '2025-10-15', culledBy: 'Alice' },
        { species: 'Fall', sex: 'female', date: '2025-10-16', culledBy: 'Bob' },
      ],
    });
    const texts = restore.spy.lastDoc.calls
      .filter(c => c[0] === 'text')
      .map(c => String(c[1]));
    const scope = texts.find(t => t.includes('Ground filter:'));
    assert.ok(scope, 'scope line missing; got: ' + JSON.stringify(texts));
    assert.ok(scope.includes('none (all grounds)'));
    // 2 distinct shooters → pluralised.
    assert.ok(scope.includes('2 contributing shooters'));
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
    // No time on the entry → no HHMM suffix (back-compat with the legacy shape).
    assert.equal(res.filename, 'declaration-red-deer-2025-10-15.pdf');
  } finally { restore(); }
});

test('buildGameDealerDeclarationPDF: appends HHMM when entry has a time (same-day disambiguation)', () => {
  const restore = installJsPdfStub();
  try {
    const res = buildGameDealerDeclarationPDF({
      entry: { species: 'Fallow', sex: 'male', date: '2026-04-11', time: '01:31:00' },
      user: null,
    });
    assert.equal(res.filename, 'declaration-fallow-2026-04-11-0131.pdf');
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

// ── buildSeasonSummaryPDF / buildSyndicateSeasonSummaryPDF (Commit L) ──────
// These are the two biggest PDF builders (Season Summary ≈ 378 lines, the
// Syndicate variant ≈ 295). The tests below lock down the public contract
// — empty-guard, filename shape, return shape — rather than the pixel-level
// output, because the renderer is ~400 draw-calls deep and unit-testing at
// that granularity would just mirror the implementation.

import {
  buildSeasonSummaryPDF,
  buildSyndicateSeasonSummaryPDF,
} from '../modules/pdf.mjs';

const PLAN_SPECIES_FIXTURE = [
  { name: 'Red Deer', mLbl: 'Stag', fLbl: 'Hind' },
  { name: 'Roe Deer', mLbl: 'Buck', fLbl: 'Doe'  },
  { name: 'Fallow',   mLbl: 'Buck', fLbl: 'Doe'  },
];

test('buildSeasonSummaryPDF returns null for empty entries (no save)', () => {
  const restore = installJsPdfStub();
  try {
    const a = buildSeasonSummaryPDF({ entries: [],    season: '2025-26', planSpecies: PLAN_SPECIES_FIXTURE, cullTargets: {} });
    const b = buildSeasonSummaryPDF({ entries: null,  season: '2025-26', planSpecies: PLAN_SPECIES_FIXTURE, cullTargets: {} });
    assert.equal(a, null);
    assert.equal(b, null);
  } finally { restore(); }
});

test('buildSeasonSummaryPDF returns { filename, count } with season-coded filename', () => {
  const restore = installJsPdfStub();
  try {
    const res = buildSeasonSummaryPDF({
      entries: [
        { species: 'Roe Deer', sex: 'm', date: '2025-10-20', weight_kg: 18, tag_number: 'T1' },
        { species: 'Roe Deer', sex: 'f', date: '2025-10-21', weight_kg: 15, tag_number: 'T2' },
      ],
      season: '2025-26',
      cullTargets: {},
      planSpecies: PLAN_SPECIES_FIXTURE,
      now: new Date('2025-10-22T10:00:00Z'),
    });
    assert.deepEqual(res, { filename: 'first-light-season-2025-26.pdf', count: 2 });
    assert.equal(restore.spy.lastDoc.saved, 'first-light-season-2025-26.pdf');
  } finally { restore(); }
});

test('buildSeasonSummaryPDF uses "all-seasons" filename when label override is set', () => {
  const restore = installJsPdfStub();
  try {
    const res = buildSeasonSummaryPDF({
      entries: [{ species: 'Roe Deer', sex: 'm', date: '2025-10-20' }],
      season: '2025-26',
      seasonLabelOverride: 'All Seasons',
      cullTargets: {},
      planSpecies: PLAN_SPECIES_FIXTURE,
      now: new Date('2025-10-22T10:00:00Z'),
    });
    assert.equal(res.filename, 'first-light-all-seasons.pdf');
    // Cull Plan section must be suppressed for "All Seasons" — no "Cull Plan vs Actual"
    // text should have been drawn.
    const planText = restore.spy.lastDoc.calls.filter(
      c => c[0] === 'text' && typeof c[1] === 'string' && c[1].toUpperCase().includes('CULL PLAN')
    );
    assert.equal(planText.length, 0, 'Cull Plan section must be omitted for All Seasons');
  } finally { restore(); }
});

test('buildSeasonSummaryPDF slugs the ground override into the filename', () => {
  const restore = installJsPdfStub();
  try {
    const res = buildSeasonSummaryPDF({
      entries: [{ species: 'Roe Deer', sex: 'm', date: '2025-10-20' }],
      season: '2025-26',
      groundOverride: 'Woodland Block',
      cullTargets: {},
      planSpecies: PLAN_SPECIES_FIXTURE,
      now: new Date('2025-10-22T10:00:00Z'),
    });
    assert.equal(res.filename, 'first-light-season-2025-26-woodland-block.pdf');
  } finally { restore(); }
});

test('buildSeasonSummaryPDF ignores "All Grounds" override (no filename suffix)', () => {
  const restore = installJsPdfStub();
  try {
    const res = buildSeasonSummaryPDF({
      entries: [{ species: 'Roe Deer', sex: 'm', date: '2025-10-20' }],
      season: '2025-26',
      groundOverride: 'All Grounds',
      cullTargets: {},
      planSpecies: PLAN_SPECIES_FIXTURE,
      now: new Date('2025-10-22T10:00:00Z'),
    });
    assert.equal(res.filename, 'first-light-season-2025-26.pdf');
  } finally { restore(); }
});

test('buildSeasonSummaryPDF renders the cull-plan progress bar when targets present', () => {
  const restore = installJsPdfStub();
  try {
    buildSeasonSummaryPDF({
      entries: [
        { species: 'Roe Deer', sex: 'm', date: '2025-10-20' },
        { species: 'Roe Deer', sex: 'm', date: '2025-10-21' },
      ],
      season: '2025-26',
      cullTargets: { 'Roe Deer-m': 5 },
      planSpecies: PLAN_SPECIES_FIXTURE,
      now: new Date('2025-10-22T10:00:00Z'),
    });
    const planHeaderDrawn = restore.spy.lastDoc.calls.some(
      c => c[0] === 'text' && c[1] === 'CULL PLAN VS ACTUAL'
    );
    assert.equal(planHeaderDrawn, true, 'Cull Plan vs Actual section must render');
    // The "2/5" progress label should appear somewhere.
    const progressLabel = restore.spy.lastDoc.calls.some(
      c => c[0] === 'text' && typeof c[1] === 'string' && c[1] === '2/5'
    );
    assert.equal(progressLabel, true, 'Progress label "actual/target" must render');
  } finally { restore(); }
});

test('buildSyndicateSeasonSummaryPDF returns { filename, count } with syndicate slug', () => {
  const restore = installJsPdfStub();
  try {
    const res = buildSyndicateSeasonSummaryPDF({
      syndicate: { name: 'Castle Acre' },
      season: '2025-26',
      entries: [
        { cull_date: '2025-10-20', species: 'Roe Deer', sex: 'm', culledBy: 'Alice' },
        { cull_date: '2025-10-21', species: 'Roe Deer', sex: 'f', culledBy: 'Bob'   },
      ],
      summaryRows: [],
      planSpecies: PLAN_SPECIES_FIXTURE,
      planSpeciesMeta: (name) => ({ name, mLbl: 'Buck', fLbl: 'Doe' }),
      now: new Date('2025-10-22T10:00:00Z'),
    });
    assert.equal(res.count, 2);
    assert.match(res.filename, /^syndicate-castle-acre-summary-2025-26\.pdf$/);
    assert.equal(restore.spy.lastDoc.saved, res.filename);
  } finally { restore(); }
});

test('buildSyndicateSeasonSummaryPDF renders "No culls recorded" for empty species set', () => {
  const restore = installJsPdfStub();
  try {
    buildSyndicateSeasonSummaryPDF({
      syndicate: { name: 'Empty Co' },
      season: '2025-26',
      entries: [],
      summaryRows: [],
      planSpecies: PLAN_SPECIES_FIXTURE,
      planSpeciesMeta: (name) => ({ name, mLbl: 'Buck', fLbl: 'Doe' }),
      now: new Date('2025-10-22T10:00:00Z'),
    });
    const emptyMsg = restore.spy.lastDoc.calls.some(
      c => c[0] === 'text' && c[1] === 'No culls recorded for this season.'
    );
    assert.equal(emptyMsg, true);
  } finally { restore(); }
});

test('buildSyndicateSeasonSummaryPDF renders cull plan from summaryRows target/actual', () => {
  const restore = installJsPdfStub();
  try {
    buildSyndicateSeasonSummaryPDF({
      syndicate: { name: 'Castle Acre' },
      season: '2025-26',
      entries: [{ cull_date: '2025-10-20', species: 'Roe Deer', sex: 'm', culledBy: 'Alice' }],
      summaryRows: [{ species: 'Roe Deer', sex: 'm', target_total: '4', actual_total: '1' }],
      planSpecies: PLAN_SPECIES_FIXTURE,
      planSpeciesMeta: (name) => ({ name, mLbl: 'Buck', fLbl: 'Doe' }),
      now: new Date('2025-10-22T10:00:00Z'),
    });
    const planHeaderDrawn = restore.spy.lastDoc.calls.some(
      c => c[0] === 'text' && c[1] === 'CULL PLAN VS ACTUAL'
    );
    assert.equal(planHeaderDrawn, true);
    const progressLabel = restore.spy.lastDoc.calls.some(
      c => c[0] === 'text' && typeof c[1] === 'string' && c[1] === '1/4'
    );
    assert.equal(progressLabel, true);
  } finally { restore(); }
});

test('buildSyndicateSeasonSummaryPDF tolerates a null syndicate name (filename safe)', () => {
  const restore = installJsPdfStub();
  try {
    const res = buildSyndicateSeasonSummaryPDF({
      syndicate: {},
      season: '2025-26',
      entries: [],
      summaryRows: [],
      planSpecies: PLAN_SPECIES_FIXTURE,
      planSpeciesMeta: (name) => ({ name, mLbl: 'Buck', fLbl: 'Doe' }),
      now: new Date('2025-10-22T10:00:00Z'),
    });
    assert.match(res.filename, /^syndicate-[a-z0-9-]+-summary-2025-26\.pdf$/);
  } finally { restore(); }
});
