// First Light — modules/pdf.mjs
// =============================================================================
// PDF export helpers extracted from diary.js during the Phase-2 modularisation.
// See MODULARISATION-PLAN.md → Phase 2 / Commit I (scaffold + 2 smallest exports).
//
// Scope of this module (grows across Commits I → L):
//   • buildSimpleDiaryPDF(opts)   — "Simple list" all-entries PDF
//                                    (exportPDFData fallback / All-Seasons path)
//   • buildSingleEntryPDF(opts)   — per-carcass one-pager
//                                    (viewed from the entry detail modal)
//   • userProfileDisplayName(user)— legal-name resolver used by every PDF header
//
// Later commits will add:
//   • Larder book + syndicate list/larder  (Commit J)
//   • Game dealer + consignment declarations  (Commit K)
//   • Season summary + syndicate summary      (Commit L)
//
// Dependency model (why this module looks the way it does):
//   • jspdf is loaded globally via <script>, so we reach into window.jspdf here.
//     That's a deliberate choice — bundling jspdf as an ES module would force a
//     build step for the whole PWA, which is off-scope for the modularisation.
//   • All app state (current user, entries, season, syndicate…) is passed in via
//     an `opts` object. The module is therefore pure w.r.t. globals — tests can
//     import and call it without a browser DOM (apart from jspdf, which is
//     mocked in the unit tests as needed).
//   • Pure string helpers come from lib/fl-pure.mjs.  Tiny private helpers
//     (fmtDate, hasValue) are inlined here to avoid a dependency on diary.js.
// =============================================================================

import {
  sexLabel,
  parseEntryDateParts,
  MONTH_NAMES,
  seasonLabel,
  ABNORMALITY_LABEL_BY_CODE
} from '../lib/fl-pure.mjs';

// ── Private helpers (duplicated from diary.js deliberately) ─────────────────
// These are ~3 lines each and moving them into fl-pure.mjs would touch every
// caller in diary.js. They'll consolidate naturally when diary.js slims down
// enough that the duplication is visible.

const DOW_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export function fmtEntryDateShort(d) {
  if (!d) return '';
  const p = parseEntryDateParts(d);
  if (!p) return typeof d === 'string' ? d : String(d);
  const dt = new Date(p.y, p.m - 1, p.day);
  return DOW_SHORT[dt.getDay()] + ' ' + p.day + ' ' + MONTH_NAMES[p.m - 1];
}

export function hasValue(v) {
  return !(v === null || v === undefined || v === '');
}

/**
 * Slug a syndicate (or any) name for use in a filename.
 * "The Quarry Estate!" → "the-quarry-estate"
 * Empty / pure-punctuation falls back to "syndicate" so we never emit
 * something like `team-larder-book--2025.pdf`.
 */
export function syndicateFileSlug(name) {
  const s = String(name || 'syndicate')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return s || 'syndicate';
}

/**
 * Draws a bold table header row + a hairline underline on a jspdf doc.
 * Mutates the passed `doc` and returns the new y cursor.
 *
 * Extracted from the two inner drawHeader() closures inside the larder
 * PDFs — they were byte-identical. Signature is deliberately minimal so
 * the page-break code path (which also calls it) stays a one-liner.
 */
export function drawTableHeader(doc, { headers, colX, y, pageW, fontSize = 8 }) {
  doc.setFontSize(fontSize);
  doc.setFont(undefined, 'bold');
  for (let h = 0; h < headers.length; h++) doc.text(headers[h], colX[h], y);
  doc.setFont(undefined, 'normal');
  const ny = y + 6;
  doc.setDrawColor(200);
  doc.line(14, ny - 3, pageW - 14, ny - 3);
  return ny;
}

// ── User profile helpers ────────────────────────────────────────────────────

/**
 * Profile name for PDFs — not email (email is identity only, not a legal "name").
 * Falls back through the Supabase user_metadata shape the app writes.
 * Returns '' when no explicit name has been set.
 */
export function userProfileDisplayName(user) {
  if (!user) return '';
  const m = user.user_metadata || {};
  const n = String(m.full_name || m.name || m.display_name || '').trim();
  return n;
}

// ── jspdf access ────────────────────────────────────────────────────────────
// Guarded so the module can be imported in Node tests without exploding.
function getJsPDF() {
  const g = (typeof window !== 'undefined' ? window : globalThis);
  if (!g.jspdf || !g.jspdf.jsPDF) {
    throw new Error('jspdf not loaded — expected window.jspdf.jsPDF');
  }
  return g.jspdf.jsPDF;
}

