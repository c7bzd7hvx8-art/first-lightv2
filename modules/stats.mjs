// First Light — modules/stats.mjs
// =============================================================================
// Stats-tab data tables, pure aggregators, and their DOM paint wrappers.
// Extracted from diary.js across several commits; see MODULARISATION-PLAN.md.
//
// Scope of this module:
//   Data tables (pure lookups — Commit H):
//     • CAL_COLORS       — 6-colour gradient palette for the calibre chart
//     • SP_COLORS_D      — species → stats-chart colour
//     • AGE_CLASSES      — ordered age-class label list
//     • AGE_COLORS       — one colour per AGE_CLASSES index
//     • AGE_GROUPS       — { 'Juvenile'|'Adult'|'Mature': [labels] }
//
//   Pure aggregators (no DOM, no globals — Commit H):
//     • aggregateShooterStats(entries)    → { counts, sortedNames, maxCount, isAllSelf }
//     • aggregateDestinationStats(entries) → { counts, sortedNames, maxCount }
//     • aggregateTimeOfDayStats(entries)  → { buckets, counts, total, maxCount }
//     • categorizeHourToBucket(hour)      → 0..5 bucket index (or 5 for night/NaN)
//
//   DOM paint wrappers (write HTML into stats-tab cards — Commit M):
//     • buildShooterStats(entries)       — renders #shooter-card / #shooter-chart
//     • buildDestinationStats(entries)   — renders #destination-card / #destination-chart
//     • buildTimeOfDayStats(entries)     — renders #time-card / #time-chart
//     Each hides its card when there is no data worth showing (all-Self / empty
//     destinations / no timed entries).
//
// Explicitly *not* in this module (stays in diary.js for now):
//   • buildCalibreDistanceStats, buildAgeStats, buildTrendsChart,
//     buildGroundStats — they mix aggregation, HTML, and DOM writes; their
//     pure halves are worth extracting but are larger and touch more cross-
//     references (normalizeAgeClassLabel, buildSeasonFromEntry, currentSeason,
//     Chart.js). Queued for Commit N.
//   • buildStats orchestrator — Commit O.
//
// Data-table + aggregator functions are pure. The DOM paint wrappers touch
// `document` and are tested with a small in-memory DOM stub.
// =============================================================================

import { esc } from '../lib/fl-pure.mjs';

// ── Shared palettes / age labels ──────────────────────────────────────────

/**
 * 6-colour calibre chart palette. Ordered loudest-to-softest so that the
 * chart's first-place bar draws the eye. Must have at least 6 entries
 * because we render up to the top-6 calibres (beyond that the bars get
 * unreadable on mobile).
 */
export const CAL_COLORS = [
  'linear-gradient(90deg,#5a7a30,#7adf7a)',
  'linear-gradient(90deg,#c8a84b,#f0c870)',
  'linear-gradient(90deg,#6a1b9a,#ab47bc)',
  'linear-gradient(90deg,#1565c0,#42a5f5)',
  'linear-gradient(90deg,#c62828,#ef5350)',
  'linear-gradient(90deg,#00695c,#26a69a)'
];

/**
 * Species → solid colour for stats charts (distance-by-species, trends).
 * Distinct from the hero-card species palette because stats charts print
 * small and need higher-contrast fills.
 */
export const SP_COLORS_D = {
  'Red Deer': '#c8a84b',
  'Roe Deer': '#5a7a30',
  'Fallow':   '#f57f17',
  'Muntjac':  '#6a1b9a',
  'Sika':     '#1565c0',
  'CWD':      '#00695c'
};

/** Age classes in canonical order (juvenile → mature). */
export const AGE_CLASSES = ['Calf / Kid / Fawn', 'Yearling', '2–4 years', '5–8 years', '9+ years'];

/** One colour per AGE_CLASSES index (same length + order). */
export const AGE_COLORS = ['#5a9a3a', '#5a7a30', '#c8a84b', '#f57f17', '#c62828'];

/**
 * Summary groupings for the "age pills" row under the per-class bars.
 * Values reference AGE_CLASSES labels verbatim — changing either requires
 * changing both. Kept as object so the render code can just iterate keys
 * for stable row order in all browsers that preserve insertion order (ES2015+).
 */
export const AGE_GROUPS = {
  'Juvenile': ['Calf / Kid / Fawn', 'Yearling'],
  'Adult':    ['2–4 years'],
  'Mature':   ['5–8 years', '9+ years']
};

// ── Pure aggregators ──────────────────────────────────────────────────────

/**
 * Shooter histogram. Treats blank/undefined `shooter` as the literal string
 * `'Self'` so the current user (who rarely fills the field for their own
 * culls) still appears on the chart when the user is part of a syndicate
 * that includes guest stalkers.
 *
 * Sort: 'Self' pinned first (the user's own shots are the meaningful
 * anchor point), then by count descending. Ties break by insertion order.
 *
 * @param {Array<{shooter?: string|null}>} entries
 * @returns {{
 *   counts: Record<string, number>,
 *   sortedNames: string[],
 *   maxCount: number,
 *   isAllSelf: boolean  // render caller uses this to hide the whole card
 * }}
 */
