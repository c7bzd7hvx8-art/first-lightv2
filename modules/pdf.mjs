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
 * Resolve the hunter identity lines used on every PDF that needs a
 * trained-hunter signature block. Returns:
 *   { hunterName: string, accountEmail: string }
 * Both strings are '' when no profile data is available. Wrapped in a
 * try/catch because `user` can be a malformed Supabase user object from
 * a borked session — we'd rather emit a blank signature line than blow
 * up an export at the critical "user clicks download" moment.
 */
function resolveHunterIdentity(user) {
  let hunterName = '';
  let accountEmail = '';
  try {
    hunterName = userProfileDisplayName(user);
    accountEmail = (user && user.email) ? String(user.email).trim() : '';
  } catch (_) { /* malformed user object */ }
  return { hunterName, accountEmail };
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

// ── Per-carcass Trained Hunter Declaration (game dealer) ───────────────────
// Regulation (EC) 853/2004 requires a trained hunter to declare that each
// carcass presented to a game dealer was examined at gralloch. This is the
// per-carcass version — caller passes an already-resolved entry.
//
// The declaration has three sections:
//   1. Entry facts table (species, date, location, tag, etc.)
//   2. Gralloch inspection list — structured abnormality codes with a legacy
//      fall-through to the free-text "notes" field for entries predating
//      the abnormalities columns.
//   3. Declaration statement + signature block + (optional) account email
//      reference when no explicit hunter name is set.
export function buildGameDealerDeclarationPDF({ entry, user }) {
  if (!entry) return null;

  const { hunterName, accountEmail } = resolveHunterIdentity(user);

  const JsPDF = getJsPDF();
  const doc = new JsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  const cx = pageW / 2;

  doc.setFontSize(18); doc.setFont(undefined, 'bold');
  doc.text('Trained Hunter Declaration', cx, 24, { align: 'center' });
  doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(100);
  doc.text('Wild Game — Food Safety Regulations', cx, 32, { align: 'center' });
  doc.setTextColor(0);

  doc.setDrawColor(200); doc.line(14, 38, pageW - 14, 38);

  const fields = [
    ['Species', entry.species || ''],
    ['Sex', sexLabel(entry.sex, entry.species)],
    ['Date of kill', entry.date || ''],
    ['Time', entry.time || ''],
    ['Location', entry.location_name || ''],
    ['Ground', entry.ground || ''],
    ['Tag / carcass number', entry.tag_number || ''],
    ['Carcass weight (kg)', hasValue(entry.weight_kg) ? String(entry.weight_kg) : ''],
    ['Age class', entry.age_class || ''],
    ['Calibre', entry.calibre || ''],
    ['Shot placement', entry.shot_placement || ''],
    ['Destination', entry.destination || '']
  ];

  let y = 48;
  doc.setFontSize(10);
  fields.forEach(function(f) {
    doc.setFont(undefined, 'bold');   doc.text(f[0] + ':', 20, y);
    doc.setFont(undefined, 'normal'); doc.text(f[1], 80, y);
    y += 8;
  });

  y += 6;
  doc.setFontSize(10); doc.setFont(undefined, 'bold');
  doc.text('Gralloch inspection (AHVLA trained-hunter checklist):', 20, y);
  doc.setFont(undefined, 'normal'); y += 8;

  // Structured list — each checklist code on its own line so a dealer /
  // inspector can see at a glance what was observed. Falls back to the
  // legacy "notes as abnormalities" behaviour for entries pre-dating the
  // abnormalities columns.
  const abnormCodes = Array.isArray(entry.abnormalities) ? entry.abnormalities : null;
  const abnormOther = entry.abnormalities_other || '';
  const hasStructured = (abnormCodes && abnormCodes.length > 0) || abnormOther;

  if (hasStructured) {
    if (abnormCodes && abnormCodes.length === 1 && abnormCodes[0] === 'none') {
      doc.text('✓ No abnormalities observed at gralloch.', 20, y);
      y += 7;
      if (abnormOther) {
        const altLines = doc.splitTextToSize('Additional note: ' + abnormOther, pageW - 40);
        doc.text(altLines, 20, y);
        y += altLines.length * 6;
      }
    } else if (abnormCodes && abnormCodes.length) {
      abnormCodes.filter(function(c) { return c !== 'none'; }).forEach(function(code) {
        doc.text('• ' + (ABNORMALITY_LABEL_BY_CODE[code] || code), 22, y);
        y += 6;
      });
      if (abnormOther) {
        const oLines = doc.splitTextToSize('• Other: ' + abnormOther, pageW - 40);
        doc.text(oLines, 22, y);
        y += oLines.length * 6;
      }
    } else {
      // Only free-text "other" was provided.
      const soloLines = doc.splitTextToSize('• ' + abnormOther, pageW - 40);
      doc.text(soloLines, 22, y);
      y += soloLines.length * 6;
    }
    y += 6;
  } else {
    // Legacy entries: no structured data captured. Fall back to notes as a
    // pragmatic stand-in so an older declaration still reads correctly.
    const legacy = entry.notes ? entry.notes.slice(0, 500) : 'Not recorded at gralloch';
    const splitNotes = doc.splitTextToSize(legacy, pageW - 40);
    doc.text(splitNotes, 20, y);
    y += splitNotes.length * 6 + 6;
  }
  y += 6;

  doc.setDrawColor(200); doc.line(14, y, pageW - 14, y); y += 16;

  doc.setFontSize(10);
  doc.text('I, the undersigned trained hunter, declare that I have examined this carcass and', 20, y); y += 7;
  doc.text('the viscera at the time of gralloching and found no abnormalities other than', 20, y); y += 7;
  doc.text('those noted above.', 20, y); y += 18;

  doc.text('Trained hunter name: ' + (hunterName || '________________________'), 20, y); y += 10;
  if (accountEmail && !hunterName) {
    doc.setFontSize(8); doc.setTextColor(120);
    doc.text('First Light account (reference): ' + accountEmail, 20, y);
    doc.setFontSize(10); doc.setTextColor(0);
    y += 8;
  }
  doc.text('Signature: ___________________________', 20, y);
  doc.text('Date: _______________', 130, y); y += 18;

  doc.setFontSize(7); doc.setTextColor(150);
  doc.text('Produced by First Light Cull Diary — firstlightdeer.co.uk', cx, y, { align: 'center' });

  const filename = 'declaration-' + (entry.species || 'entry').replace(/\s+/g, '-').toLowerCase() + '-' + entry.date + '.pdf';
  doc.save(filename);
  return { filename };
}

// ── Per-consignment Trained Hunter Declaration ─────────────────────────────
// Reg (EC) 853/2004 permits a single declaration covering every carcass in
// one consignment (delivery) rather than one declaration per carcass. The
// user selects N entries from the diary list in Select mode; caller passes
// the resolved entry rows — this function does the "Left on hill" exclusion
// internally so the excluded count can appear on the PDF.
//
// Return shape (caller drives the toast & select-mode exit):
//   null                       — no entries passed
//   { status: 'all-excluded',
//     excluded: N }            — every selected entry was "Left on hill"
//   { filename, count,
//     excluded: N }            — success
//
// NOTE on the header row: the consignment PDF uses a filled-green header
// rectangle with white text (not the bold-underline style used by the
// larder books), so it does not share `drawTableHeader`. We keep the
// 14-line block as an inner closure so the initial + page-break paths
// stay in sync (previously they were duplicated and had diverged slightly).
export function buildConsignmentDealerDeclarationPDF({ entries, user }) {
  if (!entries || !entries.length) return null;

  // Left-on-hill exclusion — a carcass that never entered the larder cannot
  // be declared to a game dealer.
  const excluded = entries.filter(function(e) {
    return (e.destination || '').toLowerCase() === 'left on hill';
  }).length;
  const filtered = entries.filter(function(e) {
    return (e.destination || '').toLowerCase() !== 'left on hill';
  }).slice(); // clone before sorting (don't mutate caller's array)

  if (filtered.length === 0) return { status: 'all-excluded', excluded };

  // Stable order: oldest first within the consignment — reads as a delivery manifest.
  filtered.sort(function(a, b) {
    return (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || '');
  });

  const { hunterName, accountEmail } = resolveHunterIdentity(user);

  // Landscape A4 — the carcass table needs 9 columns + notes column; portrait
  // is too narrow to avoid mid-word wraps in Species and Location.
  const JsPDF = getJsPDF();
  const doc = new JsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const PW = 842, PH = 595;
  const ML = 24, MR = 24;
  const UW = PW - ML - MR;
  const cx = PW / 2;

  const dateMin = filtered[0].date || '';
  const dateMax = filtered[filtered.length - 1].date || '';
  const totalKg = filtered.reduce(function(s, e) { return s + (parseFloat(e.weight_kg) || 0); }, 0);
  const weighedCount = filtered.filter(function(e) { return hasValue(e.weight_kg); }).length;

  doc.setFontSize(16); doc.setFont(undefined, 'bold');
  doc.text('Consignment — Trained Hunter Declaration', cx, 34, { align: 'center' });
  doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(100);
  doc.text('Wild Game — Food Safety Regulations (Reg (EC) 853/2004)', cx, 46, { align: 'center' });
  doc.setTextColor(0);
  doc.setDrawColor(200); doc.line(ML, 52, PW - MR, 52);

  doc.setFontSize(9); doc.setFont(undefined, 'bold');
  const summary = filtered.length + ' carcass' + (filtered.length === 1 ? '' : 'es')
    + '  ·  ' + (weighedCount === filtered.length
                 ? Math.round(totalKg) + ' kg total'
                 : Math.round(totalKg) + ' kg (' + weighedCount + ' of ' + filtered.length + ' weighed)')
    + '  ·  ' + (dateMin === dateMax ? dateMin : dateMin + ' → ' + dateMax);
  doc.text(summary, ML, 66);
  if (excluded > 0) {
    doc.setFont(undefined, 'normal'); doc.setTextColor(120); doc.setFontSize(8);
    doc.text('(' + excluded + ' excluded — destination "Left on hill")', ML, 78);
    doc.setTextColor(0);
  }

  let y = excluded > 0 ? 92 : 84;

  // Column widths + x-offsets. Named object so the row loop stays legible.
  const W_NUM = 24, W_TAG = 54, W_DATE = 56, W_TIME = 34, W_SP = 68, W_SEX = 44;
  const W_WT = 42, W_AGE = 56, W_LOC = 140, W_GRND = 80;
  const W_NOTES = UW - (W_NUM + W_TAG + W_DATE + W_TIME + W_SP + W_SEX + W_WT + W_AGE + W_LOC + W_GRND);
  const C = {
    num:  ML,
    tag:  ML + W_NUM,
    date: ML + W_NUM + W_TAG,
    time: ML + W_NUM + W_TAG + W_DATE,
    sp:   ML + W_NUM + W_TAG + W_DATE + W_TIME,
    sex:  ML + W_NUM + W_TAG + W_DATE + W_TIME + W_SP,
    wt:   ML + W_NUM + W_TAG + W_DATE + W_TIME + W_SP + W_SEX,
    age:  ML + W_NUM + W_TAG + W_DATE + W_TIME + W_SP + W_SEX + W_WT,
    loc:  ML + W_NUM + W_TAG + W_DATE + W_TIME + W_SP + W_SEX + W_WT + W_AGE,
    grnd: ML + W_NUM + W_TAG + W_DATE + W_TIME + W_SP + W_SEX + W_WT + W_AGE + W_LOC,
    notes: ML + W_NUM + W_TAG + W_DATE + W_TIME + W_SP + W_SEX + W_WT + W_AGE + W_LOC + W_GRND,
  };

  function shortAge(a) {
    if (!a) return '–';
    const s = String(a).trim();
    if (/^calf/i.test(s) || /kid|fawn/i.test(s)) return 'Calf';
    if (/yearling/i.test(s)) return 'Yrl';
    if (/adult/i.test(s)) return 'Adult';
    return s.slice(0, 7);
  }

  // Inner closure — both the initial header and the page-break header draw
  // the same filled-green bar. Previously this was duplicated inline and the
  // two copies had started to drift (different setFontSize ordering). One
  // source of truth now.
  function drawConsignmentHeader(atY) {
    doc.setFontSize(7); doc.setFont(undefined, 'bold');
    doc.setFillColor(90, 122, 48); doc.setTextColor(255);
    doc.rect(ML, atY, UW, 14, 'F');
    doc.text('#', C.num + 4, atY + 9);
    doc.text('TAG', C.tag + 4, atY + 9);
    doc.text('DATE', C.date + 4, atY + 9);
    doc.text('TIME', C.time + 4, atY + 9);
    doc.text('SPECIES', C.sp + 4, atY + 9);
    doc.text('SEX', C.sex + 4, atY + 9);
    doc.text('WT(kg)', C.wt + 4, atY + 9);
    doc.text('AGE', C.age + 4, atY + 9);
    doc.text('LOCATION', C.loc + 4, atY + 9);
    doc.text('GROUND', C.grnd + 4, atY + 9);
    doc.text('GRALLOCH / NOTES (abnormalities if any)', C.notes + 4, atY + 9);
    doc.setTextColor(0); doc.setFont(undefined, 'normal'); doc.setFontSize(7);
    return atY + 14;
  }

  y = drawConsignmentHeader(y);

  filtered.forEach(function(e, idx) {
    if (y > PH - 120) {
      doc.addPage();
      y = drawConsignmentHeader(40);
    }
    // Zebra stripe — light parchment on even rows.
    if (idx % 2 === 0) { doc.setFillColor(248, 246, 240); doc.rect(ML, y, UW, 14, 'F'); }
    const rowY = y + 9;
    doc.text(String(idx + 1), C.num + 4, rowY);
    doc.text((e.tag_number ? String(e.tag_number) : '–').slice(0, 10), C.tag + 4, rowY);
    doc.text(e.date || '–', C.date + 4, rowY);
    doc.text(e.time || '–', C.time + 4, rowY);
    doc.text((e.species || '–').slice(0, 12), C.sp + 4, rowY);
    doc.text((sexLabel(e.sex, e.species) || '–').slice(0, 8), C.sex + 4, rowY);
    doc.text(hasValue(e.weight_kg) ? String(e.weight_kg) : '–', C.wt + 4, rowY);
    doc.text(shortAge(e.age_class), C.age + 4, rowY);
    const locTxt = (e.location_name || '–');
    const locLines = doc.splitTextToSize(locTxt, W_LOC - 6);
    doc.text(locLines.length > 1 ? locLines[0].slice(0, 30) + '…' : (locLines[0] || '–'), C.loc + 4, rowY);
    doc.text((e.ground || '–').slice(0, 14), C.grnd + 4, rowY);

    // Prefer structured abnormalities over free-text notes: shorter, more
    // uniform, and actually defensible as "trained hunter ticked these boxes".
    // Codes expand to short labels; long lists append "+N" so row height
    // stays fixed.
    let gText;
    if (Array.isArray(e.abnormalities) && e.abnormalities.length) {
      if (e.abnormalities.length === 1 && e.abnormalities[0] === 'none') {
        gText = 'No abnormalities observed';
      } else {
        const codes = e.abnormalities.filter(function(c) { return c !== 'none'; });
        let shown = codes.slice(0, 2).map(function(c) { return ABNORMALITY_LABEL_BY_CODE[c] || c; }).join(', ');
        if (codes.length > 2) shown += ' (+' + (codes.length - 2) + ')';
        if (e.abnormalities_other) shown += '; other: ' + e.abnormalities_other;
        gText = shown;
      }
    } else if (e.abnormalities_other) {
      gText = e.abnormalities_other;
    } else if (e.notes && e.notes.trim()) {
      gText = e.notes.trim();
    } else {
      gText = 'Not recorded';
    }
    const nLines = doc.splitTextToSize(gText, W_NOTES - 6);
    doc.text(nLines.length > 1 ? nLines[0].slice(0, 40) + '…' : (nLines[0] || '–'), C.notes + 4, rowY);
    y += 14;
  });

  // Declaration block — force to next page if we can't fit declaration +
  // signature together, so the signed page isn't orphaned from the manifest.
  if (y > PH - 110) { doc.addPage(); y = 40; }
  y += 16;
  doc.setDrawColor(200); doc.line(ML, y, PW - MR, y); y += 16;
  doc.setFontSize(10); doc.setFont(undefined, 'bold');
  doc.text('Declaration', ML, y); y += 12;
  doc.setFont(undefined, 'normal'); doc.setFontSize(9);
  const declLines = doc.splitTextToSize(
    'I, the undersigned trained hunter, declare that I examined each carcass listed above ' +
    'and its viscera at the time of gralloching, and found no abnormalities other than any ' +
    'recorded in the GRALLOCH / NOTES column for the carcass concerned. The carcasses are ' +
    'being transferred to the named game dealer as a single consignment.',
    UW
  );
  doc.text(declLines, ML, y); y += declLines.length * 12 + 10;

  doc.setFontSize(10);
  doc.text('Trained hunter name: ' + (hunterName || '________________________________'), ML, y); y += 14;
  if (accountEmail && !hunterName) {
    doc.setFontSize(8); doc.setTextColor(120);
    doc.text('First Light account (reference): ' + accountEmail, ML, y);
    doc.setFontSize(10); doc.setTextColor(0); y += 12;
  }
  doc.text('Game dealer / consignee: ______________________________________', ML, y); y += 14;
  doc.text('Signature: ___________________________________', ML, y);
  doc.text('Date: ____________________', ML + 360, y); y += 20;

  doc.setFontSize(7); doc.setTextColor(150);
  doc.text('Produced by First Light Cull Diary — firstlightdeer.co.uk', cx, PH - 18, { align: 'center' });

  const filename = 'consignment-declaration-' + (dateMin || 'na')
    + (dateMax && dateMax !== dateMin ? '-to-' + dateMax : '')
    + '.pdf';
  doc.save(filename);
  return { filename, count: filtered.length, excluded };
}
