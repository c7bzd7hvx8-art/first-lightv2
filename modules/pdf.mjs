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

import { sexLabel, parseEntryDateParts, MONTH_NAMES } from '../lib/fl-pure.mjs';

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