export function aggregateShooterStats(entries) {
  var counts = {};
  (entries || []).forEach(function (e) {
    var s = (e && e.shooter && e.shooter.trim()) ? e.shooter.trim() : 'Self';
    counts[s] = (counts[s] || 0) + 1;
  });
  var names = Object.keys(counts);
  names.sort(function (a, b) {
    if (a === 'Self') return -1;
    if (b === 'Self') return 1;
    return counts[b] - counts[a];
  });
  var maxCount = names.length ? Math.max.apply(null, names.map(function (s) { return counts[s]; })) : 0;
  var isAllSelf = names.length <= 1 && names[0] === 'Self';
  return { counts: counts, sortedNames: names, maxCount: maxCount, isAllSelf: isAllSelf };
}

/**
 * Destination histogram (Game dealer, Self/personal, etc.). Entries with no
 * `destination` set are skipped entirely — the caller hides the whole card
 * when sortedNames is empty, rather than rendering a confusing "not recorded"
 * slice that would dominate early-season data.
 *
 * @param {Array<{destination?: string|null}>} entries
 * @returns {{ counts: Record<string,number>, sortedNames: string[], maxCount: number }}
 */
export function aggregateDestinationStats(entries) {
  var counts = {};
  (entries || []).forEach(function (e) {
    if (e && e.destination) counts[e.destination] = (counts[e.destination] || 0) + 1;
  });
  var names = Object.keys(counts);
  names.sort(function (a, b) { return counts[b] - counts[a]; });
  var maxCount = names.length ? Math.max.apply(null, names.map(function (d) { return counts[d]; })) : 0;
  return { counts: counts, sortedNames: names, maxCount: maxCount };
}

/**
 * 6-bucket time-of-day histogram (Dawn / Morning / Midday / Afternoon / Dusk
 * / Night). Night wraps 21:00 → 04:00 so the bucket.min/max aren't a clean
 * range — we detect it via `categorizeHourToBucket` below. Buckets are in
 * render order (caller iterates index 0..5); Night is always index 5 so it
 * renders at the bottom.
 */
export const TIME_OF_DAY_BUCKETS = [
  { label: 'Dawn (05–07)',      min: 5,  max: 7,  clr: 'linear-gradient(90deg,#f57f17,#ffb74d)' },
  { label: 'Morning (08–10)',   min: 8,  max: 10, clr: 'linear-gradient(90deg,#c8a84b,#f0c870)' },
  { label: 'Midday (11–14)',    min: 11, max: 14, clr: 'linear-gradient(90deg,#5a7a30,#7adf7a)' },
  { label: 'Afternoon (15–17)', min: 15, max: 17, clr: 'linear-gradient(90deg,#1565c0,#42a5f5)' },
  { label: 'Dusk (18–20)',      min: 18, max: 20, clr: 'linear-gradient(90deg,#6a1b9a,#ab47bc)' },
  { label: 'Night (21–04)',     min: -1, max: -1, clr: 'linear-gradient(90deg,#444,#888)' }
];

/**
 * Return the time-of-day bucket index (0-5) for a given hour. NaN / out-of-
 * range input falls through to 5 (Night) — this is intentional: a stalker
 * who types "25:00" by mistake shouldn't silently drop out of the histogram
 * totals, and the Night bucket also happens to be the one that catches the
 * legitimate 21-04 wrap-around.
 */
export function categorizeHourToBucket(hour) {
  var h = typeof hour === 'number' ? hour : parseInt(hour, 10);
  if (isNaN(h)) return 5;
  for (var i = 0; i < 5; i++) {
    var b = TIME_OF_DAY_BUCKETS[i];
    if (h >= b.min && h <= b.max) return i;
  }
  return 5;
}

/**
 * Time-of-day histogram. Reads the HH from each entry's `time` string
 * ('HH:MM' or 'HH:MM:SS'). Entries with no time or unparseable time are
 * skipped entirely — unlike the hour-25 case in `categorizeHourToBucket`,
 * a *missing* time isn't a data point we want to force into Night.
 *
 * @param {Array<{time?: string|null}>} entries
 * @returns {{
 *   buckets: typeof TIME_OF_DAY_BUCKETS,
 *   counts: number[],   // length 6, parallel to buckets
 *   total: number,      // sum of counts; caller hides card when 0
 *   maxCount: number
 * }}
 */
export function aggregateTimeOfDayStats(entries) {
  var counts = [0, 0, 0, 0, 0, 0];
  (entries || []).forEach(function (e) {
    if (!e || !e.time) return;
    var h = parseInt(String(e.time).split(':')[0], 10);
    if (isNaN(h)) return;
    counts[categorizeHourToBucket(h)]++;
  });
  var total = counts.reduce(function (a, b) { return a + b; }, 0);
  var maxCount = Math.max.apply(null, counts);
  return { buckets: TIME_OF_DAY_BUCKETS, counts: counts, total: total, maxCount: maxCount };
}