// ── Simple diary list PDF ───────────────────────────────────────────────────
// Replaces diary.js's exportPDFData(entries, label).
// Caller supplies the pre-computed season label + raw season code so the
// filename matches the legacy naming convention.
//
// Returns { filename, count } on success (so the caller can toast); returns
// null when there's nothing to export (empty-guard is still the caller's job,
// but we double-check to keep the module self-defensive).
export function buildSimpleDiaryPDF({ entries, label, season }) {
  if (!entries || !entries.length) return null;

  const JsPDF = getJsPDF();
  const doc = new JsPDF();

  doc.setFontSize(18);
  doc.text('Cull Diary - ' + label, 14, 20);
  doc.setFontSize(10);
  doc.text('First Light · firstlightdeer.co.uk · ' + entries.length + ' entries', 14, 28);

  let y = 38;
  entries.forEach(function(e, i) {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.text(
      (i + 1) + '. ' + e.species + ' (' + sexLabel(e.sex, e.species) + ') - ' +
      (fmtEntryDateShort(e.date) || '—'),
      14, y
    );
    y += 6;
    doc.setFontSize(9);
    const meta = [];
    if (e.location_name) meta.push('Location: ' + e.location_name);
    if (e.weight_kg)     meta.push('Weight: ' + e.weight_kg + 'kg');
    if (e.tag_number)    meta.push('Tag: ' + e.tag_number);
    if (e.calibre)       meta.push('Calibre: ' + e.calibre);
    if (e.distance_m)    meta.push('Distance: ' + e.distance_m + 'm');
    if (e.shot_placement) meta.push('Placement: ' + e.shot_placement);
    if (e.destination)   meta.push('Destination: ' + e.destination);
    if (meta.length) { doc.text(meta.join(' · '), 14, y); y += 5; }
    if (e.notes) {
      const noteLines = doc.splitTextToSize('Notes: ' + e.notes, 180);
      noteLines.forEach(function(line) {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(line, 14, y); y += 4;
      });
      y += 1;
    }
    y += 4;
    doc.line(14, y, 196, y); y += 5;
  });

  const filename = label === 'All Seasons'
    ? 'cull-diary-all-seasons'
    : 'cull-diary-' + season;
  doc.save(filename + '.pdf');
  return { filename: filename + '.pdf', count: entries.length };
}

// ── Single entry one-pager PDF ──────────────────────────────────────────────
// Replaces diary.js's exportSinglePDF(id). Caller already has the resolved
// entry object (so we stay out of the allEntries lookup business).
export function buildSingleEntryPDF({ entry }) {
  if (!entry) return null;

  const JsPDF = getJsPDF();
  const doc = new JsPDF();

  doc.setFontSize(16); doc.text('Cull Record — First Light', 14, 20);
  doc.setFontSize(12); doc.text(entry.species + ' (' + sexLabel(entry.sex, entry.species) + ')', 14, 32);
  doc.setFontSize(10);

  const fields = [
    ['Date', entry.date],
    ['Time', entry.time],
    ['Location', entry.location_name],
    ['Ground', entry.ground],
    ['Age class', entry.age_class],
    ['Carcass weight', hasValue(entry.weight_kg) ? entry.weight_kg + ' kg' : ''],
    ['Tag number', entry.tag_number || ''],
    ['Calibre', entry.calibre],
    ['Distance', hasValue(entry.distance_m) ? entry.distance_m + 'm' : ''],
    ['Shot placement', entry.shot_placement],
    ['Destination', entry.destination],
    ['Notes', entry.notes ? entry.notes.slice(0, 300) : null],
  ];

  let y = 44;
  fields.forEach(function(f) {
    if (!f[1]) return;
    doc.setFont(undefined, 'bold');   doc.text(f[0] + ':', 14, y);
    doc.setFont(undefined, 'normal'); doc.text(String(f[1]), 60, y);
    y += 7;
  });

  doc.save('cull-record-' + entry.date + '.pdf');
  return { filename: 'cull-record-' + entry.date + '.pdf' };
}