// ── DOM paint wrappers ────────────────────────────────────────────────────
// The three functions below each render one card in the Stats tab's "More"
// section. They follow the same pattern: call the matching aggregator, hide
// the card entirely when the data is uninteresting (all-Self / empty set),
// otherwise build an HTML string from bar rows and assign it to the chart
// element's innerHTML in one write.
//
// The cards are styled by `.bar-row` / `.bar-lbl` / `.bar-track` /
// `.bar-fill` / `.bar-cnt` in `diary.css`; the colour choice for each row
// is inlined as a `style` attribute because each series uses a different
// palette (self=green / other=gold for shooter; a colour-coded map for
// destination; pre-baked colours from the aggregator for time-of-day).

/** Render the Shooter-breakdown card. Hides the card when every entry was
 *  shot by "Self" (no useful comparison to draw). */
export function buildShooterStats(entries) {
  var card  = document.getElementById('shooter-card');
  var chart = document.getElementById('shooter-chart');
  var agg = aggregateShooterStats(entries);

  if (agg.isAllSelf) { card.style.display = 'none'; return; }
  card.style.display = 'block';

  var html = '';
  agg.sortedNames.forEach(function(s) {
    var cnt = agg.counts[s];
    var pct = Math.round(cnt / agg.maxCount * 100);
    var barClr = s === 'Self'
      ? 'linear-gradient(90deg,#5a7a30,#7adf7a)'
      : 'linear-gradient(90deg,#c8a84b,#f0c870)';
    html += '<div class="bar-row">'
      + '<div class="bar-lbl">' + esc(s) + '</div>'
      + '<div class="bar-track"><div class="bar-fill" style="width:'+pct+'%;background:'+barClr+';"></div></div>'
      + '<div class="bar-cnt">'+cnt+'</div>'
      + '</div>';
  });
  chart.innerHTML = html;
}

/** Render the Destination-breakdown card. Hides the card when no entries
 *  carry a destination value. */
export function buildDestinationStats(entries) {
  var card  = document.getElementById('destination-card');
  var chart = document.getElementById('destination-chart');
  var agg = aggregateDestinationStats(entries);

  if (agg.sortedNames.length === 0) { card.style.display = 'none'; return; }
  card.style.display = 'block';

  // Per-destination gradient palette. Matches the semantic colour each
  // destination carries throughout the app (Self = green, Dealer = gold,
  // Condemned = red, etc.). Falls back to the Self/green gradient so an
  // unexpected free-text destination still renders rather than crash.
  var destColors = {
    'Self / personal use': 'linear-gradient(90deg,#5a7a30,#7adf7a)',
    'Game dealer':         'linear-gradient(90deg,#c8a84b,#f0c870)',
    'Friend / family':     'linear-gradient(90deg,#1565c0,#42a5f5)',
    'Stalking client':     'linear-gradient(90deg,#6a1b9a,#ab47bc)',
    'Estate / landowner':  'linear-gradient(90deg,#00695c,#4db6ac)',
    'Left on hill':        'linear-gradient(90deg,#888,#aaa)',
    'Condemned':           'linear-gradient(90deg,#c62828,#ef5350)'
  };

  var html = '';
  agg.sortedNames.forEach(function(d) {
    var cnt = agg.counts[d];
    var pct = Math.round(cnt / agg.maxCount * 100);
    var barClr = destColors[d] || 'linear-gradient(90deg,#5a7a30,#7adf7a)';
    html += '<div class="bar-row">'
      + '<div class="bar-lbl">' + esc(d) + '</div>'
      + '<div class="bar-track"><div class="bar-fill" style="width:'+pct+'%;background:'+barClr+';"></div></div>'
      + '<div class="bar-cnt">'+cnt+'</div>'
      + '</div>';
  });
  chart.innerHTML = html;
}

/** Render the Time-of-day card. Hides the card when no entry carries a
 *  usable time value. Early-returns when either DOM element is missing
 *  (the card is conditionally present depending on feature flags). */
export function buildTimeOfDayStats(entries) {
  var card  = document.getElementById('time-card');
  var chart = document.getElementById('time-chart');
  if (!card || !chart) return;

  var agg = aggregateTimeOfDayStats(entries);
  if (agg.total === 0) { card.style.display = 'none'; return; }
  card.style.display = 'block';

  var html = '';
  for (var j = 0; j < agg.buckets.length; j++) {
    if (agg.counts[j] === 0) continue;
    var pct = Math.round(agg.counts[j] / agg.maxCount * 100);
    html += '<div class="bar-row">'
      + '<div class="bar-lbl">' + agg.buckets[j].label + '</div>'
      + '<div class="bar-track"><div class="bar-fill" style="width:'+pct+'%;background:'+agg.buckets[j].clr+';"></div></div>'
      + '<div class="bar-cnt">'+agg.counts[j]+'</div>'
      + '</div>';
  }
  chart.innerHTML = html;
}