// ── Larder book (single user) ──────────────────────────────────────────────
// Every carcass the stalker retrieved to the larder, for the current season
// (or all seasons when the caller is showing All Seasons). Not a dealer-only
// document — covers self-consumption, gifted, etc. The only legitimate
// exclusion is "Left on hill" (carcass never entered the larder).
//
// Caller passes the already-scoped list (diary.js calls this with
// `filteredEntries`). We do the "Left on hill" filter + chronological sort
// internally so tests can rely on a single deterministic output shape, and
// so the caller's array isn't mutated (legacy code did an in-place sort of
// `filteredEntries`, which was a subtle bug the UI never surfaced).
export function buildLarderBookPDF({ filteredEntries, user, season }) {
  if (!filteredEntries || !filteredEntries.length) return null;

  const entries = filteredEntries
    .filter(function(e) { return (e.destination || '').toLowerCase() !== 'left on hill'; })
    .slice()
    .sort(function(a, b) {
      return (a.date || '').localeCompare(b.date || '')
          || (a.time || '').localeCompare(b.time || '');
    });
  if (entries.length === 0) return null;

  const JsPDF = getJsPDF();
  const doc = new JsPDF('landscape');
  const pageW = doc.internal.pageSize.getWidth();

  let stalkerLine = '';
  try {
    stalkerLine = userProfileDisplayName(user) || (user && user.email) || '';
  } catch (_) { /* defensive — malformed user obj */ }

  doc.setFontSize(16); doc.text('Larder Book — First Light Cull Diary', 14, 16);
  doc.setFontSize(9);  doc.setTextColor(120);

  // Prefer "Season 2025/26" over a raw first/last date so a dealer or auditor
  // instantly sees the scope. Fall back to date range for All Seasons.
  let scopeLine;
  try {
    scopeLine = (season && season !== '__all__')
      ? 'Season ' + seasonLabel(season)
      : 'All seasons · ' + entries[0].date + ' to ' + entries[entries.length - 1].date;
  } catch (_) {
    scopeLine = entries[0].date + ' to ' + entries[entries.length - 1].date;
  }
  doc.text(
    (stalkerLine ? stalkerLine + ' · ' : '') + scopeLine + ' · ' + entries.length + ' carcasses',
    14, 23
  );
  doc.setTextColor(0);

  const headers = ['#','Date','Tag','Species','Sex','Weight (kg)','Location / Ground','Destination','Abnormalities'];
  const colX    = [14,  22,   52,    78,        110,  133,           155,                210,           248];
  let y = 32;
  y = drawTableHeader(doc, { headers, colX, y, pageW });

  doc.setFontSize(7.5);
  entries.forEach(function(e, idx) {
    if (y > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      y = drawTableHeader(doc, { headers, colX, y: 16, pageW });
      doc.setFontSize(7.5);
    }
    const locText = ((e.location_name || '') + (e.ground ? ' / ' + e.ground : ''))
      .trim().replace(/^\//, '').trim();
    const row = [
      String(idx + 1),
      e.date || '—',
      e.tag_number || '—',
      e.species || '—',
      sexLabel(e.sex, e.species) || '—',
      hasValue(e.weight_kg) ? String(e.weight_kg) : '—',
      (locText || '—').slice(0, 40),
      (e.destination || '—').slice(0, 25),
      (e.notes || 'None observed').slice(0, 40)
    ];
    for (let c = 0; c < row.length; c++) doc.text(row[c], colX[c], y);
    y += 5.5;
  });

  y += 10;
  if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = 20; }
  doc.setFontSize(9);
  doc.text('Signature: ___________________________', 14, y);
  doc.text('Date: _______________', 160, y);
  y += 12;
  doc.setFontSize(7); doc.setTextColor(150);
  doc.text('Produced by First Light Cull Diary — firstlightdeer.co.uk', 14, y);

  const filename = 'larder-book-' + entries[0].date + '.pdf';
  doc.save(filename);
  return { filename, count: entries.length };
}

// ── Syndicate "list" PDF (simple culls list) ───────────────────────────────
// The lightweight "rows summary" export used by syndicate views. All inputs
// are already sliced from the RPC (no globals touched).
export function buildSyndicateListPDF({ rows, syndicateName, seasonLabelStr, filenameBase }) {
  if (!rows || !rows.length) return null;

  const JsPDF = getJsPDF();
  const doc = new JsPDF();
  doc.setFontSize(16);
  doc.text('Syndicate culls — ' + syndicateName, 14, 18);
  doc.setFontSize(10);
  doc.text(seasonLabelStr + ' · ' + rows.length + ' rows · firstlightdeer.co.uk', 14, 26);

  let y = 36;
  rows.forEach(function(r, i) {
    if (y > 275) { doc.addPage(); y = 20; }
    doc.setFontSize(10); doc.setFont(undefined, 'bold');
    doc.text((i + 1) + '. ' + (r.species || '—'), 14, y);
    doc.setFont(undefined, 'normal');
    doc.text(sexLabel(r.sex, r.species), 100, y);
    doc.text(fmtEntryDateShort(r.cull_date) || String(r.cull_date || '—'), 130, y);
    y += 5;
    doc.setFontSize(9); doc.setTextColor(100, 100, 100);
    doc.text('Culled by: ' + (r.culledBy || '—'), 14, y);
    doc.setTextColor(0, 0, 0);
    y += 8;
  });

  const filename = filenameBase + '.pdf';
  doc.save(filename);
  return { filename, count: rows.length };
}

// ── Syndicate "team larder book" PDF ───────────────────────────────────────
// Manager export: every carcass the team took across a season, with the
// SHOOTER column that single-user larder book doesn't have. Rows come
// pre-filtered server-side (RPC excludes "Left on hill" / anonymised
// retention rows) — we just sort chronologically and render.
export function buildSyndicateLarderBookPDF({ syndicate, season, rows }) {
  if (!rows || !rows.length) return null;

  const JsPDF = getJsPDF();
  const doc = new JsPDF('landscape');
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const label = seasonLabel(season);
  const synName = (syndicate && syndicate.name) || 'Syndicate';

  doc.setFontSize(16); doc.text('Team Larder Book — First Light Cull Diary', 14, 16);
  doc.setFontSize(9);  doc.setTextColor(120);
  doc.text(synName + ' · Season ' + label + ' · ' + rows.length + ' carcasses', 14, 23);
  doc.setTextColor(0);

  // Column layout — Shooter is the new column vs the single-user export.
  // Deliberate order: numeric # first, then the identity columns (date, tag,
  // shooter, species, sex) that a dealer checks first, then weight and
  // location bundle, then inspection / destination. Location is the most
  // elastic so it goes last.
  const headers = ['#','Date','Time','Tag','Shooter','Species','Sex','Wt(kg)','Age','Destination','Location / Ground','Larder inspection'];
  const colX    = [14,  22,   42,    58,   78,       120,      148,  165,      180,  196,           227,                  261];
  let y = 32;
  y = drawTableHeader(doc, { headers, colX, y, pageW });

  function abnormCell(r) {
    // Concise inline summary: structured codes first, then free-text "other".
    // Truncated at the colX grid; full text stays readable in the diary UI.
    if (Array.isArray(r.abnormalities) && r.abnormalities.length) {
      if (r.abnormalities.length === 1 && r.abnormalities[0] === 'none') return 'None observed';
      const codes = r.abnormalities.filter(function(c) { return c !== 'none'; });
      let shown = codes.slice(0, 2).map(function(c) { return ABNORMALITY_LABEL_BY_CODE[c] || c; }).join(', ');
      if (codes.length > 2) shown += ' (+' + (codes.length - 2) + ')';
      if (r.abnormalities_other) shown += '; other: ' + r.abnormalities_other;
      return shown;
    }
    if (r.abnormalities_other) return r.abnormalities_other;
    return 'Not recorded';
  }

  doc.setFontSize(7.5);
  rows.forEach(function(r, idx) {
    if (y > pageH - 20) {
      doc.addPage();
      y = drawTableHeader(doc, { headers, colX, y: 16, pageW });
      doc.setFontSize(7.5);
    }
    const locText = ((r.location_name || '') + (r.ground ? ' / ' + r.ground : ''))
      .trim().replace(/^\//, '').trim();
    const ageShort = (function(a) {
      if (!a) return '—';
      const s = String(a).trim();
      if (/^calf/i.test(s) || /kid|fawn/i.test(s)) return 'Calf';
      if (/yearling/i.test(s)) return 'Yrl';
      if (/adult/i.test(s)) return 'Adult';
      return s.slice(0, 7);
    })(r.age_class);
    const row = [
      String(idx + 1),
      r.date || '—',
      r.time || '—',
      (r.tag_number || '—').slice(0, 12),
      (r.culledBy || '—').slice(0, 22),
      (r.species || '—').slice(0, 14),
      sexLabel(r.sex, r.species) || '—',
      hasValue(r.weight_kg) ? String(r.weight_kg) : '—',
      ageShort,
      (r.destination || '—').slice(0, 18),
      (locText || '—').slice(0, 22),
      abnormCell(r).slice(0, 28)
    ];
    for (let c = 0; c < row.length; c++) doc.text(row[c], colX[c], y);
    y += 5.5;
  });

  // Totals footer — quick sanity row so a dealer/auditor can tick off
  // the page before signing.
  y += 6;
  if (y > pageH - 30) { doc.addPage(); y = 20; }
  doc.setDrawColor(200); doc.line(14, y - 2, pageW - 14, y - 2);
  doc.setFontSize(8); doc.setFont(undefined, 'bold');
  const totalKg = rows.reduce(function(s, r) { return s + (parseFloat(r.weight_kg) || 0); }, 0);
  doc.text('Total carcasses: ' + rows.length, 14, y);
  doc.text('Total weight: ' + (Math.round(totalKg * 10) / 10) + ' kg', 100, y);
  doc.setFont(undefined, 'normal');
  y += 14;

  // Manager signature — team book, so the manager signs it off.
  if (y > pageH - 20) { doc.addPage(); y = 20; }
  doc.setFontSize(9);
  doc.text('Syndicate manager signature: ___________________________', 14, y);
  doc.text('Date: _______________', 170, y);
  y += 12;
  doc.setFontSize(7); doc.setTextColor(150);
  doc.text('Produced by First Light Cull Diary — firstlightdeer.co.uk', 14, y);

  const filename = 'team-larder-book-' + syndicateFileSlug(synName) + '-' + season + '.pdf';
  doc.save(filename);
  return { filename, count: rows.length };
}
