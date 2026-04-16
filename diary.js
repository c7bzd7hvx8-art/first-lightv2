/* Cull Diary — App v2.0 */

// ══════════════════════════════════════════════════════════════
// MODULE IMPORTS (modularisation Phase 1 — see MODULARISATION-PLAN.md)
// ══════════════════════════════════════════════════════════════
// Each import lands here as we extract. Order: Tier-0 / Tier-1 first so
// later tiers can build on them. All modules live under ./modules/ except
// lib/fl-pure.mjs which predates the plan.
import {
  diaryNow,
  isDiaryUkClockReady,
  syncDiaryTrustedUkClock as flClockSync
} from './modules/clock.mjs';
import { initSwBridge } from './modules/sw-bridge.mjs';
import {
  SUPABASE_URL, SUPABASE_KEY, sb,
  initSupabase as flSupabaseInit
} from './modules/supabase.mjs';
import {
  wxCodeLabel,
  windDirLabel,
  fetchCullWeather
} from './modules/weather.mjs';
// findOpenMeteoHourlyIndex and diaryLondonWallMs are not re-imported —
// they're used only by fetchCullWeather (inside the module) and tests.
import {
  CULL_PHOTO_SIGN_EXPIRES,
  newCullPhotoPath,
  cullPhotoStoragePath,
  dataUrlToBlob,
  compressPhotoFile
} from './modules/photos.mjs';
import {
  CAL_COLORS, SP_COLORS_D,
  AGE_CLASSES, AGE_COLORS, AGE_GROUPS,
  aggregateShooterStats,
  aggregateDestinationStats,
  aggregateTimeOfDayStats
} from './modules/stats.mjs';
import {
  SVG_PLAN_TARGET_ICON, SVG_CULL_MAP_EMPTY_PIN,
  SVG_FL_CLOUD, SVG_FL_CLIPBOARD, SVG_FL_CAMERA, SVG_FL_IMAGE_GALLERY,
  SVG_FL_IMAGE_OFF, SVG_FL_PIN, SVG_FL_GPS, SVG_FL_PENCIL,
  SVG_FL_FILE_PDF, SVG_FL_TRASH, SVG_FL_BOOK, SVG_FL_QUICK,
  SVG_FL_SIGNAL, SVG_FL_TOAST_WARN, SVG_FL_TOAST_OK, SVG_FL_TOAST_INFO,
  SVG_WX_TEMP, SVG_WX_WIND, SVG_WX_PRESSURE,
  SVG_WX_SKY_CLR, SVG_WX_SKY_PTLY, SVG_WX_SKY_OVC, SVG_WX_SKY_FOG,
  SVG_WX_SKY_DZ, SVG_WX_SKY_RAIN, SVG_WX_SKY_SHOWERS, SVG_WX_SKY_SNOW,
  SVG_WX_SKY_SNSH, SVG_WX_SKY_TS, SVG_WX_SKY_UNK
} from './modules/svg-icons.mjs';

// ══════════════════════════════════════════════════════════════
// GLOBALS INDEX (partial — full migration deferred to P3 code-quality #1)
// ══════════════════════════════════════════════════════════════
// Migrated (use these):
//   flSelection   { active, ids }         — diary-list multi-select
//   flQuickEntry  { species, sex, loc… }  — quick-entry form state
//
// NOT yet migrated (still free `var` declarations):
//   currentUser / allEntries / currentSeason           — ~225 refs
//   editingId / formDirty / pendingDeleteEntryId       — ~24 refs
//   photoFile / photoPreviewUrl / editingOriginalPhotoPath
//   formSpecies / formSex / cullTargets / prevSeasonTargets
//
// Rationale for deferral: these participate in cross-function mutation
// graphs that would need every touch-site audited and tested in one shot.
// The plan is in MODULARISATION-PLAN.md — they get folded into module-
// local state (auth / data / form / photos) during that refactor so they
// move once, under cover of an expanded test suite, instead of twice.
// Until then: DO NOT add new top-level globals without a strong reason.
// If you need app-wide state, extend one of the two flXxx objects above
// or file under a descriptive prefix (fl…) so the grep surface stays flat.
// ══════════════════════════════════════════════════════════════

// ── Debug logging gate ─────────────────────────────────────────
// Most console.warn/console.error sites in this file log a short one-line
// message in catch-blocks (fine to ship). A small number — notably the
// photo-upload path — dumped full Supabase error objects to the console,
// which a curious user on a shared device can see by opening devtools.
// flDebugLog() keeps the user-visible toast intact but only prints object
// details when the user has explicitly opted in by setting
// `localStorage.fl_debug = '1'` or `window.FL_DEBUG = true`. A one-line
// label still prints by default so remote troubleshooting over screen-share
// is possible without exposing internals.
function flDebugEnabled() {
  try {
    if (typeof window !== 'undefined' && window.FL_DEBUG === true) return true;
    if (typeof localStorage !== 'undefined' && localStorage.getItem('fl_debug') === '1') return true;
  } catch (_) {}
  return false;
}
function flDebugLog(level, label, details) {
  var fn = (level === 'error') ? console.error : console.warn;
  try {
    if (flDebugEnabled()) {
      fn.call(console, label, details);
    } else {
      fn.call(console, label);
    }
  } catch (_) {}
}

// ── Top-level error safety net ─────────────────────────────────
// Before this, the only error listener in the file was on <img> — a
// rejected promise in an async save handler, PDF generation, map init,
// or Nominatim fetch would disappear silently and the user would see a
// button that did nothing. These two handlers surface at least *some*
// feedback: one haptic buzz so the device confirms something went wrong,
// and a short toast so the user knows to try again. We explicitly skip
// benign noise (AbortError from cancelled fetches, ResizeObserver loops,
// extension script errors from window.error with filename === '') so the
// toast doesn't nag on normal lifecycle events.
(function installFlGlobalErrorHandlers() {
  if (typeof window === 'undefined' || window.__flGlobalErrorInstalled) return;
  window.__flGlobalErrorInstalled = true;
  var FL_ERR_COOLDOWN_MS = 3000;
  var lastToastAt = 0;
  function shouldIgnore(reason) {
    if (!reason) return true;
    var name = reason.name || '';
    var msg  = String(reason.message || reason || '');
    if (name === 'AbortError') return true;
    if (/ResizeObserver loop/i.test(msg)) return true;
    if (/Non-Error promise rejection/i.test(msg)) return true;
    return false;
  }
  function surface(label, reason) {
    if (shouldIgnore(reason)) return;
    flDebugLog('error', label, reason);
    var now = Date.now();
    if (now - lastToastAt < FL_ERR_COOLDOWN_MS) return;
    lastToastAt = now;
    try { if (typeof flHapticError === 'function') flHapticError(); } catch (_) {}
    try { if (typeof showToast === 'function') showToast('⚠️ Something went wrong — please try again'); } catch (_) {}
  }
  window.addEventListener('unhandledrejection', function(ev) {
    surface('unhandledrejection', ev && ev.reason);
  });
  window.addEventListener('error', function(ev) {
    // Browser extensions sometimes fire error events with no filename
    // and no message — not our bug, don't toast.
    if (ev && !ev.message && !ev.filename) return;
    surface('window.error', ev && (ev.error || ev.message));
  });
})();

// ── DOM-ready helper ───────────────────────────────────────────
// Under <script type="module"> the script is deferred; by the time this file
// runs, DOMContentLoaded has already fired and a plain
// `document.addEventListener('DOMContentLoaded', fn)` callback would never
// execute. This helper runs `fn` after the module's synchronous top-level
// finishes (via queueMicrotask) — otherwise callbacks registered early in
// the file would fire before later `var` declarations have been initialised,
// crashing with "Cannot read properties of undefined". Safe under classic-
// script too because the microtask queue drains after the current script.
function flOnReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    // Defer to microtask so the callback observes the final module state
    // (all top-level `var`s and function declarations initialised).
    queueMicrotask(fn);
  }
}

// ══════════════════════════════════════════════════════════════
// CULL PLAN — targets vs actuals
// ══════════════════════════════════════════════════════════════
var cullTargets = {}; // { 'Red Deer-m': 10, 'Red Deer-f': 12, ... }
var prevSeasonTargets = {}; // for copy-from-prev
/** Serialized targets sheet inputs after open or save — for unsaved-close guard. */
var targetsSheetSavedSnapshot = null;

var PLAN_SPECIES = [
  { name:'Red Deer',  color:'#c8a84b', key:'red',     mLbl:'Stag', fLbl:'Hind' },
  { name:'Roe Deer',  color:'#5a7a30', key:'roe',     mLbl:'Buck', fLbl:'Doe'  },
  { name:'Fallow',    color:'#f57f17', key:'fallow',  mLbl:'Buck', fLbl:'Doe'  },
  { name:'Muntjac',   color:'#6a1b9a', key:'muntjac', mLbl:'Buck', fLbl:'Doe'  },
  { name:'Sika',      color:'#1565c0', key:'sika',    mLbl:'Stag', fLbl:'Hind' },
  { name:'CWD',       color:'#00695c', key:'cwd',     mLbl:'Buck', fLbl:'Doe'  },
];

// ── Trusted UK clock ───────────────────────────────────────────
// Implementation lives in ./modules/clock.mjs. This shim preserves the
// zero-arg `syncDiaryTrustedUkClock()` signature used across diary.js (5
// call sites) while passing the Supabase anon config through for the
// third-tier fallback. SUPABASE_URL / SUPABASE_KEY are imported from
// ./modules/supabase.mjs at the top of this file.
async function syncDiaryTrustedUkClock() {
  return flClockSync({ supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY });
}

/** Match PLAN_SPECIES row for syndicate / plan UIs; unknown names get a neutral dot. */
function planSpeciesMeta(name) {
  for (var i = 0; i < PLAN_SPECIES.length; i++) {
    if (PLAN_SPECIES[i].name === name) return PLAN_SPECIES[i];
  }
  return { name: name, color: '#5a7a30', mLbl: 'Male', fLbl: 'Female' };
}

function isCurrentSeason(season) {
  var now = diaryNow();
  var m = now.getMonth() + 1, y = now.getFullYear();
  var startYear = m >= 8 ? y : y - 1;
  return season === startYear + '-' + String(startYear + 1).slice(-2);
}

async function loadTargets(season) {
  if (!sb || !currentUser) return;
  try {
    var r = await sb.from('cull_targets')
      .select('species, sex, target')
      .eq('user_id', currentUser.id)
      .eq('season', season);
    cullTargets = {};
    if (r.data) {
      r.data.forEach(function(row) {
        cullTargets[row.species + '-' + row.sex] = row.target;
      });
    }
  } catch(e) { console.warn('loadTargets error:', e); }
}

async function loadPrevTargets(season) {
  // Load targets from the season before current for copy functionality
  if (!sb || !currentUser) return;
  var parts = season.split('-');
  var prevStart = parseInt(parts[0]) - 1;
  var prevSeason = prevStart + '-' + String(prevStart + 1).slice(-2);
  try {
    var r = await sb.from('cull_targets')
      .select('species, sex, target')
      .eq('user_id', currentUser.id)
      .eq('season', prevSeason);
    prevSeasonTargets = {};
    if (r.data) {
      r.data.forEach(function(row) {
        prevSeasonTargets[row.species + '-' + row.sex] = row.target;
      });
    }
  } catch(e) { console.warn('loadPrevTargets error:', e); }
}

// SVG icon blobs live in ./modules/svg-icons.mjs (imported at the top of
// this file). Extracting them removes ~120 lines of string literals from
// here; callers reference the same `SVG_*` names via the import.

function diaryCloudSaveInner(label) {
  return '<span class="di-btn-ic" aria-hidden="true">' + SVG_FL_CLOUD + '</span>' + label;
}

function diaryNoPhotoListHtml(spClass, species) {
  var ini = species && species.length ? esc(species.charAt(0)) : '';
  return '<div class="no-photo-placeholder ' + spClass + ' no-photo-placeholder--list" style="position:absolute;inset:0;">'
    + '<span class="di-ic di-ic--list-noph" aria-hidden="true">' + SVG_FL_IMAGE_OFF + '</span>'
    + '<div class="no-photo-list-cap">No photo</div>'
    + (ini ? '<div class="no-photo-list-sub">' + ini + '</div>' : '')
    + '</div>';
}

function diaryHeroNoPhotoHtml() {
  return '<div class="detail-hero-noph" aria-hidden="true">'
    + '<span class="di-ic di-ic--hero-noph">' + SVG_FL_IMAGE_OFF + '</span>'
    + '<div class="detail-hero-noph-t">No photo</div></div>';
}

function diaryPhotoThumbEmptyHtml() {
  return '<div class="photo-thumb-noph">'
    + '<span class="di-ic di-ic--thumb-noph" aria-hidden="true">' + SVG_FL_IMAGE_OFF + '</span>'
    + '<div class="photo-thumb-noph-t">No photo</div></div>';
}

function flToastParse(msg) {
  var m = String(msg == null ? '' : msg);
  if (/^✅\s*/.test(m)) return { kind: 'ok', text: m.replace(/^✅\s*/, '') };
  if (/^⚠️?\s*/.test(m)) return { kind: 'warn', text: m.replace(/^⚠️?\s*/, '') };
  if (/^✓\s*/.test(m)) return { kind: 'ok', text: m.replace(/^✓\s*/, '') };
  if (/^📋\s*/.test(m)) return { kind: 'info', text: m.replace(/^📋\s*/, '') };
  if (/^📷\s*/.test(m)) return { kind: 'info', text: m.replace(/^📷\s*/, '') };
  if (/^📍\s*/.test(m)) return { kind: 'info', text: m.replace(/^📍\s*/, '') };
  if (/^📶\s*/.test(m)) return { kind: 'info', text: m.replace(/^📶\s*/, '') };
  if (/^☁️?\s*/.test(m)) return { kind: 'info', text: m.replace(/^☁️?\s*/, '') };
  if (/^⏳\s*/.test(m)) return { kind: 'info', text: m.replace(/^⏳\s*/, '') };
  if (/^🗑\uFE0F?\s*/.test(m)) return { kind: 'info', text: m.replace(/^🗑\uFE0F?\s*/, '') };
  return { kind: 'info', text: m };
}

function renderPlanCard(entries, season) {
  var body = document.getElementById('plan-body');
  var editBtn = document.getElementById('plan-edit-btn');
  var planSub = document.getElementById('plan-sub');
  if (!body) return;

  // Hide edit button for past seasons
  var isCurrent = isCurrentSeason(season);
  if (editBtn) editBtn.style.display = isCurrent ? '' : 'none';
  if (planSub) planSub.textContent = isCurrent ? 'Cull targets vs actual' : 'Past season · read only';

  // Check if any targets set — either season or ground mode
  var hasSeasonTargets = Object.keys(cullTargets).some(function(k) { return cullTargets[k] > 0; });
  var hasGrndTargets = hasGroundTargets();
  var hasTargets = hasSeasonTargets || hasGrndTargets;
  if (!hasTargets) {
    body.innerHTML = isCurrent
      ? '<div class="plan-empty"><div class="plan-empty-icon" aria-hidden="true">' + SVG_PLAN_TARGET_ICON + '</div><div class="plan-empty-t">No targets set</div><div class="plan-empty-s">Set cull targets to track your season plan against actual results.</div><button type="button" class="plan-set-btn" data-fl-action="open-targets">Set targets</button></div>'
      : '<div class="plan-empty"><div class="plan-empty-icon" aria-hidden="true">' + SVG_PLAN_TARGET_ICON + '</div><div class="plan-empty-t">No targets were set</div><div class="plan-empty-s">No cull plan was recorded for this season.</div></div>';
    return;
  }

  // Count actuals per species/sex — filtered by ground if in ground mode
  var actuals = {};
  var filteredByGround = entries;
  if (planGroundFilter !== 'overview' && (savedGrounds.length > 0 || hasGroundTargets())) {
    if (planGroundFilter === '__unassigned__') {
      filteredByGround = entries.filter(function(e){ return !e.ground; });
    } else {
      filteredByGround = entries.filter(function(e){ return e.ground === planGroundFilter; });
    }
  }
  filteredByGround.forEach(function(e) {
    var k = e.species + '-' + e.sex;
    actuals[k] = (actuals[k] || 0) + 1;
  });

  // Determine which targets to use
  var activeTargets = cullTargets;
  if (planGroundFilter === 'overview') {
    if (groundLedPlanActive()) {
      var aggOverview = sumGroundTargetsAgg(groundTargets);
      activeTargets = summedGroundTargetsAnyPositive(aggOverview) ? aggOverview : cullTargets;
    } else if (hasGroundTargets()) {
      var hasSeasonT = Object.keys(cullTargets).some(function(k) { return cullTargets[k] > 0; });
      if (!hasSeasonT) {
        activeTargets = {};
        Object.keys(groundTargets).forEach(function(g) {
          Object.keys(groundTargets[g]).forEach(function(k) {
            activeTargets[k] = (activeTargets[k] || 0) + (groundTargets[g][k] || 0);
          });
        });
      }
    }
  } else if (savedGrounds.length > 0 || hasGroundTargets()) {
    activeTargets = groundTargets[planGroundFilter] || {};
  }

  var totalTarget = 0, totalActual = 0;
  var html = '';

  PLAN_SPECIES.forEach(function(sp, idx) {
    var mKey = sp.name + '-m';
    var fKey = sp.name + '-f';
    var mTarget = activeTargets[mKey] || 0;
    var fTarget = activeTargets[fKey] || 0;
    var mActual = actuals[mKey] || 0;
    var fActual = actuals[fKey] || 0;
    if (mTarget === 0 && fTarget === 0 && mActual === 0 && fActual === 0) return; // skip species with no targets and no actuals
    var spTarget = mTarget + fTarget;
    var spActual = mActual + fActual;
    totalTarget += spTarget;
    totalActual += spActual;

    if (idx > 0 && html) html += '<div class="plan-divider"></div>';

    html += '<div class="plan-sp-section">';
    html += '<div class="plan-sp-hdr">';
    html += '<div class="plan-sp-dot" style="background:' + sp.color + ';"></div>';
    html += '<div class="plan-sp-name">' + sp.name + '</div>';
    html += '<div class="plan-sp-total">' + spActual + '/' + spTarget + '</div>';
    html += '</div>';

    // Male row — show if target set OR actuals exist
    if (mTarget > 0 || mActual > 0) {
      var mPct = mTarget > 0 ? Math.min(100, Math.round(mActual / mTarget * 100)) : (mActual > 0 ? 100 : 0);
      var mDone = mTarget > 0 && mActual >= mTarget;
      var barColor = mTarget === 0 ? 'linear-gradient(90deg,#a0988a,#c0b8a8)' : mDone ? 'linear-gradient(90deg,#2d7a1a,#7adf7a)' : 'linear-gradient(90deg,#5a7a30,#7adf7a)';
      html += '<div class="plan-sex-row">';
      html += '<div class="plan-sex-icon">♂</div>';
      html += '<div class="plan-sex-lbl">' + sp.mLbl + '</div>';
      html += '<div class="plan-bar-wrap"><div class="plan-bar" style="width:' + mPct + '%;background:' + barColor + ';"></div></div>';
      html += '<div class="plan-count ' + (mDone ? 'plan-count-done' : mActual === 0 ? 'plan-count-zero' : '') + '">' + mActual + '/' + mTarget + (mDone ? ' ✓' : '') + '</div>';
      html += '</div>';
    }

    // Female row — show if target set OR actuals exist
    if (fTarget > 0 || fActual > 0) {
      var fPct = fTarget > 0 ? Math.min(100, Math.round(fActual / fTarget * 100)) : (fActual > 0 ? 100 : 0);
      var fDone = fTarget > 0 && fActual >= fTarget;
      var fBarColor = fTarget === 0 ? 'linear-gradient(90deg,#a0988a,#c0b8a8)' : fDone ? 'linear-gradient(90deg,#2d7a1a,#7adf7a)' : 'linear-gradient(90deg,#5a7a30,#7adf7a)';
      html += '<div class="plan-sex-row">';
      html += '<div class="plan-sex-icon">♀</div>';
      html += '<div class="plan-sex-lbl">' + sp.fLbl + '</div>';
      html += '<div class="plan-bar-wrap"><div class="plan-bar" style="width:' + fPct + '%;background:' + fBarColor + ';"></div></div>';
      html += '<div class="plan-count ' + (fDone ? 'plan-count-done' : fActual === 0 ? 'plan-count-zero' : '') + '">' + fActual + '/' + fTarget + (fDone ? ' ✓' : '') + '</div>';
      html += '</div>';
    }

    html += '</div>';
  });

  // Total row
  var totalPct = totalTarget > 0 ? Math.min(100, Math.round(totalActual / totalTarget * 100)) : 0;
  html += '<div class="plan-total-row">';
  html += '<div class="plan-total-lbl">Total</div>';
  html += '<div class="plan-total-bar"><div class="plan-total-fill" style="width:' + totalPct + '%;"></div></div>';
  html += '<div class="plan-total-count">' + totalActual + '/' + totalTarget + '</div>';
  html += '</div>';

  if (!isCurrent) html += '<div class="plan-past-note">Past season — read only</div>';

  body.innerHTML = html;
}

function openTargetsSheet() {
  if (!isCurrentSeason(currentSeason)) return; // only edit current season

  // Populate season steppers (sum of grounds + pool when that split is in use)
  var disp = getSeasonSheetDisplayTotals();
  PLAN_SPECIES.forEach(function(sp) {
    var mEl = document.getElementById('tt-' + sp.key + 'm');
    var fEl = document.getElementById('tt-' + sp.key + 'f');
    if (mEl) mEl.value = disp[sp.name + '-m'] || 0;
    if (fEl) fEl.value = disp[sp.name + '-f'] || 0;
  });

  // Show copy-from-prev if previous season has targets and current is empty
  var dispCopy = getSeasonSheetDisplayTotals();
  var hasCurrentTargets = Object.keys(dispCopy).some(function(k){ return dispCopy[k] > 0; });
  var hasPrevTargets = Object.keys(prevSeasonTargets).some(function(k){ return prevSeasonTargets[k] > 0; });
  var copyWrap = document.getElementById('copy-targets-wrap');
  if (copyWrap) copyWrap.style.display = (!hasCurrentTargets && hasPrevTargets) ? 'block' : 'none';

  // Update subtitle
  var sub = document.getElementById('tsheet-sub');
  if (sub) sub.textContent = currentSeason;

  // Build By ground DOM (hidden) so snapshots, dirty check, and live sync to Season total work.
  renderGroundSections();

  // Always open Season total first; By ground is one tap away (Unassigned lives there only).
  setTargetMode('season');
  refreshSeasonGroundLedHint();
  updateSeasonTotalFooter();
  setTargetsSheetSnapshot();

  document.getElementById('tsheet-ov').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function captureTargetsSheetSnapshot() {
  var parts = [];
  PLAN_SPECIES.forEach(function(sp) {
    var mEl = document.getElementById('tt-' + sp.key + 'm');
    var fEl = document.getElementById('tt-' + sp.key + 'f');
    parts.push('ttm:' + sp.key + ':' + (mEl ? (parseInt(mEl.value, 10) || 0) : -1));
    parts.push('ttf:' + sp.key + ':' + (fEl ? (parseInt(fEl.value, 10) || 0) : -1));
  });
  (savedGrounds || []).forEach(function(g, i) {
    var p = 'gt_' + i;
    PLAN_SPECIES.forEach(function(sp) {
      var mEl = document.getElementById(p + '_' + sp.key + 'm');
      var fEl = document.getElementById(p + '_' + sp.key + 'f');
      parts.push('g:' + p + ':' + sp.key + 'm:' + (mEl ? (parseInt(mEl.value, 10) || 0) : -1));
      parts.push('g:' + p + ':' + sp.key + 'f:' + (fEl ? (parseInt(fEl.value, 10) || 0) : -1));
    });
  });
  PLAN_SPECIES.forEach(function(sp) {
    var mEl = document.getElementById('gt_u_' + sp.key + 'm');
    var fEl = document.getElementById('gt_u_' + sp.key + 'f');
    parts.push('gu:' + sp.key + 'm:' + (mEl ? (parseInt(mEl.value, 10) || 0) : -1));
    parts.push('gu:' + sp.key + 'f:' + (fEl ? (parseInt(fEl.value, 10) || 0) : -1));
  });
  return parts.join('|');
}

function isTargetsSheetDirty() {
  var ov = document.getElementById('tsheet-ov');
  if (!ov || !ov.classList.contains('open')) return false;
  if (targetsSheetSavedSnapshot == null) return false;
  return captureTargetsSheetSnapshot() !== targetsSheetSavedSnapshot;
}

function setTargetsSheetSnapshot() {
  targetsSheetSavedSnapshot = captureTargetsSheetSnapshot();
}

/**
 * Close targets sheet. Pass `{ force: true }` after a successful save (skip unsaved prompt).
 * @returns {boolean} false if the user cancelled the unsaved-changes confirm; true if closed or was not open.
 */
function closeTargetsSheet(opts) {
  var ov = document.getElementById('tsheet-ov');
  if (!ov || !ov.classList.contains('open')) {
    document.body.style.overflow = '';
    targetsSheetSavedSnapshot = null;
    return true;
  }
  var force = opts && opts.force;
  if (!force && isTargetsSheetDirty()) {
    // UNSAVED-CHANGES GUARD — deliberately still uses native confirm().
    // This is called from several synchronous paths (`go(id)`, overlay-click
    // close, back-button, `closeTargetsSheet()` in chained checks) that
    // expect a sync boolean return. Promoting this to flConfirm() would
    // cascade into making every caller async. Queued for the form-editing
    // state refactor (P3 code-quality #1 / MODULARISATION-PLAN.md) where
    // the whole "dirty form guard" machinery moves to a shared module
    // and every call site gets audited together. Low-exposure path: users
    // only see this if they *actually have* unsaved target changes and
    // try to navigate away — it's a safety net, not a destructive prompt.
    if (!confirm('You have target changes that are not saved yet.\n\nClose anyway and lose them?')) return false;
  }
  ov.classList.remove('open');
  document.body.style.overflow = '';
  targetsSheetSavedSnapshot = null;
  return true;
}

/** Live sums under Season total steppers (♂ / ♀ / all). */
function updateSeasonTotalFooter() {
  var mSum = 0;
  var fSum = 0;
  PLAN_SPECIES.forEach(function(sp) {
    var mel = document.getElementById('tt-' + sp.key + 'm');
    var fel = document.getElementById('tt-' + sp.key + 'f');
    mSum += parseInt(mel && mel.value, 10) || 0;
    fSum += parseInt(fel && fel.value, 10) || 0;
  });
  var elM = document.getElementById('tseason-total-m');
  var elF = document.getElementById('tseason-total-f');
  var elA = document.getElementById('tseason-total-all');
  if (elM) elM.textContent = String(mSum);
  if (elF) elF.textContent = String(fSum);
  if (elA) {
    var n = mSum + fSum;
    elA.textContent = n + (n === 1 ? ' animal' : ' animals');
  }
}

/** Sum all By ground steppers in the DOM (named + Unassigned). */
function readGroundTargetsSumFromDom() {
  var out = {};
  PLAN_SPECIES.forEach(function(sp) {
    out[sp.name + '-m'] = 0;
    out[sp.name + '-f'] = 0;
  });
  (savedGrounds || []).forEach(function(g, i) {
    var p = 'gt_' + i;
    PLAN_SPECIES.forEach(function(sp) {
      var mEl = document.getElementById(p + '_' + sp.key + 'm');
      var fEl = document.getElementById(p + '_' + sp.key + 'f');
      out[sp.name + '-m'] += parseInt(mEl && mEl.value, 10) || 0;
      out[sp.name + '-f'] += parseInt(fEl && fEl.value, 10) || 0;
    });
  });
  PLAN_SPECIES.forEach(function(sp) {
    var mEl = document.getElementById('gt_u_' + sp.key + 'm');
    var fEl = document.getElementById('gt_u_' + sp.key + 'f');
    out[sp.name + '-m'] += parseInt(mEl && mEl.value, 10) || 0;
    out[sp.name + '-f'] += parseInt(fEl && fEl.value, 10) || 0;
  });
  return out;
}

/** With named grounds: keep Season total steppers + footer in sync with By ground inputs (no save yet). */
function syncSeasonSteppersFromGroundDom() {
  if (!groundLedPlanActive()) return;
  if (!document.getElementById('gt_u_' + PLAN_SPECIES[0].key + 'm')) return;
  var sum = readGroundTargetsSumFromDom();
  PLAN_SPECIES.forEach(function(sp) {
    var mEl = document.getElementById('tt-' + sp.key + 'm');
    var fEl = document.getElementById('tt-' + sp.key + 'f');
    if (mEl) mEl.value = sum[sp.name + '-m'] || 0;
    if (fEl) fEl.value = sum[sp.name + '-f'] || 0;
  });
  updateSeasonTotalFooter();
}

function tstep(id, delta) {
  var el = document.getElementById('tt-' + id);
  if (el) el.value = Math.max(0, (parseInt(el.value) || 0) + delta);
  updateSeasonTotalFooter();
  syncUnassignedSteppersFromSeasonFormDom();
}

function copyTargetsFromPrev() {
  PLAN_SPECIES.forEach(function(sp) {
    var mEl = document.getElementById('tt-' + sp.key + 'm');
    var fEl = document.getElementById('tt-' + sp.key + 'f');
    if (mEl) mEl.value = prevSeasonTargets[sp.name + '-m'] || 0;
    if (fEl) fEl.value = prevSeasonTargets[sp.name + '-f'] || 0;
  });
  document.getElementById('copy-targets-wrap').style.display = 'none';
  updateSeasonTotalFooter();
  syncUnassignedSteppersFromSeasonFormDom();
  showToast('📋 Targets copied from previous season');
}

async function saveTargets() {
  if (!sb || !currentUser) { showToast('⚠️ Not signed in'); return; }
  var btn = document.querySelector('.tsheet-save');
  btn.disabled = true; btn.innerHTML = diaryCloudSaveInner('Saving…');

  try {
    if (targetMode === 'ground') {
      await saveGroundTargets();
      showToast('✅ Targets saved');
      flHapticSuccess();
      closeTargetsSheet({ force: true });
      renderPlanGroundFilter();
      renderPlanCard(allEntries, currentSeason);
      btn.disabled = false; btn.innerHTML = diaryCloudSaveInner('Save targets');
      return;
    }

    // Season total mode — save to cull_targets; with named grounds, rebalance __unassigned__ only
    var rows = [];
    PLAN_SPECIES.forEach(function(sp) {
      var mEl = document.getElementById('tt-' + sp.key + 'm');
      var fEl = document.getElementById('tt-' + sp.key + 'f');
      var mVal = parseInt(mEl ? mEl.value : 0) || 0;
      var fVal = parseInt(fEl ? fEl.value : 0) || 0;
      rows.push({ user_id: currentUser.id, season: currentSeason, species: sp.name, sex: 'm', target: mVal });
      rows.push({ user_id: currentUser.id, season: currentSeason, species: sp.name, sex: 'f', target: fVal });
    });

    if (groundLedPlanActive()) {
      await loadGroundTargets(currentSeason);
      var namedAgg = sumNamedGroundsOnlyAgg(groundTargets);
      var uRows = [];
      var shortfall = null;
      PLAN_SPECIES.forEach(function(sp) {
        ['m', 'f'].forEach(function(sx) {
          var k = sp.name + '-' + sx;
          var want = 0;
          rows.forEach(function(row) {
            if (row.species === sp.name && row.sex === sx) want = row.target;
          });
          var onNamed = parseInt(namedAgg[k], 10) || 0;
          var u = want - onNamed;
          if (u < 0) shortfall = shortfall || (sp.name + (sx === 'm' ? ' stag/buck' : ' hind/doe'));
          uRows.push({
            user_id: currentUser.id, season: currentSeason, ground: '__unassigned__',
            species: sp.name, sex: sx, target: Math.max(0, u)
          });
        });
      });
      if (shortfall) {
        showToast('⚠️ That number is smaller than you already put on a ground (' + shortfall + '). Lower the ground first, or use By ground.');
        btn.disabled = false;
        btn.innerHTML = diaryCloudSaveInner('Save targets');
        return;
      }
      var ur = await sb.from('ground_targets').upsert(uRows, { onConflict: 'user_id,season,ground,species,sex' });
      if (ur.error) throw ur.error;
      await loadGroundTargets(currentSeason);
    }

    var r = await sb.from('cull_targets')
      .upsert(rows, { onConflict: 'user_id,season,species,sex' });

    if (r.error) throw r.error;

    cullTargets = {};
    rows.forEach(function(row) { cullTargets[row.species + '-' + row.sex] = row.target; });

    showToast('✅ Targets saved');
    flHapticSuccess();
    closeTargetsSheet({ force: true });
    renderPlanGroundFilter();
    renderPlanCard(allEntries, currentSeason);
  } catch(e) {
    showToast('⚠️ Save failed: ' + (e.message || 'Unknown error'));
    flHapticError();
  }
  btn.disabled = false; btn.innerHTML = diaryCloudSaveInner('Save targets');
}

// ════════════════════════════════════
// SUPABASE CONFIG
// Implementation and credentials live in ./modules/supabase.mjs. This shim
// keeps the old boolean-returning `initSupabase()` API used by the init
// IIFE, and translates the module's richer result object into the existing
// two app-specific UI paths (setup-notice DOM rewrite vs transient toast).
// ════════════════════════════════════
function initSupabase() {
  var result = flSupabaseInit();
  if (result.ok) return true;
  if (result.reason === 'not-configured') {
    // Show setup notice on auth card instead of crashing.
    var note = document.querySelector('.auth-note');
    if (note) {
      note.innerHTML = '<span style="color:#c62828;font-weight:700;">Supabase not configured.</span><br>Open <strong>modules/supabase.mjs</strong> and set<br><code>SUPABASE_URL</code> and <code>SUPABASE_KEY</code><br>(replace the <code>YOUR_SUPABASE_*</code> placeholders).';
    }
    document.getElementById('auth-btn').disabled = true;
    return false;
  }
  showToast('⚠️ Supabase failed to initialise');
  return false;
}

// ════════════════════════════════════
// STATE
// ════════════════════════════════════
var currentUser   = null;
var allEntries    = [];
/** All-season rows for Summary PDF modal only (see openSummaryFilter). */
var summaryEntryPool = null;
var filteredEntries = [];
var currentFilter = 'all';
var currentGroundFilter = 'all';
var currentSearch = '';
var listSortAsc = false;
var currentEntry  = null;
var editingId     = null;
var photoFile     = null;
var photoPreviewUrl = null;
// Path of the photo that was on the entry when edit was opened. Captured so we
// can delete the old storage object after the user replaces or removes a photo,
// preventing orphan photos from accumulating. `null` when adding a new entry or
// when the edited entry had no photo to begin with.
var editingOriginalPhotoPath = null;
var formSpecies   = '';

function revokeBlobPreviewUrl(u) {
  if (u && u.indexOf('blob:') === 0) {
    try { URL.revokeObjectURL(u); } catch (e) {}
  }
}

function fileToDataUrl(file) {
  return new Promise(function(resolve, reject) {
    var r = new FileReader();
    r.onload = function() { resolve(r.result); };
    r.onerror = function() { reject(r.error || new Error('read failed')); };
    r.readAsDataURL(file);
  });
}
var formSex       = '';

function enhanceKeyboardClickables(root) {
  var scope = root || document;
  var nodes = scope.querySelectorAll('[onclick]');
  nodes.forEach(function(el) {
    var tag = (el.tagName || '').toLowerCase();
    var nativeInteractive = /^(button|a|input|select|textarea|summary)$/.test(tag);
    if (nativeInteractive) return;
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    if (el.dataset.kbBound === '1') return;
    el.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      }
    });
    el.dataset.kbBound = '1';
  });
}

function initDiaryFlUi() {
  document.body.addEventListener('click', function(e) {
    var el = e.target.closest('[data-fl-action]');
    if (!el) return;
    var act = el.getAttribute('data-fl-action');
    switch (act) {
      case 'auth-tab': authTab(el.getAttribute('data-tab')); break;
      case 'handle-auth': handleAuth(); break;
      case 'open-forgot-password': openForgotPasswordModal(); break;
      case 'close-forgot-password-modal': closeForgotPasswordModal(); break;
      case 'send-password-reset':
        void sendPasswordResetEmail();
        break;
      case 'submit-password-recovery':
        void submitPasswordRecovery();
        break;
      case 'cancel-password-recovery':
        void cancelPasswordRecovery();
        break;
      case 'filter-entries': filterEntries(el.getAttribute('data-species'), el); break;
      case 'filter-ground': currentGroundFilter = el.value; renderList(); break;
      case 'clear-list-search': clearListSearch(); break;
      case 'toggle-sort':
        listSortAsc = !listSortAsc;
        el.classList.toggle('asc', listSortAsc);
        document.getElementById('sort-label').textContent = listSortAsc ? 'Oldest' : 'Newest';
        renderList();
        break;
      case 'toggle-map-fullscreen': toggleMapFullscreen(); break;
      case 'filter-cull-map': filterCullMap(el.getAttribute('data-species'), el); break;
      case 'go': go(el.getAttribute('data-view')); break;
      case 'sync-offline': syncOfflineQueue(); break;
      case 'open-quick': openQuickEntry(); break;
      case 'open-new': openNewEntry(); break;
      case 'close-quick': closeQuickEntry(); break;
      case 'close-quick-then-new': closeQuickEntry(); openNewEntry(); break;
      case 'qs-pick': qsPick(el, el.getAttribute('data-species')); break;
      case 'qs-sex': qsSex(el.getAttribute('data-sex')); break;
      case 'save-quick': saveQuickEntry(); break;
      case 'form-back': formBack(); break;
      case 'photo-camera': offlinePhotoWarn(function(){ var c = document.getElementById('photo-input-camera'); if (c) c.click(); }); break;
      case 'photo-gallery': offlinePhotoWarn(function(){ var c = document.getElementById('photo-input-gallery'); if (c) c.click(); }); break;
      case 'remove-photo': removePhoto(); break;
      case 'pick-species': pickSpecies(el, el.getAttribute('data-species')); break;
      case 'pick-sex': pickSex(el.getAttribute('data-sex')); break;
      case 'open-pin': openPinDrop(); break;
      case 'get-gps': getGPS(); break;
      case 'clear-pinned': clearPinnedLocation(); break;
      case 'save-entry': saveEntry(); break;
      case 'open-targets': openTargetsSheet(); break;
      case 'set-cull-layer': setCullLayer(el.getAttribute('data-layer')); break;
      case 'set-pin-layer': setPinLayer(el.getAttribute('data-layer')); break;
      case 'open-export': openExportModal(el.getAttribute('data-export-fmt')); break;
      case 'open-syndicate-export': openSyndicateExportModal(el.getAttribute('data-export-fmt')); break;
      case 'do-syndicate-export':
        void doSyndicateExport();
        break;
      case 'close-syndicate-export-modal': closeSyndicateExportModal(); break;
      case 'open-summary-filter':
        void openSummaryFilter();
        break;
      case 'do-export': doExport(el.getAttribute('data-export-scope')); break;
      case 'do-export-summary':
        doExportSummaryFiltered().catch(function(err) {
          if (typeof console !== 'undefined' && console.warn) console.warn('doExportSummaryFiltered', err);
          showToast('⚠️ Summary PDF failed — try again');
        });
        break;
      case 'close-export-modal': closeExportModal(); break;
      case 'close-summary-modal':
        closeSummaryFilterModal();
        break;
      case 'sign-out': signOut(); break;
      case 'cal-preset-pick': pickCalibrePreset(el.getAttribute('data-cal-val')); break;
      case 'open-signout-all': openSignOutAllModal(); break;
      case 'close-signout-all': closeSignOutAllModal(); break;
      case 'confirm-signout-all': confirmSignOutAll(); break;
      case 'fl-generic-confirm-ok': flConfirmResolve(true); break;
      case 'fl-generic-confirm-cancel': flConfirmResolve(false); break;
      case 'confirm-delete-account': confirmDeleteAccount(); break;
      case 'delete-account': deleteAccount(); break;
      case 'close-delete-modal': closeDeleteModal(); break;
      case 'close-pin': closePinDrop(); break;
      case 'confirm-pin': confirmPinDrop(); break;
      case 'apply-manual-pin-coords': applyManualPinCoords(); break;
      case 'close-targets': closeTargetsSheet(); break;
      case 'copy-targets-prev': copyTargetsFromPrev(); break;
      case 'set-target-mode': setTargetMode(el.getAttribute('data-mode')); break;
      case 'show-add-ground': showAddGroundInput(); break;
      case 'hide-add-ground': hideAddGroundInput(); break;
      case 'confirm-add-ground': confirmAddGround(); break;
      case 'save-targets': saveTargets(); break;
      case 'tstep':
        tstep(el.getAttribute('data-step-id'), parseInt(el.getAttribute('data-step-delta'), 10));
        break;
      case 'close-photo-lb': closePhotoLightbox(); break;
      case 'open-detail':
        if (flSelection.active) toggleEntrySelection(el.getAttribute('data-entry-id'));
        else openDetail(el.getAttribute('data-entry-id'));
        break;
      case 'enter-select-mode': enterSelectMode(); break;
      case 'exit-select-mode': exitSelectMode(); break;
      case 'select-all-visible': selectAllVisible(); break;
      case 'export-consignment-dealer': exportConsignmentDealerPdf(); break;
      case 'bulk-csv-selected': bulkCsvSelected(); break;
      case 'bulk-delete-selected': openBulkDeleteModal(); break;
      case 'close-bulk-delete-modal': closeBulkDeleteModal(); break;
      case 'confirm-bulk-delete': confirmBulkDelete(); break;
      case 'close-delete-entry-modal': closeDeleteEntryModal(); break;
      case 'confirm-delete-entry': confirmDeleteEntry(); break;
      case 'open-photo-lb': {
        var pu = el.getAttribute('data-photo-url');
        if (pu) openPhotoLightbox(decodeURIComponent(pu));
        break;
      }
      case 'open-edit-entry': openEditEntry(el.getAttribute('data-entry-id')); break;
      case 'export-single-pdf': exportSinglePDF(el.getAttribute('data-entry-id')); break;
      case 'export-declaration': exportGameDealerDeclaration(el.getAttribute('data-entry-id')); break;
      case 'export-larder-book': exportLarderBookPDF(); break;
      case 'delete-entry': deleteEntry(el.getAttribute('data-entry-id')); break;
      case 'gt-step':
        gtStep(el.getAttribute('data-gt-id'), parseInt(el.getAttribute('data-gt-delta'), 10));
        break;
      case 'toggle-ground': toggleGroundSection(el.getAttribute('data-ground-prefix')); break;
      case 'toggle-unassigned': toggleUnassignedBuffer(); break;
      case 'delete-ground-idx':
        e.stopPropagation();
        deleteGroundByIdx(el);
        break;
      case 'plan-ground-filter':
        setPlanGroundFilter(decodeURIComponent(el.getAttribute('data-plan-key') || ''));
        break;
      case 'open-syndicate-create': openSyndicateCreateSheet(); break;
      case 'close-syndicate-modal': closeSynModal(); break;
      case 'open-syndicate-manage':
        syndicateEditingId = el.getAttribute('data-syndicate-id');
        openSyndicateManageSheet(syndicateEditingId);
        break;
      case 'save-syndicate-create': saveSyndicateCreate(); break;
      case 'save-syndicate-targets': saveSyndicateTargets(); break;
      case 'save-syndicate-alloc': saveSyndicateAlloc(); break;
      case 'synd-generate-invite': syndGenerateInvite(); break;
      case 'synd-copy-invite': syndCopyInvite(el); break;
      case 'synd-copy-existing-invite': syndCopyExistingInvite(el); break;
      case 'synd-revoke-invite':
        syndRevokeInvite(el.getAttribute('data-invite-id'));
        break;
      case 'synd-leave': syndLeaveOrClose(); break;
      case 'synd-delete': syndDelete(); break;
      case 'synd-promote-member':
        syndPromoteMember(el.getAttribute('data-member-user-id'));
        break;
      case 'synd-remove-member':
        syndRemoveMember(el.getAttribute('data-member-user-id'));
        break;
      case 'synd-tstep':
        syndTstep(el.getAttribute('data-step-id'), parseInt(el.getAttribute('data-step-delta'), 10));
        break;
      case 'pinmap-select':
        pinmapSelectResult(
          parseFloat(el.getAttribute('data-lat')),
          parseFloat(el.getAttribute('data-lng')),
          decodeURIComponent(el.getAttribute('data-place-name') || '')
        );
        break;
      default: return;
    }
    e.preventDefault();
  });

  document.body.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var el = e.target.closest('[data-fl-action]');
    if (!el) return;
    if (el.matches('button,a,input,textarea,select')) return;
    e.preventDefault();
    el.click();
  });

  var qso = document.getElementById('qs-overlay');
  if (qso) qso.addEventListener('click', function(ev) { if (ev.target === qso) closeQuickEntry(); });
  var tso = document.getElementById('tsheet-ov');
  if (tso) tso.addEventListener('click', function(ev) { if (ev.target === tso) closeTargetsSheet(); });
  var syno = document.getElementById('syn-ov');
  if (syno) syno.addEventListener('click', function(ev) { if (ev.target === syno) closeSynModal(); });
  var synExp = document.getElementById('syndicate-export-modal');
  if (synExp) synExp.addEventListener('click', function(ev) { if (ev.target === synExp) closeSyndicateExportModal(); });
  var forgotMo = document.getElementById('forgot-password-modal');
  if (forgotMo) forgotMo.addEventListener('click', function(ev) { if (ev.target === forgotMo) closeForgotPasswordModal(); });
  var plb = document.getElementById('photo-lightbox');
  if (plb) plb.addEventListener('click', function(ev) { if (ev.target === plb) closePhotoLightbox(); });
  var delEntMo = document.getElementById('delete-entry-modal');
  if (delEntMo) delEntMo.addEventListener('click', function(ev) { if (ev.target === delEntMo) closeDeleteEntryModal(); });

  var seasonSel = document.getElementById('season-select');
  if (seasonSel) seasonSel.addEventListener('change', changeSeason);
  var seasonStats = document.getElementById('season-select-stats');
  if (seasonStats && seasonSel) {
    seasonStats.addEventListener('change', function() {
      seasonSel.value = seasonStats.value;
      changeSeason();
    });
  }

  var gfSel = document.getElementById('ground-filter');
  if (gfSel) gfSel.addEventListener('change', function() { currentGroundFilter = gfSel.value; renderList(); });

  var searchInp = document.getElementById('list-search-input');
  if (searchInp) searchInp.addEventListener('input', onListSearchInput);

  var fg = document.getElementById('f-ground');
  if (fg) fg.addEventListener('change', function() { handleGroundSelect(fg); });
  var fgc = document.getElementById('f-ground-custom');
  if (fgc) {
    fgc.addEventListener('change', function() { maybeAutoSelectSyndicateFromGround(fgc.value); });
    fgc.addEventListener('blur', function() { maybeAutoSelectSyndicateFromGround(fgc.value); });
  }
  var fs = document.getElementById('f-syndicate');
  if (fs) fs.addEventListener('change', clearSyndicateAutoNote);
  var fc = document.getElementById('f-calibre-sel');
  if (fc) fc.addEventListener('change', function() { handleCalibreSelect(fc); });
  var fp = document.getElementById('f-placement');
  if (fp) fp.addEventListener('change', function() { handlePlacementSelect(fp); });

  var pic = document.getElementById('photo-input-camera');
  var pig = document.getElementById('photo-input-gallery');
  if (pic) pic.addEventListener('change', function(ev) { handlePhoto(ev.target); });
  if (pig) pig.addEventListener('change', function(ev) { handlePhoto(ev.target); });

  var psearch = document.getElementById('pinmap-search');
  if (psearch) {
    psearch.addEventListener('input', function() { pinmapSearchDebounce(psearch.value); });
    psearch.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') pinmapSearchNow(psearch.value);
    });
  }

  var gadd = document.getElementById('ground-add-inp');
  if (gadd) {
    gadd.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') confirmAddGround();
      if (ev.key === 'Escape') hideAddGroundInput();
    });
  }

  var delInp = document.getElementById('delete-confirm-input');
  if (delInp) delInp.addEventListener('input', checkDeleteInput);
  var formScroll = document.querySelector('#v-form .form-scroll');
  if (formScroll) formScroll.addEventListener('scroll', requestFormProgressUpdate, { passive:true });

  var fshoot = document.getElementById('f-shooter');
  if (fshoot) {
    fshoot.addEventListener('input', function() {
      fshoot.classList.toggle('shooter-self', fshoot.value === '' || fshoot.value === 'Self');
    });
  }

  document.body.addEventListener('change', function(ev) {
    if (ev.target.classList && ev.target.classList.contains('tstep-val')) {
      updateGroundRollup();
      if (ev.target.id && ev.target.id.indexOf('tt-') === 0) {
        updateSeasonTotalFooter();
        syncUnassignedSteppersFromSeasonFormDom();
      }
      if (ev.target.id && (ev.target.id.indexOf('gt_') === 0 || ev.target.id.indexOf('gt_u_') === 0)) {
        syncSeasonSteppersFromGroundDom();
      }
    }
  });

  var tsOv = document.getElementById('tsheet-ov');
  if (tsOv) {
    tsOv.addEventListener('input', function(ev) {
      if (!ev.target.classList || !ev.target.classList.contains('tstep-val') || !ev.target.id) return;
      if (ev.target.id.indexOf('tt-') === 0) {
        updateSeasonTotalFooter();
        syncUnassignedSteppersFromSeasonFormDom();
      }
      if (ev.target.id.indexOf('gt_') === 0 || ev.target.id.indexOf('gt_u_') === 0) {
        updateGroundRollup();
        syncSeasonSteppersFromGroundDom();
      }
    });
  }

  document.addEventListener('keydown', function(ev) {
    if (ev.key !== 'Escape') return;
    var tsEsc = document.getElementById('tsheet-ov');
    if (!tsEsc || !tsEsc.classList.contains('open')) return;
    var gaddEsc = document.getElementById('ground-add-inp');
    if (gaddEsc && document.activeElement === gaddEsc) return;
    ev.preventDefault();
    closeTargetsSheet();
  });
}

// ════════════════════════════════════
// SEASON HELPERS — fully dynamic
// ════════════════════════════════════
function getCurrentSeason() {
  var now = diaryNow();
  var y = now.getFullYear();
  var m = now.getMonth() + 1; // 1-12
  // Season runs Aug-Jul, so Aug 2025 → Jul 2026 = "2025-26"
  var startYear = m >= 8 ? y : y - 1;
  return startYear + '-' + String(startYear + 1).slice(-2);
}

// SPEC: lib/fl-pure.mjs#seasonLabel — keep in sync until modularisation (P3 code-quality #1).
function seasonLabel(s) {
  var parts = s.split('-');
  var y1 = parts[0];
  var y2 = parts[1].length === 2 ? '20' + parts[1] : parts[1];
  return y1 + '–' + y2 + ' Season';
}

// SPEC: lib/fl-pure.mjs#buildSeasonFromEntry — keep in sync.
function buildSeasonFromEntry(dateStr) {
  // Given an entry date, return which season it belongs to
  if (dateStr == null || dateStr === '') return getCurrentSeason();
  var raw = String(dateStr).trim();
  if (!raw) return getCurrentSeason();
  // Parse manually to avoid UTC midnight timezone shift (YYYY-MM-DD parsed by new Date() = UTC)
  var parts = raw.split('-');
  if (parts.length < 2) return getCurrentSeason();
  var y = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10); // 1–12 exact, no timezone offset
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return getCurrentSeason();
  var startYear = m >= 8 ? y : y - 1;
  if (!Number.isFinite(startYear)) return getCurrentSeason();
  return startYear + '-' + String(startYear + 1).slice(-2);
}

function populateSeasonDropdown(seasons) {
  var sel = document.getElementById('season-select');
  if (!sel) return;
  sel.innerHTML = '';
  if (seasons.length > 1) {
    var allOpt = document.createElement('option');
    allOpt.value = '__all__';
    allOpt.textContent = 'All seasons';
    sel.appendChild(allOpt);
  }
  seasons.forEach(function(s) {
    var opt = document.createElement('option');
    opt.value = s;
    opt.textContent = seasonLabel(s);
    sel.appendChild(opt);
  });
  sel.value = currentSeason;
  var statsSel = document.getElementById('season-select-stats');
  if (statsSel) { statsSel.innerHTML = sel.innerHTML; statsSel.value = currentSeason; }
}

// SPEC: lib/fl-pure.mjs#buildSeasonList — pure version takes `current` as an
// arg so it is testable in Node; this wrapper resolves `current` via
// getCurrentSeason() so existing diary.js call sites stay single-arg.
function buildSeasonList(earliestSeason) {
  // Build list from earliest season with entries up to current season
  var current = getCurrentSeason();
  var seasons = [];
  var startYear = parseInt(current.split('-')[0]);
  var endYear = earliestSeason ? parseInt(earliestSeason.split('-')[0]) : startYear;
  // Go from current back to earliest (or max 10 years)
  for (var y = startYear; y >= Math.max(endYear, startYear - 9); y--) {
    seasons.push(y + '-' + String(y + 1).slice(-2));
  }
  return seasons;
}

var currentSeason = getCurrentSeason();

// ── Season list cache ───────────────────────────────────────────────
// `loadEntries()` used to run an extra SELECT returning every entry date just
// to find the earliest one so it could populate the season dropdown. With a
// few hundred rows that's negligible; with a decade-long diary it's wasted
// bandwidth on every save/delete/sync/tab-switch. We cache the earliest
// entry date in-memory (tagged with the user id to survive account-switch)
// and probe only when the cache is stale.
//
// Cache format: ISO `YYYY-MM-DD`. `null` means "not yet probed".
// `cachedEarliestEntryDateForUserId` holds the user id the cache was built
// for — any mismatch invalidates.
var cachedEarliestEntryDate = null;
var cachedEarliestEntryDateForUserId = null;

function invalidateSeasonCache() {
  cachedEarliestEntryDate = null;
  cachedEarliestEntryDateForUserId = null;
}

/**
 * Extend the cache backwards if the given entry date is earlier than what we
 * already know about. Called on successful inserts (online or offline-sync)
 * so the dropdown can grow without a re-probe. Idempotent; safe to call with
 * any date string including `null`/`undefined`.
 */
function extendSeasonCacheForDate(dateStr) {
  if (!dateStr || !currentUser) return;
  // Tag against the current user; a cache built for another user is stale.
  if (cachedEarliestEntryDateForUserId !== currentUser.id) return;
  if (!cachedEarliestEntryDate || String(dateStr) < cachedEarliestEntryDate) {
    cachedEarliestEntryDate = String(dateStr);
  }
}

/**
 * Probe the database for this user's earliest entry date. Uses LIMIT 1 so
 * a decade-long diary costs one row, not N. Returns `null` when the user
 * has no entries.
 */
async function probeEarliestEntryDate() {
  if (!sb || !currentUser) return null;
  var r = await sb.from('cull_entries')
    .select('date')
    .eq('user_id', currentUser.id)
    .order('date', { ascending: true })
    .limit(1);
  if (r.error || !r.data || !r.data.length) return null;
  return r.data[0].date || null;
}

// ════════════════════════════════════
// ROUTING
// ════════════════════════════════════
var VIEWS = ['v-auth','v-list','v-form','v-detail','v-stats'];
var NAV_MAP = {'v-list':'n-list','v-form':'n-form','v-stats':'n-stats'};
var formDirty = false;
/** After loadEntries / sign-out; cleared at end of buildStats — avoids full stats rebuild on every Stats tab visit. */
var statsNeedsFullRebuild = true;
/** Snapshot of allEntries.length the last time buildStats ran a full rebuild. Used to detect a stale fast-path (e.g. buildStats ran once before loadEntries resolved). */
var statsLastBuildSize = -1;
var UNSAVED_FORM_MSG = 'You have unsaved changes. Leave without saving?';

function hasUnsavedFormChanges() {
  var formView = document.getElementById('v-form');
  return !!(formDirty && formView && formView.classList.contains('active'));
}

function confirmDiscardUnsavedForm() {
  if (!hasUnsavedFormChanges()) return true;
  // UNSAVED-CHANGES GUARD — deliberately native. See closeTargetsSheet()
  // above for the rationale: this is invoked from `go(id)` and form-close
  // handlers that require a sync boolean. Queued for the form-editing
  // state refactor (P3 code-quality #1 / MODULARISATION-PLAN.md).
  if (!confirm(UNSAVED_FORM_MSG)) return false;
  formDirty = false;
  return true;
}

function go(id) {
  var target = document.getElementById(id);
  if (!target) return;
  var tsOvGo = document.getElementById('tsheet-ov');
  if (tsOvGo && tsOvGo.classList.contains('open') && !closeTargetsSheet()) return;
  // Warn if leaving form with unsaved changes
  if (id !== 'v-form' && !confirmDiscardUnsavedForm()) return;
  // Exit diary-list select mode whenever we leave the list — prevents the
  // floating select bar from hanging around on stats / detail / form views.
  if (id !== 'v-list' && flSelection.active) exitSelectMode();
  VIEWS.forEach(function(v){
    var el = document.getElementById(v);
    if (el) el.classList.remove('active');
  });
  target.classList.add('active');
  var nav = document.getElementById('main-nav');
  if (!nav) return;
  nav.style.display = (id === 'v-auth') ? 'none' : 'flex';
  Object.keys(NAV_MAP).forEach(function(k){
    var nb = document.getElementById(NAV_MAP[k]);
    if (nb) nb.classList.remove('on');
  });
  if (NAV_MAP[id]) {
    var activeNav = document.getElementById(NAV_MAP[id]);
    if (activeNav) activeNav.classList.add('on');
  }
  window.scrollTo(0,0);
  if (id === 'v-form') {
    var fs = target.querySelector('.form-scroll');
    if (fs) fs.scrollTop = 0;
    requestFormProgressUpdate();
  }
  if (id === 'v-stats') {
    var statsSelGo = document.getElementById('season-select-stats');
    var listSelGo = document.getElementById('season-select');
    if (statsSelGo && listSelGo) {
      statsSelGo.innerHTML = listSelGo.innerHTML;
      statsSelGo.value = currentSeason;
    }
    // Always refresh syndicate strip (lightweight) so we never leave the static “sign in” placeholder
    if (sb && typeof renderSyndicateSection === 'function') {
      void renderSyndicateSection().then(function() {
        void updateSyndicateExportVisibility();
      });
    }
    // Only take the fast-path if the rendered KPIs still match current allEntries.
    // Otherwise we risk showing stale "0 total" after a buildStats ran pre-loadEntries.
    if (!statsNeedsFullRebuild && cullMap && statsLastBuildSize === allEntries.length) {
      setTimeout(function() {
        if (cullMap) {
          cullMap.invalidateSize();
          renderCullMapPins();
        }
        var sub = document.getElementById('cullmap-sub');
        if (sub) sub.textContent = 'Location history · ' + currentSeason;
      }, 150);
      return;
    }
    buildStats();
  }
}

function formBack() {
  if (!confirmDiscardUnsavedForm()) return;
  go('v-list');
}

var formProgressRaf = false;
function requestFormProgressUpdate() {
  if (formProgressRaf) return;
  formProgressRaf = true;
  requestAnimationFrame(function() {
    formProgressRaf = false;
    updateFormProgressChip();
  });
}

function updateFormProgressChip() {
  var chip = document.getElementById('form-progress-chip');
  var sc = document.querySelector('#v-form .form-scroll');
  if (!chip || !sc) return;
  var sections = Array.from(document.querySelectorAll('#v-form .fsec'));
  if (!sections.length) return;
  var active = 0;
  var scRect = sc.getBoundingClientRect();
  var marker = scRect.top + 30;
  for (var i = 0; i < sections.length; i++) {
    var secTop = sections[i].getBoundingClientRect().top;
    if (secTop <= marker) active = i;
  }
  sections.forEach(function(sec, idx) { sec.classList.toggle('is-current', idx === active); });
  var t = sections[active].querySelector('.fsec-title');
  var title = t ? t.textContent.trim() : '';
  chip.textContent = 'Section ' + (active + 1) + ' of ' + sections.length + (title ? ' · ' + title : '');
}

// Mark form dirty on any input change
flOnReady(function() {
  var form = document.getElementById('v-form');
  if (form) {
    form.addEventListener('input', function() { formDirty = true; });
    form.addEventListener('change', function() { formDirty = true; });
  }
  renderAbnormalityGrid();
});

window.addEventListener('beforeunload', function(e) {
  if (!hasUnsavedFormChanges()) return;
  e.preventDefault();
  e.returnValue = '';
});

document.addEventListener('click', function(e) {
  var link = e.target.closest('a[href]');
  if (!link) return;
  var href = link.getAttribute('href') || '';
  if (!href || href.charAt(0) === '#' || href.indexOf('javascript:') === 0) return;
  if (!confirmDiscardUnsavedForm()) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);

function showToast(msg, duration) {
  var t = document.getElementById('toast');
  if (!t) return;
  var p = flToastParse(msg);
  var iconSvg = p.kind === 'warn' ? SVG_FL_TOAST_WARN : (p.kind === 'ok' ? SVG_FL_TOAST_OK : SVG_FL_TOAST_INFO);
  t.className = 'toast toast--' + p.kind;
  t.innerHTML = '<span class="toast-inner"><span class="toast-ic" aria-hidden="true">' + iconSvg + '</span><span class="toast-txt"></span></span>';
  var tx = t.querySelector('.toast-txt');
  if (tx) tx.textContent = p.text;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, duration || 2500);
}

function flReducedMotion() {
  try {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { return false; }
}

/** One short pulse on devices that support Vibration API (typically Android Chrome). */
function flHapticSuccess() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(12);
    }
  } catch (e) { /* ignore */ }
}

/**
 * Error / warning haptic. A three-pulse pattern (long–gap–long) that's
 * distinguishable from the single success buzz — you can tell by feel
 * alone whether your save went through. Gracefully no-ops on iOS Safari
 * (no Vibration API) and when `prefers-reduced-motion` is set, since some
 * users extend that to "no vibration surprises" too.
 */
function flHapticError() {
  try {
    if (flReducedMotion && flReducedMotion()) return;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([40, 60, 40]);
    }
  } catch (e) { /* ignore */ }
}

function getListSkeletonHtml() {
  var rows = '';
  for (var i = 0; i < 6; i++) {
    rows += '<div class="skel-list-row"><div class="skel skel-thumb"></div><div class="skel-list-text">'
      + '<div class="skel skel-line skel-w40"></div><div class="skel skel-line skel-w70"></div><div class="skel skel-line skel-w30"></div></div></div>';
  }
  var cls = 'list-skeleton' + (flReducedMotion() ? '' : ' skel-shimmer');
  return '<div class="' + cls + '" aria-busy="true" aria-label="Loading entries">' + rows + '</div>';
}

function showEntriesListSkeleton() {
  var c = document.getElementById('entries-container');
  if (c) c.innerHTML = getListSkeletonHtml();
}

function getStatsSkeletonInnerHtml() {
  var cells = '';
  for (var i = 0; i < 4; i++) {
    cells += '<div class="stats-skel-cell"><div class="skel skel-stat-h"></div><div class="skel skel-stat-n"></div><div class="skel skel-stat-s"></div></div>';
  }
  return '<div class="stats-skel-statgrid">' + cells + '</div>'
    + '<div class="skel skel-map-block" aria-hidden="true"></div>'
    + '<div class="stats-skel-band"><div class="skel skel-band-t" aria-hidden="true"></div><div class="skel skel-band-r" aria-hidden="true"></div></div>'
    + '<div class="stats-skel-band"><div class="skel skel-band-t w40" aria-hidden="true"></div><div class="skel skel-chart" aria-hidden="true"></div></div>';
}

function ensureStatsLoadingOverlay() {
  var scroll = document.querySelector('#v-stats .stats-scroll');
  if (!scroll) return null;
  var el = document.getElementById('stats-loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'stats-loading-overlay';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', 'Loading statistics');
    scroll.insertBefore(el, scroll.firstChild);
  }
  el.innerHTML = getStatsSkeletonInnerHtml();
  el.className = 'stats-loading-overlay' + (flReducedMotion() ? '' : ' skel-shimmer');
  return el;
}

function showStatsLoadingOverlay() {
  var el = ensureStatsLoadingOverlay();
  if (el) {
    el.classList.add('is-on');
    el.hidden = false;
  }
}

function hideStatsLoadingOverlay() {
  var el = document.getElementById('stats-loading-overlay');
  if (el) {
    el.classList.remove('is-on');
    el.hidden = true;
  }
}

// ════════════════════════════════════
// AUTH
// ════════════════════════════════════
var authMode = 'signin';
/** True while user must set a new password (email reset link). Blocks normal sign-in redirect. */
var authRecoveryMode = false;

function isPasswordRecoveryUrl() {
  try {
    var h = window.location.hash;
    if (h && h.length > 2 && /type=recovery/i.test(decodeURIComponent(h))) return true;
  } catch (e) { /* ignore */ }
  return false;
}

function diaryShowPasswordRecovery() {
  if (authRecoveryMode) return;
  authRecoveryMode = true;
  currentUser = null;
  var std = document.getElementById('auth-standard-panel');
  var rec = document.getElementById('auth-recovery-panel');
  if (std) std.style.display = 'none';
  if (rec) rec.style.display = 'block';
  var p1 = document.getElementById('auth-recovery-pass');
  var p2 = document.getElementById('auth-recovery-pass2');
  if (p1) p1.value = '';
  if (p2) p2.value = '';
  var re = document.getElementById('auth-recovery-err');
  if (re) { re.style.display = 'none'; re.textContent = ''; }
  go('v-auth');
}

function diaryHidePasswordRecoveryUI() {
  authRecoveryMode = false;
  var std = document.getElementById('auth-standard-panel');
  var rec = document.getElementById('auth-recovery-panel');
  if (std) std.style.display = 'block';
  if (rec) rec.style.display = 'none';
}

function openForgotPasswordModal() {
  if (!sb) {
    showToast('⚠️ Supabase not configured');
    return;
  }
  var em = document.getElementById('auth-email');
  var fe = document.getElementById('forgot-password-email');
  if (fe && em) fe.value = em.value.trim();
  var err = document.getElementById('forgot-password-err');
  if (err) err.style.display = 'none';
  var m = document.getElementById('forgot-password-modal');
  if (m) m.style.display = 'flex';
}

function closeForgotPasswordModal() {
  var m = document.getElementById('forgot-password-modal');
  if (m) m.style.display = 'none';
}

async function sendPasswordResetEmail() {
  if (!sb) {
    showToast('⚠️ Supabase not configured');
    return;
  }
  var fe = document.getElementById('forgot-password-email');
  var err = document.getElementById('forgot-password-err');
  var email = fe && fe.value ? fe.value.trim() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (err) {
      err.textContent = 'Please enter a valid email address.';
      err.style.display = 'block';
    }
    return;
  }
  if (err) err.style.display = 'none';
  try {
    var redirectTo = window.location.origin + window.location.pathname;
    var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectTo });
    if (r.error) throw r.error;
    showToast('✅ Check your email for a reset link', 5000);
    closeForgotPasswordModal();
  } catch (e) {
    if (err) {
      err.textContent = e.message || 'Could not send reset email.';
      err.style.display = 'block';
    }
  }
}

async function submitPasswordRecovery() {
  if (!sb) return;
  var p1 = document.getElementById('auth-recovery-pass');
  var p2 = document.getElementById('auth-recovery-pass2');
  var errEl = document.getElementById('auth-recovery-err');
  var btn = document.getElementById('auth-recovery-btn');
  var a = p1 ? p1.value : '';
  var b = p2 ? p2.value : '';
  if (errEl) errEl.style.display = 'none';
  if (!a || a.length < 8) {
    if (errEl) {
      errEl.textContent = 'Password must be at least 8 characters.';
      errEl.style.display = 'block';
    }
    return;
  }
  if (a !== b) {
    if (errEl) {
      errEl.textContent = 'Passwords do not match.';
      errEl.style.display = 'block';
    }
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Updating…';
  }
  try {
    var result = await sb.auth.updateUser({ password: a });
    if (result.error) throw result.error;
    authRecoveryMode = false;
    diaryHidePasswordRecoveryUI();
    if (window.location.hash) history.replaceState(null, '', window.location.pathname);
    showToast('✅ Password updated');
    var sess = await sb.auth.getSession();
    if (sess.data && sess.data.session && sess.data.session.user) {
      currentUser = sess.data.session.user;
      onSignedIn();
    }
  } catch (e) {
    if (errEl) {
      errEl.textContent = e.message || 'Could not update password.';
      errEl.style.display = 'block';
    }
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Update password →';
  }
}

async function cancelPasswordRecovery() {
  if (sb) await sb.auth.signOut();
  authRecoveryMode = false;
  diaryHidePasswordRecoveryUI();
  if (window.location.hash) history.replaceState(null, '', window.location.pathname);
}

function authTab(mode) {
  authMode = mode;
  document.getElementById('tab-signin').classList.toggle('on', mode === 'signin');
  document.getElementById('tab-signup').classList.toggle('on', mode === 'signup');
  document.getElementById('auth-btn').textContent = mode === 'signin' ? 'Sign In →' : 'Create Account →';
  document.getElementById('auth-name-field').style.display = mode === 'signup' ? 'block' : 'none';
  document.getElementById('auth-consent-field').style.display = mode === 'signup' ? 'block' : 'none';
  document.getElementById('auth-err').style.display = 'none';
  document.getElementById('auth-password').setAttribute('autocomplete', mode === 'signin' ? 'current-password' : 'new-password');
  var fr = document.getElementById('auth-forgot-row');
  if (fr) fr.style.display = mode === 'signin' ? 'block' : 'none';
}

async function handleAuth() {
  if (!sb) { showToast('⚠️ Supabase not configured'); return; }
  var email = document.getElementById('auth-email').value.trim();
  var password = document.getElementById('auth-password').value;
  var errEl = document.getElementById('auth-err');
  var btn = document.getElementById('auth-btn');
  errEl.style.display = 'none';
  if (!email || !password) { errEl.textContent = 'Please enter email and password.'; errEl.style.display = 'block'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = 'Please enter a valid email address.'; errEl.style.display = 'block'; return; }
  if (password.length < 8) { errEl.textContent = 'Password must be at least 8 characters.'; errEl.style.display = 'block'; return; }
  if (authMode === 'signup' && !document.getElementById('auth-consent').checked) {
    errEl.textContent = 'Please agree to the Privacy Policy to create an account.'; errEl.style.display = 'block'; return;
  }
  btn.disabled = true;
  btn.textContent = authMode === 'signin' ? 'Signing in…' : 'Creating account…';
  try {
    var result;
    if (authMode === 'signin') {
      result = await sb.auth.signInWithPassword({ email: email, password: password });
    } else {
      var name = document.getElementById('auth-name').value.trim();
      result = await sb.auth.signUp({ email: email, password: password, options: { data: { full_name: name } } });
    }
    if (result.error) throw result.error;
    if (authMode === 'signup') {
      // Supabase only returns a `session` from signUp() when email-confirmation
      // is disabled on the project. When that's the case, asking the user to
      // "check their email" is misleading — they're already authenticated and
      // the app should just drop them into their diary. When it IS returned,
      // we auto-sign-in; otherwise we fall back to the original email-confirm
      // message + tab flip.
      if (result.data && result.data.session && result.data.user) {
        currentUser = result.data.user;
        onSignedIn();
      } else {
        showToast('✅ Check your email to confirm your account', 4000);
        authTab('signin');
      }
    } else {
      currentUser = result.data.user;
      onSignedIn();
    }
  } catch(e) {
    errEl.textContent = e.message || 'Authentication failed.';
    errEl.style.display = 'block';
    flHapticError();
  }
  btn.disabled = false;
  btn.textContent = authMode === 'signin' ? 'Sign In →' : 'Create Account →';
}

function destroyCullMapLeaflet() {
  statsNeedsFullRebuild = true;
  if (!cullMap) return;
  try {
    cullMap.remove();
  } catch (e) {}
  cullMarkers = [];
  cullMap = null;
  cullMapLayer = null;
  cullSatLayer = null;
}

/**
 * Sign the user out of this device (default) or *every* device the account
 * is signed in to (`{ scope: 'global' }`). Global sign-out calls Supabase's
 * token-revocation endpoint which invalidates every refresh token on the
 * user record — the only way to recover from a lost / stolen device. After
 * the auth call we tear down the same local state we'd clear on a regular
 * sign-out (offline queue + IndexedDB + in-memory caches).
 */
async function signOut(opts) {
  var scope = opts && opts.scope === 'global' ? 'global' : 'local';
  if (sb) {
    try { await sb.auth.signOut({ scope: scope }); }
    // Fall back to default signOut() for older supabase-js versions that
    // don't accept the `scope` option — still signs out locally which is
    // the minimum safe behaviour.
    catch (_) { try { await sb.auth.signOut(); } catch (__) {} }
  }
  try {
    localStorage.removeItem(OFFLINE_KEY);
    localStorage.removeItem(OFFLINE_SYNCED_RECENT_KEY);
  } catch (_) {}
  try {
    var db = await openOfflineDb();
    if (db) {
      await new Promise(function(resolve) {
        var tx = db.transaction(OFFLINE_DB_STORE, 'readwrite');
        tx.objectStore(OFFLINE_DB_STORE).clear();
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { resolve(false); };
      });
    }
  } catch (_) {}
  // Reset all session state so a new user starts clean
  currentUser = null;
  allEntries = [];
  filteredEntries = [];
  currentSeason = getCurrentSeason();
  currentFilter = 'all';
  invalidateSeasonCache();
  cullTargets = {};
  groundTargets = {};
  savedGrounds = [];
  syndicateGroundFilterSet = new Set();
  planGroundFilter = 'overview';
  targetMode = 'season';
  destroyCullMapLeaflet();
  hideStatsLoadingOverlay();
  go('v-auth');
}

function openSignOutAllModal() {
  var modal = document.getElementById('signout-all-modal');
  if (modal) modal.style.display = 'flex';
}

function closeSignOutAllModal() {
  var modal = document.getElementById('signout-all-modal');
  if (modal) modal.style.display = 'none';
}

/**
 * Execute the global sign-out. This calls Supabase with `scope: 'global'`
 * which invalidates every refresh token on the user record — other devices
 * will be signed out the next time their access token expires (≤1 hour).
 * Current device tears down immediately via the shared `signOut()` path.
 */
async function confirmSignOutAll() {
  var btn = document.getElementById('signout-all-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Signing out…'; }
  try {
    closeSignOutAllModal();
    await signOut({ scope: 'global' });
    showToast('✅ Signed out of all devices', 4000);
  } catch (e) {
    if (typeof console !== 'undefined' && console.warn) console.warn('signout-all:', e);
    showToast('⚠️ Could not complete — try again');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Sign out everywhere'; }
  }
}

// ── Themed confirm modal (replaces native window.confirm for 7 sites) ────────
// Hooked by #fl-generic-confirm-modal in diary.html. One shared instance so
// nested confirms are impossible (previous call auto-resolves false if a
// second flConfirm fires while the first modal is still open; this mirrors
// how browsers treat overlapping window.confirm calls).
//
// Three tones:
//   'danger' — red trash icon (matches the single-entry / bulk-delete modals).
//              Use only for permanent data loss (syndicate delete, ground remove).
//   'warn'   — amber halo + amber CTA (matches the larder-book tone). Use for
//              reversible admin actions: revoke invite, promote, leave, kick.
//   'info'   — moss-green halo (matches sign-out-all). Use for safety prompts
//              where the action itself is protective, not destructive.
//
// Icons are inlined to avoid a second SVG round-trip. Resolver pattern so the
// returned Promise can be awaited by any async caller:
//   if (!(await flConfirm({ title: '…', body: '…', action: '…', tone: 'danger' }))) return;
var FL_CONFIRM_ICON_SVG = {
  danger: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="#c62828" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v6M14 11v6" stroke="#c62828" stroke-width="2" stroke-linecap="round"/>',
  warn:   '<path d="M12 3l10 18H2L12 3z" stroke="#c8892b" stroke-width="2" fill="none" stroke-linejoin="round"/><path d="M12 10v5" stroke="#c8892b" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="18" r="1" fill="#c8892b"/>',
  info:   '<circle cx="12" cy="12" r="9" stroke="#5a7a30" stroke-width="2" fill="none"/><path d="M12 11v5" stroke="#5a7a30" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="8" r="1" fill="#5a7a30"/>'
};
var flConfirmCurrentResolver = null;
function flConfirmResolve(ok) {
  var modal = document.getElementById('fl-generic-confirm-modal');
  if (modal) modal.style.display = 'none';
  var r = flConfirmCurrentResolver;
  flConfirmCurrentResolver = null;
  if (typeof r === 'function') r(!!ok);
}
function flConfirm(opts) {
  opts = opts || {};
  var title  = opts.title  || 'Are you sure?';
  var body   = opts.body   || '';
  var action = opts.action || 'Confirm';
  var tone   = (opts.tone === 'info' || opts.tone === 'warn') ? opts.tone : 'danger';

  var modal   = document.getElementById('fl-generic-confirm-modal');
  var titleEl = document.getElementById('fl-generic-confirm-title');
  var bodyEl  = document.getElementById('fl-generic-confirm-body');
  var okBtn   = document.getElementById('fl-generic-confirm-ok');
  var iconWrap= document.getElementById('fl-generic-confirm-icon-wrap');
  var iconEl  = document.getElementById('fl-generic-confirm-icon');
  if (!modal || !titleEl || !bodyEl || !okBtn || !iconWrap || !iconEl) {
    // DOM isn't ready — fall back to native confirm so the call site still
    // returns a sensible boolean instead of silently resolving false.
    return Promise.resolve(window.confirm(title + (body ? '\n\n' + body : '')));
  }

  // If a prior modal is still open, auto-cancel it so the new one can take over.
  if (typeof flConfirmCurrentResolver === 'function') {
    var prior = flConfirmCurrentResolver;
    flConfirmCurrentResolver = null;
    try { prior(false); } catch (_) {}
  }

  titleEl.textContent = title;
  bodyEl.textContent  = body;
  okBtn.textContent   = action;

  iconWrap.classList.remove('di-delete-icon-wrap--info');
  iconWrap.classList.remove('di-delete-icon-wrap--warn');
  if (tone === 'info') iconWrap.classList.add('di-delete-icon-wrap--info');
  else if (tone === 'warn') iconWrap.classList.add('di-delete-icon-wrap--warn');

  okBtn.classList.remove('di-btn-warn');
  if (tone === 'warn') okBtn.classList.add('di-btn-warn');
  // 'danger' uses the default .di-btn-full red (same as delete-entry modal).
  // 'info' uses .di-btn-pri-solid when explicitly requested but for the
  // generic helper we keep the default green-tinted CTA look.

  iconEl.innerHTML = FL_CONFIRM_ICON_SVG[tone] || FL_CONFIRM_ICON_SVG.danger;

  modal.style.display = 'flex';
  // Move focus to the cancel button so Enter doesn't accidentally confirm.
  var cancelBtn = modal.querySelector('[data-fl-action="fl-generic-confirm-cancel"]');
  if (cancelBtn) { try { cancelBtn.focus(); } catch (_) {} }

  return new Promise(function(resolve) {
    flConfirmCurrentResolver = resolve;
  });
}

function onSignedIn() {
  reconcileOfflineQueueForCurrentUser();
  updateOfflineBadge();
  var meta = currentUser.user_metadata || {};
  var name = meta.full_name || currentUser.email.split('@')[0];
  var initials = name.split(' ').map(function(w){ return w[0]; }).join('').toUpperCase().slice(0,2);
  var av = document.getElementById('account-av');
  var nm = document.getElementById('account-name');
  var em = document.getElementById('account-email');
  if (av) av.textContent = initials;
  if (nm) nm.textContent = name;
  if (em) em.textContent = currentUser.email + ' · Synced';
  // Set current season label dynamically
  currentSeason = getCurrentSeason();
  var sl = document.getElementById('season-label');
  var ssl = document.getElementById('stats-season-lbl');
  if (sl) sl.textContent = seasonLabel(currentSeason);
  if (ssl) ssl.textContent = seasonLabel(currentSeason);
  go('v-list');
  loadGrounds();
  loadEntries();
  (async function() {
    await tryRedeemSyndicateInviteFromUrl();
    await ensureMySyndicateDisplayNames();
    await syncSyndicateGroundFiltersForCurrentUser();
  })();
}

/** Apply Supabase session to UI (list view, loads). Clears URL hash after email-confirm redirect. */
function diaryApplyAuthSession(session) {
  if (!session || !session.user) return;
  if (authRecoveryMode) return;
  if (isPasswordRecoveryUrl()) {
    diaryShowPasswordRecovery();
    return;
  }
  if (currentUser && currentUser.id === session.user.id) {
    if (window.location.hash) history.replaceState(null, '', window.location.pathname);
    return;
  }
  currentUser = session.user;
  onSignedIn();
  if (window.location.hash) history.replaceState(null, '', window.location.pathname);
}

// Init on DOM ready
flOnReady(function() {
  (async function() {
  await syncDiaryTrustedUkClock();
  initStatsMoreSection();
  initPlanCollapse();
  if (!initSupabase()) return;
  initDiaryFlUi();
  enhanceKeyboardClickables(document);
  if ('MutationObserver' in window) {
    var kbObserver = new MutationObserver(function(muts) {
      muts.forEach(function(m) {
        if (m.type === 'childList' && m.addedNodes && m.addedNodes.length) {
          m.addedNodes.forEach(function(n) {
            if (n && n.nodeType === 1) enhanceKeyboardClickables(n);
          });
        }
      });
    });
    kbObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Subscribe first so PASSWORD_RECOVERY from reset links is handled before we auto-apply session to the list.
  (async function() {
    sb.auth.onAuthStateChange(function(event, session) {
      if (event === 'SIGNED_OUT') {
        currentUser = null;
        authRecoveryMode = false;
        invalidateSeasonCache();
        diaryHidePasswordRecoveryUI();
        go('v-auth');
        return;
      }
      if (event === 'PASSWORD_RECOVERY') {
        diaryShowPasswordRecovery();
        return;
      }
      if (event === 'TOKEN_REFRESHED' && session && session.user) {
        if (authRecoveryMode) return;
        currentUser = session.user;
        return;
      }
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session && session.user) {
        if (authRecoveryMode) return;
        if (isPasswordRecoveryUrl()) {
          diaryShowPasswordRecovery();
          return;
        }
        if (currentUser && currentUser.id === session.user.id) {
          if (window.location.hash) history.replaceState(null, '', window.location.pathname);
          return;
        }
        diaryApplyAuthSession(session);
      }
    });

    try {
      var s = await sb.auth.getSession();
      if (s.data && s.data.session) {
        if (isPasswordRecoveryUrl()) {
          diaryShowPasswordRecovery();
        } else {
          // Defer so PASSWORD_RECOVERY can set authRecoveryMode first (reset-link edge cases).
          setTimeout(function() {
            if (authRecoveryMode) return;
            sb.auth.getSession().then(function(s2) {
              if (!s2.data || !s2.data.session) return;
              if (authRecoveryMode) return;
              diaryApplyAuthSession(s2.data.session);
            });
          }, 0);
        }
      }
    } catch (e) { /* no session */ }
  })();
  })();
});

// SW registration + update-banner wiring lives in modules/sw-bridge.mjs.
// Call it once at module init — idempotent, so re-init (hot reload etc.)
// won't attach duplicate listeners.
initSwBridge();

// ════════════════════════════════════
// DATA
// ════════════════════════════════════
function seasonDates(season) {
  var parts = season.split('-');
  var y1 = parseInt(parts[0]); // e.g. 2025
  var y2 = y1 + 1;             // always next year (2026)
  return { start: y1 + '-08-01', end: y2 + '-07-31' };
}

// Season list + cards + stats + map: omit weather_data (JSONB can be large). Hydrate in openDetail.
var CULL_ENTRY_LIST_COLUMNS =
  'id,user_id,species,sex,date,time,location_name,lat,lng,weight_kg,' +
  'calibre,distance_m,shot_placement,age_class,notes,shooter,ground,destination,tag_number,syndicate_id,photo_url,created_at';
var CULL_ENTRY_LIST_COLUMNS_LEGACY =
  'id,user_id,species,sex,date,time,location_name,lat,lng,weight_kg,' +
  'calibre,distance_m,shot_placement,age_class,notes,shooter,ground,destination,syndicate_id,photo_url,created_at';

async function loadEntries() {
  if (!currentUser || !sb) return;
  var statsActive = document.getElementById('v-stats') && document.getElementById('v-stats').classList.contains('active');
  if (statsActive) showStatsLoadingOverlay();
  else showEntriesListSkeleton();

  try {
    // Probe the earliest entry date only when the in-memory cache is stale
    // (different user, explicit invalidation, or first load). Previously this
    // ran `SELECT date FROM cull_entries` on every call — fine at 50 rows,
    // wasteful at 5000. LIMIT 1 keeps the probe O(1) regardless of diary size.
    if (cachedEarliestEntryDateForUserId !== currentUser.id) {
      cachedEarliestEntryDate = await probeEarliestEntryDate();
      cachedEarliestEntryDateForUserId = currentUser.id;
    }
    var earliest = cachedEarliestEntryDate
      ? buildSeasonFromEntry(cachedEarliestEntryDate)
      : null;
    var seasons = buildSeasonList(earliest);
    populateSeasonDropdown(seasons);

    async function fetchCullEntries(columns) {
      if (currentSeason === '__all__') {
        return sb.from('cull_entries')
          .select(columns)
          .eq('user_id', currentUser.id)
          .order('date', { ascending: false });
      }
      var d = seasonDates(currentSeason);
      return sb.from('cull_entries')
        .select(columns)
        .eq('user_id', currentUser.id)
        .gte('date', d.start)
        .lte('date', d.end)
        .order('date', { ascending: false });
    }

    var r = await fetchCullEntries(CULL_ENTRY_LIST_COLUMNS);
    if (r.error) {
      var errMsg = String(r.error.message || r.error.details || '').toLowerCase();
      // Handle schema drift gracefully if production is missing newly added tag_number.
      if (errMsg.indexOf('tag_number') !== -1) {
        var fallback = await fetchCullEntries(CULL_ENTRY_LIST_COLUMNS_LEGACY);
        if (!fallback.error) {
          fallback.data = (fallback.data || []).map(function(row) {
            row.tag_number = null;
            return row;
          });
          r = fallback;
          showToast('⚠️ Running in compatibility mode (tag number not available yet)');
        }
      }
    }

    if (!r.error) {
      allEntries = r.data || [];
      await resolveCullPhotoDisplayUrls(allEntries);
      populateGroundFilterDropdown();
      renderList();
      statsNeedsFullRebuild = true;
      if (statsActive) {
        buildStats();
        hideStatsLoadingOverlay();
      }
    } else {
      showToast('⚠️ Could not load entries');
      renderList();
      if (statsActive) {
        buildStats();
        hideStatsLoadingOverlay();
      }
    }
  } catch(e) {
    showToast('⚠️ Could not load entries');
    console.warn('loadEntries failed:', e);
    renderList();
    if (statsActive) {
      buildStats();
      hideStatsLoadingOverlay();
    }
  }
}

function changeSeason() {
  currentSeason = document.getElementById('season-select').value;
  document.getElementById('season-label').textContent = currentSeason === '__all__' ? 'All Seasons' : seasonLabel(currentSeason);
  loadEntries();
}

// ════════════════════════════════════
// RENDER LIST
// ════════════════════════════════════
var SPECIES_CLASS = { 'Red Deer':'sp-red','Roe Deer':'sp-roe','Fallow':'sp-fallow','Sika':'sp-sika','Muntjac':'sp-muntjac','CWD':'sp-cwd' };
// SPEC: lib/fl-pure.mjs#MONTH_NAMES — must be byte-identical.
var MONTH_NAMES   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var FULL_MONTHS   = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── Larder inspection / abnormalities ───────────────────────────────
// Closed list of the checks a UK trained hunter is asked to make during
// gralloch (AHVLA trained-hunter course + BDS DSC1 larder module). Having a
// structured list rather than free-text means:
//   1) The Game Dealer PDF can list exactly what was observed vs. what was
//      checked-and-clear, instead of boiler-plating "no abnormalities
//      observed other than those noted above" around the user's free-text.
//   2) The Summary PDF can aggregate counts across the season ("3 carcasses
//      showed liver fluke on this ground") — meaningful for manager reports.
//   3) Stalkers tick a box in ~5 seconds rather than retyping the same list.
// `code` is the short string persisted in the `abnormalities` TEXT[] column;
// `label` is the on-screen / PDF label.
// SPEC: lib/fl-pure.mjs#ABNORMALITY_OPTIONS — codes persist in Supabase TEXT[]
// column `abnormalities`; renaming/reordering `code` values is a data migration.
var ABNORMALITY_OPTIONS = [
  { code: 'poor-condition',   label: 'Poor body condition / emaciated' },
  { code: 'lymph-enlarged',   label: 'Enlarged / abnormal lymph nodes' },
  { code: 'abscess',          label: 'Abscess or pus' },
  { code: 'cysts',            label: 'Cysts in organs' },
  { code: 'fluke',            label: 'Liver fluke visible' },
  { code: 'tb-lesions',       label: 'Lung lesions (possible TB)' },
  { code: 'tumour',           label: 'Tumour / unusual growth' },
  { code: 'parasites-heavy',  label: 'Heavy ecto-parasite burden' },
  { code: 'joints-swollen',   label: 'Swollen / arthritic joints' },
  { code: 'organ-colour',     label: 'Abnormal organ colour or smell' },
  { code: 'behaviour',        label: 'Abnormal behaviour before shot' },
  { code: 'bruising',         label: 'Bruising beyond shot path' }
];
// SPEC: lib/fl-pure.mjs#ABNORMALITY_LABEL_BY_CODE — derived from ABNORMALITY_OPTIONS.
var ABNORMALITY_LABEL_BY_CODE = (function() {
  var m = {};
  ABNORMALITY_OPTIONS.forEach(function(o) { m[o.code] = o.label; });
  return m;
})();

function renderAbnormalityGrid() {
  var grid = document.getElementById('abnorm-grid');
  if (!grid) return;
  grid.innerHTML = ABNORMALITY_OPTIONS.map(function(o) {
    return '<label class="abnorm-chip" data-abnorm-code="' + o.code + '">'
      + '<input type="checkbox" data-abnorm-input="1" value="' + o.code + '">'
      + '<span>' + esc(o.label) + '</span></label>';
  }).join('');
  // Clicking anywhere on a chip toggles its checkbox; keep visual state in
  // sync without a framework dependency.
  grid.addEventListener('change', function(ev) {
    var t = ev.target;
    if (!t || t.getAttribute('data-abnorm-input') !== '1') return;
    var chip = t.closest('.abnorm-chip');
    if (chip) chip.classList.toggle('is-on', t.checked);
    // Ticking any specific abnormality clears the "None observed" toggle.
    if (t.checked) {
      var noneBox = document.getElementById('f-abnorm-none');
      if (noneBox && noneBox.checked) {
        noneBox.checked = false;
        grid.classList.remove('is-disabled');
      }
    }
  });
  var noneBox = document.getElementById('f-abnorm-none');
  if (noneBox) {
    noneBox.addEventListener('change', function() {
      if (noneBox.checked) {
        grid.classList.add('is-disabled');
        grid.querySelectorAll('input[data-abnorm-input="1"]').forEach(function(cb) {
          cb.checked = false;
          var chip = cb.closest('.abnorm-chip');
          if (chip) chip.classList.remove('is-on');
        });
        var otherInp = document.getElementById('f-abnorm-other');
        if (otherInp) otherInp.value = '';
      } else {
        grid.classList.remove('is-disabled');
      }
    });
  }
}

function getAbnormalityValues() {
  var noneBox = document.getElementById('f-abnorm-none');
  var isNone = !!(noneBox && noneBox.checked);
  var codes = [];
  if (!isNone) {
    document.querySelectorAll('#abnorm-grid input[data-abnorm-input="1"]:checked').forEach(function(cb) {
      codes.push(cb.value);
    });
  }
  var otherEl = document.getElementById('f-abnorm-other');
  var other = (otherEl && !isNone) ? otherEl.value.trim() : '';
  // DB convention: store `['none']` when explicitly clear; `null` when the
  // stalker didn't engage with the inspection at all. This lets the Summary
  // PDF distinguish "confirmed healthy" from "unchecked / unknown".
  var arr;
  if (isNone) arr = ['none'];
  else if (codes.length) arr = codes;
  else arr = null;
  return { abnormalities: arr, abnormalities_other: other || null };
}

function setAbnormalityValues(codes, other) {
  var noneBox = document.getElementById('f-abnorm-none');
  var grid = document.getElementById('abnorm-grid');
  var otherEl = document.getElementById('f-abnorm-other');
  if (noneBox) noneBox.checked = false;
  if (grid) {
    grid.classList.remove('is-disabled');
    grid.querySelectorAll('input[data-abnorm-input="1"]').forEach(function(cb) {
      cb.checked = false;
      var chip = cb.closest('.abnorm-chip');
      if (chip) chip.classList.remove('is-on');
    });
  }
  if (otherEl) otherEl.value = other || '';
  if (Array.isArray(codes)) {
    if (codes.length === 1 && codes[0] === 'none') {
      if (noneBox) noneBox.checked = true;
      if (grid) grid.classList.add('is-disabled');
    } else {
      codes.forEach(function(code) {
        var cb = document.querySelector('#abnorm-grid input[data-abnorm-input="1"][value="' + code + '"]');
        if (cb) {
          cb.checked = true;
          var chip = cb.closest('.abnorm-chip');
          if (chip) chip.classList.add('is-on');
        }
      });
    }
  }
}

/**
 * Human-readable summary of abnormalities for PDFs and detail view.
 * Returns null when there's genuinely nothing to show (unchecked + no other).
 * "None observed" renders as the reassuring affirmative so a declaration PDF
 * reads cleanly rather than being silent about the inspection.
 */
// SPEC: lib/fl-pure.mjs#abnormalitySummaryText — 6 test cases pin the contract
// (null / ['none'] / codes / codes+other / unknown code fallback / etc).
function abnormalitySummaryText(codes, other) {
  var hasCodes = Array.isArray(codes) && codes.length > 0;
  var isNone = hasCodes && codes.length === 1 && codes[0] === 'none';
  var otherStr = (other && typeof other === 'string') ? other.trim() : '';
  if (isNone) {
    return otherStr
      ? 'No structural abnormalities observed (additional note: ' + otherStr + ')'
      : 'No abnormalities observed at gralloch';
  }
  if (hasCodes) {
    var labels = codes
      .filter(function(c) { return c !== 'none'; })
      .map(function(c) { return ABNORMALITY_LABEL_BY_CODE[c] || c; });
    var joined = labels.join('; ');
    return otherStr ? joined + '; plus: ' + otherStr : joined;
  }
  return otherStr || null;
}

// SPEC: lib/fl-pure.mjs#sexBadgeClass — keep in sync.
function sexBadgeClass(sex, species) {
  if (sex === 'm') return (species === 'Roe Deer' || species === 'Fallow' || species === 'Muntjac' || species === 'CWD') ? 'sx-bu' : 'sx-st';
  return (species === 'Roe Deer' || species === 'Fallow' || species === 'Muntjac' || species === 'CWD') ? 'sx-do' : 'sx-hi';
}
// SPEC: lib/fl-pure.mjs#sexLabel — species-aware (Stag/Hind for Red/Sika, Buck/Doe otherwise).
function sexLabel(sex, species) {
  var isBuck = ['Roe Deer','Fallow','Muntjac','CWD'].indexOf(species) >= 0;
  if (sex === 'm') return isBuck ? 'Buck' : 'Stag';
  return isBuck ? 'Doe' : 'Hind';
}
/** YYYY-MM-DD calendar parts for local display; null if not three numeric segments with sane ranges */
// SPEC: lib/fl-pure.mjs#parseEntryDateParts — handles YYYY-MM-DD strict.
function parseEntryDateParts(d) {
  if (d == null || d === '') return null;
  var raw = String(d).trim();
  if (!raw) return null;
  var parts = raw.split('-');
  if (parts.length < 3) return null;
  var y = parseInt(parts[0], 10);
  var mo = parseInt(parts[1], 10);
  var day = parseInt(parts[2], 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(day)) return null;
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;
  return { y: y, m: mo, day: day };
}

function fmtDate(d) {
  if (!d) return '';
  var p = parseEntryDateParts(d);
  if (!p) return typeof d === 'string' ? d : String(d);
  // Local calendar date — avoid UTC parse shift from new Date('YYYY-MM-DD')
  var dt = new Date(p.y, p.m - 1, p.day);
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getDay()] + ' ' + p.day + ' ' + MONTH_NAMES[p.m - 1];
}

// Safe photo URL — only allow https URLs from trusted storage
function safeUrl(url) {
  if (!url) return null;
  return /^https:\/\//.test(url) ? url : null;
}

// Photo storage helpers (CULL_PHOTO_SIGN_EXPIRES, newCullPhotoPath,
// cullPhotoStoragePath) moved to modules/photos.mjs — see Commit G in
// MODULARISATION-PLAN.md. Imported at the top of this file.

/** After loadEntries: fill _photoDisplayUrl for list/detail (private bucket). */
async function resolveCullPhotoDisplayUrls(entries) {
  if (!sb || !currentUser || !entries || !entries.length) return;
  await Promise.all(entries.map(async function(e) {
    delete e._photoDisplayUrl;
    if (!e.photo_url) return;
    var path = cullPhotoStoragePath(e.photo_url);
    if (!path) return;
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        var signed = await sb.storage.from('cull-photos').createSignedUrl(path, CULL_PHOTO_SIGN_EXPIRES);
        if (signed.data && signed.data.signedUrl && !signed.error) {
          e._photoDisplayUrl = signed.data.signedUrl;
          break;
        }
      } catch (err) { /* retry */ }
    }
  }));
}

function entryPhotoSrc(e) {
  if (!e) return null;
  if (e._photoDisplayUrl) return e._photoDisplayUrl;
  return safeUrl(e.photo_url);
}

/** Fade-in photos: skeleton hides when image loads or errors (Cull Diary list/detail/form). */
function diaryOnImgLoad(img) {
  img.classList.add('diary-img-loaded');
  var prev = img.previousElementSibling;
  if (prev && prev.classList && prev.classList.contains('diary-img-skeleton')) {
    prev.classList.add('diary-img-skeleton-hide');
  }
}
function diaryOnImgError(img) {
  img.classList.add('diary-img-loaded');
  var prev = img.previousElementSibling;
  if (prev && prev.classList && prev.classList.contains('diary-img-skeleton')) {
    prev.classList.add('diary-img-skeleton-hide');
  }
}

/** CSP: no inline onload/onerror on injected <img> — attach here. */
function bindDiaryImgHandlers(img) {
  if (!img) return;
  img.addEventListener('load', function() { diaryOnImgLoad(img); });
  img.addEventListener('error', function() { diaryOnImgError(img); });
  if (img.complete) {
    if (img.naturalWidth > 0) diaryOnImgLoad(img);
    else diaryOnImgError(img);
  }
}

function diaryWireDiaryImages(root) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('img.diary-img-fade').forEach(bindDiaryImgHandlers);
}


// XSS sanitiser — escapes user data before innerHTML injection
// SPEC: lib/fl-pure.mjs#esc — escapes the five critical HTML entities.
function esc(s) {
  return (s === null || s === undefined) ? '' :
    String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
             .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
             .replace(/'/g,'&#x27;');
}
function hasValue(v) {
  return !(v === null || v === undefined || v === '');
}
function numOrNull(v) {
  return Number.isFinite(v) ? v : null;
}

/** Empty list — onboarding + link to diary-guide.html (static SVG, no user data). */
function getEmptyListHtml() {
  var hasAny = allEntries.length > 0;
  var filtered = currentFilter !== 'all';
  var title;
  var sub;
  if (filtered && hasAny) {
    title = 'No entries for ' + esc(currentFilter);
    sub = 'Tap <strong>All</strong> to see every species, or <strong>+</strong> to log a cull.';
  } else {
    title = 'Start your cull diary';
    sub = 'Tap <strong>+</strong> for a full entry or <strong>Quick</strong> for a fast log. Your records sync when you\'re online.';
  }
  var svg = '<svg class="empty-illu-svg" viewBox="0 0 120 88" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
    + '<defs><linearGradient id="empty-paper" x1="0%" y1="0%" x2="100%" y2="100%">'
    + '<stop offset="0%" stop-color="#faf8f4"/><stop offset="100%" stop-color="#ebe6dc"/></linearGradient></defs>'
    + '<rect x="22" y="10" width="76" height="68" rx="9" fill="url(#empty-paper)" stroke="#d4cfc4" stroke-width="1.2"/>'
    + '<rect x="22" y="10" width="16" height="68" rx="3" fill="#5a7a30" opacity="0.1"/>'
    + '<line x1="22" y1="26" x2="98" y2="26" stroke="#e0dbd2" stroke-width="1"/>'
    + '<line x1="46" y1="40" x2="88" y2="40" stroke="#c9a84c" stroke-width="1.4" stroke-linecap="round" opacity="0.45"/>'
    + '<line x1="46" y1="50" x2="80" y2="50" stroke="#c9a84c" stroke-width="1.4" stroke-linecap="round" opacity="0.35"/>'
    + '<line x1="46" y1="60" x2="92" y2="60" stroke="#c9a84c" stroke-width="1.4" stroke-linecap="round" opacity="0.28"/>'
    + '<circle cx="82" cy="20" r="6" fill="#c9a84c" opacity="0.2"/>'
    + '<path d="M86 52c4-6 10-6 14-2c2 2 3 5 2 8h-5c0-3-2-5-5-5s-5 2-6 5v3h-4v-4c0-4 2-8 4-5z" fill="#5a7a30" opacity="0.18"/>'
    + '</svg>';
  return '<div class="empty-state">'
    + '<div class="empty-illu">' + svg + '</div>'
    + '<div class="empty-title">' + title + '</div>'
    + '<div class="empty-sub">' + sub + '</div>'
    + '<a href="diary-guide.html" class="empty-guide-link">'
    + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 7h8M8 11h5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/></svg>'
    + 'How to use the Cull Diary</a>'
    + '</div>';
}

/**
 * Case-insensitive substring match across every human-readable field on a cull
 * entry. Supports multi-word queries (all words must hit somewhere — AND
 * semantics): e.g. "roe buck larder" narrows to roe-sex-m-destination-larder.
 * Kept in one place so the detail view / future search UIs stay consistent.
 */
function entryMatchesSearch(e, query) {
  if (!query) return true;
  var hay = (
    (e.species || '') + ' ' +
    (sexLabel(e.sex, e.species) || '') + ' ' +
    (e.location_name || '') + ' ' +
    (e.ground || '') + ' ' +
    (e.shooter || '') + ' ' +
    (e.tag_number || '') + ' ' +
    (e.calibre || '') + ' ' +
    (e.shot_placement || '') + ' ' +
    (e.age_class || '') + ' ' +
    (e.destination || '') + ' ' +
    (e.notes || '') + ' ' +
    (e.date || '')
  ).toLowerCase();
  var tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  for (var i = 0; i < tokens.length; i++) {
    if (hay.indexOf(tokens[i]) === -1) return false;
  }
  return true;
}

function updateListSearchClearVisibility() {
  var btn = document.getElementById('list-search-clear');
  if (btn) btn.hidden = !currentSearch;
}

function onListSearchInput(ev) {
  currentSearch = (ev && ev.target && typeof ev.target.value === 'string') ? ev.target.value.trim() : '';
  updateListSearchClearVisibility();
  renderList();
}

function clearListSearch() {
  currentSearch = '';
  var inp = document.getElementById('list-search-input');
  if (inp) inp.value = '';
  updateListSearchClearVisibility();
  renderList();
}

function populateGroundFilterDropdown() {
  var sel = document.getElementById('ground-filter');
  var wrap = document.getElementById('list-secondary-filters');
  var searchWrap = document.getElementById('list-search');
  if (!sel || !wrap) return;
  var grounds = {};
  allEntries.forEach(function(e) { if (e.ground) grounds[e.ground] = true; });
  var keys = Object.keys(grounds).sort();

  // Row visibility: show whenever there are ANY entries, so Sort + Select are
  // always reachable. Previously we hid the whole row when fewer than 2 grounds
  // were in use — which hid Select too.
  var hasAnyEntries = Array.isArray(allEntries) && allEntries.length > 0;
  wrap.style.display = hasAnyEntries ? 'flex' : 'none';
  // Search row follows the same rule — hidden on an empty diary so it doesn't
  // clutter the onboarding state, visible the moment the user has something
  // to search through.
  if (searchWrap) searchWrap.style.display = hasAnyEntries ? 'flex' : 'none';

  // The ground <select> itself is only useful when there are 2+ grounds to pick
  // between; hide it on its own while keeping Sort + Select visible.
  sel.style.display = keys.length >= 2 ? '' : 'none';

  if (keys.length < 2) {
    // Still reset the filter so a stale value doesn't linger after grounds are removed.
    sel.innerHTML = '<option value="all">All grounds</option>';
    sel.value = 'all';
    currentGroundFilter = 'all';
    return;
  }
  var cur = sel.value;
  sel.innerHTML = '<option value="all">All grounds</option>';
  keys.forEach(function(g) {
    var o = document.createElement('option');
    o.value = g; o.textContent = g;
    sel.appendChild(o);
  });
  sel.value = cur && grounds[cur] ? cur : 'all';
  currentGroundFilter = sel.value;
}

// ── Multi-select mode ────────────────────────────────────────────
// Lets the user pick N entries from the list and run a bulk action
// (today: per-consignment Game Dealer PDF — Reg (EC) 853/2004 allows a
// single declaration for a whole delivery; plus bulk CSV and bulk delete).
// `flSelection` is the single source of truth — groups the two former
// globals (`selectMode`, `selectedEntryIds`) into one object so callers
// pass/inspect intent instead of juggling two correlated flags.
var flSelection = { active: false, ids: new Set() };

function enterSelectMode() {
  flSelection.active = true;
  flSelection.ids = new Set();
  document.body.classList.add('in-select-mode');
  var bar = document.getElementById('select-bar');
  if (bar) bar.hidden = false;
  renderList();
  updateSelectBar();
}

function exitSelectMode() {
  flSelection.active = false;
  flSelection.ids = new Set();
  document.body.classList.remove('in-select-mode');
  var bar = document.getElementById('select-bar');
  if (bar) bar.hidden = true;
  renderList();
}

function toggleEntrySelection(id) {
  if (!id) return;
  if (flSelection.ids.has(id)) flSelection.ids.delete(id);
  else flSelection.ids.add(id);
  // Update just the card in place rather than re-rendering the whole list —
  // keeps tap response instant and avoids scroll jumping.
  var card = document.querySelector('.gc[data-entry-id="' + id + '"]');
  if (card) card.classList.toggle('is-selected', flSelection.ids.has(id));
  updateSelectBar();
}

function selectAllVisible() {
  if (!flSelection.active) return;
  (filteredEntries || []).forEach(function(e) { if (e && e.id) flSelection.ids.add(e.id); });
  document.querySelectorAll('#entries-container .gc').forEach(function(card) {
    var id = card.getAttribute('data-entry-id');
    if (id && flSelection.ids.has(id)) card.classList.add('is-selected');
  });
  updateSelectBar();
}

function updateSelectBar() {
  var n = flSelection.ids.size;
  var countEl = document.getElementById('select-count');
  if (countEl) countEl.textContent = n + ' selected';
  var disabled = n === 0;
  var btn = document.getElementById('select-consignment-btn');
  if (btn) btn.disabled = disabled;
  var csvBtn = document.getElementById('select-csv-btn');
  if (csvBtn) csvBtn.disabled = disabled;
  var delBtn = document.getElementById('select-delete-btn');
  if (delBtn) delBtn.disabled = disabled;
}

function renderList() {
  var entries = currentFilter === 'all' ? allEntries : allEntries.filter(function(e){ return e.species === currentFilter; });
  if (currentGroundFilter !== 'all') entries = entries.filter(function(e){ return e.ground === currentGroundFilter; });
  if (currentSearch) entries = entries.filter(function(e) { return entryMatchesSearch(e, currentSearch); });
  if (listSortAsc) entries = entries.slice().sort(function(a,b){ return (a.date||'').localeCompare(b.date||'') || (a.time||'').localeCompare(b.time||''); });
  filteredEntries = entries;
  var container = document.getElementById('entries-container');

  // Stats
  var total = entries.length;
  var kg = entries.reduce(function(s,e){ return s + (parseFloat(e.weight_kg)||0); }, 0);
  var species_set = new Set(entries.map(function(e){ return e.species; }));
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-kg').textContent = Math.round(kg);
  document.getElementById('stat-spp').textContent = species_set.size;

  if (!total) {
    // "Nothing matches your search" looks different from "you have no entries" —
    // the latter shows the onboarding illustration; the former is a tiny hint
    // with the user's query echoed back, so they know they still have entries
    // and just need to clear the search.
    if (currentSearch) {
      container.innerHTML =
        '<div class="list-search-empty">'
          + '<strong>No matches for "' + esc(currentSearch) + '"</strong>'
          + 'Try a species, ground, tag, shooter, calibre, or location keyword.'
        + '</div>';
      return;
    }
    container.innerHTML = getEmptyListHtml();
    return;
  }

  // Group by month (invalid dates → single bucket at end)
  var LIST_INVALID_YM = '0000-00';
  var months = {};
  entries.forEach(function(e) {
    var p = parseEntryDateParts(e.date);
    var k = p ? p.y + '-' + ('0' + p.m).slice(-2) : LIST_INVALID_YM;
    if (!months[k]) months[k] = [];
    months[k].push(e);
  });

  var html = '';
  Object.keys(months).sort(function(a,b){ return b.localeCompare(a); }).forEach(function(ym) {
    if (ym === LIST_INVALID_YM) {
      html += '<div class="month-lbl">Other dates</div>';
    } else {
      var parts = ym.split('-');
      var mi = parseInt(parts[1], 10);
      html += '<div class="month-lbl">' + FULL_MONTHS[mi - 1] + ' ' + parts[0] + '</div>';
    }
    html += '<div class="grid">';
    var group = months[ym];
    var i = 0;
    while (i < group.length) {
      var e = group[i];
      var spClass = SPECIES_CLASS[e.species] || 'sp-red';
      var sxClass = sexBadgeClass(e.sex, e.species);
      var sxLbl = sexLabel(e.sex, e.species);
      var safePhoto = entryPhotoSrc(e);
      var hasPhoto = !!safePhoto;
      var imgHtml = hasPhoto
        ? '<div class="diary-img-skeleton" aria-hidden="true"></div><img class="diary-img diary-img-fade" src="' + esc(safePhoto) + '" alt="" loading="eager" decoding="async"><div class="gc-img-ov"></div>'
        : diaryNoPhotoListHtml(spClass, e.species);

      // Check if next entry also exists for potential wide layout (no-photo entries shown wide)
      var nextE = group[i+1];
      var showWide = !e.photo_url && (!nextE || !nextE.photo_url);
      var isSel = flSelection.active && flSelection.ids.has(e.id);
      var selClass = isSel ? ' is-selected' : '';
      var tickHtml = flSelection.active ? '<div class="gc-select-tick" aria-hidden="true">✓</div>' : '';
      if (showWide) {
        // Wide card
        html += '<div class="gc wide' + selClass + '" tabindex="0" role="button" data-fl-action="open-detail" data-entry-id="' + e.id + '">'
          + '<div class="gc-img ' + spClass + '" style="position:relative;">' + imgHtml
          + '<div class="gc-img-top"><span class="gc-sex ' + sxClass + '">' + sxLbl + '</span></div>'
          + '<div class="gc-img-bot"><div class="gc-species">' + esc(e.species || '') + '</div><div class="gc-date">' + fmtDate(e.date) + '</div></div>'
          + tickHtml
          + '</div>'
          + '<div class="gc-body"><div class="gc-meta">' + esc(e.location_name) + (e.calibre ? ' · ' + esc(e.calibre) : '') + '</div>'
          + '<div class="gc-foot"><span class="gc-kg">' + (hasValue(e.weight_kg) ? e.weight_kg + ' kg' : '–') + '</span>' + (e.tag_number ? '<span class="gc-tag">' + esc(e.tag_number) + '</span>' : '') + '</div></div></div>';
        i++;
      } else {
        // Normal card
        html += '<div class="gc' + selClass + '" tabindex="0" role="button" data-fl-action="open-detail" data-entry-id="' + e.id + '">'
          + '<div class="gc-img ' + spClass + '" style="position:relative;">' + imgHtml
          + '<div class="gc-img-top"><span class="gc-sex ' + sxClass + '">' + sxLbl + '</span>'
          + (hasPhoto ? '<div class="gc-photo-badge" aria-hidden="true">' + SVG_FL_CAMERA + '</div>' : '')
          + '</div>'
          + '<div class="gc-img-bot"><div class="gc-species">' + esc(e.species || '') + '</div><div class="gc-date">' + fmtDate(e.date) + '</div></div>'
          + tickHtml
          + '</div>'
          + '<div class="gc-body"><div class="gc-meta">' + esc(e.location_name) + (e.calibre ? ' · ' + esc(e.calibre) : '') + '</div>'
          + '<div class="gc-foot"><span class="gc-kg">' + (hasValue(e.weight_kg) ? e.weight_kg + ' kg' : '–') + '</span>'
          + (e.tag_number ? '<span class="gc-tag">' + esc(e.tag_number) + '</span>' : '')
          + '<span class="gc-cal">' + esc(e.calibre) + '</span></div></div></div>';
        i++;
      }
    }
    html += '</div>';
  });

  container.innerHTML = html;
  diaryWireDiaryImages(container);
}

function filterEntries(filter, el) {
  currentFilter = filter;
  document.querySelectorAll('.filter-bar .fc').forEach(function(b){ b.classList.remove('on'); });
  el.classList.add('on');
  renderList();
}

// ════════════════════════════════════
// DETAIL
// ════════════════════════════════════
async function openDetail(id) {
  var e = allEntries.find(function(x){ return x.id === id; });
  if (!e) return;
  if (e.weather_data === undefined && sb && currentUser) {
    try {
      var wr = await sb.from('cull_entries')
        .select('weather_data')
        .eq('id', id)
        .eq('user_id', currentUser.id)
        .maybeSingle();
      e.weather_data = (wr.data && 'weather_data' in wr.data) ? wr.data.weather_data : null;
    } catch (err) {
      e.weather_data = null;
    }
  }
  if (e.photo_url && sb && currentUser) {
    var phPath = cullPhotoStoragePath(e.photo_url);
    if (phPath) {
      try {
        var sh = await sb.storage.from('cull-photos').createSignedUrl(phPath, CULL_PHOTO_SIGN_EXPIRES);
        if (sh.data && sh.data.signedUrl && !sh.error) e._photoDisplayUrl = sh.data.signedUrl;
      } catch (err) { /* use cached _photoDisplayUrl from list */ }
    }
  }
  currentEntry = e;
  var spClass = SPECIES_CLASS[e.species] || 'sp-red';
  var sxLbl = sexLabel(e.sex, e.species);

  var heroStyle = e.photo_url
    ? 'background:#0a0f07;'
    : 'background:linear-gradient(135deg,' + {'Red Deer':'#3a1a0a,#1a0a04','Roe Deer':'#0a2210,#050e04','Fallow':'#3a2208,#180e04','Sika':'#081830,#020810','Muntjac':'#1a0a2a,#0a0410','CWD':'#062018,#041010'}[e.species] + ');';

  var _safeHero = entryPhotoSrc(e);
  var heroImg = _safeHero
    ? '<div class="diary-img-skeleton diary-img-skeleton-hero" aria-hidden="true"></div><img class="diary-img diary-img-fade" src="' + esc(_safeHero) + '" alt="" loading="eager" decoding="async" fetchpriority="high">'
    : diaryHeroNoPhotoHtml();

  var syncTime = e.created_at ? new Date(e.created_at).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '';

  var dateDisp = fmtDate(e.date);
  var calibreRange = '–';
  if (e.calibre && hasValue(e.distance_m)) calibreRange = esc(e.calibre) + ' · ' + e.distance_m + 'm';
  else if (e.calibre) calibreRange = esc(e.calibre);
  else if (hasValue(e.distance_m)) calibreRange = '– · ' + e.distance_m + 'm';
  var placementDisp = e.shot_placement ? esc(e.shot_placement) : '–';
  var shooterDisp = e.shooter ? esc(e.shooter) : 'Self';
  var destDisp = e.destination ? esc(e.destination) : '–';
  function ddWt(v) {
    if (v == null || v === '') return '–';
    return esc(String(v)) + ' <span class="dd-u">kg</span>';
  }
  function ddDist(v) {
    if (v == null || v === '') return '–';
    return esc(String(v)) + ' <span class="dd-u">m</span>';
  }

  var photoCard = '<div class="dd-card"><div class="dd-card-lbl">Photo</div>'
    + (_safeHero
      ? '<div class="dd-photo-row"><div class="dd-photo-col"><div class="photo-thumb" tabindex="0" role="button" data-fl-action="open-photo-lb" data-photo-url="' + encodeURIComponent(_safeHero) + '" title="Tap to view full size"><div class="diary-img-skeleton diary-img-skeleton-thumb" aria-hidden="true"></div><img class="diary-img diary-img-fade" src="' + esc(_safeHero) + '" alt="" loading="eager" decoding="async"></div><div class="dd-photo-hint">Tap to expand</div></div><button type="button" class="photo-change-btn" data-fl-action="open-edit-entry" data-entry-id="' + e.id + '"><span class="di-btn-ic" aria-hidden="true">' + SVG_FL_PENCIL + '</span>Edit entry</button></div>'
      : '<div class="dd-photo-row"><div class="dd-photo-col"><div class="photo-thumb photo-thumb--empty">' + diaryPhotoThumbEmptyHtml() + '</div></div><button type="button" class="photo-change-btn" data-fl-action="open-edit-entry" data-entry-id="' + e.id + '"><span class="di-btn-ic" aria-hidden="true">' + SVG_FL_PENCIL + '</span>Edit entry</button></div>')
    + '</div>';

  var whenCard = '<div class="dd-card"><div class="dd-card-lbl">When &amp; where</div>'
    + '<div class="dd-kv"><span class="dd-k">Date</span><span class="dd-v">' + esc(dateDisp || '–') + '</span></div>'
    + '<div class="dd-kv"><span class="dd-k">Time</span><span class="dd-v">' + esc(e.time || '–') + '</span></div>'
    + '<div class="dd-kv"><span class="dd-k">Location</span><span class="dd-v">' + (e.location_name ? esc(e.location_name) : '–') + '</span></div>'
    + '<div class="dd-kv"><span class="dd-k">Ground</span><span class="dd-v">' + (e.ground ? esc(e.ground) : '–') + '</span></div>'
    + '</div>';

  var weightsCard = '<div class="dd-card"><div class="dd-card-lbl">Weight &amp; distance</div><div class="dd-grid2">'
    + '<div class="dd-tile"><div class="dd-tile-k">Carcass weight</div><div class="dd-tile-v">' + ddWt(e.weight_kg) + '</div></div>'
    + '<div class="dd-tile"><div class="dd-tile-k">Distance</div><div class="dd-tile-v">' + ddDist(e.distance_m) + '</div></div>'
    + (e.tag_number ? '<div class="dd-tile"><div class="dd-tile-k">Tag number</div><div class="dd-tile-v">' + esc(e.tag_number) + '</div></div>' : '')
    + '</div></div>';

  var shotCard = '<div class="dd-card"><div class="dd-card-lbl">Shot &amp; stalking</div>'
    + '<div class="dd-kv"><span class="dd-k">Calibre / range</span><span class="dd-v">' + calibreRange + '</span></div>'
    + '<div class="dd-kv"><span class="dd-k">Placement</span><span class="dd-v">' + placementDisp + '</span></div>'
    + '<div class="dd-kv"><span class="dd-k">Shooter</span><span class="dd-v">' + shooterDisp + '</span></div>'
    + '<div class="dd-kv"><span class="dd-k">Destination</span><span class="dd-v">' + destDisp + '</span></div>'
    + '</div>';

  var notesCard = e.notes
    ? '<div class="dd-card"><div class="dd-card-lbl">Notes</div><p class="dd-notes">' + esc(e.notes) + '</p></div>'
    : '';

  // Larder inspection card — lives between Notes and Weather. We only show it
  // when the stalker has captured something: a concrete checklist saves a
  // trip back to the form later when prepping a dealer declaration.
  var abnormCodes = Array.isArray(e.abnormalities) ? e.abnormalities : null;
  var abnormSummary = abnormalitySummaryText(abnormCodes, e.abnormalities_other);
  var abnormCard = '';
  if (abnormSummary) {
    var isClean = abnormCodes && abnormCodes.length === 1 && abnormCodes[0] === 'none';
    abnormCard = '<div class="dd-card"><div class="dd-card-lbl">Larder inspection</div>'
      + (isClean
          ? '<p class="dd-notes">' + esc(abnormSummary) + '</p>'
          : '<ul class="dd-abnorm-list">'
              + (abnormCodes || []).filter(function(c) { return c !== 'none'; }).map(function(c) {
                return '<li>' + esc(ABNORMALITY_LABEL_BY_CODE[c] || c) + '</li>';
              }).join('')
              + (e.abnormalities_other ? '<li><em>Other: ' + esc(e.abnormalities_other) + '</em></li>' : '')
            + '</ul>')
      + '</div>';
  }

  var wxRaw = renderWeatherStrip(e);
  var wxCard = wxRaw ? '<div class="dd-card dd-card--wx">' + wxRaw + '</div>' : '';

  var html = '<div class="detail-hero detail-hero--dense ' + spClass + '" style="' + heroStyle + '">'
    + heroImg
    + '<div class="detail-hero-ov"></div>'
    + '<button type="button" class="detail-hero-back" data-fl-action="go" data-view="v-list" aria-label="Back to list">←</button>'
    + '<div class="detail-hero-bot">'
    + '<div class="detail-species">' + esc(e.species || '') + ' ' + esc(sxLbl) + '</div>'
    + '<div class="detail-chips">'
    + '<span class="dchip ' + (e.sex === 'm' ? 'dc-m' : 'dc-f') + '">' + (e.sex === 'm' ? '♂' : '♀') + ' ' + esc(sxLbl) + (e.age_class ? ' · ' + esc(e.age_class) : '') + '</span>'
    + (e.location_name ? '<span class="dchip dc-l"><span class="dchip-ic" aria-hidden="true">' + SVG_FL_PIN + '</span>' + esc(e.location_name) + '</span>' : '')
    + (hasValue(e.weight_kg) ? '<span class="dchip dc-w">' + e.weight_kg + ' kg</span>' : '')
    + (e.tag_number ? '<span class="dchip dc-t">' + esc(e.tag_number) + '</span>' : '')
    + '</div>'
    + '<div class="sync-row"><div class="sync-dot"></div><span class="sync-txt">Synced' + (syncTime ? ' · ' + syncTime : '') + '</span></div>'
    + '</div></div>'

    + '<div class="detail-dash">'
    + photoCard
    + whenCard
    + weightsCard
    + shotCard
    + notesCard
    + abnormCard
    + wxCard
    + '<div class="action-row action-row--dash">'
    + '<button type="button" class="abtn a-e" data-fl-action="open-edit-entry" data-entry-id="' + e.id + '"><span class="di-btn-ic" aria-hidden="true">' + SVG_FL_PENCIL + '</span>Edit</button>'
    + '<button type="button" class="abtn a-x" data-fl-action="export-single-pdf" data-entry-id="' + e.id + '"><span class="di-btn-ic" aria-hidden="true">' + SVG_FL_FILE_PDF + '</span>PDF</button>'
    + '<button type="button" class="abtn a-dec" data-fl-action="export-declaration" data-entry-id="' + e.id + '" title="Trained hunter declaration PDF — for game dealers and wild game food safety (UK)." aria-label="Download trained hunter declaration PDF for game dealers">'
    + '<span class="di-btn-ic" aria-hidden="true">' + SVG_FL_FILE_PDF + '</span>Game dealer PDF</button>'
    + '<button type="button" class="abtn a-d" data-fl-action="delete-entry" data-entry-id="' + e.id + '"><span class="di-btn-ic" aria-hidden="true">' + SVG_FL_TRASH + '</span>Delete</button>'
    + '</div></div>';

  var detailEl = document.getElementById('detail-content');
  detailEl.innerHTML = html;
  diaryWireDiaryImages(detailEl);
  go('v-detail');
}

// ════════════════════════════════════
// FORM
// ════════════════════════════════════
async function openNewEntry() {
  if (!isDiaryUkClockReady()) {
    var okClock = await syncDiaryTrustedUkClock();
    if (!okClock) { showToast('⚠️ UK time unavailable — connect to internet'); return; }
  }
  formDirty = false;
  editingId = null;
  photoFile = null;
  editingOriginalPhotoPath = null;
  revokeBlobPreviewUrl(photoPreviewUrl);
  photoPreviewUrl = null;
  formSpecies = '';
  formSex = '';
  resetPhotoSlot();
  document.querySelectorAll('.sp-btn').forEach(function(b){ b.classList.remove('on'); });
  document.getElementById('sx-m').classList.remove('on');
  document.getElementById('sx-f').classList.remove('on');
  updateFormSexLabels('');
  var now = diaryNow();
  // Use UK time for date/time pre-fill — toISOString() returns UTC which can be wrong date/time
  var _ukParts = new Intl.DateTimeFormat('en-GB', {
    timeZone:'Europe/London', year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hour12:false
  }).formatToParts(now);
  var _get = function(t){ return _ukParts.find(function(p){ return p.type===t; }).value; };
  document.getElementById('f-date').value = _get('year') + '-' + _get('month') + '-' + _get('day');
  document.getElementById('f-time').value = _get('hour') + ':' + _get('minute');
  ['f-location','f-dist','f-notes'].forEach(function(id){ document.getElementById(id).value = ''; }); setCalibreValue(''); renderCalibrePresets();
  var shooterEl = document.getElementById('f-shooter');
  if (shooterEl) { shooterEl.value = 'Self'; shooterEl.classList.add('shooter-self'); }
  var destEl = document.getElementById('f-destination');
  if (destEl) destEl.value = '';
  var tagEl = document.getElementById('f-tag');
  if (tagEl) tagEl.value = '';
  setAbnormalityValues(null, '');
  var groundEl = document.getElementById('f-ground');
  if (groundEl) { groundEl.value = ''; }
  var groundCustom = document.getElementById('f-ground-custom');
  if (groundCustom) { groundCustom.value = ''; groundCustom.style.display = 'none'; }
  clearSyndicateAutoNote();
  await syncSyndicateGroundFiltersForCurrentUser();
  populateGroundDropdown();
  await populateSyndicateAttributionDropdown('');
  document.getElementById('f-wt').value = '';
  clearPinnedLocation();
  setPlacementValue('');
  document.getElementById('f-age').value = '';
  document.getElementById('form-title').textContent = 'New Entry';
  var _days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var _ukDate = new Intl.DateTimeFormat('en-GB', {
    timeZone:'Europe/London', weekday:'short', day:'numeric', month:'long', year:'numeric'
  }).formatToParts(now);
  var _gp = function(t){ var p=_ukDate.find(function(x){return x.type===t;}); return p?p.value:''; };
  document.getElementById('form-date-label').textContent = _gp('weekday') + ' ' + _gp('day') + ' ' + _gp('month') + ' ' + _gp('year');
  go('v-form');
}

async function openEditEntry(id) {
  formDirty = false;
  var e = allEntries.find(function(x){ return x.id === id; });
  if (!e) return;
  await syncSyndicateGroundFiltersForCurrentUser();
  editingId = id;
  formSpecies = e.species;
  formSex = e.sex;
  photoFile = null;
  revokeBlobPreviewUrl(photoPreviewUrl);
  photoPreviewUrl = null;
  var path = e.photo_url ? cullPhotoStoragePath(e.photo_url) : null;
  editingOriginalPhotoPath = path || null;
  if (path && sb) {
    try {
      var signed = await sb.storage.from('cull-photos').createSignedUrl(path, CULL_PHOTO_SIGN_EXPIRES);
      if (signed.data && signed.data.signedUrl && !signed.error) photoPreviewUrl = signed.data.signedUrl;
    } catch (err) { /* fall through */ }
  }
  if (!photoPreviewUrl) photoPreviewUrl = safeUrl(e.photo_url) || null;
  // Set photo slot
  if (photoPreviewUrl) {
    var slot = document.getElementById('photo-slot');
    slot.className = 'photo-slot filled';
    slot.innerHTML = '<div class="diary-img-skeleton diary-img-skeleton-slot" aria-hidden="true"></div><img class="diary-img diary-img-fade" src="' + esc(photoPreviewUrl) + '" alt=""><button type="button" class="photo-slot-rm" data-fl-action="remove-photo">✕</button>';
    diaryWireDiaryImages(slot);
    document.getElementById('photo-rm-btn').style.display = 'block';
  } else {
    resetPhotoSlot();
  }
  // Species
  document.querySelectorAll('.sp-btn').forEach(function(b){ b.classList.toggle('on', b.querySelector('.sp-name').textContent === e.species); });
  updateFormSexLabels(e.species);
  // Sex
  document.getElementById('sx-m').classList.toggle('on', e.sex === 'm');
  document.getElementById('sx-f').classList.toggle('on', e.sex === 'f');
  document.getElementById('f-date').value = e.date || '';
  document.getElementById('f-time').value = e.time || '';
  document.getElementById('f-location').value = e.location_name || '';
  if (e.lat != null && e.lng != null) {
    formPinLat = e.lat; formPinLng = e.lng;
    showPinnedStrip(e.location_name || (e.lat.toFixed(4) + ', ' + e.lng.toFixed(4)), e.lat, e.lng);
  } else {
    clearPinnedLocation();
  }
  document.getElementById('f-wt').value = hasValue(e.weight_kg) ? String(e.weight_kg) : '';
  setCalibreValue(e.calibre || ''); renderCalibrePresets();
  document.getElementById('f-dist').value = hasValue(e.distance_m) ? String(e.distance_m) : '';
  setPlacementValue(e.shot_placement || '');
  document.getElementById('f-age').value = normalizeAgeClassLabel(e.age_class || '');
  document.getElementById('f-notes').value = e.notes || '';
  var sEl = document.getElementById('f-shooter');
  if (sEl) {
    sEl.value = e.shooter || 'Self';
    sEl.classList.toggle('shooter-self', !e.shooter || e.shooter === 'Self');
  }
  var destEl = document.getElementById('f-destination');
  if (destEl) destEl.value = e.destination || '';
  var tagEl = document.getElementById('f-tag');
  if (tagEl) tagEl.value = e.tag_number || '';
  setAbnormalityValues(e.abnormalities || null, e.abnormalities_other || '');
  clearSyndicateAutoNote();
  populateGroundDropdown();
  setGroundValue(e.ground || '');
  await populateSyndicateAttributionDropdown(e.syndicate_id || '');
  document.getElementById('form-title').textContent = 'Edit Entry';
  document.getElementById('form-date-label').textContent = fmtDate(e.date);
  go('v-form');
}

var JUVENILE_LABEL = { 'Red Deer':'Calf', 'Sika':'Calf', 'Roe Deer':'Kid', 'Fallow':'Fawn', 'Muntjac':'Fawn', 'CWD':'Fawn' };
function normalizeAgeClassLabel(ageClass) {
  if (ageClass === 'Calf / Kid') return 'Calf / Kid / Fawn';
  return ageClass;
}

function updateFormSexLabels(species) {
  var mName = document.querySelector('#sx-m .sx-name');
  var fName = document.querySelector('#sx-f .sx-name');
  if (species) {
    if (mName) mName.textContent = sexLabel('m', species);
    if (fName) fName.textContent = sexLabel('f', species);
  } else {
    if (mName) mName.textContent = 'Stag / Buck';
    if (fName) fName.textContent = 'Hind / Doe';
  }
  var ageEl = document.getElementById('f-age');
  if (ageEl) {
    for (var i = 0; i < ageEl.options.length; i++) {
      if (ageEl.options[i].value === 'Calf / Kid / Fawn' || ageEl.options[i].value === 'Calf / Kid') {
        ageEl.options[i].textContent = species ? (JUVENILE_LABEL[species] || 'Calf / Kid / Fawn') : 'Calf / Kid / Fawn';
        break;
      }
    }
  }
}

function updateQuickSexLabels(species) {
  var mBtn = document.getElementById('qs-m');
  var fBtn = document.getElementById('qs-f');
  if (species) {
    if (mBtn) mBtn.textContent = '\u2642 ' + sexLabel('m', species);
    if (fBtn) fBtn.textContent = '\u2640 ' + sexLabel('f', species);
  } else {
    if (mBtn) mBtn.textContent = '\u2642 Stag / Buck';
    if (fBtn) fBtn.textContent = '\u2640 Hind / Doe';
  }
}

function pickSpecies(el, name) {
  document.querySelectorAll('.sp-btn').forEach(function(b){ b.classList.remove('on'); });
  el.classList.add('on');
  formSpecies = name;
  updateFormSexLabels(name);
  formDirty = true;
}
function pickSex(s) {
  formSex = s;
  document.getElementById('sx-m').classList.toggle('on', s === 'm');
  document.getElementById('sx-f').classList.toggle('on', s === 'f');
  formDirty = true;
}

function handlePhoto(input) {
  var file = input.files[0];
  if (!file) return;
  input.value = '';
  revokeBlobPreviewUrl(photoPreviewUrl);
  photoPreviewUrl = null;

  // Compression (FileReader → Image → Canvas → Blob at 800px max / 0.75 JPEG)
  // lives in modules/photos.mjs so the offline-queue code can share it and so
  // the pipeline is testable in isolation. Everything below the compress call
  // is DOM state that must stay in diary.js.
  compressPhotoFile(file).then(function(res) {
    photoFile = res.file;
    photoPreviewUrl = res.previewUrl;

    var slot = document.getElementById('photo-slot');
    slot.className = 'photo-slot filled';
    slot.innerHTML = '<div class="diary-img-skeleton diary-img-skeleton-slot" aria-hidden="true"></div><img class="diary-img diary-img-fade" src="' + esc(photoPreviewUrl) + '" alt=""><button type="button" class="photo-slot-rm" data-fl-action="remove-photo">✕</button>';
    diaryWireDiaryImages(slot);
    document.getElementById('photo-rm-btn').style.display = 'block';

    showToast('📷 Photo ready · ' + res.kb + ' KB');
  }).catch(function(err) {
    console.warn('Photo compress failed:', err);
    showToast('⚠️ Photo failed to load');
  });
}

function removePhoto() {
  photoFile = null;
  revokeBlobPreviewUrl(photoPreviewUrl);
  photoPreviewUrl = null;
  resetPhotoSlot();
}

/** New Entry empty photo — landscape frame + sun + hills (matches form HTML). */
var PHOTO_SLOT_EMPTY_HTML =
  '<div class="photo-slot-icon" aria-hidden="true">' +
  '<svg class="photo-slot-empty-svg" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<rect x="7" y="11" width="34" height="26" rx="5" stroke="currentColor" stroke-width="1.5" opacity="0.9"/>' +
  '<circle cx="17" cy="20" r="3.5" fill="#c8a84b" opacity="0.42"/>' +
  '<path d="M9 36l9-12 7 7 9-13 6 18H9z" fill="#5a7a30" fill-opacity="0.2"/>' +
  '<path d="M9 36l9-12 7 7 9-13 6 18" fill="none" stroke="#5a7a30" stroke-opacity="0.5" stroke-width="1.15" stroke-linejoin="round"/>' +
  '</svg></div><div class="photo-slot-lbl">No photo</div>';

function resetPhotoSlot() {
  var slot = document.getElementById('photo-slot');
  slot.className = 'photo-slot empty';
  slot.innerHTML = PHOTO_SLOT_EMPTY_HTML;
  document.getElementById('photo-rm-btn').style.display = 'none';
}

var lastGpsLat = null, lastGpsLng = null;


// ── Calibre presets (per-user recent list) ────────────────────────
// We store a rolling list of the calibres the user has actually saved in
// localStorage, keyed by auth user id. Rendering up to 5 as chips above the
// dropdown means the normal case (one stalker, one rifle this season) is
// a single tap. Keyed per-user so a shared device / syndicate-owned iPad
// doesn't leak one stalker's calibres into another's form.
var CALIBRE_PRESETS_MAX_STORED = 10;   // keep the last 10 in storage
var CALIBRE_PRESETS_MAX_SHOWN = 5;     // render at most 5 chips

function calibrePresetsKey() {
  var id = (currentUser && currentUser.id) ? currentUser.id : 'anon';
  return 'fl_calibre_presets_' + id;
}

function loadCalibrePresets() {
  try {
    var raw = localStorage.getItem(calibrePresetsKey());
    if (!raw) return [];
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(function(x) { return typeof x === 'string' && x.trim(); }) : [];
  } catch (_) { return []; }
}

function saveCalibrePresets(list) {
  try {
    localStorage.setItem(calibrePresetsKey(), JSON.stringify(list.slice(0, CALIBRE_PRESETS_MAX_STORED)));
  } catch (_) { /* quota — non-fatal */ }
}

/**
 * Move `calibre` to the front of the saved list (or add if new). Called from
 * saveEntry() on a successful save so only calibres that actually shipped to
 * the cloud end up as presets — typos mid-form don't pollute the chip row.
 */
function rememberCalibrePreset(calibre) {
  if (!calibre) return;
  var c = String(calibre).trim();
  if (!c) return;
  var list = loadCalibrePresets();
  // Case-insensitive dedupe on the stored list (".243 Win" vs ".243 win").
  var lc = c.toLowerCase();
  list = list.filter(function(x) { return String(x).toLowerCase() !== lc; });
  list.unshift(c);
  saveCalibrePresets(list);
  renderCalibrePresets();
}

/**
 * Render (up to) CALIBRE_PRESETS_MAX_SHOWN chips above the calibre select.
 * Marks the current selection with `.is-on` so the user can see which one
 * matches what's in the form. Hides the container when empty so first-use
 * users don't see a blank area.
 */
function renderCalibrePresets() {
  var wrap = document.getElementById('cal-presets');
  if (!wrap) return;
  var presets = loadCalibrePresets();
  if (!presets.length) {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }
  var current = getCalibreValue();
  var currentLc = String(current || '').toLowerCase();
  var shown = presets.slice(0, CALIBRE_PRESETS_MAX_SHOWN);
  wrap.innerHTML = shown.map(function(c) {
    var on = String(c).toLowerCase() === currentLc ? ' is-on' : '';
    return '<button type="button" class="cal-preset-chip' + on + '" data-fl-action="cal-preset-pick" data-cal-val="' + esc(c) + '">'
      + (on ? '<span class="cal-preset-chip-ic" aria-hidden="true">✓</span>' : '')
      + esc(c)
      + '</button>';
  }).join('');
  wrap.style.display = 'flex';
}

function pickCalibrePreset(val) {
  if (!val) return;
  setCalibreValue(val);
  renderCalibrePresets();
}

function handleCalibreSelect(sel) {
  var custom = document.getElementById('f-calibre');
  if (sel.value === '__custom__') {
    custom.style.display = 'block';
    custom.value = '';
    custom.focus();
    sel.classList.add('has-val');
  } else {
    custom.style.display = 'none';
    custom.value = sel.value;
    sel.classList.toggle('has-val', sel.value !== '');
  }
  // Re-render chips so the active "is-on" tick tracks whatever the user
  // just picked from the native select.
  renderCalibrePresets();
}

function getCalibreValue() {
  var sel = document.getElementById('f-calibre-sel');
  var custom = document.getElementById('f-calibre');
  if (sel && sel.value === '__custom__') return custom.value.trim();
  if (sel && sel.value && sel.value !== '') return sel.value;
  return custom ? custom.value.trim() : '';
}

function setCalibreValue(val) {
  var sel = document.getElementById('f-calibre-sel');
  var custom = document.getElementById('f-calibre');
  if (!val) { 
    if (sel) sel.value = ''; 
    if (custom) { custom.value = ''; custom.style.display = 'none'; }
    return; 
  }
  // Check if val matches a dropdown option
  var matched = false;
  if (sel) {
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === val) { sel.value = val; matched = true; break; }
    }
  }
  if (!matched) {
    // Use custom
    if (sel) sel.value = '__custom__';
    if (custom) { custom.value = val; custom.style.display = 'block'; }
  } else {
    if (custom) { custom.value = val; custom.style.display = 'none'; }
  }
}

function handlePlacementSelect(sel) {
  var custom = document.getElementById('f-placement-custom');
  if (sel.value === '__other__') {
    custom.style.display = 'block';
    sel.classList.add('has-val');
    custom.focus();
  } else {
    custom.style.display = 'none';
    custom.value = '';
    sel.classList.toggle('has-val', !!sel.value);
  }
}

function getPlacementValue() {
  var sel = document.getElementById('f-placement');
  if (sel.value === '__other__') {
    return document.getElementById('f-placement-custom').value.trim() || '';
  }
  return sel.value;
}

function setPlacementValue(val) {
  var sel = document.getElementById('f-placement');
  var custom = document.getElementById('f-placement-custom');
  // Check if val matches a known option
  var known = ['Heart / Lung','High Shoulder','Neck','Head','Spine','Shoulder','Abdomen','Haunch'];
  if (!val) {
    sel.value = '';
    sel.classList.remove('has-val');
    custom.style.display = 'none';
    custom.value = '';
  } else if (known.indexOf(val) !== -1) {
    sel.value = val;
    sel.classList.add('has-val');
    custom.style.display = 'none';
    custom.value = '';
  } else {
    sel.value = '__other__';
    sel.classList.add('has-val');
    custom.style.display = 'block';
    custom.value = val;
  }
} // stored for weather fetch

/** Nominatim (OpenStreetMap) — abort after `ms` to avoid hung UI on slow networks. Default 5s. */
function nominatimFetch(url, ms) {
  var limit = ms === undefined ? 5000 : ms;
  var ctrl = new AbortController();
  var tid = setTimeout(function() { ctrl.abort(); }, limit);
  return fetch(url, { signal: ctrl.signal }).finally(function() { clearTimeout(tid); });
}

function getGPS() {
  if (!navigator.geolocation) { showToast('GPS not available'); return; }
  showToast('📍 Getting location…');
  navigator.geolocation.getCurrentPosition(function(pos) {
    var lat = pos.coords.latitude.toFixed(4);
    var lng = pos.coords.longitude.toFixed(4);
    lastGpsLat = parseFloat(lat); lastGpsLng = parseFloat(lng);
    formPinLat = parseFloat(lat); formPinLng = parseFloat(lng);
    nominatimFetch('https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lng + '&format=json')
      .then(function(r){ return r.json(); })
      .then(function(d) {
        var name = diaryReverseGeocodeLabel(d, lat, lng);
        document.getElementById('f-location').value = name;
        showPinnedStrip(name, parseFloat(lat), parseFloat(lng));
        showToast('📍 ' + name);
      }).catch(function() {
        document.getElementById('f-location').value = lat + ', ' + lng;
        showPinnedStrip(lat + ', ' + lng, parseFloat(lat), parseFloat(lng));
      });
  }, function() { showToast('Could not get location'); });
}

async function saveEntry() {
  if (!formSpecies) { showToast('⚠️ Please select a species'); return; }
  if (!formSex)     { showToast('⚠️ Please select sex'); return; }
  if (!sb)          { showToast('⚠️ Supabase not configured'); return; }
  var btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.innerHTML = diaryCloudSaveInner('Saving…');
  var selectedGround = getGroundValue();
  var selectedSyndicate = getSyndicateAttributionValue();
  var wtRaw = parseFloat(document.getElementById('f-wt').value);
  var distRaw = parseInt(document.getElementById('f-dist').value, 10);
  var wtVal = Number.isFinite(wtRaw) ? Math.max(0, wtRaw) : null;
  var distVal = Number.isFinite(distRaw) ? Math.max(0, distRaw) : null;
  if (!(await validateSyndicateAttributionGround(selectedSyndicate, selectedGround))) {
    btn.disabled = false;
    btn.innerHTML = diaryCloudSaveInner('Save to Cloud');
    return;
  }

  // Collect abnormality selections once so we can reuse across offline/online
  // payloads without scraping the DOM twice. Null-vs-[] distinction matters
  // (see getAbnormalityValues() comment) so we keep the object as-is.
  var _abnorm = getAbnormalityValues();

  // ── Offline check — queue locally if no connection ──
  if (!navigator.onLine && !editingId) {
    var offlinePayload = {
      species:         formSpecies,
      sex:             formSex,
      date:            document.getElementById('f-date').value,
      time:            document.getElementById('f-time').value,
      location_name:   document.getElementById('f-location').value,
      lat:             formPinLat || lastGpsLat || null,
      lng:             formPinLng || lastGpsLng || null,
      weight_kg:       wtVal,
      calibre:         getCalibreValue(),
      distance_m:      distVal,
      shot_placement:  getPlacementValue(),
      age_class:       document.getElementById('f-age').value,
      notes:           document.getElementById('f-notes').value,
      shooter:         document.getElementById('f-shooter').value.trim() || 'Self',
      ground:          selectedGround,
      syndicate_id:    selectedSyndicate,
      destination:     document.getElementById('f-destination').value || null,
      tag_number:      document.getElementById('f-tag').value.trim() || null,
      abnormalities:       _abnorm.abnormalities,
      abnormalities_other: _abnorm.abnormalities_other,
      _photoDataUrl:   null,
      _existingPhotoUrl: (function() {
        if (!photoPreviewUrl || photoPreviewUrl.indexOf('blob:') === 0) return null;
        var p = cullPhotoStoragePath(photoPreviewUrl);
        if (p) return p;
        return photoPreviewUrl.indexOf('http') === 0 ? photoPreviewUrl : null;
      })(),
    };
    if (photoFile) {
      try {
        offlinePayload._photoDataUrl = await fileToDataUrl(photoFile);
      } catch (fe) {
        showToast('⚠️ Could not read photo for offline save');
        btn.disabled = false;
        btn.innerHTML = diaryCloudSaveInner('Save to Cloud');
        return;
      }
    }
    await queueOfflineEntry(offlinePayload);
    formDirty = false;
    btn.disabled = false;
    btn.innerHTML = diaryCloudSaveInner('Save to Cloud');
    return;
  }

  try {
    var payload = {
      user_id:         currentUser.id,
      species:         formSpecies,
      sex:             formSex,
      date:            document.getElementById('f-date').value,
      time:            document.getElementById('f-time').value,
      location_name:   document.getElementById('f-location').value,
      lat:             formPinLat || lastGpsLat || null,
      lng:             formPinLng || lastGpsLng || null,
      weight_kg:       wtVal,
      calibre:         getCalibreValue(),
      distance_m:      distVal,
      shot_placement:  getPlacementValue(),
      age_class:       document.getElementById('f-age').value,
      notes:           document.getElementById('f-notes').value,
      shooter:         document.getElementById('f-shooter').value.trim() || 'Self',
      ground:          selectedGround,
      syndicate_id:    selectedSyndicate,
      destination:     document.getElementById('f-destination').value || null,
      tag_number:      document.getElementById('f-tag').value.trim() || null,
      abnormalities:       _abnorm.abnormalities,
      abnormalities_other: _abnorm.abnormalities_other,
    };
    if (photoFile) {
      try {
        var path = newCullPhotoPath(currentUser.id);
        var upload = await sb.storage.from('cull-photos').upload(path, photoFile, {
          upsert: true,
          contentType: 'image/jpeg'
        });
        if (upload.error) {
          flDebugLog('error', 'Photo upload error', upload.error);
          showToast('⚠️ Photo upload failed: ' + (upload.error.message || 'Check storage policies'));
        } else {
          payload.photo_url = path;
          showToast('📷 Photo uploaded');
        }
      } catch(uploadErr) {
        showToast('⚠️ Photo upload error — entry saved without photo');
        flDebugLog('error', 'Upload exception', uploadErr);
      }
    } else if (photoPreviewUrl) {
      var keepPath = cullPhotoStoragePath(photoPreviewUrl);
      if (keepPath) payload.photo_url = keepPath;
    } else if (!photoPreviewUrl) {
      payload.photo_url = null; // removed
    }

    var result;
    if (editingId) {
      // Belt-and-braces: RLS already blocks cross-user writes, but the explicit
      // user_id filter means a misconfigured/missing policy fails closed
      // (matches 0 rows → returns no error but no rows updated) rather than
      // exposing another user's row if the migration ever regresses.
      result = await sb.from('cull_entries')
        .update(payload)
        .eq('id', editingId)
        .eq('user_id', currentUser.id);
    } else {
      result = await sb.from('cull_entries').insert(payload).select('id');
    }
    if (result.error) throw result.error;

    // Keep the season-dropdown cache fresh so a backdated entry grows the
    // dropdown without a full re-probe on the next loadEntries() call.
    if (payload && payload.date) extendSeasonCacheForDate(payload.date);
    // Bubble the saved calibre to the top of the per-user presets so the
    // next new-entry form shows it as a one-tap chip.
    if (payload && payload.calibre) rememberCalibrePreset(payload.calibre);

    // Orphan-photo cleanup: if this was an edit that replaced or removed the
    // original photo, delete the old storage object. Best-effort only — a
    // failure here doesn't roll back the save, just leaves one orphan behind.
    // Skipped when the payload didn't touch `photo_url` (upload-failed branch
    // above) because the DB still points at the original.
    if (editingId && editingOriginalPhotoPath && Object.prototype.hasOwnProperty.call(payload, 'photo_url')) {
      if (payload.photo_url !== editingOriginalPhotoPath) {
        try {
          await sb.storage.from('cull-photos').remove([editingOriginalPhotoPath]);
        } catch (_) { /* non-fatal — manual cleanup path still exists via delete */ }
      }
    }
    editingOriginalPhotoPath = null;

    showToast(editingId ? '✅ Entry updated' : '✅ Entry saved');
    flHapticSuccess();
    formDirty = false;
    // Save new ground name if not already in list
    var gVal = getGroundValue();
    if (gVal) saveGround(gVal);
    await loadEntries();
    go('v-list');

    // Silently fetch and attach weather in background (last 7 days only).
    // Previously fell back to "most recent row for this user" when the insert
    // did not return an id — but during concurrent offline-sync drain that
    // could attach the current form's weather to someone else's (newer) row.
    // Better to skip weather than guess wrong; a later edit can re-fetch.
    var savedId = editingId || (result.data && result.data[0] && result.data[0].id) || null;
    if (savedId && payload.date) {
      // Use this form's selected pin first; never reuse quick-entry coords here.
      var wxLat = numOrNull(formPinLat);
      var wxLng = numOrNull(formPinLng);
      if (wxLat == null || wxLng == null) {
        wxLat = numOrNull(lastGpsLat);
        wxLng = numOrNull(lastGpsLng);
      }
      if ((wxLat == null || wxLng == null) && payload.location_name) {
        var coordMatch = payload.location_name.match(/^(-?[\d.]+),\s*(-?[\d.]+)$/);
        if (coordMatch) { wxLat = numOrNull(parseFloat(coordMatch[1])); wxLng = numOrNull(parseFloat(coordMatch[2])); }
      }
      if (wxLat != null && wxLng != null) {
        attachWeatherToEntry(savedId, payload.date, payload.time, wxLat, wxLng);
      }
    }
  } catch(e) {
    showToast('⚠️ Save failed: ' + (e.message || 'Unknown error'));
    flHapticError();
  }
  btn.disabled = false;
  btn.innerHTML = diaryCloudSaveInner('Save to Cloud');
}

// Currently-pending id for the themed delete-entry confirm modal.
// We don't store the full entry — the list may refresh under us — just the id,
// and re-resolve against `allEntries` at confirm time.
var pendingDeleteEntryId = null;

function deleteEntry(id) {
  if (!id) return;
  pendingDeleteEntryId = id;
  var e = allEntries.find(function(x){ return x.id === id; });
  var modal = document.getElementById('delete-entry-modal');
  var summary = document.getElementById('del-entry-summary');
  if (summary) {
    if (e) {
      var parts = [];
      if (e.species) parts.push('<span class="del-sp">' + esc(e.species) + '</span>');
      var sl = sexLabel(e.sex, e.species);
      if (sl) parts.push(esc(sl));
      if (e.date) parts.push(esc(fmtDate(e.date)));
      if (e.location_name) parts.push(esc(e.location_name));
      summary.innerHTML = parts.join(' · ');
    } else {
      summary.textContent = '';
    }
  }
  if (modal) modal.style.display = 'flex';
}

function closeDeleteEntryModal() {
  pendingDeleteEntryId = null;
  var modal = document.getElementById('delete-entry-modal');
  if (modal) modal.style.display = 'none';
}

async function confirmDeleteEntry() {
  var id = pendingDeleteEntryId;
  if (!id) { closeDeleteEntryModal(); return; }
  // Disable the button to prevent double-tap on slow connections.
  var btn = document.getElementById('delete-entry-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }
  try {
    var entry = allEntries.find(function(e){ return e.id === id; });
    // Delete photo from storage first if it exists.
    if (entry && entry.photo_url && sb) {
      try {
        var sp = cullPhotoStoragePath(entry.photo_url);
        if (sp) await sb.storage.from('cull-photos').remove([sp]);
      } catch (e) { /* non-fatal */ }
    }
    // Belt-and-braces user_id filter (see the saveEntry UPDATE for rationale).
    var r = await sb.from('cull_entries').delete().eq('id', id).eq('user_id', currentUser.id);
    if (!r.error) {
      // The deleted row might have been the sole entry in the earliest
      // season, so invalidate the cache and force loadEntries() to re-probe.
      // One LIMIT-1 query is cheap; a stale dropdown reading from months of
      // a now-empty season is not.
      invalidateSeasonCache();
      showToast('🗑 Entry deleted');
      closeDeleteEntryModal();
      await loadEntries();
      go('v-list');
    } else {
      showToast('⚠️ Could not delete');
      flHapticError();
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Delete entry'; }
  }
}

// ════════════════════════════════════
// STATS
// ════════════════════════════════════
/** Shared empty state for chart areas (keeps copy consistent). */
function statsChartEmpty(message) {
  return '<div class="stats-empty">' + esc(message || 'No data for this season') + '</div>';
}

function initStatsMoreSection() {
  var wrap = document.getElementById('stats-more-wrap');
  var btn = document.getElementById('stats-more-toggle');
  var body = document.getElementById('stats-more-body');
  if (!wrap || !btn || !body) return;
  function apply(opened) {
    wrap.classList.toggle('open', opened);
    btn.setAttribute('aria-expanded', opened ? 'true' : 'false');
    btn.setAttribute('aria-label', opened ? 'Hide charts and breakdowns' : 'Show charts and breakdowns');
    body.hidden = !opened;
    var cta = document.getElementById('stats-more-cta');
    if (cta) cta.textContent = opened ? 'Tap to hide' : 'Tap to show';
    try {
      localStorage.setItem('fl-stats-more', opened ? '1' : '0');
    } catch (e) { /* private mode */ }
  }
  apply(true); // Always default open on load for quicker stats scanning
  btn.addEventListener('click', function() {
    apply(!wrap.classList.contains('open'));
  });
}

function initPlanCollapse() {
  function bind(sectionId, btnId, bodyId, ctaId, storageKey, defaultOpen, a11yLabel, toggleId) {
    var section = document.getElementById(sectionId);
    var btn = document.getElementById(btnId);
    var body = document.getElementById(bodyId);
    var toggle = document.getElementById(toggleId);
    if (!section || !btn || !body) return;
    function apply(opened) {
      section.classList.toggle('open', opened);
      body.hidden = !opened;
      if (toggle) toggle.setAttribute('aria-expanded', opened ? 'true' : 'false');
      btn.setAttribute('aria-expanded', opened ? 'true' : 'false');
      btn.setAttribute('aria-label', (opened ? 'Hide ' : 'Show ') + a11yLabel);
      var cta = document.getElementById(ctaId);
      if (cta) cta.textContent = opened ? 'Tap to hide' : 'Tap to show';
      try {
        localStorage.setItem(storageKey, opened ? '1' : '0');
      } catch (e) { /* private mode */ }
    }
    var stored = null;
    try {
      stored = localStorage.getItem(storageKey);
    } catch (e) { /* ignore */ }
    apply(stored === null ? !!defaultOpen : stored === '1');
    btn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      apply(!section.classList.contains('open'));
    });
    if (toggle) {
      toggle.addEventListener('click', function() {
        apply(!section.classList.contains('open'));
      });
      toggle.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          apply(!section.classList.contains('open'));
        }
      });
    }
  }
  bind('plan-card', 'plan-collapse-btn', 'plan-fold', 'plan-more-cta', 'fl-plan-open', false, 'season plan', 'plan-toggle');
  bind('syndicate-card-outer', 'syndicate-collapse-btn', 'syndicate-fold', 'syndicate-more-cta', 'fl-syndicate-open', false, 'syndicates', 'syndicate-toggle');
}

/**
 * Compute the Season target KPI using the same resolution rules as the Season Plan
 * "Overview" total: prefer season-wide `cullTargets` when any are set; otherwise fall
 * back to the aggregate of per-ground `groundTargets` (including `__unassigned__`).
 * Returns {targetTotal, targetPct, targetRemaining, targetOver}.
 */
function computeSeasonTargetKpi(totalActual) {
  var out = {
    targetTotal: 0,
    targetPct: null,
    targetRemaining: 0,
    targetOver: 0,
    /**
     * paceState: 'pre' | 'on' | 'ahead' | 'behind' | 'final-met' | 'final-over' | 'final-short' | null
     * paceDelta: integer (number of carcasses ahead/behind the linear trajectory, or over/short at final)
     * paceDaysToStart: when paceState === 'pre', days until season opens (inclusive)
     */
    paceState: null,
    paceDelta: 0,
    paceDaysToStart: 0
  };
  if (currentSeason === '__all__') return out;
  var effective = cullTargets || {};
  var hasSeasonT = Object.keys(effective).some(function(k) { return (parseInt(effective[k], 10) || 0) > 0; });
  if (!hasSeasonT && typeof sumGroundTargetsAgg === 'function') {
    var agg = sumGroundTargetsAgg(groundTargets);
    if (summedGroundTargetsAnyPositive(agg)) effective = agg;
  }
  PLAN_SPECIES.forEach(function(sp) {
    out.targetTotal += (parseInt(effective[sp.name + '-m'], 10) || 0);
    out.targetTotal += (parseInt(effective[sp.name + '-f'], 10) || 0);
  });
  if (out.targetTotal > 0) {
    out.targetPct = Math.round(totalActual * 100 / out.targetTotal);
    out.targetRemaining = Math.max(0, out.targetTotal - totalActual);
    out.targetOver = Math.max(0, totalActual - out.targetTotal);

    // Linear-pace indicator: compares actuals against the "even-paced" trajectory
    // between season open (Aug 1) and close (Jul 31). UK stalking seasons vary by
    // species/sex, but the KPI is an aggregate across all target species so a single
    // season-wide linear baseline is the simplest honest proxy. A stalker culling
    // ahead of linear pace mid-season is almost always genuinely ahead; someone
    // behind may have most of their species' open season still ahead of them, so
    // the wording stays deliberately soft ("ahead of pace" / "behind pace").
    try {
      var d = seasonDates(currentSeason);
      var now = diaryNow();
      var startMs = Date.parse(d.start + 'T00:00:00Z');
      var endMs   = Date.parse(d.end + 'T23:59:59Z');
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
        if (now < startMs) {
          out.paceState = 'pre';
          out.paceDaysToStart = Math.max(1, Math.ceil((startMs - now) / 86400000));
        } else if (now > endMs) {
          if (totalActual >= out.targetTotal) {
            out.paceState = totalActual > out.targetTotal ? 'final-over' : 'final-met';
            out.paceDelta = totalActual - out.targetTotal;
          } else {
            out.paceState = 'final-short';
            out.paceDelta = out.targetTotal - totalActual;
          }
        } else {
          var progress = (now - startMs) / (endMs - startMs);
          if (progress < 0) progress = 0;
          if (progress > 1) progress = 1;
          var expected = out.targetTotal * progress;
          var delta = totalActual - expected;
          var rounded = Math.round(delta);
          out.paceDelta = Math.abs(rounded);
          // Use a 0.5-carcass dead band so we don't flicker between "on pace"
          // and "+1 ahead" as the clock ticks over midnight.
          if (Math.abs(delta) < 0.5) out.paceState = 'on';
          else if (delta > 0) out.paceState = 'ahead';
          else out.paceState = 'behind';
        }
      }
    } catch (e) { /* non-fatal; pace just stays null */ }
  }
  return out;
}

/**
 * Format the "Season target" KPI subtext including the pace indicator.
 * Kept separate from computeSeasonTargetKpi so buildStats() and refreshSeasonTargetKpi()
 * share one formatter and stay in sync.
 */
function formatSeasonTargetSub(totalActual, calc) {
  if (calc.targetTotal <= 0) return 'Set targets to track progress';
  var base = totalActual + '/' + calc.targetTotal + ' target' + (calc.targetTotal === 1 ? '' : 's');
  var pace = '';
  switch (calc.paceState) {
    case 'pre':
      pace = ' · opens in ' + calc.paceDaysToStart + ' day' + (calc.paceDaysToStart === 1 ? '' : 's');
      break;
    case 'on':     pace = ' · on pace'; break;
    case 'ahead':  pace = ' · +' + calc.paceDelta + ' ahead of pace'; break;
    case 'behind': pace = ' · ' + calc.paceDelta + ' behind pace'; break;
    case 'final-met':   pace = ' · target met'; break;
    case 'final-over':  pace = ' · +' + calc.paceDelta + ' over target'; break;
    case 'final-short': pace = ' · ' + calc.paceDelta + ' short of target'; break;
    default:
      // No pace (e.g. clock not ready): fall back to the classic "N left / +N over".
      pace = (calc.targetOver > 0 ? ' · +' + calc.targetOver + ' over' : ' · ' + calc.targetRemaining + ' left');
  }
  return base + pace;
}

/**
 * Re-paint the Season target KPI card. Called after `loadTargets` / `loadGroundTargets`
 * resolve, since `buildStats` writes the initial KPI synchronously before targets load.
 */
function refreshSeasonTargetKpi() {
  // Mirror whatever count is currently displayed in the Total cull KPI (honours any
  // active species chip filter) so the two cards stay in agreement.
  var totalEl = document.getElementById('st-total');
  var total = totalEl ? (parseInt(totalEl.textContent, 10) || 0) : (allEntries ? allEntries.length : 0);
  var calc = computeSeasonTargetKpi(total);
  var tEl = document.getElementById('st-target');
  var tSub = document.getElementById('st-target-sub');
  if (tEl) tEl.textContent = calc.targetPct == null ? '–' : (calc.targetPct + '%');
  if (tSub) tSub.textContent = formatSeasonTargetSub(total, calc);
}

function buildStats(speciesFilter) {
  // Schedule map init FIRST so the map/satellite/fullscreen controls always get wired,
  // even if a later DOM write in this function throws (e.g. transient HTML/JS cache skew
  // after a deploy). Previously this setTimeout sat at the end of buildStats and any
  // throw above it left cullMap === null → all map toggles silently no-op.
  setTimeout(function() {
    try {
      initCullMap();
      renderCullMapPins();
      var _sub = document.getElementById('cullmap-sub');
      if (_sub) _sub.textContent = 'Location history · ' + currentSeason;
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) console.warn('initCullMap failed:', e);
    }
  }, 0);

  // Sync stats season pill with list season dropdown
  var statsSel = document.getElementById('season-select-stats');
  var listSel  = document.getElementById('season-select');
  if (statsSel && listSel) {
    statsSel.innerHTML = listSel.innerHTML;
    statsSel.value = currentSeason;
  }
  if (currentSeason === '__all__') {
    var planCard = document.getElementById('plan-card');
    if (planCard) planCard.style.display = 'none';
    var _ssl0 = document.getElementById('stats-season-lbl');
    if (_ssl0) _ssl0.textContent = 'All Seasons';
  } else {
    var planCard2 = document.getElementById('plan-card');
    if (planCard2) planCard2.style.display = '';
    Promise.all([loadTargets(currentSeason), loadGroundTargets(currentSeason)]).then(function() {
      loadPrevTargets(currentSeason);
      renderPlanGroundFilter();
      renderPlanCard(allEntries, currentSeason);
      // Targets now loaded — refresh the Season target KPI so it reflects the actual
      // cullTargets / groundTargets (buildStats first computed it with empty targets).
      refreshSeasonTargetKpi();
      return renderSyndicateSection();
    }).then(function() {
      void updateSyndicateExportVisibility();
    });
    var d = seasonDates(currentSeason);
    var parts = currentSeason.split('-');
    var y1 = parts[0];
    var y2 = parts[1].length === 2 ? '20' + parts[1] : parts[1];
    var startDate = new Date(d.start);
    var endDate = new Date(d.end);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var seasonDateStr = months[startDate.getMonth()] + ' ' + startDate.getFullYear()
      + ' – ' + months[endDate.getMonth()] + ' ' + endDate.getFullYear();
    var _ssl1 = document.getElementById('stats-season-lbl');
    if (_ssl1) _ssl1.textContent = y1 + '–' + y2 + ' · ' + seasonDateStr;
  }

  var entries = speciesFilter ? allEntries.filter(function(e){ return e.species === speciesFilter; }) : allEntries;
  var total = entries.length;
  var kg = entries.reduce(function(s,e){ return s + (parseFloat(e.weight_kg)||0); }, 0);
  var mappedCount = entries.filter(function(e){ return e.lat != null && e.lng != null; }).length;
  var mappedPct = total ? Math.round(mappedCount * 100 / total) : 0;
  var speciesCount = new Set(entries.map(function(e){ return e.species; }).filter(Boolean)).size;
  var weightEntries = entries.filter(function(e){ return hasValue(e.weight_kg); });
  var avgWeight = weightEntries.length ? (kg / weightEntries.length) : 0;
  var distEntries = entries.filter(function(e){ return hasValue(e.distance_m) && parseFloat(e.distance_m) > 0; });
  var avgDist = distEntries.length ? Math.round(distEntries.reduce(function(s, e){ return s + parseFloat(e.distance_m); }, 0) / distEntries.length) : null;
  var maxE = weightEntries.reduce(function(m,e){
    if (!m) return e;
    return parseFloat(e.weight_kg) > parseFloat(m.weight_kg) ? e : m;
  }, null);
  var targetCalc = computeSeasonTargetKpi(total);
  var targetPct = targetCalc.targetPct;
  // Null-safe DOM writes: if the cached HTML is an older version missing any of these IDs
  // (e.g. service worker served a stale diary.html against the latest diary.js), we must not
  // throw here — doing so would abort buildStats() before initCullMap() is scheduled, leaving
  // the map/satellite toggle and fullscreen button silently inert.
  function _setText(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; }
  function _setHtml(id, val) { var el = document.getElementById(id); if (el) el.innerHTML = val; }
  _setText('st-total', total);
  _setText('st-total-sub', 'Mapped ' + mappedCount + '/' + total + ' · ' + mappedPct + '%');
  _setText('st-target', targetPct == null ? '–' : (targetPct + '%'));
  _setText('st-target-sub', formatSeasonTargetSub(total, targetCalc));
  _setText('st-dist', avgDist == null ? '–' : String(avgDist) + 'm');
  _setText('st-dist-sub', distEntries.length > 0
    ? (distEntries.length + ' entr' + (distEntries.length === 1 ? 'y' : 'ies') + ' with distance')
    : 'No shot distances recorded');
  _setText('st-species', speciesCount);

  var weightMeta = maxE ? (esc(maxE.species || '') + (maxE.date ? ' · ' + esc(String(maxE.date).slice(0, 7)) : '')) : 'No carcass weights recorded yet';
  _setHtml('weight-chart',
    '<div class="range-grid">'
      + '<div class="range-cell"><div class="range-band">Total kg</div><div class="range-cnt">' + Math.round(kg) + '</div><div class="range-pct">all recorded entries</div></div>'
      + '<div class="range-cell"><div class="range-band">Average kg</div><div class="range-cnt">' + (weightEntries.length ? avgWeight.toFixed(1) : '–') + '</div><div class="range-pct">' + weightEntries.length + ' weighted entr' + (weightEntries.length === 1 ? 'y' : 'ies') + '</div></div>'
      + '<div class="range-cell"><div class="range-band">Heaviest</div><div class="range-cnt">' + (maxE ? esc(String(maxE.weight_kg)) : '–') + '</div><div class="range-pct">' + weightMeta + '</div></div>'
      + '<div class="range-cell"><div class="range-band">Missing weight</div><div class="range-cnt">' + Math.max(0, total - weightEntries.length) + '</div><div class="range-pct">entries without carcass kg</div></div>'
    + '</div>');

  // Species chart with sex breakdown
  var spCount = {}, spMale = {}, spFemale = {};
  entries.forEach(function(e){
    spCount[e.species]  = (spCount[e.species]||0)+1;
    if (e.sex==='m') spMale[e.species]   = (spMale[e.species]||0)+1;
    else             spFemale[e.species] = (spFemale[e.species]||0)+1;
  });
  var spMax = Math.max.apply(null, Object.values(spCount).concat([1]));
  var spColors = {'Red Deer':'#c8a84b','Roe Deer':'#5a7a30','Fallow':'#f57f17','Sika':'#1565c0','Muntjac':'#6a1b9a','CWD':'#00695c'};
  var spMaleLabels = {'Red Deer':'Stag','Roe Deer':'Buck','Fallow':'Buck','Sika':'Stag','Muntjac':'Buck','CWD':'Buck'};
  var spFemLabels  = {'Red Deer':'Hind','Roe Deer':'Doe','Fallow':'Doe','Sika':'Hind','Muntjac':'Doe','CWD':'Doe'};
  var spHtml = Object.keys(spCount).sort(function(a,b){ return spCount[b]-spCount[a]; }).map(function(sp) {
    var clr = spColors[sp]||'#5a7a30';
    var mCnt = spMale[sp]||0, fCnt = spFemale[sp]||0;
    var mLbl = spMaleLabels[sp]||'Male', fLbl = spFemLabels[sp]||'Female';
    var html = '<div class="bar-row" style="margin-bottom:4px;">'
      + '<div class="bar-lbl" style="font-size:12px;font-weight:700;">' + sp + '</div>'
      + '<div class="bar-track"><div class="bar-fill" style="width:' + (spCount[sp]/spMax*100) + '%;background:' + clr + ';"></div></div>'
      + '<div class="bar-cnt">' + spCount[sp] + '</div></div>';
    // Sex sub-rows
    if (mCnt > 0) html += '<div class="bar-row" style="padding-left:12px;margin-bottom:3px;">'
      + '<div class="bar-lbl" style="font-size:10px;color:var(--muted);">♂ ' + mLbl + '</div>'
      + '<div class="bar-track" style="height:4px;"><div class="bar-fill" style="width:' + (mCnt/spCount[sp]*100) + '%;background:rgba(191,54,12,0.55);"></div></div>'
      + '<div class="bar-cnt" style="font-size:10px;color:var(--muted);">' + mCnt + '</div></div>';
    if (fCnt > 0) html += '<div class="bar-row" style="padding-left:12px;margin-bottom:8px;">'
      + '<div class="bar-lbl" style="font-size:10px;color:var(--muted);">♀ ' + fLbl + '</div>'
      + '<div class="bar-track" style="height:4px;"><div class="bar-fill" style="width:' + (fCnt/spCount[sp]*100) + '%;background:rgba(136,14,79,0.55);"></div></div>'
      + '<div class="bar-cnt" style="font-size:10px;color:var(--muted);">' + fCnt + '</div></div>';
    return html;
  }).join('');
  _setHtml('species-chart', spHtml || statsChartEmpty('No culls this season'));

  // Sex chart
  var mCount = entries.filter(function(e){ return e.sex === 'm'; }).length;
  var fCount = entries.filter(function(e){ return e.sex === 'f'; }).length;
  var sexMax = Math.max(mCount, fCount, 1);
  _setHtml('sex-chart',
    '<div class="bar-row"><div class="bar-lbl">♂ Male</div><div class="bar-track"><div class="bar-fill" style="width:' + (mCount/sexMax*100) + '%;background:rgba(191,54,12,0.75);"></div></div><div class="bar-cnt">' + mCount + '</div></div>' +
    '<div class="bar-row"><div class="bar-lbl">♀ Female</div><div class="bar-track"><div class="bar-fill" style="width:' + (fCount/sexMax*100) + '%;background:rgba(136,14,79,0.75);"></div></div><div class="bar-cnt">' + fCount + '</div></div>');

  // Calibre, distance, age & ground stats
  buildCalibreDistanceStats(entries);
  buildAgeStats(entries);
  buildShooterStats(entries);
  buildDestinationStats(entries);
  buildTimeOfDayStats(entries);
  buildTrendsChart(entries);
  buildGroundStats(entries);

  // Cull map init is scheduled at the top of buildStats (see comment there).

  // Monthly chart
  var mCount2 = {};
  entries.forEach(function(e) {
    if (!e.date) return;
    var dp = String(e.date).trim().split('-');
    var m = parseInt(dp[1], 10);
    if (!Number.isFinite(m) || m < 1 || m > 12) return;
    mCount2[m] = (mCount2[m] || 0) + 1;
  });
  var mMax = Math.max.apply(null, Object.values(mCount2).concat([1]));
  var seasonMonths = [8,9,10,11,12,1,2,3,4,5,6,7];
  var mHtml = seasonMonths.map(function(m) {
    var cnt = mCount2[m]||0;
    var h = cnt ? Math.max(6, Math.round(cnt/mMax*60)) : 3;
    var cls = cnt ? (cnt === Math.max.apply(null, Object.values(mCount2)) ? 'mc-bar pk' : 'mc-bar on') : 'mc-bar';
    return '<div class="mc-col"><div class="' + cls + '" style="height:' + h + 'px;' + (cnt ? '' : 'opacity:0.4;') + '"></div><div class="mc-lbl">' + MONTH_NAMES[m-1] + '</div></div>';
  }).join('');
  _setHtml('month-chart', mHtml);

  statsNeedsFullRebuild = false;
  statsLastBuildSize = allEntries.length;
}

// ════════════════════════════════════
// EXPORT
// ════════════════════════════════════
// ════════════════════════════════════
// DELETE ACCOUNT
// ════════════════════════════════════
function confirmDeleteAccount() {
  document.getElementById('delete-confirm-input').value = '';
  document.getElementById('delete-confirm-btn').disabled = true;
  document.getElementById('delete-account-modal').style.display = 'flex';
}

function closeDeleteModal() {
  document.getElementById('delete-account-modal').style.display = 'none';
}

function checkDeleteInput() {
  var val = document.getElementById('delete-confirm-input').value;
  var btn = document.getElementById('delete-confirm-btn');
  var ready = val === 'DELETE';
  btn.disabled = !ready;
}

async function deleteAccount() {
  if (!sb || !currentUser) return;
  var btn = document.getElementById('delete-confirm-btn');
  btn.textContent = 'Deleting…';
  btn.disabled = true;

  try {
    // 1. Delete all photos from storage
    showToast('🗑 Deleting photos…');
    var photos = await sb.from('cull_entries')
      .select('photo_url')
      .eq('user_id', currentUser.id)
      .not('photo_url', 'is', null);

    if (photos.data && photos.data.length > 0) {
      var paths = photos.data
        .filter(function(e) { return e.photo_url; })
        .map(function(e) { return cullPhotoStoragePath(e.photo_url); })
        .filter(Boolean);
      if (paths.length > 0) {
        await sb.storage.from('cull-photos').remove(paths);
      }
    }

    // 2. Anonymised syndicate tallies (species / sex / date only) — must run before cull_entries delete
    showToast('🗑 Saving syndicate totals…');
    var retainRes = await sb.rpc('retain_syndicate_anonymous_culls');
    if (retainRes.error && typeof console !== 'undefined' && console.warn) {
      console.warn('retain_syndicate_anonymous_culls:', retainRes.error.message || retainRes.error);
    }

    // 3. Delete all entries
    showToast('🗑 Deleting records…');
    await sb.from('cull_entries').delete().eq('user_id', currentUser.id);

    // 4. Delete the auth account via custom RPC
    // Requires 'delete_user' function in Supabase (calls auth.users delete internally)
    showToast('🗑 Deleting account…');
    var rpcResult = await sb.rpc('delete_user');
    if (rpcResult.error) {
      // RPC may not exist — sign out and inform user to contact support
      await sb.auth.signOut();
      destroyCullMapLeaflet();
      showToast('⚠️ Entries deleted. Contact support to remove auth account.');
      setTimeout(function() { go('v-auth'); }, 3000);
      return;
    }

    // 5. Sign out and redirect
    await sb.auth.signOut();
    destroyCullMapLeaflet();
    closeDeleteModal();
    showToast('✅ Account deleted. Goodbye.');
    setTimeout(function() { go('v-auth'); }, 2000);

  } catch(e) {
    // Fallback — sign out even if delete fails
    showToast('⚠️ ' + (e.message || 'Could not fully delete. Contact support.'));
    btn.textContent = 'Delete everything';
    btn.disabled = false;
  }
}
var exportFormat = 'csv';

async function openExportModal(format) {
  exportFormat = format;
  document.getElementById('export-modal-title').textContent = format === 'csv' ? 'Export CSV' : 'Export PDF';
  document.getElementById('export-season-lbl').textContent = seasonLabel(currentSeason);
  document.getElementById('export-season-count').textContent = allEntries.length + ' entries';

  // Fetch total all-entries count
  if (sb && currentUser) {
    try {
      var all = await sb.from('cull_entries').select('id', { count: 'exact' }).eq('user_id', currentUser.id);
      var total = all.count || 0;
      document.getElementById('export-all-count').textContent = total + ' entries across all seasons';
    } catch(e) {
      document.getElementById('export-all-count').textContent = '– entries across all seasons';
    }
  }

  var modal = document.getElementById('export-modal');
  modal.style.display = 'flex';
}

function closeExportModal() {
  document.getElementById('export-modal').style.display = 'none';
}

async function doExport(scope) {
  closeExportModal();
  if (scope === 'season') {
    if (exportFormat === 'csv') exportCSV();
    else exportPDF();
  } else {
    if (!sb || !currentUser) {
      showToast('⚠️ Sign in to export');
      return;
    }
    // Fetch ALL entries across all seasons.
    // Columns are the union of what exportCSVData() and exportPDFData()
    // actually read — we deliberately omit the big ones (weather_data
    // JSONB, photo_url, abnormalities, lat/lng, created_at) because
    // neither "all seasons" CSV nor the simple PDF surfaces them. Saves
    // several KB per row on large archives and keeps the query snappy.
    showToast('⏳ Fetching all entries…');
    try {
      var r = await sb.from('cull_entries')
        .select('date, time, species, sex, location_name, ground, weight_kg, tag_number, calibre, distance_m, shot_placement, age_class, shooter, destination, notes')
        .eq('user_id', currentUser.id)
        .order('date', { ascending: false });
      if (r.error || !r.data.length) { showToast('⚠️ No entries found'); return; }
      var allData = r.data;
      if (exportFormat === 'csv') exportCSVData(allData, 'all-seasons');
      else exportPDFData(allData, 'All Seasons');
    } catch(e) {
      showToast('⚠️ Export failed — ' + (e.message || 'network error'));
    }
  }
}

function exportCSV() {
  if (!allEntries.length) { showToast('⚠️ No entries to export'); return; }
  exportCSVData(allEntries, currentSeason);
}

function exportCSVData(entries, label) {
  var headers = ['Date','Time','Species','Sex','Location','Ground','Weight(kg)','Tag','Calibre','Distance(m)','Placement','Age class','Shooter','Destination','Notes'];
  var rows = entries.map(function(e) {
    return [
      csvField(e.date), csvField(e.time), csvField(e.species),
      csvField(sexLabel(e.sex, e.species)), csvField(e.location_name), csvField(e.ground||''),
      csvField(e.weight_kg), csvField(e.tag_number||''),
      csvField(e.calibre), csvField(e.distance_m), csvField(e.shot_placement),
      csvField(e.age_class), csvField(e.shooter||'Self'), csvField(e.destination||''), csvField(e.notes)
    ].join(',');
  });
  triggerCsvDownload([headers.join(',')].concat(rows), 'cull-diary-' + label + '.csv');
  showToast('✅ CSV downloaded — ' + entries.length + ' entries');
}

/**
 * Shared CSV builder used by every CSV export in the app.
 *   - UTF-8 BOM (\uFEFF) so Excel on Windows detects UTF-8 and doesn't mangle
 *     accented characters in location names / notes / "Muntjac" etc.
 *   - CRLF line endings — what Excel's CSV parser prefers.
 *   - MIME includes charset=utf-8 so browsers that honour it don't guess latin-1.
 * Pass an array of already-joined row strings (no line ending).
 */
function triggerCsvDownload(rowLines, filename) {
  var csv = '\uFEFF' + rowLines.join('\r\n') + '\r\n';
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  // Let the anchor finish downloading before revoking.
  setTimeout(function() { try { URL.revokeObjectURL(a.href); } catch (_) {} }, 1000);
}

/**
 * CSV field quoter: always quote, escape embedded quotes, flatten CR/LF inside
 * a cell to spaces so Excel doesn't break the row mid-value.
 */
// SPEC: lib/fl-pure.mjs#csvField — RFC-4180 quoting + CR/LF squash. Tests pin this.
function csvField(v) {
  var s = v === null || v === undefined ? '' : String(v);
  return '"' + s.replace(/"/g, '""').replace(/\r\n|\r|\n/g, ' ') + '"';
}

function exportPDF() {
  if (!allEntries.length) { showToast('⚠️ No entries to export'); return; }
  exportPDFData(allEntries, seasonLabel(currentSeason));
}

function exportPDFData(entries, label) {
  // Simple list export (used for all-seasons or fallback)
  var doc = new jspdf.jsPDF();
  doc.setFontSize(18);
  doc.text('Cull Diary - ' + label, 14, 20);
  doc.setFontSize(10);
  doc.text('First Light · firstlightdeer.co.uk · ' + entries.length + ' entries', 14, 28);
  var y = 38;
  entries.forEach(function(e, i) {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.text((i+1) + '. ' + e.species + ' (' + sexLabel(e.sex, e.species) + ') - ' + (fmtDate(e.date) || '—'), 14, y);
    y += 6;
    doc.setFontSize(9);
    var meta = [];
    if (e.location_name) meta.push('Location: ' + e.location_name);
    if (e.weight_kg) meta.push('Weight: ' + e.weight_kg + 'kg');
    if (e.tag_number) meta.push('Tag: ' + e.tag_number);
    if (e.calibre) meta.push('Calibre: ' + e.calibre);
    if (e.distance_m) meta.push('Distance: ' + e.distance_m + 'm');
    if (e.shot_placement) meta.push('Placement: ' + e.shot_placement);
    if (e.destination) meta.push('Destination: ' + e.destination);
    if (meta.length) { doc.text(meta.join(' · '), 14, y); y += 5; }
    if (e.notes) {
      var noteLines = doc.splitTextToSize('Notes: ' + e.notes, 180);
      noteLines.forEach(function(line) {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(line, 14, y); y += 4;
      });
      y += 1;
    }
    y += 4;
    doc.line(14, y, 196, y); y += 5;
  });
  var filename = label === 'All Seasons' ? 'cull-diary-all-seasons' : 'cull-diary-' + currentSeason;
  doc.save(filename + '.pdf');
  showToast('✅ PDF downloaded - ' + entries.length + ' entries');
}

// ── Season Summary PDF ────────────────────────────────────────
// Full formatted report: header, stats, species breakdown,
// cull plan vs actual, complete entries table with pagination
function exportSeasonSummary() {
  var entries = allEntries;
  if (!entries.length) { showToast('⚠️ No entries to export'); return; }

  // A4 landscape (was portrait). Portrait's 559pt usable width couldn't fit the
  // detail columns a deer manager actually needs for end-of-season reporting
  // (Tag, Age class, Destination — required for Reg 853/2004 traceability and
  // BDS/AHDB annual returns). Landscape gives us 806pt, enough for all 13 columns
  // at 7pt without crushing Notes.
  var doc = new jspdf.jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  var PW = 842, PH = 595; // A4 landscape in pt
  var ML = 18, MR = 18;   // left/right margins
  var UW = PW - ML - MR;  // usable width = 806pt

  // ── Colour helpers ──
  function rgb(hex) {
    var r = parseInt(hex.slice(1,3),16)/255;
    var g = parseInt(hex.slice(3,5),16)/255;
    var b = parseInt(hex.slice(5,7),16)/255;
    return [r,g,b];
  }
  var C = {
    deep:   '#0e2a08', forest: '#1a3a0e', moss:   '#5a7a30',
    gold:   '#c8a84b', bark:   '#3d2b1f', muted:  '#a0988a',
    stone:  '#ede9e2', white:  '#ffffff',
    red:    '#c8a84b', roe:    '#5a7a30', fallow: '#f57f17',
    muntjac:'#6a1b9a', sika:   '#1565c0', cwd:    '#00695c',
    male:   '#8b4513', female: '#8b1a4a', done:   '#2d7a1a',
  };
  function setFill(hex)   { var c=rgb(hex); doc.setFillColor(c[0]*255,c[1]*255,c[2]*255); }
  function setStroke(hex) { var c=rgb(hex); doc.setDrawColor(c[0]*255,c[1]*255,c[2]*255); }
  function setFont(hex)   { var c=rgb(hex); doc.setTextColor(c[0]*255,c[1]*255,c[2]*255); }

  function hrule(y, col) {
    setStroke(col||C.stone); doc.setLineWidth(0.3);
    doc.line(0, y, PW, y);
  }

  function newPageIfNeeded(y, needed) {
    if (y + needed > PH - 50) {
      doc.addPage();
      // Mini header on continuation pages (match “All Seasons” vs single season)
      setFill(C.deep); doc.rect(0, 0, PW, 24, 'F');
      setFont(C.gold); doc.setFontSize(7); doc.setFont(undefined,'bold');
      var hdrSeason = window._summarySeasonLabel
        ? String(window._summarySeasonLabel).toUpperCase()
        : String(currentSeason).toUpperCase();
      doc.text('FIRST LIGHT  -  CULL DIARY  -  ' + hdrSeason, ML, 15);
      return 32;
    }
    return y;
  }

  // ── Stats from entries ──
  // Average kg must be divided by entries that ACTUALLY have a recorded weight,
  // not the total entry count — otherwise missing weights pull the average down
  // and the headline figure is misleading (e.g. 104kg across 2 weighed + 3 unweighed
  // entries previously showed "21kg" instead of the correct 52kg per carcass).
  var weighedEntries = entries.filter(function(e){ return hasValue(e.weight_kg); });
  var totalKg  = weighedEntries.reduce(function(s,e){ return s+(parseFloat(e.weight_kg)||0); },0);
  var avgKg    = weighedEntries.length ? Math.round(totalKg / weighedEntries.length) : 0;
  var spSet    = {};
  entries.forEach(function(e){ spSet[e.species]=(spSet[e.species]||0)+1; });
  var spCount  = Object.keys(spSet).length;
  var spColors = { 'Red Deer':C.red,'Roe Deer':C.roe,'Fallow':C.fallow,
                   'Muntjac':C.muntjac,'Sika':C.sika,'CWD':C.cwd };

  // ── Generate display date ──
  function fmtEntryDate(d) {
    if (!d) return '';
    var p = parseEntryDateParts(d);
    if (!p) {
      var s = String(d).trim();
      return s || '—';
    }
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return p.day + ' ' + months[p.m - 1] + ' ' + p.y;
  }
  function fmtEntryTime(t) {
    if (t === null || t === undefined || t === '') return '–';
    var s = String(t).trim();
    return s || '–';
  }

  // ═══════════════════════════════════════
  // PAGE 1
  // ═══════════════════════════════════════
  var y = 0;

  // Header band — HDR_H from stacked lines so URL / generated never overlap
  var now = diaryNow();
  var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var _pdfHm = (function(d){ var p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d); return {h:parseInt(p.find(function(x){return x.type==='hour';}).value),m:parseInt(p.find(function(x){return x.type==='minute';}).value)}; }(now));
  var genDate = now.getDate()+' '+mo[now.getMonth()]+' '+now.getFullYear()+
    '  -  '+('0'+_pdfHm.h).slice(-2)+':'+('0'+_pdfHm.m).slice(-2);
  var hasGr = window._summaryGroundOverride && window._summaryGroundOverride !== 'All Grounds';
  var metaUrlY = hasGr ? 74 : 58;
  var metaGenY = metaUrlY + 13;
  var HDR_H = metaGenY + 16;

  setFill(C.deep); doc.rect(0, 0, PW, HDR_H, 'F');
  setFill(C.forest); doc.rect(0, 0, PW/2, HDR_H, 'F');
  setStroke(C.gold); doc.setLineWidth(1.5);
  doc.line(0, HDR_H, PW, HDR_H);

  setFont(C.gold); doc.setFontSize(7); doc.setFont(undefined,'bold');
  doc.text('FIRST LIGHT  -  CULL DIARY', ML, 18);
  setFont(C.white); doc.setFontSize(22); doc.setFont(undefined,'bold');
  var pdfSeasonTitle = (window._summarySeasonLabel || (currentSeason + ' Season Report'));
  doc.text(pdfSeasonTitle, ML, 42);
  if (hasGr) {
    setFont(C.gold); doc.setFontSize(9); doc.setFont(undefined,'bold');
    doc.text('Ground: ' + window._summaryGroundOverride, ML, 58);
  }
  setFont('#aaaaaa'); doc.setFontSize(10); doc.setFont(undefined,'normal');
  doc.text('firstlightdeer.co.uk', ML, metaUrlY);
  setFont(C.gold); doc.setFontSize(7); doc.setFont(undefined,'normal');
  doc.text('Generated '+genDate, ML, metaGenY);

  y = HDR_H;

  // Stats row
  var STAT_H = 46, cw = PW/4;
  var statData = [
    [String(entries.length), 'Total Cull'],
    [String(spCount),        'Species'],
    [String(Math.round(totalKg)), 'Total kg'],
    [avgKg ? String(avgKg)+'kg' : '–', 'Avg kg' + (weighedEntries.length && weighedEntries.length < entries.length ? ' (of ' + weighedEntries.length + ')' : '')],
  ];
  statData.forEach(function(s, i) {
    var x = i*cw;
    setFill(i%2===0 ? C.white : '#faf8f5'); doc.rect(x, y, cw, STAT_H, 'F');
    if (i>0) { setStroke(C.stone); doc.setLineWidth(0.5); doc.line(x,y,x,y+STAT_H); }
    setFont(C.bark); doc.setFontSize(20); doc.setFont(undefined,'bold');
    doc.text(s[0], x+cw/2, y+22, {align:'center'});
    setFont(C.muted); doc.setFontSize(7); doc.setFont(undefined,'bold');
    doc.text(s[1].toUpperCase(), x+cw/2, y+35, {align:'center'});
  });
  hrule(y+STAT_H, C.stone);
  y += STAT_H;

  // ── Section header helper ──
  function secHdr(y, title) {
    setFill('#f0ece6'); doc.rect(0, y, PW, 18, 'F');
    setStroke(C.stone); doc.setLineWidth(0.5); doc.line(0,y+18,PW,y+18);
    setFont(C.moss); doc.setFontSize(7); doc.setFont(undefined,'bold');
    doc.text(title.toUpperCase(), ML, y+11);
    return y+18;
  }

  // ── Species breakdown ──
  y = secHdr(y, 'Species Breakdown');
  var spSorted = Object.keys(spSet).sort(function(a,b){ return spSet[b]-spSet[a]; });
  var spMax = Math.max.apply(null, spSorted.map(function(k){ return spSet[k]; }));
  var totalWtBySpecies = {};
  entries.forEach(function(e){ totalWtBySpecies[e.species]=(totalWtBySpecies[e.species]||0)+(parseFloat(e.weight_kg)||0); });

  // Rescaled for landscape — bars stretch further right so the row doesn't look
  // left-weighted with a big empty band between the count and the weight.
  var bxBar = 180, bwBar = 450, bhBar = 5;
  var spCountX = bxBar + bwBar + 25; // count sits just after the bar
  spSorted.forEach(function(sp) {
    y += 22;
    var base = y;
    var clr = spColors[sp] || C.moss;
    setFill(clr); doc.circle(22, base - 3, 3.5, 'F');
    setFont(C.bark); doc.setFontSize(10); doc.setFont(undefined,'bold');
    doc.text(sp, 32, base);
    setFill(C.stone); doc.roundedRect(bxBar, base - 5, bwBar, bhBar, 2, 2, 'F');
    setFill(clr); doc.roundedRect(bxBar, base - 5, bwBar * (spSet[sp] / spMax), bhBar, 2, 2, 'F');
    setFont(C.bark); doc.setFontSize(10); doc.setFont(undefined,'bold');
    doc.text(String(spSet[sp]), spCountX, base);
    setFont(C.muted); doc.setFontSize(9); doc.setFont(undefined,'normal');
    var wtStr = totalWtBySpecies[sp] ? Math.round(totalWtBySpecies[sp]) + ' kg' : '';
    doc.text(wtStr, PW - MR, base, { align: 'right' });
    hrule(base + 10, C.stone);
    y = base + 10;
  });

  // Species breakdown — total row. Matches the "TOTAL" line the Season Plan shows
  // in the Stats tab so a dealer/auditor reading the PDF gets the same rollup.
  if (spSorted.length) {
    y += 22;
    var spTotalBase = y;
    var spGrandTotal = entries.length;
    var spGrandKg = Math.round(
      spSorted.reduce(function(s, k) { return s + (totalWtBySpecies[k] || 0); }, 0)
    );
    setFont(C.bark); doc.setFontSize(9); doc.setFont(undefined, 'bold');
    doc.text('TOTAL', 32, spTotalBase);
    setFont(C.bark); doc.setFontSize(10); doc.setFont(undefined, 'bold');
    doc.text(String(spGrandTotal), spCountX, spTotalBase);
    setFont(C.muted); doc.setFontSize(9); doc.setFont(undefined, 'bold');
    doc.text(spGrandKg ? spGrandKg + ' kg' : '–', PW - MR, spTotalBase, { align: 'right' });
    hrule(spTotalBase + 10, C.stone);
    y = spTotalBase + 10;
  }

  // ── Cull Plan vs Actual ──
  // Cull targets are per-season. When the user picks "All Seasons" the export flow
  // deliberately blanks `cullTargets`, which means every row in this table would
  // otherwise render as "1 (no target set)" — noisy and confusing (see user report).
  // Skip the whole section for All Seasons; targets only make sense alongside a
  // single-season actual.
  var isAllSeasons = window._summarySeasonLabel === 'All Seasons';
  var actuals = {};
  entries.forEach(function(e) { var k = e.species + '-' + e.sex; actuals[k] = (actuals[k] || 0) + 1; });
  var planRows = 0;
  if (!isAllSeasons) {
    PLAN_SPECIES.forEach(function(sp) {
      var mT = cullTargets[sp.name + '-m'] || 0, fT = cullTargets[sp.name + '-f'] || 0;
      var mA = actuals[sp.name + '-m'] || 0, fA = actuals[sp.name + '-f'] || 0;
      [[mT, mA, 'Male'], [fT, fA, 'Female']].forEach(function(row) {
        var tgt = row[0], act = row[1], sex = row[2];
        if (!tgt && !act) return;
        planRows++;
      });
    });
  }
  if (planRows > 0) {
    y += 10;
    y = secHdr(y, 'Cull Plan vs Actual');
    var planTargetSum = 0, planActualSum = 0;
    PLAN_SPECIES.forEach(function(sp) {
      var mT = cullTargets[sp.name + '-m'] || 0, fT = cullTargets[sp.name + '-f'] || 0;
      var mA = actuals[sp.name + '-m'] || 0, fA = actuals[sp.name + '-f'] || 0;
      // Draw the species name on the FIRST row that actually renders, not hard-coded
      // to the male row. Previously a species with only female data (e.g. Muntjac Doe
      // with no Muntjac Buck target) produced an orphan "Doe" row with no species label.
      var spLabelDrawn = false;
      [['m', mT, mA], ['f', fT, fA]].forEach(function(row) {
        var sx = row[0], tgt = row[1], act = row[2];
        if (!tgt && !act) return;
        planTargetSum += tgt;
        planActualSum += act;
        y += 16;
        var sexLbl = sx === 'm' ? sp.mLbl : sp.fLbl;
        setFont(C.bark); doc.setFontSize(9); doc.setFont(undefined, 'bold');
        if (!spLabelDrawn) { doc.text(sp.name, ML, y); spLabelDrawn = true; }
        setFont(sx === 'm' ? C.male : C.female); doc.setFont(undefined, 'normal');
        doc.text(sexLbl, 82, y);
        var bx = 180, bw = 520, bh = 4;
        if (tgt > 0) {
          var pct = Math.min(1, act / tgt), done = act >= tgt;
          setFill(C.stone); doc.roundedRect(bx, y - 3, bw, bh, 2, 2, 'F');
          setFill(done ? C.done : C.moss); doc.roundedRect(bx, y - 3, bw * pct, bh, 2, 2, 'F');
          setFont(done ? C.done : C.bark); doc.setFontSize(9); doc.setFont(undefined, 'bold');
          doc.text(act + '/' + tgt + (done ? ' (done)' : ''), PW - MR, y, { align: 'right' });
        } else {
          setFont(C.muted); doc.setFontSize(9); doc.setFont(undefined, 'normal');
          doc.text(String(act) + ' (no target set)', PW - MR, y, { align: 'right' });
        }
        hrule(y + 6, C.stone);
      });
    });

    // Cull plan — total row. Matches the "TOTAL x/y" rollup the Season Plan shows
    // in the Stats tab. Only draws the progress bar when at least one target was set.
    y += 16;
    var bx = 180, bw = 520, bh = 5;
    setFont(C.bark); doc.setFontSize(9); doc.setFont(undefined, 'bold');
    doc.text('TOTAL', ML, y);
    if (planTargetSum > 0) {
      var tPct = Math.min(1, planActualSum / planTargetSum);
      var tDone = planActualSum >= planTargetSum;
      setFill(C.stone); doc.roundedRect(bx, y - 3, bw, bh, 2, 2, 'F');
      setFill(tDone ? C.done : C.gold); doc.roundedRect(bx, y - 3, bw * tPct, bh, 2, 2, 'F');
      setFont(tDone ? C.done : C.bark); doc.setFontSize(10); doc.setFont(undefined, 'bold');
      doc.text(planActualSum + '/' + planTargetSum + (tDone ? ' (done)' : ''), PW - MR, y, { align: 'right' });
    } else {
      setFont(C.muted); doc.setFontSize(9); doc.setFont(undefined, 'normal');
      doc.text(String(planActualSum) + ' culls', PW - MR, y, { align: 'right' });
    }
    hrule(y + 7, C.stone);
  }

  // ── Entries table (landscape A4, 13 columns) ──
  // Column widths total 806pt (= UW). Order chosen so identifiers (date, species,
  // sex, tag) read left-to-right first, then carcass data (weight, age, destination),
  // then location/admin, then notes last (widest, right-hand side).
  y += 10;
  y = secHdr(y, 'All Entries — ' + entries.length + ' records');

  var W_DATE = 52, W_TIME = 30, W_SP = 62, W_SEX = 40, W_TAG = 44, W_WT = 38,
      W_AGE = 52, W_GRND = 62, W_PLACE = 54, W_SHOOT = 56, W_DEST = 60,
      W_LOC = 80, W_NOTES = 176;
  // total = 52+30+62+40+44+38+52+62+54+56+60+80+176 = 806 (== UW)

  var COL = {
    date:      ML,
    time:      ML + W_DATE,
    species:   ML + W_DATE + W_TIME,
    sex:       ML + W_DATE + W_TIME + W_SP,
    tag:       ML + W_DATE + W_TIME + W_SP + W_SEX,
    weight:    ML + W_DATE + W_TIME + W_SP + W_SEX + W_TAG,
    age:       ML + W_DATE + W_TIME + W_SP + W_SEX + W_TAG + W_WT,
    ground:    ML + W_DATE + W_TIME + W_SP + W_SEX + W_TAG + W_WT + W_AGE,
    placement: ML + W_DATE + W_TIME + W_SP + W_SEX + W_TAG + W_WT + W_AGE + W_GRND,
    shooter:   ML + W_DATE + W_TIME + W_SP + W_SEX + W_TAG + W_WT + W_AGE + W_GRND + W_PLACE,
    dest:      ML + W_DATE + W_TIME + W_SP + W_SEX + W_TAG + W_WT + W_AGE + W_GRND + W_PLACE + W_SHOOT,
    location:  ML + W_DATE + W_TIME + W_SP + W_SEX + W_TAG + W_WT + W_AGE + W_GRND + W_PLACE + W_SHOOT + W_DEST,
    notes:     ML + W_DATE + W_TIME + W_SP + W_SEX + W_TAG + W_WT + W_AGE + W_GRND + W_PLACE + W_SHOOT + W_DEST + W_LOC
  };

  // Collapse long age labels ("Calf / Kid / Fawn" etc.) to the first word so
  // the 52pt column can display them without ellipsis. "Adult", "Yearling",
  // "Calf" are the common forms after normalising.
  function shortAge(v) {
    if (!v) return '–';
    var s = String(v).trim();
    if (!s) return '–';
    return s.split(/\s*\/\s*|\s+/)[0] || s;
  }

  var TB = 7;
  y += 18;
  setFill('#f0ece6'); doc.rect(0, y - 14, PW, 18, 'F');
  setFont(C.muted); doc.setFontSize(6.5); doc.setFont(undefined,'bold');
  var hdrs = [
    ['DATE', COL.date], ['TIME', COL.time], ['SPECIES', COL.species], ['SEX', COL.sex],
    ['TAG', COL.tag], ['WT(kg)', COL.weight], ['AGE', COL.age],
    ['GROUND', COL.ground], ['PLACE', COL.placement], ['SHOOTER', COL.shooter],
    ['DEST', COL.dest], ['LOCATION', COL.location], ['NOTES', COL.notes]
  ];
  hdrs.forEach(function(h) { doc.text(h[0], h[1], y - 3); });
  hrule(y + 4, C.stone);

  entries.forEach(function(e, i) {
    y = newPageIfNeeded(y, 22);
    y += 18;
    setFill(i % 2 === 0 ? C.white : '#fdfcfa'); doc.rect(0, y - 12, PW, 18, 'F');
    doc.setFontSize(TB); setFont(C.bark); doc.setFont(undefined, 'normal');
    doc.text(fmtEntryDate(e.date), COL.date, y);
    doc.text(fmtEntryTime(e.time), COL.time, y);
    doc.text((e.species || '').slice(0, 16), COL.species, y);
    setFont(e.sex === 'm' ? C.male : C.female); doc.setFont(undefined, 'bold');
    doc.text(sexLabel(e.sex, e.species), COL.sex, y);
    setFont(C.bark); doc.setFont(undefined, 'normal');
    doc.text((e.tag_number ? String(e.tag_number) : '–').slice(0, 10), COL.tag, y);
    doc.text(hasValue(e.weight_kg) ? (String(e.weight_kg).slice(0, 8)) : '–', COL.weight, y);
    doc.text(shortAge(e.age_class).slice(0, 10), COL.age, y);
    var gnd = (e.ground && String(e.ground).trim()) ? String(e.ground).trim() : '–';
    var gLines = doc.splitTextToSize(gnd, W_GRND - 2);
    doc.text(gLines.length > 1 ? gLines[0] + '…' : (gLines[0] || '–'), COL.ground, y);
    doc.text((e.shot_placement || '–').slice(0, 12), COL.placement, y);
    doc.text((e.shooter && e.shooter !== 'Self' ? e.shooter : '–').slice(0, 14), COL.shooter, y);
    var dest = (e.destination && String(e.destination).trim()) ? String(e.destination).trim() : '–';
    var dLines = doc.splitTextToSize(dest, W_DEST - 2);
    doc.text(dLines.length > 1 ? dLines[0] + '…' : (dLines[0] || '–'), COL.dest, y);
    var locRaw = String(e.location_name || '–');
    var locLines = doc.splitTextToSize(locRaw, W_LOC - 2);
    doc.text(locLines.length > 1 ? locLines[0] + '…' : (locLines[0] || '–'), COL.location, y);
    var noteRaw = (e.notes && String(e.notes).trim()) ? String(e.notes).replace(/\s+/g, ' ').trim() : '–';
    var noteLines = doc.splitTextToSize(noteRaw, W_NOTES - 2);
    doc.text(noteLines.length > 1 ? noteLines[0] + '…' : (noteLines[0] || '–'), COL.notes, y);
    hrule(y + 4, C.stone);
  });

  // Footer on each page
  var pageCount = doc.internal.getNumberOfPages();
  for (var p=1; p<=pageCount; p++) {
    doc.setPage(p);
    setStroke(C.stone); doc.setLineWidth(0.5); doc.line(0,PH-38,PW,PH-38);
    setFont(C.muted); doc.setFontSize(7); doc.setFont(undefined,'normal');
    doc.text('First Light  -  Cull Diary  -  Page '+p+' of '+pageCount, ML, PH-24);
    setFont(C.gold);
    doc.text('firstlightdeer.co.uk', PW-MR, PH-24, {align:'right'});
  }

  var summaryFilename = window._summarySeasonLabel
    ? 'first-light-all-seasons'
    : 'first-light-season-' + currentSeason;
  if (window._summaryGroundOverride && window._summaryGroundOverride !== 'All Grounds') {
    summaryFilename += '-' + window._summaryGroundOverride.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  }
  doc.save(summaryFilename + '.pdf');
  showToast('✅ Season summary downloaded');
}

// ── Syndicate manager export (species, sex, date, culled-by only) ──
var syndicateExportFormat = 'csv';

function syndicateFileSlug(name) {
  var s = String(name || 'syndicate').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return s || 'syndicate';
}

function getSeasonSelectValues() {
  var sel = document.getElementById('season-select');
  if (!sel || !sel.options || !sel.options.length) return [currentSeason];
  var out = [];
  for (var i = 0; i < sel.options.length; i++) {
    var v = sel.options[i].value;
    if (v) out.push(v);
  }
  return out.length ? out : [currentSeason];
}

function sortSeasonLabelsDesc(labels) {
  return labels.slice().sort(function(a, b) {
    return String(b || '').localeCompare(String(a || ''));
  });
}

async function getSyndicateSeasonValues(syndicateId, fallbackSeason) {
  var seed = fallbackSeason || currentSeason;
  if (!sb || !syndicateId) return [seed];
  var set = {};
  if (seed) set[String(seed)] = 1;

  function addSeason(s) {
    if (!s) return;
    set[String(s)] = 1;
  }
  function addSeasonFromDate(ymd) {
    if (!ymd) return;
    addSeason(buildSeasonFromEntry(ymd));
  }

  try {
    var targets = await sb.from('syndicate_targets')
      .select('season')
      .eq('syndicate_id', syndicateId);
    if (targets.data) targets.data.forEach(function(r) { addSeason(r.season); });
  } catch (e) { /* optional source */ }

  try {
    var allocs = await sb.from('syndicate_member_allocations')
      .select('season')
      .eq('syndicate_id', syndicateId);
    if (allocs.data) allocs.data.forEach(function(r) { addSeason(r.season); });
  } catch (e) { /* optional source */ }

  try {
    var live = await sb.from('cull_entries')
      .select('date')
      .eq('syndicate_id', syndicateId)
      .order('date', { ascending: false });
    if (live.data) live.data.forEach(function(r) { addSeasonFromDate(r.date); });
  } catch (e) { /* optional source */ }

  try {
    var anon = await sb.from('syndicate_anonymous_culls')
      .select('season')
      .eq('syndicate_id', syndicateId);
    if (anon.data) anon.data.forEach(function(r) { addSeason(r.season); });
  } catch (e) { /* optional source */ }

  var out = sortSeasonLabelsDesc(Object.keys(set));
  return out.length ? out : [seed];
}

async function updateSyndicateExportVisibility() {
  var row = document.getElementById('syndicate-export-row');
  if (!row) return;
  if (!sb || !currentUser) {
    row.style.display = 'none';
    return;
  }
  try {
    var list = await loadMySyndicateRows();
    var hasMgr = list.some(function(x) { return x.role === 'manager'; });
    row.style.display = hasMgr ? 'block' : 'none';
  } catch (e) {
    row.style.display = 'none';
  }
}

async function fetchSyndicateMemberNameMap(syndicateId) {
  var map = {};
  if (!sb || !syndicateId) return map;
  var r = await sb.from('syndicate_members').select('user_id, display_name')
    .eq('syndicate_id', syndicateId).eq('status', 'active');
  if (r.data) {
    r.data.forEach(function(m) {
      map[m.user_id] = (m.display_name && String(m.display_name).trim())
        ? String(m.display_name).trim()
        : ('Member ' + (m.user_id || '').slice(0, 8));
    });
  }
  return map;
}

function syndicateCulledByLabel(row, nameMap) {
  if (!row || !row.user_id) return 'Anonymous (retained)';
  return nameMap[row.user_id] || ('Member ' + String(row.user_id).slice(0, 8));
}

async function fetchSyndicateManagerExportRowsRaw(syndicateId, season, nameMap) {
  var br = await sb.rpc('syndicate_member_actuals_for_manager', { p_syndicate_id: syndicateId, p_season: season });
  if (br.error) throw br.error;
  return (br.data || []).map(function(row) {
    return {
      species: row.species,
      sex: row.sex,
      cull_date: row.cull_date,
      culledBy: syndicateCulledByLabel(row, nameMap)
    };
  });
}

/**
 * Fetch every larder-relevant carcass a syndicate's active members entered
 * in the given season, via the manager-only RPC. Decorated with the member's
 * display name for the PDF. Excludes "Left on hill" (never entered the larder)
 * and anonymised retention rows (no weight/tag to print).
 */
async function fetchSyndicateLarderRows(syndicateId, season, nameMap) {
  var br = await sb.rpc('syndicate_member_larder_for_manager', {
    p_syndicate_id: syndicateId,
    p_season: season
  });
  if (br.error) throw br.error;
  return (br.data || []).map(function(row) {
    return {
      entry_id: row.entry_id,
      user_id: row.user_id,
      date: row.cull_date,
      time: row.cull_time,
      species: row.species,
      sex: row.sex,
      tag_number: row.tag_number,
      weight_kg: row.weight_kg,
      age_class: row.age_class,
      destination: row.destination,
      ground: row.ground,
      location_name: row.location_name,
      calibre: row.calibre,
      abnormalities: row.abnormalities,
      abnormalities_other: row.abnormalities_other,
      culledBy: syndicateCulledByLabel(row, nameMap)
    };
  });
}

function sortSyndicateExportRows(rows) {
  return rows.slice().sort(function(a, b) {
    var da = String(a.cull_date || '');
    var db = String(b.cull_date || '');
    if (da !== db) return db.localeCompare(da);
    var sp = String(a.species || '').localeCompare(String(b.species || ''));
    if (sp !== 0) return sp;
    var sx = String(a.sex || '').localeCompare(String(b.sex || ''));
    if (sx !== 0) return sx;
    return String(a.culledBy || '').localeCompare(String(b.culledBy || ''));
  });
}

async function fetchSyndicateExportRowsForScope(syndicateId, season, scope, nameMap) {
  if (scope === 'season') {
    return sortSyndicateExportRows(await fetchSyndicateManagerExportRowsRaw(syndicateId, season, nameMap));
  }
  var merged = [];
  var seasons = await getSyndicateSeasonValues(syndicateId, season);
  for (var i = 0; i < seasons.length; i++) {
    var part = await fetchSyndicateManagerExportRowsRaw(syndicateId, seasons[i], nameMap);
    merged = merged.concat(part);
  }
  return sortSyndicateExportRows(merged);
}

function openSyndicateExportModal(format) {
  if (!sb || !currentUser) {
    showToast('⚠️ Sign in to export');
    return;
  }
  syndicateExportFormat = format || 'csv';
  var title = document.getElementById('syndicate-export-modal-title');
  var sub = document.getElementById('syndicate-export-modal-sub');
  var scopeWrap = document.getElementById('syndicate-export-scope-wrap');
  var sumHint = document.getElementById('syndicate-export-summary-hint');
  if (syndicateExportFormat === 'summary') {
    if (title) title.textContent = 'Syndicate summary (PDF)';
    if (sub) sub.textContent = 'Species breakdown, plan vs actual, and all entries.';
    if (scopeWrap) scopeWrap.style.display = 'none';
    if (sumHint) sumHint.style.display = 'block';
  } else if (syndicateExportFormat === 'larder') {
    if (title) title.textContent = 'Team Larder Book (PDF)';
    if (sub) sub.textContent = 'Every carcass that entered the larder, across all active members.';
    // Team larder is inherently per-season — aggregating "all seasons" into
    // one larder book isn't a thing a dealer or inspector would recognise.
    if (scopeWrap) scopeWrap.style.display = 'none';
    if (sumHint) sumHint.style.display = 'block';
  } else {
    if (title) title.textContent = syndicateExportFormat === 'csv' ? 'Syndicate CSV' : 'Syndicate PDF';
    if (sub) sub.textContent = 'Species, sex, date, and who culled.';
    if (scopeWrap) scopeWrap.style.display = 'block';
    if (sumHint) sumHint.style.display = 'none';
  }

  loadMySyndicateRows().then(function(list) {
    var mgr = list.filter(function(x) { return x.role === 'manager'; });
    if (!mgr.length) {
      showToast('⚠️ Manager access required');
      return;
    }
    var sel = document.getElementById('syndicate-export-syndicate');
    var sea = document.getElementById('syndicate-export-season');
    if (!sel || !sea) return;
    sel.innerHTML = mgr.map(function(x) {
      return '<option value="' + esc(x.syndicate.id) + '">' + esc(x.syndicate.name) + '</option>';
    }).join('');
    var listSel = document.getElementById('season-select');
    sea.innerHTML = listSel ? listSel.innerHTML : '<option value="' + esc(currentSeason) + '">' + esc(currentSeason) + '</option>';
    sea.value = currentSeason;
    var modal = document.getElementById('syndicate-export-modal');
    if (modal) modal.style.display = 'flex';
  }).catch(function() {
    showToast('⚠️ Could not load syndicates');
  });
}

function closeSyndicateExportModal() {
  var modal = document.getElementById('syndicate-export-modal');
  if (modal) modal.style.display = 'none';
}

async function fetchSyndicateSummaryForManagerExport(syndicate, season) {
  var sum = await fetchSyndicateSummaryRpc(syndicate.id, season);
  if (sum.ok) return sum.rows || [];
  var fb = await fetchSyndicateSummaryFallback(syndicate, season, true);
  return fb.rows || [];
}

async function doSyndicateExport() {
  if (!sb || !currentUser) {
    showToast('⚠️ Sign in');
    return;
  }
  var sel = document.getElementById('syndicate-export-syndicate');
  var sea = document.getElementById('syndicate-export-season');
  if (!sel || !sea) return;
  var syndicateId = sel.value;
  if (!syndicateId) {
    showToast('⚠️ Choose a syndicate');
    return;
  }
  var list = await loadMySyndicateRows();
  var pick = list.find(function(x) {
    return String(x.syndicate.id) === String(syndicateId) && x.role === 'manager';
  });
  if (!pick) {
    showToast('⚠️ Manager access required');
    return;
  }
  var s = pick.syndicate;
  var season = sea.value || currentSeason;
  var scopeEl = document.querySelector('input[name="syndicate-export-scope"]:checked');
  var scope = scopeEl ? scopeEl.value : 'season';
  closeSyndicateExportModal();

  var nameMap = await fetchSyndicateMemberNameMap(syndicateId);

  try {
    if (syndicateExportFormat === 'summary') {
      showToast('⏳ Building summary…');
      var entries = sortSyndicateExportRows(await fetchSyndicateManagerExportRowsRaw(syndicateId, season, nameMap));
      var summaryRows = await fetchSyndicateSummaryForManagerExport(s, season);
      exportSyndicateSeasonSummaryPdf(s, season, entries, summaryRows);
      return;
    }
    if (syndicateExportFormat === 'larder') {
      showToast('⏳ Building team larder…');
      var larderRows = await fetchSyndicateLarderRows(syndicateId, season, nameMap);
      if (!larderRows.length) {
        showToast('⚠️ No larder entries for this syndicate & season');
        return;
      }
      exportSyndicateLarderBookPDF(s, season, larderRows);
      return;
    }
    showToast('⏳ Preparing export…');
    var rows = await fetchSyndicateExportRowsForScope(syndicateId, season, scope, nameMap);
    var slug = syndicateFileSlug(s.name);
    var label = scope === 'all' ? 'all-seasons' : season;
    if (syndicateExportFormat === 'csv') {
      exportSyndicateCSVData(rows, 'syndicate-' + slug + '-' + label);
    } else {
      var titleExtra = scope === 'all' ? 'All seasons' : seasonLabel(season);
      exportSyndicateListPDF(rows, s.name, titleExtra, 'syndicate-' + slug + '-' + label);
    }
  } catch (e) {
    if (typeof console !== 'undefined' && console.warn) console.warn('syndicate export', e);
    showToast('⚠️ ' + (e.message || 'Export failed'));
  }
}

function exportSyndicateCSVData(rows, filenameBase) {
  var headers = ['Species', 'Sex', 'Date', 'Culled by'];
  var lines = rows.map(function(r) {
    return [
      csvField(r.species),
      csvField(sexLabel(r.sex, r.species)),
      csvField(r.cull_date || ''),
      csvField(r.culledBy)
    ].join(',');
  });
  triggerCsvDownload([headers.join(',')].concat(lines), filenameBase + '.csv');
  showToast('✅ CSV downloaded — ' + rows.length + ' rows');
}

function exportSyndicateListPDF(rows, syndicateName, seasonLabelStr, filenameBase) {
  var doc = new jspdf.jsPDF();
  doc.setFontSize(16);
  doc.text('Syndicate culls — ' + syndicateName, 14, 18);
  doc.setFontSize(10);
  doc.text(seasonLabelStr + ' · ' + rows.length + ' rows · firstlightdeer.co.uk', 14, 26);
  var y = 36;
  rows.forEach(function(r, i) {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text((i + 1) + '. ' + (r.species || '—'), 14, y);
    doc.setFont(undefined, 'normal');
    doc.text(sexLabel(r.sex, r.species), 100, y);
    doc.text(fmtDate(r.cull_date) || String(r.cull_date || '—'), 130, y);
    y += 5;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('Culled by: ' + (r.culledBy || '—'), 14, y);
    doc.setTextColor(0, 0, 0);
    y += 8;
  });
  doc.save(filenameBase + '.pdf');
  showToast('✅ PDF downloaded — ' + rows.length + ' rows');
}

function exportSyndicateSeasonSummaryPdf(syndicate, season, entries, summaryRows) {
  var doc = new jspdf.jsPDF({ unit: 'pt', format: 'a4' });
  var PW = 595, PH = 842, ML = 18, MR = 18;

  function rgb(hex) {
    var r = parseInt(hex.slice(1, 3), 16) / 255;
    var g = parseInt(hex.slice(3, 5), 16) / 255;
    var b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b];
  }
  var C = {
    deep: '#0e2a08', forest: '#1a3a0e', moss: '#5a7a30',
    gold: '#c8a84b', bark: '#3d2b1f', muted: '#a0988a',
    stone: '#ede9e2', white: '#ffffff',
    red: '#c8a84b', roe: '#5a7a30', fallow: '#f57f17',
    muntjac: '#6a1b9a', sika: '#1565c0', cwd: '#00695c',
    male: '#8b4513', female: '#8b1a4a', done: '#2d7a1a'
  };
  var spColors = { 'Red Deer': C.red, 'Roe Deer': C.roe, 'Fallow': C.fallow,
    'Muntjac': C.muntjac, 'Sika': C.sika, 'CWD': C.cwd };

  function setFill(hex) { var c = rgb(hex); doc.setFillColor(c[0] * 255, c[1] * 255, c[2] * 255); }
  function setStroke(hex) { var c = rgb(hex); doc.setDrawColor(c[0] * 255, c[1] * 255, c[2] * 255); }
  function setFont(hex) { var c = rgb(hex); doc.setTextColor(c[0] * 255, c[1] * 255, c[2] * 255); }

  function hrule(y, col) {
    setStroke(col || C.stone);
    doc.setLineWidth(0.3);
    doc.line(0, y, PW, y);
  }

  function newPageIfNeeded(y, needed) {
    if (y + needed > PH - 50) {
      doc.addPage();
      setFill(C.deep);
      doc.rect(0, 0, PW, 24, 'F');
      setFont(C.gold);
      doc.setFontSize(7);
      doc.setFont(undefined, 'bold');
      doc.text('FIRST LIGHT  -  SYNDICATE  -  ' + String(season).toUpperCase(), ML, 15);
      return 32;
    }
    return y;
  }

  function secHdr(y0, title) {
    setFill('#f0ece6');
    doc.rect(0, y0, PW, 18, 'F');
    setStroke(C.stone);
    doc.setLineWidth(0.5);
    doc.line(0, y0 + 18, PW, y0 + 18);
    setFont(C.moss);
    doc.setFontSize(7);
    doc.setFont(undefined, 'bold');
    doc.text(title.toUpperCase(), ML, y0 + 11);
    return y0 + 18;
  }

  function fmtEntryDatePdf(d) {
    if (!d) return '—';
    var p = parseEntryDateParts(d);
    if (!p) return String(d);
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return p.day + ' ' + months[p.m - 1] + ' ' + p.y;
  }

  var now = diaryNow();
  var mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var _pdfHm = (function(d) {
    var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
    return { h: parseInt(p.find(function(x) { return x.type === 'hour'; }).value, 10), m: parseInt(p.find(function(x) { return x.type === 'minute'; }).value, 10) };
  }(now));
  var genDate = now.getDate() + ' ' + mo[now.getMonth()] + ' ' + now.getFullYear() +
    '  -  ' + ('0' + _pdfHm.h).slice(-2) + ':' + ('0' + _pdfHm.m).slice(-2);

  var HDR_H = 94;
  setFill(C.deep);
  doc.rect(0, 0, PW, HDR_H, 'F');
  setFill(C.forest);
  doc.rect(0, 0, PW / 2, HDR_H, 'F');
  setStroke(C.gold);
  doc.setLineWidth(1.5);
  doc.line(0, HDR_H, PW, HDR_H);

  setFont(C.gold);
  doc.setFontSize(7);
  doc.setFont(undefined, 'bold');
  doc.text('FIRST LIGHT  -  SYNDICATE SUMMARY', ML, 18);
  setFont(C.white);
  doc.setFontSize(20);
  doc.setFont(undefined, 'bold');
  doc.text(syndicate.name, ML, 42);
  setFont(C.gold);
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text(seasonLabel(season), ML, 58);
  setFont('#aaaaaa');
  doc.setFontSize(10);
  doc.text('firstlightdeer.co.uk', ML, 72);
  setFont(C.gold);
  doc.setFontSize(7);
  doc.text('Generated ' + genDate, ML, 84);

  var y = HDR_H + 12;

  var mCount = entries.filter(function(e) { return e.sex === 'm'; }).length;
  var fCount = entries.filter(function(e) { return e.sex === 'f'; }).length;
  var spSet = {};
  entries.forEach(function(e) { spSet[e.species] = (spSet[e.species] || 0) + 1; });
  var spCount = Object.keys(spSet).length;

  var STAT_H = 46, cw = PW / 4;
  var statData = [
    [String(entries.length), 'Total culls'],
    [String(spCount), 'Species'],
    [String(mCount), 'Male'],
    [String(fCount), 'Female']
  ];
  statData.forEach(function(s, i) {
    var x = i * cw;
    setFill(i % 2 === 0 ? C.white : '#faf8f5');
    doc.rect(x, y, cw, STAT_H, 'F');
    if (i > 0) {
      setStroke(C.stone);
      doc.setLineWidth(0.5);
      doc.line(x, y, x, y + STAT_H);
    }
    setFont(C.bark);
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.text(s[0], x + cw / 2, y + 22, { align: 'center' });
    setFont(C.muted);
    doc.setFontSize(7);
    doc.setFont(undefined, 'bold');
    doc.text(s[1].toUpperCase(), x + cw / 2, y + 35, { align: 'center' });
  });
  hrule(y + STAT_H, C.stone);
  y += STAT_H;

  y = secHdr(y, 'Species breakdown');
  var spSorted = Object.keys(spSet).sort(function(a, b) { return spSet[b] - spSet[a]; });
  if (!spSorted.length) {
    y += 14;
    setFont(C.muted);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text('No culls recorded for this season.', ML, y);
    y += 8;
  }
  var spMax = Math.max.apply(null, spSorted.map(function(k) { return spSet[k]; }).concat([1]));
  var bxBar = 130, bwBar = 210, bhBar = 5;
  spSorted.forEach(function(sp) {
    y += 22;
    var base = y;
    var clr = spColors[sp] || C.moss;
    setFill(clr);
    doc.circle(22, base - 3, 3.5, 'F');
    setFont(C.bark);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text(sp, 32, base);
    setFill(C.stone);
    doc.roundedRect(bxBar, base - 5, bwBar, bhBar, 2, 2, 'F');
    setFill(clr);
    doc.roundedRect(bxBar, base - 5, bwBar * (spSet[sp] / spMax), bhBar, 2, 2, 'F');
    setFont(C.bark);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text(String(spSet[sp]), 355, base);
    hrule(base + 10, C.stone);
    y = base + 10;
  });

  var byKey = {};
  (summaryRows || []).forEach(function(row) {
    var k = row.species + '-' + row.sex;
    byKey[k] = row;
  });
  var planRows = 0;
  PLAN_SPECIES.forEach(function(ps) {
    ['m', 'f'].forEach(function(sx) {
      var row = byKey[ps.name + '-' + sx];
      var tgt = row ? parseInt(row.target_total, 10) || 0 : 0;
      var act = row ? parseInt(row.actual_total, 10) || 0 : 0;
      if (tgt || act) planRows++;
    });
  });

  if (planRows > 0) {
    y += 10;
    y = secHdr(y, 'Cull plan vs actual');
    PLAN_SPECIES.forEach(function(ps) {
      var spMeta = planSpeciesMeta(ps.name);
      // Draw the species name on the FIRST row that actually renders (see matching
      // comment in exportSeasonSummary). Species with only-female data used to appear
      // as an orphan "Doe" row with no species label.
      var spLabelDrawn = false;
      ['m', 'f'].forEach(function(sx) {
        var row = byKey[ps.name + '-' + sx];
        var tgt = row ? parseInt(row.target_total, 10) || 0 : 0;
        var act = row ? parseInt(row.actual_total, 10) || 0 : 0;
        if (!tgt && !act) return;
        y += 16;
        var sexLbl = sx === 'm' ? (spMeta.mLbl || 'Male') : (spMeta.fLbl || 'Female');
        setFont(C.bark);
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        if (!spLabelDrawn) { doc.text(ps.name, ML, y); spLabelDrawn = true; }
        setFont(sx === 'm' ? C.male : C.female);
        doc.setFont(undefined, 'normal');
        doc.text(sexLbl, 120, y);
        var bx = 200, bw = 220, bh = 4;
        if (tgt > 0) {
          var pct = Math.min(1, act / tgt);
          var done = act >= tgt;
          setFill(C.stone);
          doc.roundedRect(bx, y - 3, bw, bh, 2, 2, 'F');
          setFill(done ? C.done : C.moss);
          doc.roundedRect(bx, y - 3, bw * pct, bh, 2, 2, 'F');
          setFont(done ? C.done : C.bark);
          doc.setFontSize(9);
          doc.setFont(undefined, 'bold');
          doc.text(act + '/' + tgt + (done ? ' (done)' : ''), PW - MR, y, { align: 'right' });
        } else {
          setFont(C.muted);
          doc.setFontSize(9);
          doc.setFont(undefined, 'normal');
          doc.text(String(act) + ' (no target set)', PW - MR, y, { align: 'right' });
        }
        hrule(y + 6, C.stone);
      });
    });
  }

  y += 10;
  y = newPageIfNeeded(y, 40);
  y = secHdr(y, 'All entries — ' + entries.length + ' records');

  var W_DATE = 78, W_SP = 100, W_SEX = 52, W_BY = PW - ML - MR - W_DATE - W_SP - W_SEX;
  var COL = {
    date: ML,
    species: ML + W_DATE,
    sex: ML + W_DATE + W_SP,
    by: ML + W_DATE + W_SP + W_SEX
  };

  y += 18;
  setFill('#f0ece6');
  doc.rect(0, y - 14, PW, 18, 'F');
  setFont(C.muted);
  doc.setFontSize(6.5);
  doc.setFont(undefined, 'bold');
  doc.text('DATE', COL.date, y - 3);
  doc.text('SPECIES', COL.species, y - 3);
  doc.text('SEX', COL.sex, y - 3);
  doc.text('CULLED BY', COL.by, y - 3);
  hrule(y + 4, C.stone);

  entries.forEach(function(e, i) {
    y = newPageIfNeeded(y, 22);
    y += 18;
    setFill(i % 2 === 0 ? C.white : '#fdfcfa');
    doc.rect(0, y - 12, PW, 18, 'F');
    doc.setFontSize(7);
    setFont(C.bark);
    doc.setFont(undefined, 'normal');
    doc.text(fmtEntryDatePdf(e.cull_date), COL.date, y);
    doc.text(String(e.species || '').slice(0, 22), COL.species, y);
    setFont(e.sex === 'm' ? C.male : C.female);
    doc.setFont(undefined, 'bold');
    doc.text(sexLabel(e.sex, e.species), COL.sex, y);
    setFont(C.bark);
    doc.setFont(undefined, 'normal');
    var byLines = doc.splitTextToSize(String(e.culledBy || '—'), W_BY - 2);
    doc.text(byLines.length ? byLines[0] : '—', COL.by, y);
    hrule(y + 4, C.stone);
  });

  var pageCount = doc.internal.getNumberOfPages();
  for (var p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    setStroke(C.stone);
    doc.setLineWidth(0.5);
    doc.line(0, PH - 38, PW, PH - 38);
    setFont(C.muted);
    doc.setFontSize(7);
    doc.setFont(undefined, 'normal');
    doc.text('First Light  -  ' + syndicate.name + '  -  Page ' + p + ' of ' + pageCount, ML, PH - 24);
    setFont(C.gold);
    doc.text('firstlightdeer.co.uk', PW - MR, PH - 24, { align: 'right' });
  }

  doc.save('syndicate-' + syndicateFileSlug(syndicate.name) + '-summary-' + season + '.pdf');
  showToast('✅ Syndicate summary downloaded');
}

function exportSinglePDF(id) {
  var e = allEntries.find(function(x){ return x.id === id; });
  if (!e) return;
  var doc = new jspdf.jsPDF();
  doc.setFontSize(16); doc.text('Cull Record — First Light', 14, 20);
  doc.setFontSize(12); doc.text(e.species + ' (' + sexLabel(e.sex, e.species) + ')', 14, 32);
  doc.setFontSize(10);
  var fields = [
    ['Date', e.date], ['Time', e.time], ['Location', e.location_name],
    ['Ground', e.ground],
    ['Age class', e.age_class], ['Carcass weight', hasValue(e.weight_kg) ? e.weight_kg + ' kg' : ''],
    ['Tag number', e.tag_number || ''],
    ['Calibre', e.calibre], ['Distance', hasValue(e.distance_m) ? e.distance_m + 'm' : ''],
    ['Shot placement', e.shot_placement], ['Destination', e.destination], ['Notes', e.notes ? e.notes.slice(0, 300) : null]
  ];
  var y = 44;
  fields.forEach(function(f) {
    if (!f[1]) return;
    doc.setFont(undefined,'bold'); doc.text(f[0] + ':', 14, y);
    doc.setFont(undefined,'normal'); doc.text(String(f[1]), 60, y);
    y += 7;
  });
  doc.save('cull-record-' + e.date + '.pdf');
  showToast('✅ PDF downloaded');
}

/** Profile name for PDFs — not email (email is identity only, not a legal “name”). */
function userProfileDisplayName() {
  if (!currentUser) return '';
  var m = currentUser.user_metadata || {};
  var n = String(m.full_name || m.name || m.display_name || '').trim();
  return n;
}

function exportLarderBookPDF() {
  // A larder book records every carcass that entered the larder — including
  // self-consumption, gifted, etc. It is NOT a dealer-only document (that is the
  // per-carcass Game dealer PDF). The only legitimate exclusion is "Left on hill":
  // the carcass was never retrieved, so it never entered the larder.
  // Destination is kept as a column so the stalker has an audit trail / dealer
  // reconciliation / recall traceability — but it must not gate what appears.
  var entries = filteredEntries.filter(function(e) {
    var d = (e.destination || '').toLowerCase();
    return d !== 'left on hill';
  });
  if (entries.length === 0) {
    showToast('No larder entries in this season.');
    return;
  }
  entries.sort(function(a,b){ return (a.date||'').localeCompare(b.date||'') || (a.time||'').localeCompare(b.time||''); });

  var doc = new jspdf.jsPDF('landscape');
  var pageW = doc.internal.pageSize.getWidth();

  var stalkerLine = '';
  try {
    stalkerLine = userProfileDisplayName() || (currentUser && currentUser.email) || '';
  } catch (_) {}

  doc.setFontSize(16); doc.text('Larder Book — First Light Cull Diary', 14, 16);
  doc.setFontSize(9); doc.setTextColor(120);
  // Prefer an explicit season label (e.g. "Season 2025/26") over a raw first/last date
  // so a dealer or auditor immediately sees the scope. Fall back to the date range
  // when viewing All Seasons (no single season selected).
  var scopeLine;
  try {
    scopeLine = (currentSeason && currentSeason !== '__all__')
      ? 'Season ' + (typeof seasonLabel === 'function' ? seasonLabel(currentSeason) : currentSeason)
      : 'All seasons · ' + entries[0].date + ' to ' + entries[entries.length-1].date;
  } catch (_) {
    scopeLine = entries[0].date + ' to ' + entries[entries.length-1].date;
  }
  doc.text((stalkerLine ? stalkerLine + ' · ' : '') + scopeLine + ' · ' + entries.length + ' carcasses', 14, 23);
  doc.setTextColor(0);

  var headers = ['#','Date','Tag','Species','Sex','Weight (kg)','Location / Ground','Destination','Abnormalities'];
  var colX = [14, 22, 52, 78, 110, 133, 155, 210, 248];
  var y = 32;

  function drawHeader() {
    doc.setFontSize(8); doc.setFont(undefined,'bold');
    for (var h = 0; h < headers.length; h++) doc.text(headers[h], colX[h], y);
    doc.setFont(undefined,'normal'); y += 6;
    doc.setDrawColor(200); doc.line(14, y - 3, pageW - 14, y - 3);
  }
  drawHeader();

  doc.setFontSize(7.5);
  entries.forEach(function(e, idx) {
    if (y > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage(); y = 16; drawHeader(); doc.setFontSize(7.5);
    }
    var locText = ((e.location_name || '') + (e.ground ? ' / ' + e.ground : '')).trim().replace(/^\//, '').trim();
    var row = [
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
    for (var c = 0; c < row.length; c++) doc.text(row[c], colX[c], y);
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

  doc.save('larder-book-' + entries[0].date + '.pdf');
  showToast('✅ Larder Book PDF downloaded');
}

/**
 * Team Larder Book — manager export. Every carcass that entered the larder
 * across all active syndicate members in the given season, scoped to the
 * syndicate's optional ground_filter. Mirrors `exportLarderBookPDF()` column
 * set plus a SHOOTER column so a dealer / inspector / auditor can attribute
 * each carcass.
 *
 * Rows come pre-filtered server-side (RPC excludes "Left on hill" and
 * anonymised retention rows). We sort ascending by date/time to read as a
 * chronological book. Abnormalities render from the structured checklist
 * when available, falling back to free-text "other" or a "Not recorded"
 * dash for pre-abnormalities entries — matches the single-user Larder Book
 * semantics.
 */
function exportSyndicateLarderBookPDF(syndicate, season, rows) {
  if (!rows || !rows.length) {
    showToast('⚠️ No larder entries for this syndicate & season');
    return;
  }
  var doc = new jspdf.jsPDF('landscape');
  var pageW = doc.internal.pageSize.getWidth();
  var pageH = doc.internal.pageSize.getHeight();

  var label = (typeof seasonLabel === 'function') ? seasonLabel(season) : season;
  var synName = (syndicate && syndicate.name) || 'Syndicate';

  doc.setFontSize(16); doc.text('Team Larder Book — First Light Cull Diary', 14, 16);
  doc.setFontSize(9); doc.setTextColor(120);
  doc.text(synName + ' · Season ' + label + ' · ' + rows.length + ' carcasses', 14, 23);
  doc.setTextColor(0);

  // Column layout — Shooter is the new column vs the single-user export.
  // Deliberate order: numeric # first, then the identity columns (date, tag,
  // shooter, species, sex) that a dealer checks first, then the weight and
  // location bundle, then the inspection / destination. Location is the most
  // elastic column so it goes last.
  var headers = ['#', 'Date', 'Time', 'Tag', 'Shooter', 'Species', 'Sex', 'Wt(kg)', 'Age', 'Destination', 'Location / Ground', 'Larder inspection'];
  var colX   =  [14,   22,    42,     58,    78,        120,       148,   165,      180,    196,            227,                    261];
  var y = 32;

  function drawHeader() {
    doc.setFontSize(8); doc.setFont(undefined, 'bold');
    for (var h = 0; h < headers.length; h++) doc.text(headers[h], colX[h], y);
    doc.setFont(undefined, 'normal'); y += 6;
    doc.setDrawColor(200); doc.line(14, y - 3, pageW - 14, y - 3);
  }
  drawHeader();

  function abnormCell(r) {
    // Concise inline summary: structured codes first, then "other". Truncated
    // so each row stays single-line; the full text is available in the diary.
    if (Array.isArray(r.abnormalities) && r.abnormalities.length) {
      if (r.abnormalities.length === 1 && r.abnormalities[0] === 'none') return 'None observed';
      var codes = r.abnormalities.filter(function(c) { return c !== 'none'; });
      var shown = codes.slice(0, 2).map(function(c) { return ABNORMALITY_LABEL_BY_CODE[c] || c; }).join(', ');
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
      doc.addPage(); y = 16; drawHeader(); doc.setFontSize(7.5);
    }
    var locText = ((r.location_name || '') + (r.ground ? ' / ' + r.ground : '')).trim().replace(/^\//, '').trim();
    var ageShort = (function(a) {
      if (!a) return '—';
      var s = String(a).trim();
      if (/^calf/i.test(s) || /kid|fawn/i.test(s)) return 'Calf';
      if (/yearling/i.test(s)) return 'Yrl';
      if (/adult/i.test(s)) return 'Adult';
      return s.slice(0, 7);
    })(r.age_class);
    var row = [
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
    for (var c = 0; c < row.length; c++) doc.text(row[c], colX[c], y);
    y += 5.5;
  });

  // Totals footer — quick sanity row so a dealer/auditor can tick off the
  // page before signing.
  y += 6;
  if (y > pageH - 30) { doc.addPage(); y = 20; }
  doc.setDrawColor(200); doc.line(14, y - 2, pageW - 14, y - 2);
  doc.setFontSize(8); doc.setFont(undefined, 'bold');
  var totalKg = rows.reduce(function(s, r) { return s + (parseFloat(r.weight_kg) || 0); }, 0);
  doc.text('Total carcasses: ' + rows.length, 14, y);
  doc.text('Total weight: ' + (Math.round(totalKg * 10) / 10) + ' kg', 100, y);
  doc.setFont(undefined, 'normal');
  y += 14;

  // Manager signature — this is a team book so the manager signs it off.
  if (y > pageH - 20) { doc.addPage(); y = 20; }
  doc.setFontSize(9);
  doc.text('Syndicate manager signature: ___________________________', 14, y);
  doc.text('Date: _______________', 170, y);
  y += 12;
  doc.setFontSize(7); doc.setTextColor(150);
  doc.text('Produced by First Light Cull Diary — firstlightdeer.co.uk', 14, y);

  var slug = syndicateFileSlug(synName);
  doc.save('team-larder-book-' + slug + '-' + season + '.pdf');
  showToast('✅ Team Larder Book PDF downloaded · ' + rows.length + ' carcasses');
}

function exportGameDealerDeclaration(id) {
  var e = allEntries.find(function(x){ return x.id === id; });
  if (!e) return;

  var hunterName = '';
  var accountEmail = '';
  try {
    hunterName = userProfileDisplayName();
    accountEmail = (currentUser && currentUser.email) ? String(currentUser.email).trim() : '';
  } catch (_) {}

  var doc = new jspdf.jsPDF();
  var pageW = doc.internal.pageSize.getWidth();
  var cx = pageW / 2;

  doc.setFontSize(18); doc.setFont(undefined,'bold');
  doc.text('Trained Hunter Declaration', cx, 24, {align:'center'});
  doc.setFontSize(9); doc.setFont(undefined,'normal'); doc.setTextColor(100);
  doc.text('Wild Game — Food Safety Regulations', cx, 32, {align:'center'});
  doc.setTextColor(0);

  doc.setDrawColor(200); doc.line(14, 38, pageW - 14, 38);

  var fields = [
    ['Species', e.species || ''],
    ['Sex', sexLabel(e.sex, e.species)],
    ['Date of kill', e.date || ''],
    ['Time', e.time || ''],
    ['Location', e.location_name || ''],
    ['Ground', e.ground || ''],
    ['Tag / carcass number', e.tag_number || ''],
    ['Carcass weight (kg)', hasValue(e.weight_kg) ? String(e.weight_kg) : ''],
    ['Age class', e.age_class || ''],
    ['Calibre', e.calibre || ''],
    ['Shot placement', e.shot_placement || ''],
    ['Destination', e.destination || '']
  ];

  var y = 48;
  doc.setFontSize(10);
  fields.forEach(function(f) {
    doc.setFont(undefined,'bold'); doc.text(f[0] + ':', 20, y);
    doc.setFont(undefined,'normal'); doc.text(f[1], 80, y);
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
  var abnormCodes = Array.isArray(e.abnormalities) ? e.abnormalities : null;
  var abnormOther = e.abnormalities_other || '';
  var hasStructured = (abnormCodes && abnormCodes.length > 0) || abnormOther;
  if (hasStructured) {
    if (abnormCodes && abnormCodes.length === 1 && abnormCodes[0] === 'none') {
      doc.text('✓ No abnormalities observed at gralloch.', 20, y);
      y += 7;
      if (abnormOther) {
        var altLines = doc.splitTextToSize('Additional note: ' + abnormOther, pageW - 40);
        doc.text(altLines, 20, y);
        y += altLines.length * 6;
      }
    } else if (abnormCodes && abnormCodes.length) {
      abnormCodes.filter(function(c) { return c !== 'none'; }).forEach(function(code) {
        doc.text('• ' + (ABNORMALITY_LABEL_BY_CODE[code] || code), 22, y);
        y += 6;
      });
      if (abnormOther) {
        var oLines = doc.splitTextToSize('• Other: ' + abnormOther, pageW - 40);
        doc.text(oLines, 22, y);
        y += oLines.length * 6;
      }
    } else {
      // Only free-text "other" was provided
      var soloLines = doc.splitTextToSize('• ' + abnormOther, pageW - 40);
      doc.text(soloLines, 22, y);
      y += soloLines.length * 6;
    }
    y += 6;
  } else {
    // Legacy entries: no structured data captured. Fall back to notes as a
    // pragmatic stand-in so an older declaration still reads correctly.
    var legacy = e.notes ? e.notes.slice(0, 500) : 'Not recorded at gralloch';
    var splitNotes = doc.splitTextToSize(legacy, pageW - 40);
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
  doc.text('Produced by First Light Cull Diary — firstlightdeer.co.uk', cx, y, {align:'center'});

  doc.save('declaration-' + (e.species || 'entry').replace(/\s+/g, '-').toLowerCase() + '-' + e.date + '.pdf');
  showToast('✅ Game dealer declaration PDF downloaded');
}

/**
 * Per-consignment Trained Hunter Declaration.
 * Reg (EC) 853/2004 permits a single declaration covering every carcass in
 * one consignment (delivery) rather than one declaration per carcass. The
 * user selects N entries from the diary list in Select mode, then triggers
 * this export. The resulting PDF has one header, one table of carcasses,
 * one declaration block, and one signature line.
 *
 * Entries destined "Left on hill" are filtered out automatically — a carcass
 * that never entered the larder cannot be declared to a game dealer.
 */
function exportConsignmentDealerPdf() {
  if (!flSelection.ids || flSelection.ids.size === 0) {
    showToast('⚠️ No entries selected');
    return;
  }

  var picked = allEntries.filter(function(e) { return flSelection.ids.has(e.id); });
  var excluded = 0;
  var entries = picked.filter(function(e) {
    var d = (e.destination || '').toLowerCase();
    if (d === 'left on hill') { excluded++; return false; }
    return true;
  });

  if (entries.length === 0) {
    showToast('⚠️ All selected entries are marked "Left on hill" — not eligible for a dealer declaration');
    return;
  }

  // Stable order: oldest first within the consignment — reads as a delivery manifest.
  entries.sort(function(a, b) {
    return (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || '');
  });

  var hunterName = '';
  var accountEmail = '';
  try {
    hunterName = userProfileDisplayName();
    accountEmail = (currentUser && currentUser.email) ? String(currentUser.email).trim() : '';
  } catch (_) {}

  // Landscape A4 — the carcass table needs 9 columns + notes column; portrait
  // is too narrow to avoid mid-word wraps in Species and Location.
  var doc = new jspdf.jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  var PW = 842, PH = 595;
  var ML = 24, MR = 24;
  var UW = PW - ML - MR;
  var cx = PW / 2;

  // Summary
  var dateMin = entries[0].date || '';
  var dateMax = entries[entries.length - 1].date || '';
  var totalKg = entries.reduce(function(s, e) { return s + (parseFloat(e.weight_kg) || 0); }, 0);
  var weighedCount = entries.filter(function(e) { return hasValue(e.weight_kg); }).length;

  // Header
  doc.setFontSize(16); doc.setFont(undefined, 'bold');
  doc.text('Consignment — Trained Hunter Declaration', cx, 34, { align: 'center' });
  doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(100);
  doc.text('Wild Game — Food Safety Regulations (Reg (EC) 853/2004)', cx, 46, { align: 'center' });
  doc.setTextColor(0);
  doc.setDrawColor(200); doc.line(ML, 52, PW - MR, 52);

  // Summary strip
  doc.setFontSize(9); doc.setFont(undefined, 'bold');
  var summary = entries.length + ' carcass' + (entries.length === 1 ? '' : 'es')
    + '  ·  ' + (weighedCount === entries.length ? Math.round(totalKg) + ' kg total'
                                                 : Math.round(totalKg) + ' kg (' + weighedCount + ' of ' + entries.length + ' weighed)')
    + '  ·  ' + (dateMin === dateMax ? dateMin : dateMin + ' → ' + dateMax);
  doc.text(summary, ML, 66);
  if (excluded > 0) {
    doc.setFont(undefined, 'normal'); doc.setTextColor(120); doc.setFontSize(8);
    doc.text('(' + excluded + ' excluded — destination "Left on hill")', ML, 78);
    doc.setTextColor(0);
  }

  // Carcass table
  var y = excluded > 0 ? 92 : 84;
  var W_NUM = 24, W_TAG = 54, W_DATE = 56, W_TIME = 34, W_SP = 68, W_SEX = 44,
      W_WT = 42, W_AGE = 56, W_LOC = 140, W_GRND = 80;
  var W_NOTES = UW - (W_NUM + W_TAG + W_DATE + W_TIME + W_SP + W_SEX + W_WT + W_AGE + W_LOC + W_GRND);
  var C = {
    num: ML,
    tag: ML + W_NUM,
    date: ML + W_NUM + W_TAG,
    time: ML + W_NUM + W_TAG + W_DATE,
    sp: ML + W_NUM + W_TAG + W_DATE + W_TIME,
    sex: ML + W_NUM + W_TAG + W_DATE + W_TIME + W_SP,
    wt: ML + W_NUM + W_TAG + W_DATE + W_TIME + W_SP + W_SEX,
    age: ML + W_NUM + W_TAG + W_DATE + W_TIME + W_SP + W_SEX + W_WT,
    loc: ML + W_NUM + W_TAG + W_DATE + W_TIME + W_SP + W_SEX + W_WT + W_AGE,
    grnd: ML + W_NUM + W_TAG + W_DATE + W_TIME + W_SP + W_SEX + W_WT + W_AGE + W_LOC,
    notes: ML + W_NUM + W_TAG + W_DATE + W_TIME + W_SP + W_SEX + W_WT + W_AGE + W_LOC + W_GRND
  };

  function shortAge(a) {
    if (!a) return '–';
    var s = String(a).trim();
    if (/^calf/i.test(s) || /kid|fawn/i.test(s)) return 'Calf';
    if (/yearling/i.test(s)) return 'Yrl';
    if (/adult/i.test(s)) return 'Adult';
    return s.slice(0, 7);
  }

  // Header row
  doc.setFontSize(7); doc.setFont(undefined, 'bold'); doc.setFillColor(90, 122, 48); doc.setTextColor(255);
  doc.rect(ML, y, UW, 14, 'F');
  doc.text('#', C.num + 4, y + 9);
  doc.text('TAG', C.tag + 4, y + 9);
  doc.text('DATE', C.date + 4, y + 9);
  doc.text('TIME', C.time + 4, y + 9);
  doc.text('SPECIES', C.sp + 4, y + 9);
  doc.text('SEX', C.sex + 4, y + 9);
  doc.text('WT(kg)', C.wt + 4, y + 9);
  doc.text('AGE', C.age + 4, y + 9);
  doc.text('LOCATION', C.loc + 4, y + 9);
  doc.text('GROUND', C.grnd + 4, y + 9);
  doc.text('GRALLOCH / NOTES (abnormalities if any)', C.notes + 4, y + 9);
  y += 14;
  doc.setTextColor(0); doc.setFont(undefined, 'normal'); doc.setFontSize(7);

  entries.forEach(function(e, idx) {
    // Page break
    if (y > PH - 120) {
      doc.addPage();
      y = 40;
      doc.setFontSize(7); doc.setFont(undefined, 'bold'); doc.setFillColor(90, 122, 48); doc.setTextColor(255);
      doc.rect(ML, y, UW, 14, 'F');
      doc.text('#', C.num + 4, y + 9); doc.text('TAG', C.tag + 4, y + 9);
      doc.text('DATE', C.date + 4, y + 9); doc.text('TIME', C.time + 4, y + 9);
      doc.text('SPECIES', C.sp + 4, y + 9); doc.text('SEX', C.sex + 4, y + 9);
      doc.text('WT(kg)', C.wt + 4, y + 9); doc.text('AGE', C.age + 4, y + 9);
      doc.text('LOCATION', C.loc + 4, y + 9); doc.text('GROUND', C.grnd + 4, y + 9);
      doc.text('GRALLOCH / NOTES (abnormalities if any)', C.notes + 4, y + 9);
      y += 14;
      doc.setTextColor(0); doc.setFont(undefined, 'normal'); doc.setFontSize(7);
    }
    // Zebra
    if (idx % 2 === 0) { doc.setFillColor(248, 246, 240); doc.rect(ML, y, UW, 14, 'F'); }
    var rowY = y + 9;
    doc.text(String(idx + 1), C.num + 4, rowY);
    doc.text((e.tag_number ? String(e.tag_number) : '–').slice(0, 10), C.tag + 4, rowY);
    doc.text(e.date || '–', C.date + 4, rowY);
    doc.text(e.time || '–', C.time + 4, rowY);
    doc.text((e.species || '–').slice(0, 12), C.sp + 4, rowY);
    doc.text((sexLabel(e.sex, e.species) || '–').slice(0, 8), C.sex + 4, rowY);
    doc.text(hasValue(e.weight_kg) ? String(e.weight_kg) : '–', C.wt + 4, rowY);
    doc.text(shortAge(e.age_class), C.age + 4, rowY);
    var locTxt = (e.location_name || '–');
    var locLines = doc.splitTextToSize(locTxt, W_LOC - 6);
    doc.text(locLines.length > 1 ? locLines[0].slice(0, 30) + '…' : (locLines[0] || '–'), C.loc + 4, rowY);
    doc.text((e.ground || '–').slice(0, 14), C.grnd + 4, rowY);
    // Prefer structured abnormalities over free-text notes: shorter, more
    // uniform, and actually defensible as "trained hunter ticked these boxes".
    // Codes are expanded to short labels; when the list is long we append "+N"
    // so the row height stays fixed.
    var gText;
    if (Array.isArray(e.abnormalities) && e.abnormalities.length) {
      if (e.abnormalities.length === 1 && e.abnormalities[0] === 'none') {
        gText = 'No abnormalities observed';
      } else {
        var codes = e.abnormalities.filter(function(c) { return c !== 'none'; });
        var shown = codes.slice(0, 2).map(function(c) { return ABNORMALITY_LABEL_BY_CODE[c] || c; }).join(', ');
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
    var nLines = doc.splitTextToSize(gText, W_NOTES - 6);
    doc.text(nLines.length > 1 ? nLines[0].slice(0, 40) + '…' : (nLines[0] || '–'), C.notes + 4, rowY);
    y += 14;
  });

  // Declaration block
  if (y > PH - 110) { doc.addPage(); y = 40; }
  y += 16;
  doc.setDrawColor(200); doc.line(ML, y, PW - MR, y); y += 16;
  doc.setFontSize(10); doc.setFont(undefined, 'bold');
  doc.text('Declaration', ML, y); y += 12;
  doc.setFont(undefined, 'normal'); doc.setFontSize(9);
  var declLines = doc.splitTextToSize(
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

  var fname = 'consignment-declaration-' + (dateMin || 'na')
    + (dateMax && dateMax !== dateMin ? '-to-' + dateMax : '')
    + '.pdf';
  doc.save(fname);
  showToast('✅ Consignment declaration PDF downloaded · ' + entries.length + ' carcass' + (entries.length === 1 ? '' : 'es'));
  exitSelectMode();
}

// ══════════════════════════════════════════════════════════════
// BULK OPERATIONS (multi-select on the diary list)
// ══════════════════════════════════════════════════════════════
// Multi-select plumbing lives in `enterSelectMode` / `toggleEntrySelection`
// / `flSelection.ids`. The Game Dealer consignment PDF was the first
// consumer; these are the remaining two bulk actions — CSV and Delete.

/**
 * Export the currently-selected entries as a single CSV. Reuses the same
 * column schema as the full-list CSV so saved templates / macros keep
 * working. Unlike the consignment PDF we do NOT filter out "Left on hill":
 * a user picking rows for their own CSV probably wants everything they
 * picked. No date / season restriction either — selection wins.
 */
function bulkCsvSelected() {
  if (!flSelection.ids || flSelection.ids.size === 0) {
    showToast('⚠️ No entries selected');
    return;
  }
  var picked = allEntries.filter(function(e) { return flSelection.ids.has(e.id); });
  if (picked.length === 0) {
    showToast('⚠️ No entries selected');
    return;
  }
  // Sort descending by date/time to match the default list order.
  picked.sort(function(a, b) {
    var d = (b.date || '').localeCompare(a.date || '');
    if (d !== 0) return d;
    return (b.time || '').localeCompare(a.time || '');
  });
  exportCSVData(picked, 'selection-' + picked.length);
}

/**
 * Open the themed bulk-delete confirmation modal for the current selection.
 * Renders a short summary (count + total weight + species list) so the user
 * has one last "am I really deleting this much?" moment before confirming.
 */
function openBulkDeleteModal() {
  if (!flSelection.ids || flSelection.ids.size === 0) {
    showToast('⚠️ No entries selected');
    return;
  }
  var picked = allEntries.filter(function(e) { return flSelection.ids.has(e.id); });
  var countEl = document.getElementById('del-bulk-count');
  if (countEl) countEl.textContent = String(picked.length);
  var sumEl = document.getElementById('del-bulk-summary');
  if (sumEl) {
    var kg = picked.reduce(function(s, e) { return s + (parseFloat(e.weight_kg) || 0); }, 0);
    var spp = {};
    picked.forEach(function(e) {
      if (e && e.species) spp[e.species] = (spp[e.species] || 0) + 1;
    });
    var sppList = Object.keys(spp).sort().map(function(k) {
      return '<span class="del-sp">' + esc(k) + '</span>' + ' ×' + spp[k];
    }).join(' · ');
    var parts = [];
    if (sppList) parts.push(sppList);
    if (kg > 0) parts.push(Math.round(kg * 10) / 10 + ' kg total');
    sumEl.innerHTML = parts.join(' · ');
  }
  var modal = document.getElementById('delete-bulk-modal');
  if (modal) modal.style.display = 'flex';
}

function closeBulkDeleteModal() {
  var modal = document.getElementById('delete-bulk-modal');
  if (modal) modal.style.display = 'none';
}

/**
 * Execute the bulk delete: photos first (best-effort, parallel), then a
 * single `DELETE ... WHERE id IN (...) AND user_id = :me`. Belt-and-braces
 * user_id filter matches the single-delete path and means a regressed RLS
 * policy quietly matches 0 rows instead of deleting somebody else's data.
 */
async function confirmBulkDelete() {
  if (!flSelection.ids || flSelection.ids.size === 0) {
    closeBulkDeleteModal();
    return;
  }
  var ids = Array.from(flSelection.ids);
  var picked = allEntries.filter(function(e) { return flSelection.ids.has(e.id); });
  var btn = document.getElementById('delete-bulk-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }
  try {
    // Collect storage paths for photo removal. Storage failure is non-fatal
    // (the row delete is what matters for the diary — orphans can be
    // cleaned up later by the storage-audit script).
    var paths = [];
    picked.forEach(function(e) {
      if (e && e.photo_url) {
        var p = cullPhotoStoragePath(e.photo_url);
        if (p) paths.push(p);
      }
    });
    if (paths.length && sb) {
      try { await sb.storage.from('cull-photos').remove(paths); }
      catch (_) { /* best-effort */ }
    }
    var r = await sb.from('cull_entries')
      .delete()
      .in('id', ids)
      .eq('user_id', currentUser.id);
    if (r.error) {
      if (typeof console !== 'undefined' && console.warn) console.warn('bulk delete:', r.error);
      showToast('⚠️ ' + (r.error.message || 'Could not delete'));
      flHapticError();
      return;
    }
    // Any of the deleted rows might have been the sole entry in the earliest
    // season, so force a re-probe (matches single-delete semantics).
    invalidateSeasonCache();
    showToast('🗑 Deleted ' + ids.length + ' ' + (ids.length === 1 ? 'entry' : 'entries'));
    closeBulkDeleteModal();
    exitSelectMode();
    await loadEntries();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Delete entries'; }
  }
}

// ══════════════════════════════════════════════════════════════
// QUICK ENTRY
// ══════════════════════════════════════════════════════════════
// Quick-entry state — species + sex the user picked, plus the GPS/label we
// resolved silently in the background. Grouped into one object to make the
// relationship explicit: the `lat` / `lng` / `location` fields are all
// side outputs of the same `navigator.geolocation` call.
var flQuickEntry = { species: null, sex: null, location: '', lat: null, lng: null };

async function openQuickEntry() {
  if (!isDiaryUkClockReady()) {
    var okClock = await syncDiaryTrustedUkClock();
    if (!okClock) { showToast('⚠️ UK time unavailable — connect to internet'); return; }
  }
  // Reset state
  flQuickEntry.species = null; flQuickEntry.sex = null;
  document.querySelectorAll('.qs-pill').forEach(function(p){ p.classList.remove('on'); });
  document.getElementById('qs-m').classList.remove('on');
  document.getElementById('qs-f').classList.remove('on');
  updateQuickSexLabels(null);
  document.getElementById('qs-wt').value = '';
  document.getElementById('qs-tag').value = '';

  // Pre-fill date/time/location in meta line
  var now = diaryNow();
  var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var _hm = (function(d){ var p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d); return {h:parseInt(p.find(function(x){return x.type==='hour';}).value),m:parseInt(p.find(function(x){return x.type==='minute';}).value)}; }(now)); var timeStr = ('0'+_hm.h).slice(-2)+':'+('0'+_hm.m).slice(-2);
  var dateStr = days[now.getDay()] + ' ' + now.getDate() + ' ' + months[now.getMonth()];
  document.getElementById('qs-meta').textContent = dateStr + ' · ' + timeStr + ' · Getting location…';

  // Show sheet
  document.getElementById('qs-overlay').classList.add('open');
  var qs = document.getElementById('quick-sheet');
  qs.style.display = 'block';
  qs.style.transform = 'translateX(-50%)';
  document.body.style.overflow = 'hidden';

  // Silently fetch GPS location
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(pos) {
      flQuickEntry.lat = pos.coords.latitude.toFixed(4);
      flQuickEntry.lng = pos.coords.longitude.toFixed(4);
      nominatimFetch('https://nominatim.openstreetmap.org/reverse?lat=' + flQuickEntry.lat + '&lon=' + flQuickEntry.lng + '&format=json')
        .then(function(r){ return r.json(); })
        .then(function(d) {
          flQuickEntry.location = diaryReverseGeocodeLabel(d, flQuickEntry.lat, flQuickEntry.lng);
          document.getElementById('qs-meta').textContent = dateStr + ' · ' + timeStr + ' · ' + flQuickEntry.location;
        }).catch(function() {
          flQuickEntry.location = flQuickEntry.lat + ', ' + flQuickEntry.lng;
          document.getElementById('qs-meta').textContent = dateStr + ' · ' + timeStr + ' · ' + flQuickEntry.location;
        });
    }, function() {
      flQuickEntry.location = '';
      document.getElementById('qs-meta').textContent = dateStr + ' · ' + timeStr;
    }, { timeout: 6000, maximumAge: 60000 });
  } else {
    document.getElementById('qs-meta').textContent = dateStr + ' · ' + timeStr;
  }
}

function closeQuickEntry() {
  document.getElementById('qs-overlay').classList.remove('open');
  document.getElementById('quick-sheet').style.display = 'none';
  document.body.style.overflow = '';
  flQuickEntry.species = null; flQuickEntry.sex = null;
}

function qsPick(el, name) {
  document.querySelectorAll('.qs-pill').forEach(function(p){ p.classList.remove('on'); });
  el.classList.add('on');
  flQuickEntry.species = name;
  updateQuickSexLabels(name);
}

function qsSex(s) {
  flQuickEntry.sex = s;
  document.getElementById('qs-m').classList.toggle('on', s === 'm');
  document.getElementById('qs-f').classList.toggle('on', s === 'f');
}

async function resolveQuickEntrySyndicateId() {
  if (!sb || !currentUser) return null;
  try {
    var list = await loadMySyndicateRows();
    if (list.length === 1 && list[0] && list[0].syndicate) {
      var only = list[0].syndicate;
      var gf = only.ground_filter ? String(only.ground_filter).trim() : '';
      if (!gf) return only.id;
      showToast('ℹ️ Quick entry saved as personal: this syndicate requires a ground match.');
      return null;
    }
    if (list.length > 1) {
      showToast('ℹ️ Multiple syndicates: quick entry saves as personal. Edit entry to assign a syndicate.');
    }
  } catch (e) {
    console.warn('resolveQuickEntrySyndicateId:', e);
  }
  return null;
}

async function saveQuickEntry() {
  if (!flQuickEntry.species) { showToast('⚠️ Please select a species'); return; }
  if (!flQuickEntry.sex)     { showToast('⚠️ Please select sex'); return; }
  if (!sb || !currentUser) { showToast('⚠️ Not signed in'); return; }

  var btn = document.getElementById('qs-save-btn');
  btn.disabled = true; btn.innerHTML = diaryCloudSaveInner('Saving…');

  if (!isDiaryUkClockReady()) {
    var okClock = await syncDiaryTrustedUkClock();
    if (!okClock) {
      btn.disabled = false; btn.innerHTML = diaryCloudSaveInner('Save to Cloud');
      showToast('⚠️ UK time unavailable — connect to internet');
      return;
    }
  }
  var now = diaryNow();
  var _ymd2 = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now);
  var dateVal = _ymd2.find(function(x){return x.type==='year';}).value + '-'
    + _ymd2.find(function(x){return x.type==='month';}).value + '-'
    + _ymd2.find(function(x){return x.type==='day';}).value;
  var _hm2 = (function(d){ var p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d); return {h:parseInt(p.find(function(x){return x.type==='hour';}).value),m:parseInt(p.find(function(x){return x.type==='minute';}).value)}; }(now)); var timeVal = ('0'+_hm2.h).slice(-2)+':'+('0'+_hm2.m).slice(-2);

  var wtRaw = parseFloat(document.getElementById('qs-wt').value);
  var wtVal = numOrNull(Number.isFinite(wtRaw) ? Math.max(0, wtRaw) : NaN);

  var payload = {
    user_id:         currentUser.id,
    species:         flQuickEntry.species,
    sex:             flQuickEntry.sex,
    date:            dateVal,
    time:            timeVal,
    location_name:   flQuickEntry.location || null,
    weight_kg:       wtVal,
    tag_number:      (document.getElementById('qs-tag').value || '').trim() || null,
    lat:             flQuickEntry.lat ? parseFloat(flQuickEntry.lat) : null,
    lng:             flQuickEntry.lng ? parseFloat(flQuickEntry.lng) : null,
    syndicate_id:    null,
  };

  // ── Offline check ──
  if (!navigator.onLine) {
    await queueOfflineEntry({ species:payload.species, sex:payload.sex, date:payload.date, time:payload.time,
      location_name:payload.location_name, lat:payload.lat, lng:payload.lng,
      weight_kg:payload.weight_kg, tag_number:payload.tag_number,
      syndicate_id:payload.syndicate_id });
    btn.disabled = false; btn.innerHTML = diaryCloudSaveInner('Save to Cloud');
    return;
  }

  try {
    payload.syndicate_id = await resolveQuickEntrySyndicateId();
    var result = await sb.from('cull_entries').insert(payload).select('id');
    if (result.error) throw result.error;
    if (payload && payload.date) extendSeasonCacheForDate(payload.date);
    showToast('✅ ' + flQuickEntry.species + ' saved');
    flHapticSuccess();
    // Attach weather in background (last 7 days only; no-op otherwise). We only
    // have the inserted id here via the `.select('id')` — no "most recent row"
    // fallback, same hardening as the full form. Quick entries usually have a
    // GPS fix because openQuickEntry fires navigator.geolocation silently on
    // sheet open (see ~line 4960); if the user denied or the browser timed out,
    // flQuickEntry.lat/lng stay null and we fall back to lastGpsLat/lastGpsLng, and if
    // that's also missing we simply skip the weather attach.
    try {
      var qsSavedId = (result.data && result.data[0] && result.data[0].id) || null;
      var qsWxLat = payload.lat != null ? payload.lat : numOrNull(lastGpsLat);
      var qsWxLng = payload.lng != null ? payload.lng : numOrNull(lastGpsLng);
      if (qsSavedId && qsWxLat != null && qsWxLng != null) {
        attachWeatherToEntry(qsSavedId, payload.date, payload.time, qsWxLat, qsWxLng);
      }
    } catch (_) { /* non-fatal */ }
    closeQuickEntry();
    await loadEntries();
  } catch(e) {
    showToast('⚠️ Save failed: ' + (e.message || 'Unknown error'));
    flHapticError();
  }
  btn.disabled = false; btn.innerHTML = diaryCloudSaveInner('Save to Cloud');
}


// Open-Meteo WMO codes → abbrev + label + SVG + strip bar (replaces emoji sky cells)
// ── Weather at time of cull ──────────────────────────────────
// The pure helpers (wxCodeLabel, windDirLabel, findOpenMeteoHourlyIndex,
// diaryLondonWallMs) and the Open-Meteo fetch (fetchCullWeather) have moved
// to modules/weather.mjs. See MODULARISATION-PLAN.md → Commit F. The
// persistence wrapper (attachWeatherToEntry) and the render surface
// (renderWeatherStrip) stay here because they touch `sb`, `currentUser`,
// `allEntries`, and `esc()` — all still diary.js-local.
// Weather rows are stored as JSONB in cull_entries.weather_data.

async function attachWeatherToEntry(entryId, date, time, lat, lng) {
  if (!sb || !currentUser || !entryId) return;
  var wx = await fetchCullWeather(date, time, lat, lng);
  if (!wx) return; // silently skip if outside 7-day window or fetch failed
  try {
    var upd = await sb.from('cull_entries')
      .update({ weather_data: wx })
      .eq('id', entryId)
      .eq('user_id', currentUser.id);
    if (upd.error) console.warn('Weather attach failed:', upd.error);
    else {
      var wxi = allEntries.findIndex(function(x) { return x.id === entryId; });
      if (wxi !== -1) allEntries[wxi].weather_data = wx;
    }
  } catch(e) {
    console.warn('Weather attach failed:', e);
  }
}

function renderWeatherStrip(e) {
  var wx = e.weather_data;
  if (!wx || typeof wx !== 'object') return '';

  var wc = wxCodeLabel(wx.code);
  var windDir = windDirLabel(wx.wind_dir);
  var windStr = wx.wind_mph !== null ? wx.wind_mph + ' mph' : '–';
  if (windDir) windStr += ' ' + windDir;
  var tempStr  = wx.temp    !== null ? wx.temp + '°C'   : '–';
  var pressStr = wx.pressure !== null ? wx.pressure + ' hPa' : '–';
  var cloudStr = wx.cloud   !== null ? wx.cloud + '%'   : '–';

  var wxTagTitle = '';
  if (wx.fetched_at) {
    try {
      var fd = new Date(wx.fetched_at);
      if (!isNaN(fd.getTime())) {
        wxTagTitle = 'Fetched ' + fd.toLocaleString('en-GB', {
          day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
      }
    } catch (x) { /* ignore */ }
  }

  var html = '<div class="wx-strip-hdr">'
    + '<div class="wx-strip-hdr-main">'
    + '<div class="wx-strip-title">Conditions at time of cull</div>'
    + '<span class="wx-added-tag"' + (wxTagTitle ? ' title="' + esc(wxTagTitle) + '"' : '') + '>Weather added</span>'
    + '</div>'
    + (e.time ? '<div class="wx-strip-time">' + esc(e.time) + '</div>' : '')
    + '</div>'
    + '<div class="wx-strip">'
    + '<div class="wx-cell wx-cell--sky" title="' + esc(wc.wmoTitle) + '">'
    + '<div class="wx-cell-icon">' + wc.skySvg + '</div>'
    + '<div class="wx-sky-bar" style="background:' + wc.barBg + '" aria-hidden="true"></div>'
    + '<div class="wx-cell-val wx-cell-val--sky"><div class="wx-sky-abbr">' + esc(wc.abbrev) + '</div><div class="wx-sky-full">' + esc(wc.label) + '</div></div>'
    + '<div class="wx-cell-lbl">Sky</div></div>'
    + '<div class="wx-cell"><div class="wx-cell-icon">' + SVG_WX_TEMP + '</div><div class="wx-cell-val">' + tempStr + '</div><div class="wx-cell-lbl">Temp</div></div>'
    + '<div class="wx-cell"><div class="wx-cell-icon">' + SVG_WX_WIND + '</div><div class="wx-cell-val" style="font-size:10px;">' + esc(windStr) + '</div><div class="wx-cell-lbl">Wind</div></div>'
    + '<div class="wx-cell"><div class="wx-cell-icon">' + SVG_WX_PRESSURE + '</div><div class="wx-cell-val" style="font-size:10px;">' + esc(pressStr) + '</div><div class="wx-cell-lbl">Pressure</div></div>'
    + '</div>';

  return html;
}


// ══════════════════════════════════════════════════════════════
// MAP FEATURE — Pin Drop + Cull Map
// ══════════════════════════════════════════════════════════════
var OS_KEY = 'Q4CgPxeA5EHM17KPG6y78arVIekRHGsv';
var MAPBOX_TOKEN = (function() {
  try {
    // Prefer token set on window (if allowed by CSP), else read meta tag.
    var w = (typeof window !== 'undefined' && window.FL_MAPBOX_TOKEN) ? String(window.FL_MAPBOX_TOKEN).trim() : '';
    if (w) return w;
    if (typeof document === 'undefined' || !document.querySelector) return '';
    var meta = document.querySelector('meta[name="fl-mapbox-token"]');
    var m = meta && meta.getAttribute ? String(meta.getAttribute('content') || '').trim() : '';
    return m;
  } catch (_) { return ''; }
})();
var MAPBOX_STYLE_STD = 'mapbox/outdoors-v12';
var MAPBOX_STYLE_SAT = 'mapbox/satellite-streets-v12';
var TILE_SAT_ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
// OS Maps API — Road_3857 works on free tier; Outdoor_3857 requires premium
var TILE_OS_STD = 'https://api.os.uk/maps/raster/v1/zxy/Road_3857/{z}/{x}/{y}.png?key=' + OS_KEY;
var TILE_MB_STD = MAPBOX_TOKEN ? ('https://api.mapbox.com/styles/v1/' + MAPBOX_STYLE_STD + '/tiles/512/{z}/{x}/{y}@2x?access_token=' + encodeURIComponent(MAPBOX_TOKEN)) : '';
var TILE_MB_SAT = MAPBOX_TOKEN ? ('https://api.mapbox.com/styles/v1/' + MAPBOX_STYLE_SAT + '/tiles/512/{z}/{x}/{y}@2x?access_token=' + encodeURIComponent(MAPBOX_TOKEN)) : '';
var mapProvider = MAPBOX_TOKEN ? 'mapbox' : 'legacy';
var _mapboxFallbackDone = false;

var SP_COLORS = {
  'Red Deer':'#c8a84b','Roe Deer':'#5a7a30','Fallow':'#f57f17',
  'Muntjac':'#6a1b9a','Sika':'#1565c0','CWD':'#00695c'
};

// ── PIN DROP ──────────────────────────────────────────────────
var pinMap = null, pinMapLayer = null, pinSatLayer = null;
var formPinLat = null, formPinLng = null;
var pinNominatimTimer = null;
var _pinMapTileErrorCount = 0;
var _cullMapTileErrorCount = 0;

function mapboxTileOpts() {
  return { maxZoom: 20, tileSize: 512, zoomOffset: -1 };
}

function legacyTileOpts() {
  return { maxZoom: 20 };
}

function mapProviderTileUrls() {
  if (mapProvider === 'mapbox' && TILE_MB_STD && TILE_MB_SAT) {
    return { std: TILE_MB_STD, sat: TILE_MB_SAT, mode: 'mapbox' };
  }
  return { std: TILE_OS_STD, sat: TILE_SAT_ESRI, mode: 'legacy' };
}

function bumpMapLoadEstimate(context) {
  // Browser-local estimate only; real billing is account-wide in Mapbox.
  try {
  var now = diaryNow();
    var monthKey = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2);
    var key = 'fl_map_load_est_' + monthKey;
    var n = (parseInt(localStorage.getItem(key), 10) || 0) + 1;
    localStorage.setItem(key, String(n));
    var warn70 = 'fl_map_load_warn70_' + monthKey;
    var warn90 = 'fl_map_load_warn90_' + monthKey;
    if (n >= 35000 && !localStorage.getItem(warn70)) {
      localStorage.setItem(warn70, '1');
      console.warn('[Map usage estimate] ~70% of 50k Mapbox free-tier reached on this browser (' + context + ').');
    }
    if (n >= 45000 && !localStorage.getItem(warn90)) {
      localStorage.setItem(warn90, '1');
      console.warn('[Map usage estimate] ~90% of 50k Mapbox free-tier reached on this browser (' + context + ').');
    }
  } catch (_) { /* ignore storage errors */ }
}

function maybeFallbackFromMapbox(reason) {
  if (mapProvider !== 'mapbox' || _mapboxFallbackDone) return;
  if (!navigator.onLine) return;
  _mapboxFallbackDone = true;
  mapProvider = 'legacy';

  var pinWasSat = document.getElementById('plt-sat') && document.getElementById('plt-sat').classList.contains('on');
  var cullWasSat = document.getElementById('clt-sat') && document.getElementById('clt-sat').classList.contains('on');

  if (pinMap) {
    try {
      if (pinMapLayer) pinMap.removeLayer(pinMapLayer);
      if (pinSatLayer) pinMap.removeLayer(pinSatLayer);
    } catch (_) {}
    pinMapLayer = L.tileLayer(TILE_OS_STD, legacyTileOpts()).addTo(pinMap);
    pinSatLayer = L.tileLayer(TILE_SAT_ESRI, legacyTileOpts());
    attachPinMapTileErrorHandlers();
    setPinLayer(pinWasSat ? 'sat' : 'map');
  }
  if (cullMap) {
    try {
      if (cullMapLayer) cullMap.removeLayer(cullMapLayer);
      if (cullSatLayer) cullMap.removeLayer(cullSatLayer);
    } catch (_) {}
    cullMapLayer = L.tileLayer(TILE_OS_STD, legacyTileOpts()).addTo(cullMap);
    cullSatLayer = L.tileLayer(TILE_SAT_ESRI, legacyTileOpts());
    attachCullMapTileErrorHandlers();
    setCullLayer(cullWasSat ? 'sat' : 'map');
  }

  showToast('⚠️ Mapbox unavailable — switched to fallback map (' + reason + ')');
}

function formatPinMapCoordLine(lat, lng) {
  return Math.abs(lat).toFixed(5) + '°' + (lat >= 0 ? 'N' : 'S')
    + ' · ' + Math.abs(lng).toFixed(5) + '°' + (lng >= 0 ? 'E' : 'W');
}

function refreshPinMapFallbackBanner() {
  var el = document.getElementById('pinmap-fallback-msg');
  if (!el) return;
  var o = document.getElementById('pinmap-overlay');
  if (!o || o.style.display !== 'flex') return;
  if (!navigator.onLine) {
    el.style.display = 'block';
    el.textContent = 'Offline — map tiles won\'t load. Enter latitude and longitude (decimal degrees, WGS84), tap Apply, then Confirm.';
    return;
  }
  if (_pinMapTileErrorCount >= 3) {
    el.style.display = 'block';
    el.textContent = 'Map tiles may be failing. Enter decimal degrees below, try Satellite, or check signal.';
    return;
  }
  el.style.display = 'none';
  el.textContent = '';
}

function applyManualPinCoords() {
  var latEl = document.getElementById('pinmap-manual-lat');
  var lngEl = document.getElementById('pinmap-manual-lng');
  if (!latEl || !lngEl) return;
  var lat = parseFloat(String(latEl.value).trim().replace(',', '.'));
  var lng = parseFloat(String(lngEl.value).trim().replace(',', '.'));
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    showToast('⚠️ Enter valid latitude (−90…90) and longitude (−180…180), decimal degrees.');
    return;
  }
  if (!pinMap) {
    showToast('⚠️ Open the map first');
    return;
  }
  pinMap.setView([lat, lng], Math.max(pinMap.getZoom(), 12));
  document.getElementById('pinmap-coords').textContent = formatPinMapCoordLine(lat, lng);
  document.getElementById('pinmap-name').textContent = lat.toFixed(5) + ', ' + lng.toFixed(5);
  formPinLat = lat;
  formPinLng = lng;
  lastGpsLat = lat;
  lastGpsLng = lng;
  setTimeout(function() { if (pinMap) pinMap.invalidateSize(); }, 80);
  showToast('✓ Coordinates applied');
}

function attachPinMapTileErrorHandlers() {
  if (!pinMapLayer || !pinSatLayer || pinMapLayer._flTileErrBound) return;
  pinMapLayer._flTileErrBound = true;
  function bump() {
    _pinMapTileErrorCount++;
    refreshPinMapFallbackBanner();
    if (_pinMapTileErrorCount >= 6) maybeFallbackFromMapbox('tile errors');
  }
  pinMapLayer.on('tileerror', bump);
  pinSatLayer.on('tileerror', bump);
}

function attachCullMapTileErrorHandlers() {
  if (!cullMapLayer || !cullSatLayer || cullMapLayer._flTileErrBound) return;
  cullMapLayer._flTileErrBound = true;
  function bump() {
    _cullMapTileErrorCount++;
    if (_cullMapTileErrorCount >= 6) maybeFallbackFromMapbox('tile errors');
  }
  cullMapLayer.on('tileerror', bump);
  cullSatLayer.on('tileerror', bump);
}

function makeMarkerIcon(color) {
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34">'
    + '<filter id="ms"><feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-opacity="0.3"/></filter>'
    + '<path d="M13 2C7.5 2 3 6.5 3 12c0 8 10 20 10 20s10-12 10-20C23 6.5 18.5 2 13 2z" fill="' + color + '" stroke="white" stroke-width="1.8" filter="url(#ms)"/>'
    + '<circle cx="13" cy="12" r="4.5" fill="white" opacity="0.92"/>'
    + '</svg>';
  return L.divIcon({ html:svg, iconSize:[26,34], iconAnchor:[13,34], popupAnchor:[0,-34], className:'' });
}

function openPinDrop() {
  _pinMapTileErrorCount = 0;
  var overlay = document.getElementById('pinmap-overlay');
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  var mLat = document.getElementById('pinmap-manual-lat');
  var mLng = document.getElementById('pinmap-manual-lng');
  if (mLat && mLng) {
    var pLat = formPinLat != null ? formPinLat : lastGpsLat;
    var pLng = formPinLng != null ? formPinLng : lastGpsLng;
    mLat.value = pLat != null ? String(pLat) : '';
    mLng.value = pLng != null ? String(pLng) : '';
  }

  if (!pinMap) {
    // Default centre: UK midpoint, or last known location
    var startLat = formPinLat || lastGpsLat || 52.5;
    var startLng = formPinLng || lastGpsLng || -1.5;

    pinMap = L.map('pin-map-div', { zoomControl:true, attributionControl:false })
      .setView([startLat, startLng], 14);

    var pinTiles = mapProviderTileUrls();
    var pinOpts = pinTiles.mode === 'mapbox' ? mapboxTileOpts() : legacyTileOpts();
    pinMapLayer = L.tileLayer(pinTiles.std, pinOpts).addTo(pinMap);
    pinSatLayer = L.tileLayer(pinTiles.sat, pinOpts);
    attachPinMapTileErrorHandlers();
    bumpMapLoadEstimate('pin-map');

    pinMap.on('move', function() {
      var c = pinMap.getCenter();
      document.getElementById('pinmap-coords').textContent = formatPinMapCoordLine(c.lat, c.lng);
      document.getElementById('pinmap-name').textContent = 'Locating…';
      clearTimeout(pinNominatimTimer);
    });

    pinMap.on('moveend', function() {
      var c = pinMap.getCenter();
      clearTimeout(pinNominatimTimer);
      pinNominatimTimer = setTimeout(function() {
        nominatimFetch('https://nominatim.openstreetmap.org/reverse?lat='+c.lat+'&lon='+c.lng+'&format=json')
          .then(function(r){ return r.json(); })
          .then(function(d) {
            var name = diaryReverseGeocodeLabel(d, c.lat.toFixed(4), c.lng.toFixed(4));
            document.getElementById('pinmap-name').textContent = name;
          }).catch(function() {
            var c2 = pinMap.getCenter();
            document.getElementById('pinmap-name').textContent = c2.lat.toFixed(4)+', '+c2.lng.toFixed(4);
          });
      }, 600); // debounce 600ms
      var _h = document.getElementById('pinmap-hint'); if(_h){ _h.style.opacity='0'; setTimeout(function(){ _h.style.display='none'; }, 300); }
    });
  } else {
    // Re-centre on last pin or current location
    var startLat = formPinLat || lastGpsLat || 52.5;
    var startLng = formPinLng || lastGpsLng || -1.5;
    pinMap.setView([startLat, startLng], 14);
    // Reset hint — remove inline style so CSS controls it
    var hint = document.getElementById('pinmap-hint');
    if (hint) { hint.style.display = ''; hint.style.opacity = ''; }
  }

  setTimeout(function(){ pinMap.invalidateSize(); }, 80);
  refreshPinMapFallbackBanner();
}

function closePinDrop() {
  document.getElementById('pinmap-overlay').style.display = 'none';
  document.body.style.overflow = '';
  var s = document.getElementById('pinmap-search');
  var r = document.getElementById('pinmap-search-results');
  if (s) s.value = '';
  if (r) r.style.display = 'none';
}

function setPinLayer(type) {
  if (!pinMap) return;
  if (type === 'sat') {
    pinMap.removeLayer(pinMapLayer); pinSatLayer.addTo(pinMap);
    document.getElementById('plt-map').className = 'lt-b off';
    document.getElementById('plt-sat').className = 'lt-b on';
  } else {
    pinMap.removeLayer(pinSatLayer); pinMapLayer.addTo(pinMap);
    document.getElementById('plt-map').className = 'lt-b on';
    document.getElementById('plt-sat').className = 'lt-b off';
  }
}

function confirmPinDrop() {
  var c = pinMap.getCenter();
  formPinLat = c.lat; formPinLng = c.lng;
  lastGpsLat = c.lat; lastGpsLng = c.lng;
  var name = document.getElementById('pinmap-name').textContent;
  if (name === 'Locating…') name = c.lat.toFixed(4) + ', ' + c.lng.toFixed(4);
  document.getElementById('f-location').value = name;
  showPinnedStrip(name, c.lat, c.lng);
  closePinDrop();
}

function showPinnedStrip(name, lat, lng) {
  var strip = document.getElementById('loc-pinned-strip');
  document.getElementById('loc-pinned-name').textContent = name;
  document.getElementById('loc-pinned-coords').textContent =
    Math.abs(lat).toFixed(4) + '°' + (lat>=0?'N':'S') +
    ' · ' + Math.abs(lng).toFixed(4) + '°' + (lng>=0?'E':'W');
  strip.style.display = 'flex';
}

function clearPinnedLocation() {
  formPinLat = null; formPinLng = null;
  lastGpsLat = null; lastGpsLng = null;
  var strip = document.getElementById('loc-pinned-strip');
  if (strip) strip.style.display = 'none';
}

// ── CULL MAP ──────────────────────────────────────────────────
var cullMap = null, cullMapLayer = null, cullSatLayer = null;
var cullMarkers = [];
var cullClusterGroup = null;
var cullFilter = 'all';
var cullMapFullscreen = false;

function initCullMap() {
  if (cullMap) return;
  var container = document.getElementById('cull-map-div');
  if (!container) return;

  // Set container height
  container.style.height = '300px';

  cullMap = L.map('cull-map-div', { zoomControl:true, attributionControl:false })
    .setView([54.0, -2.0], 6); // UK overview

  var cullTiles = mapProviderTileUrls();
  var cullOpts = cullTiles.mode === 'mapbox' ? mapboxTileOpts() : legacyTileOpts();
  cullMapLayer = L.tileLayer(cullTiles.std, cullOpts).addTo(cullMap);
  cullSatLayer = L.tileLayer(cullTiles.sat, cullOpts);
  attachCullMapTileErrorHandlers();
  bumpMapLoadEstimate('cull-map');
}

function setCullLayer(type) {
  if (!cullMap) return;
  var mapBtn = document.getElementById('clt-map');
  var satBtn = document.getElementById('clt-sat');
  var mapBtnFs = document.getElementById('clt-map-fs');
  var satBtnFs = document.getElementById('clt-sat-fs');
  if (type === 'sat') {
    cullMap.removeLayer(cullMapLayer); cullSatLayer.addTo(cullMap);
    if (mapBtn) mapBtn.className = 'lt-b off';
    if (satBtn) satBtn.className = 'lt-b on';
    if (mapBtnFs) mapBtnFs.className = 'lt-b off';
    if (satBtnFs) satBtnFs.className = 'lt-b on';
  } else {
    cullMap.removeLayer(cullSatLayer); cullMapLayer.addTo(cullMap);
    if (mapBtn) mapBtn.className = 'lt-b on';
    if (satBtn) satBtn.className = 'lt-b off';
    if (mapBtnFs) mapBtnFs.className = 'lt-b on';
    if (satBtnFs) satBtnFs.className = 'lt-b off';
  }
}

function filterCullMap(filter, el) {
  cullFilter = filter;
  document.querySelectorAll('.cmf-chip').forEach(function(c){
    c.classList.remove('on');
    c.setAttribute('aria-pressed', 'false');
  });
  el.classList.add('on');
  el.setAttribute('aria-pressed', 'true');
  // Chip filters are scoped to the map only: they re-paint pins but must NOT rebuild
  // the KPIs, charts & breakdowns, season plan, or the filteredEntries used by exports.
  // Previously called buildStats(filter) which affected every downstream number.
  renderCullMapPins();
}

function toggleMapFullscreen() {
  var container = document.getElementById('cull-map-container');
  if (!container || !cullMap) return;
  cullMapFullscreen = !cullMapFullscreen;

  if (cullMapFullscreen) {
    container.classList.add('map-fullscreen');
    var isSat = !!(document.getElementById('clt-sat') && document.getElementById('clt-sat').classList.contains('on'));
    var fsLayer = document.createElement('div');
    fsLayer.className = 'layer-tog';
    fsLayer.id = 'map-fs-layer-tog';
    fsLayer.style.position = 'absolute';
    // Dock beside Leaflet zoom control (top-left) in fullscreen.
    fsLayer.style.top = '12px';
    fsLayer.style.left = '58px';
    fsLayer.style.right = 'auto';
    fsLayer.style.zIndex = '9999';
    fsLayer.style.boxShadow = '0 2px 12px rgba(0,0,0,0.35)';
    fsLayer.style.border = '1.5px solid rgba(255,255,255,0.12)';
    fsLayer.innerHTML = ''
      + '<button class="lt-b ' + (isSat ? 'off' : 'on') + '" id="clt-map-fs" type="button" aria-label="Show map layer">Map</button>'
      + '<div class="lt-div"></div>'
      + '<button class="lt-b ' + (isSat ? 'on' : 'off') + '" id="clt-sat-fs" type="button" aria-label="Show satellite layer">Satellite</button>';
    container.appendChild(fsLayer);
    var mapFsBtn = document.getElementById('clt-map-fs');
    var satFsBtn = document.getElementById('clt-sat-fs');
    if (mapFsBtn) mapFsBtn.onclick = function() { setCullLayer('map'); };
    if (satFsBtn) satFsBtn.onclick = function() { setCullLayer('sat'); };

    var closeBtn = document.createElement('button');
    closeBtn.className = 'map-fs-close';
    closeBtn.id = 'map-fs-close';
    closeBtn.setAttribute('aria-label', 'Exit fullscreen map');
    closeBtn.title = 'Exit fullscreen';
    closeBtn.innerHTML = '✕';
    closeBtn.onclick = toggleMapFullscreen;
    container.appendChild(closeBtn);
  } else {
    container.classList.remove('map-fullscreen');
    var fsTog = document.getElementById('map-fs-layer-tog');
    if (fsTog) fsTog.remove();
    var cb = document.getElementById('map-fs-close');
    if (cb) cb.remove();
  }
  setTimeout(function(){ if(cullMap) cullMap.invalidateSize(); }, 150);
}

function renderCullMapPins() {
  if (!cullMap) return;
  // Remove existing markers and cluster group
  if (cullClusterGroup) { cullMap.removeLayer(cullClusterGroup); cullClusterGroup = null; }
  cullMarkers.forEach(function(m){ cullMap.removeLayer(m); });
  cullMarkers = [];

  var entries = allEntries.filter(function(e) {
    return e.lat != null && e.lng != null && (cullFilter === 'all' || e.species === cullFilter);
  });

  var noGps = allEntries.filter(function(e){ return e.lat == null || e.lng == null; }).length;
  var spSet = new Set(allEntries.filter(function(e){ return e.lat != null && e.lng != null; }).map(function(e){ return e.species; }));

  document.getElementById('cms-pinned').textContent = entries.length;
  document.getElementById('cms-nogps').textContent = noGps;
  document.getElementById('cms-species').textContent = spSet.size;

  // Show/hide empty state overlay (never destroy the map div)
  var emptyEl = document.getElementById('cull-map-empty-state');
  var mapDiv  = document.getElementById('cull-map-div');
  if (!emptyEl) {
    // Create overlay on first use
    emptyEl = document.createElement('div');
    emptyEl.id = 'cull-map-empty-state';
    emptyEl.className = 'cull-map-empty';
    emptyEl.style.cssText = 'position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;background:white;';
    emptyEl.innerHTML = '<div class="cull-map-empty-icon" aria-hidden="true">' + SVG_CULL_MAP_EMPTY_PIN + '</div>' +
      '<div class="cull-map-empty-t">No mapped locations yet</div>' +
      '<div class="cull-map-empty-s">Use the <strong>Pin</strong> or <strong>GPS</strong> button when logging entries to build your location history.</div>';
    document.getElementById('cull-map-container').appendChild(emptyEl);
  } else {
    var _cw = emptyEl.querySelector('.cull-map-empty-icon');
    if (!_cw || !_cw.querySelector('svg')) {
      emptyEl.innerHTML = '<div class="cull-map-empty-icon" aria-hidden="true">' + SVG_CULL_MAP_EMPTY_PIN + '</div>' +
        '<div class="cull-map-empty-t">No mapped locations yet</div>' +
        '<div class="cull-map-empty-s">Use the <strong>Pin</strong> or <strong>GPS</strong> button when logging entries to build your location history.</div>';
    }
  }

  if (entries.length === 0) {
    emptyEl.style.display = 'flex';
    document.getElementById('cull-map-stats').style.display = 'none';
    return;
  }

  emptyEl.style.display = 'none';
  document.getElementById('cull-map-stats').style.display = 'flex';

  var useClustering = typeof L.markerClusterGroup === 'function';
  if (useClustering) cullClusterGroup = L.markerClusterGroup({ maxClusterRadius: 45 });

  var bounds = [];
  entries.forEach(function(e) {
    var clr = SP_COLORS[e.species] || '#5a7a30';
    var sex = e.sex === 'm' ? '&#9794;' : '&#9792;';
    var popup = '<div style="font-size:13px;font-weight:700;color:#3d2b1f;">' + esc(e.species) + ' ' + sex + '</div>'
      + '<div style="font-size:11px;color:#a0988a;margin-top:2px;">' + esc(e.date||'') + (e.time ? ' · ' + esc(e.time) : '') + '</div>'
      + (hasValue(e.weight_kg) ? '<div style="font-size:11px;color:#3d2b1f;margin-top:4px;">' + esc(String(e.weight_kg)) + ' kg</div>' : '')
      + (e.tag_number ? '<div style="font-size:11px;color:#c8a84b;margin-top:2px;">Tag: ' + esc(e.tag_number) + '</div>' : '')
      + (e.shot_placement  ? '<div style="font-size:11px;color:#3d2b1f;">' + esc(e.shot_placement) + '</div>' : '')
      + (e.location_name ? '<div style="font-size:10px;color:#a0988a;margin-top:3px;display:flex;align-items:center;gap:4px;">'
        + '<span style="display:inline-flex;width:12px;height:12px;flex-shrink:0;" aria-hidden="true">' + SVG_FL_PIN + '</span>'
        + '<span>' + esc(e.location_name) + '</span></div>' : '');

    var marker = L.marker([e.lat, e.lng], { icon: makeMarkerIcon(clr) })
      .bindPopup(popup);
    if (useClustering) { cullClusterGroup.addLayer(marker); }
    else { marker.addTo(cullMap); }
    cullMarkers.push(marker);
    bounds.push([e.lat, e.lng]);
  });

  if (useClustering) cullMap.addLayer(cullClusterGroup);

  if (bounds.length > 0) {
    cullMap.fitBounds(bounds, { padding:[32,32], maxZoom:14 });
  }

  setTimeout(function(){ if(cullMap) cullMap.invalidateSize(); }, 100);
}

// ── Calibre & Distance Stats ─────────────────────────────────
// CAL_COLORS and SP_COLORS_D moved to modules/stats.mjs (Commit H).

function buildCalibreDistanceStats(entries) {
  // ── Calibre chart ──
  var calCard = document.getElementById('calibre-card');
  var calChart = document.getElementById('calibre-chart');
  var calEntries = entries.filter(function(e){ return e.calibre; });

  if (calEntries.length === 0) {
    calCard.style.display = 'none';
  } else {
    calCard.style.display = 'block';
    // Count by calibre
    var calCount = {}, calDist = {};
    calEntries.forEach(function(e) {
      var c = e.calibre.trim();
      calCount[c] = (calCount[c]||0) + 1;
      if (e.distance_m) {
        if (!calDist[c]) calDist[c] = [];
        calDist[c].push(e.distance_m);
      }
    });
    var sorted = Object.keys(calCount).sort(function(a,b){ return calCount[b]-calCount[a]; });
    var maxCnt = calCount[sorted[0]] || 1;

    var html = '';
    sorted.slice(0,6).forEach(function(cal, i) {
      var cnt = calCount[cal];
      var pct = Math.round(cnt/maxCnt*100);
      var avgDist = calDist[cal] && calDist[cal].length
        ? Math.round(calDist[cal].reduce(function(s,v){return s+v;},0)/calDist[cal].length)
        : null;
      html += '<div class="cal-row">'
        + '<div class="cal-name">' + esc(cal) + '</div>'
        + '<div class="cal-bar-wrap"><div class="cal-bar" style="width:'+pct+'%;background:'+CAL_COLORS[i%CAL_COLORS.length]+';"></div></div>'
        + '<div class="cal-cnt">' + cnt + '</div>'
        + '<div class="cal-avg-lbl">' + (avgDist ? avgDist+'m' : '–') + '</div>'
        + '</div>';
    });
    calChart.innerHTML = html;
  }

  // ── Distance chart ──
  var distCard = document.getElementById('distance-card');
  var distChart = document.getElementById('distance-chart');
  var distEntries = entries.filter(function(e){ return e.distance_m && e.distance_m > 0; });

  if (distEntries.length === 0) {
    distCard.style.display = 'none';
  } else {
    distCard.style.display = 'block';

    // Overall average
    var totalDist = distEntries.reduce(function(s,e){ return s+e.distance_m; }, 0);
    var avgDist = Math.round(totalDist / distEntries.length);

    // Per species averages
    var spDist = {};
    distEntries.forEach(function(e) {
      if (!spDist[e.species]) spDist[e.species] = [];
      spDist[e.species].push(e.distance_m);
    });
    var spAvgs = Object.keys(spDist).map(function(sp) {
      var vals = spDist[sp];
      return { sp:sp, avg: Math.round(vals.reduce(function(s,v){return s+v;},0)/vals.length) };
    }).sort(function(a,b){ return b.avg - a.avg; });
    var maxAvg = spAvgs.length ? spAvgs[0].avg : 1;

    // Range bands
    var bands = [
      { label:'0 – 50m',    min:0,   max:50,  color:'var(--moss)' },
      { label:'51 – 100m',  min:51,  max:100, color:'var(--gold)' },
      { label:'101 – 150m', min:101, max:150, color:'#f57f17' },
      { label:'150m+',      min:151, max:9999,color:'#c62828' },
    ];
    var bandCounts = bands.map(function(b) {
      return distEntries.filter(function(e){ return e.distance_m>=b.min && e.distance_m<=b.max; }).length;
    });
    var totalBand = distEntries.length;

    var html = '<div class="dist-avg-box">'
      + '<div><div class="dist-avg-val">' + avgDist + '</div><div class="dist-avg-unit">metres avg</div></div>'
      + '<div><div class="dist-avg-lbl">Overall average</div>'
      + '<div class="dist-avg-sub">Based on ' + distEntries.length + ' entr' + (distEntries.length===1?'y':'ies') + ' with<br>distance recorded</div></div>'
      + '</div>';

    if (spAvgs.length > 1) {
      html += '<div class="scard-sub-t">By species</div>';
      spAvgs.forEach(function(s) {
        var clr = SP_COLORS_D[s.sp] || '#5a7a30';
        var pct = Math.round(s.avg/maxAvg*100);
        html += '<div class="dist-sp-row">'
          + '<div class="dist-sp-dot" style="background:'+clr+';"></div>'
          + '<div class="dist-sp-name">'+s.sp+'</div>'
          + '<div class="dist-bar-wrap"><div class="dist-bar" style="width:'+pct+'%;background:'+clr+';"></div></div>'
          + '<div class="dist-val">'+s.avg+'m</div>'
          + '</div>';
      });
    }

    html += '<div class="scard-sub-t" style="margin-top:14px;">Distance bands</div>'
      + '<div class="range-grid">';
    bands.forEach(function(b, i) {
      var cnt = bandCounts[i];
      var pct = totalBand ? Math.round(cnt/totalBand*100) : 0;
      html += '<div class="range-cell">'
        + '<div class="range-band">'+b.label+'</div>'
        + '<div class="range-cnt">'+cnt+'</div>'
        + '<div class="range-pct">'+pct+'% of culls</div>'
        + '<div class="range-bar"><div class="range-bar-fill" style="width:'+pct+'%;background:'+b.color+';"></div></div>'
        + '</div>';
    });
    html += '</div>';

    distChart.innerHTML = html;
  }
}


// ── Age Class Breakdown ───────────────────────────────────────
// AGE_CLASSES, AGE_COLORS, AGE_GROUPS moved to modules/stats.mjs (Commit H).

function buildAgeStats(entries) {
  var card  = document.getElementById('age-card');
  var chart = document.getElementById('age-chart');
  var aged  = entries.filter(function(e){ return e.age_class; });

  if (aged.length === 0) { card.style.display = 'none'; return; }
  card.style.display = 'block';

  // Overall counts
  var counts = {};
  AGE_CLASSES.forEach(function(a){ counts[a] = 0; });
  aged.forEach(function(e){
    var ageKey = normalizeAgeClassLabel(e.age_class);
    if (counts[ageKey] !== undefined) counts[ageKey]++;
  });
  var total = aged.length;
  var maxCnt = Math.max.apply(null, AGE_CLASSES.map(function(a){ return counts[a]; }).concat([1]));

  // Overall bars
  var html = '';
  AGE_CLASSES.forEach(function(ac, i) {
    var cnt = counts[ac];
    var pct = total ? Math.round(cnt/total*100) : 0;
    var barPct = Math.round(cnt/maxCnt*100);
    html += '<div class="age-row">'
      + '<div class="age-lbl">' + ac + '</div>'
      + '<div class="age-bar-wrap"><div class="age-bar" style="width:'+barPct+'%;background:'+AGE_COLORS[i]+';"></div></div>'
      + '<div class="age-cnt">' + cnt + '</div>'
      + '<div class="age-pct">' + (cnt ? pct+'%' : '–') + '</div>'
      + '</div>';
  });

  // Summary pills
  var notRecorded = entries.length - aged.length;
  html += '<div class="age-summary">';
  Object.keys(AGE_GROUPS).forEach(function(grp) {
    var grpCnt = AGE_GROUPS[grp].reduce(function(s,a){ return s+(counts[a]||0); }, 0);
    var grpPct = total ? Math.round(grpCnt/total*100) : 0;
    var dotClr = grp==='Juvenile' ? '#7adf7a' : grp==='Adult' ? '#c8a84b' : '#f57f17';
    html += '<div class="age-pill">'
      + '<div class="age-pill-dot" style="background:'+dotClr+';"></div>'
      + '<div class="age-pill-txt">'+grp+'</div>'
      + '<div class="age-pill-cnt">'+grpCnt+' · '+grpPct+'%</div>'
      + '</div>';
  });
  if (notRecorded > 0) {
    html += '<div class="age-pill">'
      + '<div class="age-pill-dot" style="background:#ccc;"></div>'
      + '<div class="age-pill-txt">Not recorded</div>'
      + '<div class="age-pill-cnt">'+notRecorded+'</div>'
      + '</div>';
  }
  html += '</div>';

  // Per-species breakdown
  var spSeen = {};
  aged.forEach(function(e){ spSeen[e.species] = true; });
  var species = Object.keys(spSeen);

  if (species.length > 1) {
    html += '<div class="scard-sub-t" style="margin-top:14px;">By species</div>';
    species.forEach(function(sp) {
      var spEntries = aged.filter(function(e){ return e.species === sp; });
      var spCounts = {};
      AGE_CLASSES.forEach(function(a){ spCounts[a] = 0; });
      spEntries.forEach(function(e){
        var ageKey = normalizeAgeClassLabel(e.age_class);
        if (spCounts[ageKey] !== undefined) spCounts[ageKey]++;
      });
      var spMax = Math.max.apply(null, AGE_CLASSES.map(function(a){ return spCounts[a]; }).concat([1]));
      var clr = SP_COLORS_D[sp] || '#5a7a30';

      html += '<div class="age-sp-section">';
      html += '<div class="age-sp-hdr"><div class="age-sp-dot" style="background:'+clr+';"></div><div class="age-sp-nm">'+sp+'</div></div>';
      AGE_CLASSES.forEach(function(ac, i) {
        var cnt = spCounts[ac];
        if (!cnt) return;
        var barPct = Math.round(cnt/spMax*100);
        html += '<div class="age-mini-row">'
          + '<div class="age-mini-lbl">'+ac+'</div>'
          + '<div class="age-mini-bw"><div class="age-mini-bf" style="width:'+barPct+'%;background:'+AGE_COLORS[i]+';"></div></div>'
          + '<div class="age-mini-cnt">'+cnt+'</div>'
          + '</div>';
      });
      html += '</div>';
    });
  }

  chart.innerHTML = html;
}


// ══════════════════════════════════════════════════════════════
// OFFLINE ENTRY QUEUE
// ══════════════════════════════════════════════════════════════
var OFFLINE_KEY = 'fl_offline_queue';
var OFFLINE_SYNCED_RECENT_KEY = 'fl_offline_synced_recent';
var OFFLINE_DB_NAME = 'firstlight-offline';
var OFFLINE_DB_STORE = 'queue_photos';
var offlineSyncInFlight = false;

function openOfflineDb() {
  return new Promise(function(resolve, reject) {
    if (!('indexedDB' in window)) return resolve(null);
    var req = indexedDB.open(OFFLINE_DB_NAME, 1);
    req.onupgradeneeded = function(ev) {
      var db = ev.target.result;
      if (!db.objectStoreNames.contains(OFFLINE_DB_STORE)) {
        db.createObjectStore(OFFLINE_DB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = function() { reject(req.error || new Error('IndexedDB unavailable')); };
  });
}

// dataUrlToBlob() moved to modules/photos.mjs — imported at the top of this
// file. Still used at its 2 offline-queue call sites unchanged.

function saveOfflinePhotoBlob(photoId, blob) {
  return openOfflineDb().then(function(db) {
    if (!db) return false;
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(OFFLINE_DB_STORE, 'readwrite');
      tx.objectStore(OFFLINE_DB_STORE).put({ id: photoId, blob: blob, createdAt: Date.now() });
      tx.oncomplete = function() { resolve(true); };
      tx.onerror = function() { reject(tx.error || new Error('Failed to save offline photo')); };
    });
  });
}

function getOfflinePhotoBlob(photoId) {
  return openOfflineDb().then(function(db) {
    if (!db) return null;
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(OFFLINE_DB_STORE, 'readonly');
      var req = tx.objectStore(OFFLINE_DB_STORE).get(photoId);
      req.onsuccess = function() { resolve(req.result ? req.result.blob : null); };
      req.onerror = function() { reject(req.error || new Error('Failed to read offline photo')); };
    });
  });
}

function deleteOfflinePhotoBlob(photoId) {
  return openOfflineDb().then(function(db) {
    if (!db) return false;
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(OFFLINE_DB_STORE, 'readwrite');
      tx.objectStore(OFFLINE_DB_STORE).delete(photoId);
      tx.oncomplete = function() { resolve(true); };
      tx.onerror = function() { reject(tx.error || new Error('Failed to delete offline photo')); };
    });
  });
}

function getOfflineQueue() {
  try {
    var raw = localStorage.getItem(OFFLINE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch(e) { return []; }
}
function getCurrentQueueUserId() {
  return currentUser && currentUser.id ? currentUser.id : null;
}
function getOfflineQueueForCurrentUser() {
  var all = getOfflineQueue();
  var uid = getCurrentQueueUserId();
  if (!uid) return all;
  return all.filter(function(entry) {
    return entry && entry._queued_user_id === uid;
  });
}
function reconcileOfflineQueueForCurrentUser() {
  var uid = getCurrentQueueUserId();
  if (!uid) return;
  var all = getOfflineQueue();
  var kept = all.filter(function(entry) {
    return entry && entry._queued_user_id === uid;
  });
  if (kept.length !== all.length) {
    saveOfflineQueue(kept);
    showToast('ℹ️ Cleared offline entries saved by another account', 3500);
  }
}
function readSyncedRecentMap() {
  try {
    var raw = localStorage.getItem(OFFLINE_SYNCED_RECENT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch(_) {
    return {};
  }
}
function writeSyncedRecentMap(map) {
  try {
    localStorage.setItem(OFFLINE_SYNCED_RECENT_KEY, JSON.stringify(map));
  } catch(_) {}
}
function pruneSyncedRecentMap(map) {
  var now = Date.now();
  var keep = {};
  Object.keys(map || {}).forEach(function(k) {
    var ts = Number(map[k] || 0);
    if (ts > 0 && (now - ts) < 45 * 24 * 60 * 60 * 1000) keep[k] = ts;
  });
  var keys = Object.keys(keep).sort(function(a, b) { return keep[b] - keep[a]; });
  var out = {};
  for (var i = 0; i < Math.min(keys.length, 2000); i++) out[keys[i]] = keep[keys[i]];
  return out;
}
function offlineEntryFingerprint(entry) {
  if (!entry) return '';
  if (entry._id) return 'id:' + String(entry._id);
  return 'sig:' + [
    entry.species || '',
    entry.sex || '',
    entry.date || '',
    entry.time || '',
    entry.location_name || '',
    entry.lat == null ? '' : String(entry.lat),
    entry.lng == null ? '' : String(entry.lng),
    entry.weight_kg == null ? '' : String(entry.weight_kg),
    entry.tag_number || ''
  ].join('|');
}
function wasRecentlySynced(fp) {
  if (!fp) return false;
  var map = pruneSyncedRecentMap(readSyncedRecentMap());
  writeSyncedRecentMap(map);
  return !!map[fp];
}
function markRecentlySynced(fp) {
  if (!fp) return;
  var map = pruneSyncedRecentMap(readSyncedRecentMap());
  map[fp] = Date.now();
  writeSyncedRecentMap(map);
}

/** Remove photo payloads from queue entries for smaller JSON (blobs stay in IndexedDB until deleted). */
function stripOfflineQueuePhotos(entries) {
  return entries.map(function(entry) {
    var copy = Object.assign({}, entry);
    var changed = false;
    if (copy._photoDataUrl) {
      delete copy._photoDataUrl;
      changed = true;
    }
    if (copy._photoBlobId) {
      var bid = copy._photoBlobId;
      delete copy._photoBlobId;
      changed = true;
      deleteOfflinePhotoBlob(bid).catch(function() {});
    }
    if (changed) copy._photoStripped = true;
    return copy;
  });
}

/**
 * Persist offline queue to localStorage. On quota errors: strip photos, then drop oldest entries, then try [].
 * Mutates `queue` to match whatever was successfully written.
 * @returns {{ ok: boolean, clearedAll?: boolean }}
 */
function saveOfflineQueue(queue) {
  function writeAndSync(arr) {
    try {
      localStorage.setItem(OFFLINE_KEY, JSON.stringify(arr));
      queue.splice(0, queue.length);
      arr.forEach(function(x) { queue.push(x); });
      return true;
    } catch (err) {
      return false;
    }
  }

  try {
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(queue));
    return { ok: true };
  } catch (e) { /* quota or private mode */ }

  var stripped = stripOfflineQueuePhotos(queue.slice());
  if (writeAndSync(stripped)) {
    showToast('⚠️ Storage full — photos removed from offline queue, entries saved');
    return { ok: true };
  }

  var slim = stripped.slice();
  var origLen = slim.length;
  while (slim.length > 0) {
    slim.shift();
    if (writeAndSync(slim)) {
      var dropped = origLen - slim.length;
      showToast('⚠️ Storage full — removed ' + dropped + ' oldest queued entr' + (dropped === 1 ? 'y' : 'ies') + ' to save the rest');
      return { ok: true };
    }
  }

  if (writeAndSync([])) {
    showToast('⚠️ Storage full — offline queue was cleared. Re-enter entries or free browser storage.');
    return { ok: true, clearedAll: true };
  }

  showToast('⚠️ Storage full — offline queue could not be saved');
  return { ok: false };
}

async function queueOfflineEntry(entry) {
  var queue = getOfflineQueue();
  entry._queuedAt = diaryNow().toISOString();
  entry._id = Date.now() + '-' + Math.random().toString(36).slice(2,7);
  entry._queued_user_id = getCurrentQueueUserId();
  // Keep queue lightweight: store photo blobs in IndexedDB, not localStorage JSON.
  if (entry._photoDataUrl) {
    try {
      var photoId = 'photo-' + entry._id;
      var blob = dataUrlToBlob(entry._photoDataUrl);
      var saved = await saveOfflinePhotoBlob(photoId, blob);
      if (saved) {
        entry._photoBlobId = photoId;
        delete entry._photoDataUrl;
      }
    } catch(e) {
      // Fallback to legacy inline photo data if IndexedDB conversion/storage fails.
    }
  }
  queue.push(entry);
  var persist = saveOfflineQueue(queue);
  if (!persist.ok) {
    queue.pop();
    updateOfflineBadge();
    renderList();
    showToast('⚠️ Could not save offline — storage full. Free space or sync, then try again.');
    flHapticError();
    return;
  }
  if (persist.clearedAll) {
    updateOfflineBadge();
    renderList();
    return;
  }
  updateOfflineBadge();
  showToast('📶 Saved offline · will sync when connected');
  flHapticSuccess();
  go('v-list');
  renderList();
}

function updateOfflineBadge() {
  var queue = getOfflineQueueForCurrentUser();
  var cnt = queue.length;
  var badge = document.getElementById('offline-badge');
  var banner = document.getElementById('offline-banner');
  var bannerT = document.getElementById('offline-banner-t');
  var bannerS = document.getElementById('offline-banner-s');

  if (badge) {
    badge.textContent = cnt;
    badge.style.display = cnt > 0 ? 'block' : 'none';
  }
  if (banner && bannerT) {
    if (cnt > 0) {
      bannerT.textContent = cnt + ' entr' + (cnt===1?'y':'ies') + ' queued offline';
      // Estimate storage used
      var queueStr = localStorage.getItem(OFFLINE_KEY) || '';
      var kb = Math.round(queueStr.length / 1024);
      var hasPhotos = queue.some(function(e){ return e._photoDataUrl || e._photoBlobId; });
      var storageNote = kb > 0 ? ' · ~' + kb + 'KB used' : '';
      var photoNote = hasPhotos ? ' · photos queued' : '';
      // Staleness: a user on flaky coverage can forget an entry is still
      // sitting in the queue. Find the oldest _queuedAt and surface it so
      // they know at a glance whether sync is "recent" or "languishing".
      var staleNote = '';
      var oldestMs = null;
      for (var qi = 0; qi < queue.length; qi++) {
        var t = queue[qi] && queue[qi]._queuedAt ? Date.parse(queue[qi]._queuedAt) : NaN;
        if (Number.isFinite(t) && (oldestMs === null || t < oldestMs)) oldestMs = t;
      }
      if (oldestMs !== null) {
        var ageMs = Date.now() - oldestMs;
        var mins = Math.floor(ageMs / 60000);
        var ageTxt;
        if (mins < 1) ageTxt = 'just now';
        else if (mins < 60) ageTxt = mins + ' min';
        else if (mins < 60 * 24) ageTxt = Math.floor(mins / 60) + 'h';
        else ageTxt = Math.floor(mins / (60 * 24)) + 'd';
        if (mins >= 60) staleNote = ' · oldest ' + ageTxt;
      }
      if (bannerS) bannerS.textContent = 'Will sync when connection returns' + staleNote + storageNote + photoNote;
      // Amber banner above ~24 h signals "this needs attention".
      if (oldestMs !== null && (Date.now() - oldestMs) >= 24 * 60 * 60 * 1000) {
        banner.classList.add('is-stale');
      } else {
        banner.classList.remove('is-stale');
      }
      banner.classList.add('show');
    } else {
      banner.classList.remove('show');
      banner.classList.remove('is-stale');
    }
  }
}

async function syncOfflineQueue() {
  if (!navigator.onLine) { showToast('⚠️ Still offline — try again when connected'); return; }
  if (!sb || !currentUser) { showToast('⚠️ Please sign in first'); return; }
  if (offlineSyncInFlight) { showToast('ℹ️ Sync already in progress'); return; }

  var queue = getOfflineQueueForCurrentUser();
  if (queue.length === 0) { showToast('✅ Nothing to sync'); return; }

  offlineSyncInFlight = true;
  try {
    showToast('Syncing ' + queue.length + ' entr' + (queue.length === 1 ? 'y' : 'ies') + '…');

    var synced = 0, failed = 0, photosStripped = 0;
    var remaining = [];
    var stepPersistWarned = false;

    for (var i = 0; i < queue.length; i++) {
      var entry = queue[i];
      var fp = offlineEntryFingerprint(entry);
      if (wasRecentlySynced(fp)) {
        synced++;
        continue;
      }
      try {
        var payload = {
          user_id:         currentUser.id,
          species:         entry.species,
          sex:             entry.sex,
          date:            entry.date,
          time:            entry.time,
          location_name:   entry.location_name == null ? null : entry.location_name,
          lat:             entry.lat == null ? null : entry.lat,
          lng:             entry.lng == null ? null : entry.lng,
          weight_kg:       entry.weight_kg == null ? null : entry.weight_kg,
          calibre:         entry.calibre == null ? null : entry.calibre,
          distance_m:      entry.distance_m == null ? null : entry.distance_m,
          shot_placement:  entry.shot_placement == null ? null : entry.shot_placement,
          age_class:       entry.age_class == null ? null : entry.age_class,
          notes:           entry.notes == null ? null : entry.notes,
          shooter:         entry.shooter || 'Self',
          ground:          entry.ground == null ? null : entry.ground,
          syndicate_id:    entry.syndicate_id == null ? null : entry.syndicate_id,
          destination:     entry.destination == null ? null : entry.destination,
          tag_number:      entry.tag_number == null ? null : entry.tag_number,
          abnormalities:       Array.isArray(entry.abnormalities) ? entry.abnormalities : null,
          abnormalities_other: entry.abnormalities_other == null ? null : entry.abnormalities_other,
        };

      // Upload photo if queued (IndexedDB blob preferred, with dataURL fallback).
      if (entry._photoBlobId || entry._photoDataUrl) {
        try {
          var blob = null;
          if (entry._photoBlobId) {
            blob = await getOfflinePhotoBlob(entry._photoBlobId);
          }
          if (!blob && entry._photoDataUrl) {
            blob = dataUrlToBlob(entry._photoDataUrl);
          }
          if (!blob) throw new Error('No offline photo blob found');
          var file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
          var path = newCullPhotoPath(currentUser.id);
          var upload = await sb.storage.from('cull-photos').upload(path, file, { upsert: true, contentType: 'image/jpeg' });
          if (!upload.error) {
            payload.photo_url = path;
            if (entry._photoBlobId) {
              try { await deleteOfflinePhotoBlob(entry._photoBlobId); } catch(cleanErr) {}
            }
          }
        } catch(photoErr) { console.warn('Photo sync failed:', photoErr); }
      } else if (entry._existingPhotoUrl) {
        var ex = entry._existingPhotoUrl;
        var npath = cullPhotoStoragePath(ex);
        payload.photo_url = npath || ex;
      }

        var result = await sb.from('cull_entries').insert(payload).select('id');
        if (result.error) throw result.error;
        if (payload && payload.date) extendSeasonCacheForDate(payload.date);
        if (payload && payload.calibre) rememberCalibrePreset(payload.calibre);
        synced++;
        if (entry._photoStripped) photosStripped++;

        markRecentlySynced(fp);
        if (payload.lat != null && payload.lng != null && payload.date && result.data && result.data[0]) {
          attachWeatherToEntry(result.data[0].id, payload.date, payload.time, payload.lat, payload.lng);
        }

        // Persist queue progress after each successful insert to reduce duplicate risk on tab crash/storage issues.
        var stepPersist = saveOfflineQueue(remaining.concat(queue.slice(i + 1)));
        if (!stepPersist.ok && !stepPersistWarned) {
          stepPersistWarned = true;
          showToast('⚠️ Could not update local sync state — some entries may retry');
        }
      } catch(e) {
        console.warn('Sync failed for entry:', e);
        failed++;
        remaining.push(entry);
      }
    }

    var persistRes = saveOfflineQueue(remaining);
    if (!persistRes.ok) {
      showToast('⚠️ Could not save sync state to device — free storage or try again (queue may retry after refresh)');
    }
    updateOfflineBadge();
    await loadEntries();

    if (failed === 0) {
      var msg = '✅ Synced ' + synced + ' entr' + (synced===1?'y':'ies');
      if (photosStripped > 0) {
        msg += ' · ' + photosStripped + ' without photo' + (photosStripped===1?'':'s') + ' (removed to save storage)';
      }
      showToast(msg, photosStripped > 0 ? 5000 : 2500);
      if (synced > 0) flHapticSuccess();
    } else {
      showToast('⚠️ Synced ' + synced + ', failed ' + failed);
      flHapticError();
    }
  } finally {
    offlineSyncInFlight = false;
  }
}

// Auto-sync when connection returns
window.addEventListener('online', function() {
  syncDiaryTrustedUkClock();
  var queue = getOfflineQueueForCurrentUser();
  if (queue.length > 0 && sb && currentUser) {
    setTimeout(syncOfflineQueue, 1500); // small delay to let connection stabilise
  }
  updateOfflineBadge();
  refreshPinMapFallbackBanner();
});

window.addEventListener('offline', function() {
  updateOfflineBadge();
  refreshPinMapFallbackBanner();
});

// Call on sign-in to restore badge state


// ── Shooter Stats ─────────────────────────────────────────────
function buildShooterStats(entries) {
  var card  = document.getElementById('shooter-card');
  var chart = document.getElementById('shooter-chart');
  var agg = aggregateShooterStats(entries);

  // Hide card if everyone is Self (no point showing it) — the aggregator
  // raises this flag so the render logic here stays one-liner.
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

function buildDestinationStats(entries) {
  var card  = document.getElementById('destination-card');
  var chart = document.getElementById('destination-chart');
  var agg = aggregateDestinationStats(entries);

  if (agg.sortedNames.length === 0) { card.style.display = 'none'; return; }
  card.style.display = 'block';

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

function buildTimeOfDayStats(entries) {
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

function buildTrendsChart(entries) {
  var card  = document.getElementById('trends-card');
  var chart = document.getElementById('trends-chart');
  if (!card || !chart) return;

  if (currentSeason !== '__all__') { card.style.display = 'none'; return; }

  var bySeason = {};
  entries.forEach(function(e) {
    var s = buildSeasonFromEntry(e.date);
    if (!bySeason[s]) bySeason[s] = { count: 0, totalWt: 0, wtN: 0, species: {} };
    bySeason[s].count++;
    if (e.weight_kg) { bySeason[s].totalWt += parseFloat(e.weight_kg); bySeason[s].wtN++; }
    bySeason[s].species[e.species] = true;
  });

  var keys = Object.keys(bySeason).sort();
  if (keys.length < 2) { card.style.display = 'none'; return; }
  // Show last 5 seasons max
  if (keys.length > 5) keys = keys.slice(keys.length - 5);

  card.style.display = 'block';

  var maxCount = Math.max.apply(null, keys.map(function(k){ return bySeason[k].count; }));

  var html = '<div style="font-size:9px;font-weight:700;color:rgba(0,0,0,0.4);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Total cull per season</div>';
  keys.forEach(function(k) {
    var d = bySeason[k];
    var pct = Math.round(d.count / maxCount * 100);
    var avgWt = d.wtN > 0 ? (d.totalWt / d.wtN).toFixed(1) : '–';
    html += '<div class="bar-row">'
      + '<div class="bar-lbl">' + seasonLabel(k) + '</div>'
      + '<div class="bar-track"><div class="bar-fill" style="width:'+pct+'%;background:linear-gradient(90deg,#5a7a30,#7adf7a);"></div></div>'
      + '<div class="bar-cnt">' + d.count + '</div>'
      + '</div>';
    html += '<div style="font-size:9px;color:rgba(0,0,0,0.35);margin:-2px 0 6px 0;padding-left:2px;">'
      + 'Avg weight: ' + avgWt + ' kg · ' + Object.keys(d.species).length + ' species'
      + '</div>';
  });

  chart.innerHTML = html;
}


// ══════════════════════════════════════════════════════════════
// GROUNDS SYSTEM
// ══════════════════════════════════════════════════════════════
var savedGrounds = []; // loaded from Supabase
/** Trimmed `ground_filter` values from syndicates the user belongs to (for Permission / Ground optgroups). */
var syndicateGroundFilterSet = new Set();
/** Ground label -> active syndicates using that exact ground_filter. */
var syndicateGroundFilterOwners = {};
var targetMode = 'season'; // 'season' or 'ground'
var groundTargets = {}; // { 'Farm A': { 'Roe Deer-m': 3, 'Roe Deer-f': 2 }, '__unassigned__': {...} }
var planGroundFilter = 'overview'; // 'overview' or a ground name

// ── Grounds CRUD ──────────────────────────────────────────────
function rebuildSyndicateGroundFilterSet(rows) {
  syndicateGroundFilterSet = new Set();
  syndicateGroundFilterOwners = {};
  if (!rows || !rows.length) return;
  for (var i = 0; i < rows.length; i++) {
    var s = rows[i].syndicate;
    if (!s) continue;
    var g = s.ground_filter ? String(s.ground_filter).trim() : '';
    if (!g) continue;
    syndicateGroundFilterSet.add(g);
    if (!syndicateGroundFilterOwners[g]) syndicateGroundFilterOwners[g] = [];
    var sid = String(s.id || '');
    var exists = syndicateGroundFilterOwners[g].some(function(o) {
      return String(o.id) === sid;
    });
    if (!exists) {
      syndicateGroundFilterOwners[g].push({
        id: sid,
        name: String(s.name || 'Syndicate')
      });
    }
  }
}

function setSyndicateAutoNote(msg) {
  var el = document.getElementById('f-syndicate-auto-note');
  if (!el) return;
  if (!msg) {
    el.textContent = '';
    el.style.display = 'none';
    return;
  }
  el.textContent = msg;
  el.style.display = 'block';
}

function clearSyndicateAutoNote() {
  setSyndicateAutoNote('');
}

function maybeAutoSelectSyndicateFromGround(groundName) {
  var sel = document.getElementById('f-syndicate');
  if (!sel) return;
  // Respect manual choice (including explicit Personal only).
  if (sel.value) {
    clearSyndicateAutoNote();
    return;
  }
  var g = groundName ? String(groundName).trim() : '';
  if (!g) {
    clearSyndicateAutoNote();
    return;
  }
  var owners = syndicateGroundFilterOwners[g] || [];
  if (owners.length !== 1) {
    if (owners.length > 1) {
      setSyndicateAutoNote('Multiple syndicates use "' + g + '" - choose attribution manually.');
    } else {
      clearSyndicateAutoNote();
    }
    return;
  }
  var targetId = owners[0].id;
  var hasOption = false;
  for (var i = 0; i < sel.options.length; i++) {
    if (String(sel.options[i].value) === String(targetId)) { hasOption = true; break; }
  }
  if (!hasOption) {
    clearSyndicateAutoNote();
    return;
  }
  sel.value = targetId;
  setSyndicateAutoNote('Auto-selected from ground "' + g + '": ' + owners[0].name + '.');
}

async function refreshSyndicateGroundFilterSetFromNetwork() {
  if (!sb || !currentUser) {
    rebuildSyndicateGroundFilterSet([]);
    return;
  }
  try {
    var list = await loadMySyndicateRows();
    rebuildSyndicateGroundFilterSet(list);
  } catch (e) {
    console.warn('refreshSyndicateGroundFilterSetFromNetwork:', e);
    rebuildSyndicateGroundFilterSet([]);
  }
}

async function loadGrounds(opts) {
  opts = opts || {};
  if (!sb || !currentUser) return;
  try {
    var r = await sb.from('grounds')
      .select('name')
      .eq('user_id', currentUser.id)
      .order('name', { ascending: true });
    if (r.data) savedGrounds = r.data.map(function(g){ return g.name; });
    if (!opts.skipSyndicateRefresh) await refreshSyndicateGroundFilterSetFromNetwork();
    populateGroundDropdown();
  } catch(e) { console.warn('loadGrounds error:', e); }
}

async function saveGround(name) {
  if (!name || !sb || !currentUser) return;
  name = name.trim();
  if (!name || savedGrounds.indexOf(name) !== -1) return;
  try {
    await sb.from('grounds').upsert(
      { user_id: currentUser.id, name: name },
      { onConflict: 'user_id,name' }
    );
    if (savedGrounds.indexOf(name) === -1) savedGrounds.push(name);
    savedGrounds.sort();
    populateGroundDropdown();
  } catch(e) { console.warn('saveGround error:', e); }
}

// ── Ground field UI ───────────────────────────────────────────
function appendGroundOptions(parent, names) {
  names.forEach(function(g) {
    var opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    parent.appendChild(opt);
  });
}

/** Inner HTML for syndicate create “Ground filter” &lt;select&gt; — flat list (no optgroups): avoids implying another team’s settings are being edited. */
function buildSyndicateCreateGroundSelectInnerHtml() {
  var h = '<option value="">All grounds (no filter)</option>';
  var names = (savedGrounds || []).slice().sort(function(a, b) {
    return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
  });
  names.forEach(function(g) {
    h += '<option value="' + esc(g) + '">' + esc(g) + '</option>';
  });
  h += '<option value="__custom__">Other / new ground…</option>';
  return h;
}

function populateGroundDropdown() {
  var sel = document.getElementById('f-ground');
  if (!sel) return;
  var current = sel.value;
  sel.innerHTML = '<option value="">Select ground…</option>';
  var syndNames = [];
  var myNames = [];
  savedGrounds.forEach(function(g) {
    if (syndicateGroundFilterSet.has(g)) syndNames.push(g);
    else myNames.push(g);
  });
  if (syndNames.length) {
    var ogS = document.createElement('optgroup');
    ogS.label = 'Syndicate permissions';
    appendGroundOptions(ogS, syndNames);
    sel.appendChild(ogS);
  }
  if (myNames.length) {
    var ogM = document.createElement('optgroup');
    ogM.label = 'My permissions';
    appendGroundOptions(ogM, myNames);
    sel.appendChild(ogM);
  }
  var custom = document.createElement('option');
  custom.value = '__custom__';
  custom.textContent = 'Other / new ground…';
  sel.appendChild(custom);
  // Restore previous value if it exists
  if (current && current !== '__custom__') sel.value = current;
}

function handleGroundSelect(sel) {
  var customInput = document.getElementById('f-ground-custom');
  if (sel.value === '__custom__') {
    customInput.style.display = 'block';
    customInput.focus();
  } else {
    customInput.style.display = 'none';
    customInput.value = '';
    maybeAutoSelectSyndicateFromGround(sel.value);
  }
}

function getGroundValue() {
  var sel = document.getElementById('f-ground');
  if (sel.value === '__custom__') {
    return document.getElementById('f-ground-custom').value.trim() || null;
  }
  return sel.value || null;
}

function setGroundValue(val) {
  var sel = document.getElementById('f-ground');
  var customInput = document.getElementById('f-ground-custom');
  if (!sel) return;
  // Check if value exists in options
  var found = false;
  for (var i = 0; i < sel.options.length; i++) {
    if (sel.options[i].value === val) { found = true; break; }
  }
  if (found) {
    sel.value = val;
    customInput.style.display = 'none';
  } else if (val) {
    sel.value = '__custom__';
    customInput.style.display = 'block';
    customInput.value = val;
  } else {
    sel.value = '';
    customInput.style.display = 'none';
  }
}

// ── Ground Targets ────────────────────────────────────────────
async function loadGroundTargets(season) {
  if (!sb || !currentUser) return;
  try {
    var r = await sb.from('ground_targets')
      .select('ground, species, sex, target')
      .eq('user_id', currentUser.id)
      .eq('season', season);
    groundTargets = {};
    if (r.data) {
      r.data.forEach(function(row) {
        if (!groundTargets[row.ground]) groundTargets[row.ground] = {};
        groundTargets[row.ground][row.species + '-' + row.sex] = row.target;
      });
    }
  } catch(e) { console.warn('loadGroundTargets error:', e); }
}

/** Named permissions exist — season headline can be split across grounds + unassigned. */
function groundLedPlanActive() {
  return savedGrounds && savedGrounds.length > 0;
}

/** Sum every ground bucket (including __unassigned__) into one species/sex map. */
function sumGroundTargetsAgg(gt) {
  var out = {};
  Object.keys(gt || {}).forEach(function(g) {
    var bucket = gt[g];
    if (!bucket) return;
    Object.keys(bucket).forEach(function(k) {
      out[k] = (out[k] || 0) + (parseInt(bucket[k], 10) || 0);
    });
  });
  return out;
}

function summedGroundTargetsAnyPositive(agg) {
  return Object.keys(agg || {}).some(function(k) { return (agg[k] || 0) > 0; });
}

/** Sum targets on named grounds only (excludes __unassigned__). */
function sumNamedGroundsOnlyAgg(gt) {
  var out = {};
  (savedGrounds || []).forEach(function(g) {
    var bucket = (gt || {})[g] || {};
    Object.keys(bucket).forEach(function(k) {
      out[k] = (out[k] || 0) + (parseInt(bucket[k], 10) || 0);
    });
  });
  return out;
}

/**
 * Upsert cull_targets to match aggregated ground totals (headline season plan).
 * Call after By-ground save, or when seeding buffer from season.
 */
async function syncCullTargetsFromGroundTargetsAgg(gtAgg) {
  if (!sb || !currentUser) return;
  var rows = [];
  PLAN_SPECIES.forEach(function(sp) {
    var mKey = sp.name + '-m';
    var fKey = sp.name + '-f';
    var mVal = parseInt(gtAgg[mKey], 10) || 0;
    var fVal = parseInt(gtAgg[fKey], 10) || 0;
    rows.push({ user_id: currentUser.id, season: currentSeason, species: sp.name, sex: 'm', target: mVal });
    rows.push({ user_id: currentUser.id, season: currentSeason, species: sp.name, sex: 'f', target: fVal });
  });
  var r = await sb.from('cull_targets').upsert(rows, { onConflict: 'user_id,season,species,sex' });
  if (r.error) throw r.error;
  cullTargets = {};
  rows.forEach(function(row) { cullTargets[row.species + '-' + row.sex] = row.target; });
}

/** Season sheet steppers: when a ground split exists and has numbers, show that sum; else DB season row. */
function getSeasonSheetDisplayTotals() {
  if (groundLedPlanActive()) {
    var agg = sumGroundTargetsAgg(groundTargets);
    if (summedGroundTargetsAnyPositive(agg)) return agg;
  }
  return cullTargets;
}

/** Current Season total stepper values (used for By-ground preview before save). */
function readSeasonFormTargets() {
  var o = {};
  PLAN_SPECIES.forEach(function(sp) {
    var mEl = document.getElementById('tt-' + sp.key + 'm');
    var fEl = document.getElementById('tt-' + sp.key + 'f');
    o[sp.name + '-m'] = parseInt(mEl && mEl.value, 10) || 0;
    o[sp.name + '-f'] = parseInt(fEl && fEl.value, 10) || 0;
  });
  return o;
}

/** Unassigned row = season form headline minus saved named-ground totals (preview if not saved yet). */
function previewUnassignedFromSeasonForm() {
  var seasonForm = readSeasonFormTargets();
  var named = sumNamedGroundsOnlyAgg(groundTargets);
  var out = {};
  PLAN_SPECIES.forEach(function(sp) {
    ['m', 'f'].forEach(function(sx) {
      var k = sp.name + '-' + sx;
      var head = parseInt(seasonForm[k], 10) || 0;
      var onG = parseInt(named[k], 10) || 0;
      out[k] = Math.max(0, head - onG);
    });
  });
  return out;
}

/** With named grounds: keep Unassigned buffer steppers aligned to Season total minus saved named totals (dirty snapshot + By ground tab). */
function syncUnassignedSteppersFromSeasonFormDom() {
  if (!groundLedPlanActive()) return;
  if (!document.getElementById('gt_u_' + PLAN_SPECIES[0].key + 'm')) return;
  var u = previewUnassignedFromSeasonForm();
  PLAN_SPECIES.forEach(function(sp) {
    var mel = document.getElementById('gt_u_' + sp.key + 'm');
    var fel = document.getElementById('gt_u_' + sp.key + 'f');
    if (mel) mel.value = u[sp.name + '-m'] || 0;
    if (fel) fel.value = u[sp.name + '-f'] || 0;
  });
  updateGroundRollup();
}

function getUnassignedEffectiveTotal() {
  var u = groundLedPlanActive() ? previewUnassignedFromSeasonForm() : (groundTargets['__unassigned__'] || {});
  return Object.keys(u).reduce(function(s, k) { return s + (parseInt(u[k], 10) || 0); }, 0);
}

function hasGroundTargets() {
  return Object.keys(groundTargets).some(function(g) {
    return Object.keys(groundTargets[g]).some(function(k) {
      return groundTargets[g][k] > 0;
    });
  });
}

// ── Targets sheet mode ────────────────────────────────────────
function setTargetMode(mode) {
  targetMode = mode;
  document.getElementById('tmode-season').classList.toggle('on', mode === 'season');
  document.getElementById('tmode-ground').classList.toggle('on', mode === 'ground');
  document.getElementById('tmode-season-body').style.display = mode === 'season' ? 'block' : 'none';
  document.getElementById('tmode-ground-body').style.display = mode === 'ground' ? 'block' : 'none';
  if (mode === 'ground') {
    renderGroundSections();
    refreshSeasonGroundLedHint();
  } else {
    syncSeasonSteppersFromGroundDom();
    refreshTgroundModeHint();
    refreshSeasonGroundLedHint();
    updateSeasonTotalFooter();
  }
}

/** By ground tab: how split relates to headline season plan. */
function refreshTgroundModeHint() {
  var el = document.getElementById('tground-mode-hint');
  if (!el) return;
  if (targetMode !== 'ground') {
    el.setAttribute('hidden', 'hidden');
    el.innerHTML = '';
    return;
  }
  var html = '';
  if (groundLedPlanActive()) {
    html = '<p class="tground-mode-hint-line">Put your targets for <strong>each ground</strong> below. Tap a row to open it.</p>'
      + '<p class="tground-mode-hint-line"><strong>Unassigned</strong> tracks what is left after named grounds — it picks up the <strong>Season total</strong> tab when you switch here (before Save).</p>'
      + '<p class="tground-mode-hint-line">Saving updates <strong>Season total</strong> to match this tab.</p>';
  } else {
    html = '<p class="tground-mode-hint-line">Tap <strong>Add ground</strong> if you shoot on more than one place. Until then, use <strong>Season total</strong> for all your numbers.</p>';
  }
  el.innerHTML = html;
  el.removeAttribute('hidden');
}

function refreshSeasonGroundLedHint() {
  var el = document.getElementById('tseason-led-hint');
  if (!el) return;
  if (targetMode !== 'season' || !groundLedPlanActive()) {
    el.setAttribute('hidden', 'hidden');
    el.innerHTML = '';
    return;
  }
  el.innerHTML = '<p class="tseason-led-hint-line"><strong>Season total</strong> and <strong>By ground</strong> use the same figures — full totals here, split by place on the other tab.</p>';
  el.removeAttribute('hidden');
}

function makeSpeciesSteppers(prefix) {
  return PLAN_SPECIES.map(function(sp) {
    var mid = prefix + '_' + sp.key + 'm';
    var fid = prefix + '_' + sp.key + 'f';
    return '<div class="tgrid-row">'
      + '<div class="tgrid-sp"><div class="tgrid-dot" style="background:' + sp.color + ';"></div>' + sp.name + '</div>'
      + '<div class="tstepper"><button type="button" class="tstep-btn" data-fl-action="gt-step" data-gt-id="' + mid + '" data-gt-delta="-1">−</button>'
      + '<input class="tstep-val" id="' + mid + '" type="number" value="0" min="0">'
      + '<button type="button" class="tstep-btn" data-fl-action="gt-step" data-gt-id="' + mid + '" data-gt-delta="1">+</button></div>'
      + '<div class="tstepper"><button type="button" class="tstep-btn" data-fl-action="gt-step" data-gt-id="' + fid + '" data-gt-delta="-1">−</button>'
      + '<input class="tstep-val" id="' + fid + '" type="number" value="0" min="0">'
      + '<button type="button" class="tstep-btn" data-fl-action="gt-step" data-gt-id="' + fid + '" data-gt-delta="1">+</button></div>'
      + '</div>';
  }).join('');
}

function gtStep(id, delta) {
  var el = document.getElementById(id);
  if (el) { el.value = Math.max(0, (parseInt(el.value)||0) + delta); updateGroundRollup(); }
  syncSeasonSteppersFromGroundDom();
}

function getUnassignedStoreTotal() {
  var u = groundTargets['__unassigned__'] || {};
  return Object.keys(u).reduce(function(s, k) { return s + (parseInt(u[k], 10) || 0); }, 0);
}

function renderUnassignedSteppersFromStore() {
  var uSteppers = document.getElementById('tunassigned-steppers');
  if (!uSteppers) return;
  uSteppers.innerHTML = makeSpeciesSteppers('gt_u');
  var uTargets = groundLedPlanActive()
    ? previewUnassignedFromSeasonForm()
    : (groundTargets['__unassigned__'] || {});
  PLAN_SPECIES.forEach(function(sp) {
    var mel = document.getElementById('gt_u_' + sp.key + 'm');
    var fel = document.getElementById('gt_u_' + sp.key + 'f');
    if (mel) mel.value = uTargets[sp.name + '-m'] || 0;
    if (fel) fel.value = uTargets[sp.name + '-f'] || 0;
  });
}

function updateUnassignedBarSummary() {
  var sumEl = document.getElementById('tunassigned-summary');
  if (!sumEl || !document.getElementById('gt_u_' + PLAN_SPECIES[0].key + 'm')) return;
  var parts = [];
  var uTotal = 0;
  PLAN_SPECIES.forEach(function(sp) {
    var mel = document.getElementById('gt_u_' + sp.key + 'm');
    var fel = document.getElementById('gt_u_' + sp.key + 'f');
    if (!mel || !fel) return;
    var m = parseInt(mel.value, 10) || 0;
    var f = parseInt(fel.value, 10) || 0;
    uTotal += m + f;
    if (m + f > 0) parts.push(sp.name.split(' ')[0] + ': ♂' + m + ' ♀' + f);
  });
  sumEl.textContent = uTotal === 0 ? 'None set — tap to add optional targets' : parts.join(' · ');
}

function setUnassignedBufferExpanded(open) {
  var body = document.getElementById('tunassigned-body');
  var chev = document.getElementById('tunassigned-chev');
  var hdr = document.getElementById('tunassigned-hdr');
  if (!body) return;
  body.classList.toggle('open', !!open);
  if (chev) chev.classList.toggle('open', !!open);
  if (hdr) hdr.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function toggleUnassignedBuffer() {
  var body = document.getElementById('tunassigned-body');
  if (!body) return;
  setUnassignedBufferExpanded(!body.classList.contains('open'));
}

function syncUnassignedExpandedFromStore() {
  setUnassignedBufferExpanded(getUnassignedEffectiveTotal() > 0);
}

function renderGroundSections() {
  var container = document.getElementById('tground-sections');
  if (!container) return;

  if (savedGrounds.length === 0) {
    // Update label
  var lbl = document.getElementById('ground-mgmt-lbl');
  if (lbl) lbl.textContent = 'No grounds yet';
  container.innerHTML = '<div style="padding:12px 0 8px;text-align:center;font-size:12px;color:var(--muted);">No grounds yet — add one above.</div>';
  refreshTgroundModeHint();
  renderUnassignedSteppersFromStore();
  syncUnassignedExpandedFromStore();
  updateGroundRollup();
  return;
  }

  // Update ground count label
  var lbl = document.getElementById('ground-mgmt-lbl');
  if (lbl) lbl.textContent = savedGrounds.length + ' ground' + (savedGrounds.length === 1 ? '' : 's');

  var html = '';
  savedGrounds.forEach(function(g, i) {
    var gTargets = groundTargets[g] || {};
    var total = Object.values(gTargets).reduce(function(s,v){ return s+v; }, 0);
    var summary = total > 0
      ? PLAN_SPECIES.filter(function(sp){ return (gTargets[sp.name+'-m']||0)+(gTargets[sp.name+'-f']||0)>0; })
          .map(function(sp){ return sp.name.split(' ')[0]+': ♂'+(gTargets[sp.name+'-m']||0)+' ♀'+(gTargets[sp.name+'-f']||0); })
          .join(' · ')
      : 'No targets set';
    var prefix = 'gt_' + i;
    var dotColor = ['#5a7a30','#c8a84b','#f57f17','#6a1b9a','#1565c0'][i % 5];

    html += '<div class="tground-section">'
      + '<div class="tground-bar">'
      + '<div class="tground-hdr" tabindex="0" role="button" data-fl-action="toggle-ground" data-ground-prefix="' + prefix + '" aria-expanded="false" aria-label="Show targets for ' + esc(g) + '">'
      + '<div class="tground-hdr-l"><div class="tground-dot" style="background:' + dotColor + ';"></div>'
      + '<div><div class="tground-name">' + esc(g) + '</div>'
      + '<div class="tground-summary">' + esc(summary) + '</div></div></div>'
      + '<span class="tground-chev-wrap" aria-hidden="true"><span class="tground-chev" id="' + prefix + '_chev">▾</span></span>'
      + '</div>'
      + '<button type="button" class="tground-del" data-gi="' + i + '" data-fl-action="delete-ground-idx" title="Remove this saved ground">Remove</button>'
      + '</div>'
      + '<div class="tground-body" id="' + prefix + '_body">'
      + '<div class="tgrid-hdr"><div class="tgrid-col">Species</div>'
      + '<div class="tgrid-col tgrid-hdr-col"><span class="tg-sym">♂</span>Stag / Buck</div>'
      + '<div class="tgrid-col tgrid-hdr-col"><span class="tg-sym">♀</span>Hind / Doe</div></div>'
      + makeSpeciesSteppers(prefix)
      + '</div></div>';
  });
  container.innerHTML = html;

  refreshTgroundModeHint();

  // Populate with existing targets
  savedGrounds.forEach(function(g, i) {
    var gTargets = groundTargets[g] || {};
    var prefix = 'gt_' + i;
    PLAN_SPECIES.forEach(function(sp) {
      var mel = document.getElementById(prefix + '_' + sp.key + 'm');
      var fel = document.getElementById(prefix + '_' + sp.key + 'f');
      if (mel) mel.value = gTargets[sp.name+'-m'] || 0;
      if (fel) fel.value = gTargets[sp.name+'-f'] || 0;
    });
  });

  renderUnassignedSteppersFromStore();
  syncUnassignedExpandedFromStore();
  updateGroundRollup();
}

function toggleGroundSection(prefix) {
  var body = document.getElementById(prefix + '_body');
  var chev = document.getElementById(prefix + '_chev');
  if (!body) return;
  var open = body.classList.contains('open');
  body.classList.toggle('open', !open);
  if (chev) chev.classList.toggle('open', !open);
  var hdr = document.querySelector('[data-fl-action="toggle-ground"][data-ground-prefix="' + prefix + '"]');
  if (hdr) hdr.setAttribute('aria-expanded', !open ? 'true' : 'false');
}

function updateGroundRollup() {
  updateUnassignedBarSummary();
  var rollup = document.getElementById('trollup');
  if (!rollup) return;
  var lines = '';
  var grandTotal = 0;
  savedGrounds.forEach(function(g, i) {
    var prefix = 'gt_' + i;
    var total = 0;
    PLAN_SPECIES.forEach(function(sp) {
      var m = parseInt((document.getElementById(prefix+'_'+sp.key+'m')||{}).value||0);
      var f = parseInt((document.getElementById(prefix+'_'+sp.key+'f')||{}).value||0);
      total += m + f;
    });
    grandTotal += total;
    lines += '<div class="trollup-row"><span class="trollup-lbl">' + esc(g) + '</span><span class="trollup-val">' + total + '</span></div>';
  });
  // Unassigned
  var uTotal = 0;
  PLAN_SPECIES.forEach(function(sp) {
    var m = parseInt((document.getElementById('gt_u_'+sp.key+'m')||{}).value||0);
    var f = parseInt((document.getElementById('gt_u_'+sp.key+'f')||{}).value||0);
    uTotal += m + f;
  });
  if (uTotal > 0) {
    grandTotal += uTotal;
    lines += '<div class="trollup-row"><span class="trollup-lbl">Unassigned</span><span class="trollup-val">' + uTotal + '</span></div>';
  }
  rollup.innerHTML = lines
    + '<div class="trollup-total"><span class="trollup-total-lbl">Season total</span><span class="trollup-total-val">' + grandTotal + ' targets</span></div>';
}

// ── Save targets (both modes) ─────────────────────────────────
async function saveGroundTargets() {
  if (!sb || !currentUser) return;
  var rows = [];

  // Per-ground targets
  savedGrounds.forEach(function(g, i) {
    var prefix = 'gt_' + i;
    PLAN_SPECIES.forEach(function(sp) {
      var m = parseInt((document.getElementById(prefix+'_'+sp.key+'m')||{}).value||0);
      var f = parseInt((document.getElementById(prefix+'_'+sp.key+'f')||{}).value||0);
      rows.push({ user_id:currentUser.id, season:currentSeason, ground:g, species:sp.name, sex:'m', target:m });
      rows.push({ user_id:currentUser.id, season:currentSeason, ground:g, species:sp.name, sex:'f', target:f });
    });
  });

  // Unassigned buffer
  PLAN_SPECIES.forEach(function(sp) {
    var m = parseInt((document.getElementById('gt_u_'+sp.key+'m')||{}).value||0);
    var f = parseInt((document.getElementById('gt_u_'+sp.key+'f')||{}).value||0);
    rows.push({ user_id:currentUser.id, season:currentSeason, ground:'__unassigned__', species:sp.name, sex:'m', target:m });
    rows.push({ user_id:currentUser.id, season:currentSeason, ground:'__unassigned__', species:sp.name, sex:'f', target:f });
  });

  var r = await sb.from('ground_targets')
    .upsert(rows, { onConflict: 'user_id,season,ground,species,sex' });
  if (r.error) throw r.error;
  await loadGroundTargets(currentSeason);
  var aggAfter = sumGroundTargetsAgg(groundTargets);
  if (groundLedPlanActive() || summedGroundTargetsAnyPositive(aggAfter)) {
    await syncCullTargetsFromGroundTargetsAgg(aggAfter);
  }
}

// ── Plan card ground filter ───────────────────────────────────
function renderPlanGroundFilter() {
  var bar = document.getElementById('plan-ground-filter');
  if (!bar) return;

  if (!savedGrounds || savedGrounds.length === 0) {
    bar.style.display = 'none';
    return;
  }

  bar.style.display = 'flex';
  var grounds = savedGrounds.slice();
  var hasUnassigned = groundTargets['__unassigned__'] &&
    Object.values(groundTargets['__unassigned__']).some(function(v){ return v > 0; });

  var chips = [{key:'overview', label:'Overview'}];
  grounds.forEach(function(g) { chips.push({key:g, label:g}); });
  if (hasUnassigned) chips.push({key:'__unassigned__', label:'Unassigned'});

  bar.innerHTML = chips.map(function(c) {
    var on = c.key === planGroundFilter;
    return '<div class="pgf-chip' + (on?' on':'') + '" tabindex="0" role="button" data-fl-action="plan-ground-filter" data-plan-key="' + encodeURIComponent(c.key) + '">' + esc(c.label) + '</div>';
  }).join('');
}

function setPlanGroundFilter(key) {
  planGroundFilter = key;
  renderPlanGroundFilter();
  renderPlanCard(allEntries, currentSeason);
}

// ══════════════════════════════════════════════════════════════
// SYNDICATES (Supabase: syndicates, targets, invites, RPCs)
// ══════════════════════════════════════════════════════════════
var syndicateEditingId = null;
var syndicateAllocMemberId = null;

/** Label shown in syndicate UI — matches account name / email local-part. */
function syndicateDisplayNameFromUser(user) {
  if (!user) return 'Member';
  var meta = user.user_metadata || {};
  var n = (meta.full_name || '').trim();
  if (n) return n;
  var em = user.email || '';
  var at = em.indexOf('@');
  return at > 0 ? em.slice(0, at) : 'Member';
}

/** Backfill syndicate_members.display_name for the signed-in user (after DB migration). */
async function ensureMySyndicateDisplayNames() {
  if (!sb || !currentUser) return;
  var name = syndicateDisplayNameFromUser(currentUser);
  try {
    var r = await sb.from('syndicate_members')
      .update({ display_name: name })
      .eq('user_id', currentUser.id)
      .is('display_name', null);
    if (r.error) return;
  } catch (e) { /* column not migrated yet */ }
}

function syndicateRandomToken() {
  var a = new Uint8Array(24);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
  else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  return Array.from(a, function(b) { return ('0' + b.toString(16)).slice(-2); }).join('');
}

var SYNDICATE_INVITE_DEFAULT_DAYS = 7;
var SYNDICATE_INVITE_DEFAULT_MAX_USES = 10;

function syndicateInviteUrl(token) {
  return window.location.origin + window.location.pathname + '?syndicate_invite=' + encodeURIComponent(token || '');
}

function openSynModal() {
  var ov = document.getElementById('syn-ov');
  if (ov) { ov.classList.add('open'); document.body.style.overflow = 'hidden'; }
}

function closeSynModal() {
  var ov = document.getElementById('syn-ov');
  if (ov) { ov.classList.remove('open'); document.body.style.overflow = ''; }
  syndicateEditingId = null;
  syndicateAllocMemberId = null;
}

function syndKeyToInputId(key) { return 'syntt-' + key; }

function buildSyndicateStepperGrid(valuesObj, prefix) {
  var p = prefix || 'syntt';
  var rows = '';
  PLAN_SPECIES.forEach(function(sp) {
    var mk = sp.key + 'm';
    var fk = sp.key + 'f';
    var mv = (valuesObj && valuesObj[sp.name + '-m']) || 0;
    var fv = (valuesObj && valuesObj[sp.name + '-f']) || 0;
    rows += '<div class="tgrid-row">'
      + '<div class="tgrid-sp"><div class="tgrid-dot" style="background:' + sp.color + ';"></div>' + esc(sp.name) + '</div>'
      + '<div class="tstepper">'
      + '<button type="button" class="tstep-btn" data-fl-action="synd-tstep" data-step-id="' + p + '-' + mk + '" data-step-delta="-1">−</button>'
      + '<input class="tstep-val" id="' + p + '-' + mk + '" type="number" value="' + mv + '" min="0">'
      + '<button type="button" class="tstep-btn" data-fl-action="synd-tstep" data-step-id="' + p + '-' + mk + '" data-step-delta="1">+</button>'
      + '</div>'
      + '<div class="tstepper">'
      + '<button type="button" class="tstep-btn" data-fl-action="synd-tstep" data-step-id="' + p + '-' + fk + '" data-step-delta="-1">−</button>'
      + '<input class="tstep-val" id="' + p + '-' + fk + '" type="number" value="' + fv + '" min="0">'
      + '<button type="button" class="tstep-btn" data-fl-action="synd-tstep" data-step-id="' + p + '-' + fk + '" data-step-delta="1">+</button>'
      + '</div>'
      + '</div>';
  });
  return '<div class="tgrid-hdr"><div class="tgrid-col">Species</div>'
    + '<div class="tgrid-col tgrid-hdr-col">Stags/Bucks</div>'
    + '<div class="tgrid-col tgrid-hdr-col">Hinds/Does</div></div>' + rows;
}

function syndTstep(stepId, delta) {
  var el = document.getElementById(stepId);
  if (el) el.value = Math.max(0, (parseInt(el.value, 10) || 0) + delta);
}

function readSyndicateSteppers(prefix) {
  var p = prefix || 'syntt';
  var o = {};
  PLAN_SPECIES.forEach(function(sp) {
    var em = document.getElementById(p + '-' + sp.key + 'm');
    var ef = document.getElementById(p + '-' + sp.key + 'f');
    o[sp.name + '-m'] = em ? Math.max(0, parseInt(em.value, 10) || 0) : 0;
    o[sp.name + '-f'] = ef ? Math.max(0, parseInt(ef.value, 10) || 0) : 0;
  });
  return o;
}

async function loadMySyndicateRows() {
  if (!sb || !currentUser) return [];
  var mr = await sb.from('syndicate_members').select('syndicate_id, role').eq('user_id', currentUser.id).eq('status', 'active');
  if (mr.error || !mr.data || !mr.data.length) return [];
  var ids = mr.data.map(function(x) { return x.syndicate_id; });
  if (!ids.length) return [];
  var roles = {};
  mr.data.forEach(function(r) { roles[r.syndicate_id] = r.role; });
  var sr = await sb.from('syndicates').select('*').in('id', ids);
  if (sr.error || !sr.data || !sr.data.length) return [];
  return sr.data.map(function(s) { return { syndicate: s, role: roles[s.id] }; });
}

async function populateSyndicateAttributionDropdown(selectedId) {
  var sel = document.getElementById('f-syndicate');
  if (!sel) return;
  var chosen = selectedId || '';
  sel.innerHTML = '<option value="">Personal only (no syndicate)</option>';
  if (!sb || !currentUser) {
    sel.value = '';
    return;
  }
  try {
    var list = await loadMySyndicateRows();
    var opts = list.map(function(r) {
      return { id: r.syndicate.id, name: r.syndicate.name || 'Syndicate' };
    }).sort(function(a, b) {
      return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });
    });
    var known = {};
    opts.forEach(function(o) {
      if (known[o.id]) return;
      known[o.id] = true;
      sel.innerHTML += '<option value="' + esc(o.id) + '">' + esc(o.name) + '</option>';
    });
    if (chosen && !known[chosen]) {
      sel.innerHTML += '<option value="' + esc(chosen) + '">Previously assigned (not active)</option>';
    }
    sel.value = chosen;
  } catch (e) {
    console.warn('populateSyndicateAttributionDropdown:', e);
    sel.value = chosen || '';
  }
}

function getSyndicateAttributionValue() {
  var sel = document.getElementById('f-syndicate');
  if (!sel) return null;
  var v = (sel.value || '').trim();
  return v || null;
}

async function validateSyndicateAttributionGround(syndicateId, groundValue) {
  if (!sb || !currentUser || !syndicateId) return true;
  try {
    var list = await loadMySyndicateRows();
    var row = list.find(function(x) {
      return x && x.syndicate && String(x.syndicate.id) === String(syndicateId);
    });
    if (!row || !row.syndicate) return true;
    var gf = row.syndicate.ground_filter ? String(row.syndicate.ground_filter).trim() : '';
    if (!gf) return true;
    var gv = groundValue ? String(groundValue).trim() : '';
    if (gv === gf) return true;
    showToast('⚠️ This syndicate counts only ground "' + gf + '". Update Permission / Ground or clear syndicate attribution.');
    return false;
  } catch (e) {
    console.warn('validateSyndicateAttributionGround:', e);
    return true;
  }
}

async function fetchSyndicateSummaryRpc(syndicateId, season) {
  var r = await sb.rpc('syndicate_season_summary', { p_syndicate_id: syndicateId, p_season: season });
  if (!r.error && r.data) return { ok: true, rows: r.data };
  if (r.error && typeof console !== 'undefined' && console.warn) {
    console.warn('syndicate_season_summary RPC failed (deploy scripts/syndicate-summary-rpc.sql):', r.error.message || r.error);
  }
  return { ok: false, error: r.error };
}

/**
 * Used when syndicate_season_summary is missing or errors. Group mode is accurate.
 * Individual mode: syndicate-wide targets need summed allocations — managers can read all rows (RLS);
 * members only see their own rows, so target totals may show 0 until the RPC is deployed.
 */
async function fetchSyndicateSummaryFallback(syndicate, season, isManager) {
  var targets = {};
  var tr = await sb.from('syndicate_targets').select('species, sex, target').eq('syndicate_id', syndicate.id).eq('season', season);
  if (tr.data) tr.data.forEach(function(row) { targets[row.species + '-' + row.sex] = row.target; });
  var ar = await sb.rpc('syndicate_aggregate_actuals_for_user', { p_syndicate_id: syndicate.id, p_season: season });
  var actuals = {};
  if (!ar.error && ar.data) ar.data.forEach(function(row) { actuals[row.species + '-' + row.sex] = parseInt(row.actual_count, 10) || 0; });
  var myr = await sb.rpc('my_syndicate_actuals', { p_syndicate_id: syndicate.id, p_season: season });
  var mine = {};
  if (!myr.error && myr.data) myr.data.forEach(function(row) { mine[row.species + '-' + row.sex] = parseInt(row.actual_count, 10) || 0; });
  var allocMine = {};
  if (syndicate.allocation_mode === 'individual') {
    var al = await sb.from('syndicate_member_allocations').select('species, sex, allocation')
      .eq('syndicate_id', syndicate.id).eq('season', season).eq('user_id', currentUser.id);
    if (al.data) al.data.forEach(function(row) { allocMine[row.species + '-' + row.sex] = row.allocation; });
  }
  var allocSum = {};
  if (syndicate.allocation_mode === 'individual' && isManager) {
    var alAll = await sb.from('syndicate_member_allocations').select('species, sex, allocation')
      .eq('syndicate_id', syndicate.id).eq('season', season);
    if (alAll.data) {
      alAll.data.forEach(function(row) {
        var kk = row.species + '-' + row.sex;
        allocSum[kk] = (allocSum[kk] || 0) + (parseInt(row.allocation, 10) || 0);
      });
    }
  }
  var keys = {};
  Object.keys(targets).forEach(function(k) { keys[k] = 1; });
  Object.keys(actuals).forEach(function(k) { keys[k] = 1; });
  Object.keys(mine).forEach(function(k) { keys[k] = 1; });
  Object.keys(allocMine).forEach(function(k) { keys[k] = 1; });
  Object.keys(allocSum).forEach(function(k) { keys[k] = 1; });
  var rows = [];
  Object.keys(keys).forEach(function(k) {
    var parts = k.split('-');
    var sx = parts.pop();
    var sp = parts.join('-');
    var tgtGroup = syndicate.allocation_mode === 'group' ? (targets[k] || 0) : 0;
    var tgtIndiv = syndicate.allocation_mode === 'individual' ? (allocSum[k] || 0) : 0;
    rows.push({
      species: sp,
      sex: sx,
      target_total: syndicate.allocation_mode === 'group' ? tgtGroup : tgtIndiv,
      actual_total: actuals[k] || 0,
      my_allocation: allocMine[k] || 0,
      my_actual: mine[k] || 0
    });
  });
  return { ok: true, rows: rows, fallback: true };
}

function renderSyndicateProgressBars(s, summaryRows, season) {
  var mode = s.allocation_mode;
  var bySp = {};
  (summaryRows || []).forEach(function(row) {
    var sp = row.species;
    if (!sp) return;
    if (!bySp[sp]) bySp[sp] = { m: null, f: null };
    if (row.sex === 'm') bySp[sp].m = row;
    else bySp[sp].f = row;
  });
  var ordered = [];
  PLAN_SPECIES.forEach(function(ps) {
    if (bySp[ps.name]) ordered.push(ps.name);
  });
  Object.keys(bySp).forEach(function(name) {
    if (ordered.indexOf(name) < 0) ordered.push(name);
  });

  var totalTarget = 0;
  var totalActual = 0;
  var html = '';
  var rendered = 0;

  ordered.forEach(function(spName) {
    var pair = bySp[spName];
    var sp = planSpeciesMeta(spName);
    var mTarget = pair.m ? parseInt(pair.m.target_total, 10) || 0 : 0;
    var fTarget = pair.f ? parseInt(pair.f.target_total, 10) || 0 : 0;
    var mActual = pair.m ? parseInt(pair.m.actual_total, 10) || 0 : 0;
    var fActual = pair.f ? parseInt(pair.f.actual_total, 10) || 0 : 0;
    if (mTarget === 0 && fTarget === 0 && mActual === 0 && fActual === 0) return;

    var spTarget = mTarget + fTarget;
    var spActual = mActual + fActual;
    totalTarget += spTarget;
    totalActual += spActual;

    if (rendered > 0) html += '<div class="plan-divider"></div>';
    rendered++;

    html += '<div class="plan-sp-section">';
    html += '<div class="plan-sp-hdr">';
    html += '<div class="plan-sp-dot" style="background:' + sp.color + ';"></div>';
    html += '<div class="plan-sp-name">' + esc(sp.name) + '</div>';
    html += '<div class="plan-sp-total">' + spActual + '/' + spTarget + '</div>';
    html += '</div>';

    if (mTarget > 0 || mActual > 0) {
      var mPct = mTarget > 0 ? Math.min(100, Math.round(mActual / mTarget * 100)) : (mActual > 0 ? 100 : 0);
      var mDone = mTarget > 0 && mActual >= mTarget;
      var mBar = mTarget === 0 ? 'linear-gradient(90deg,#a0988a,#c0b8a8)' : mDone ? 'linear-gradient(90deg,#2d7a1a,#7adf7a)' : 'linear-gradient(90deg,#5a7a30,#7adf7a)';
      html += '<div class="plan-sex-row">';
      html += '<div class="plan-sex-icon">♂</div>';
      html += '<div class="plan-sex-lbl">' + esc(sp.mLbl) + '</div>';
      html += '<div class="plan-bar-wrap"><div class="plan-bar" style="width:' + mPct + '%;background:' + mBar + ';"></div></div>';
      html += '<div class="plan-count ' + (mDone ? 'plan-count-done' : mActual === 0 ? 'plan-count-zero' : '') + '">' + mActual + '/' + mTarget + (mDone ? ' ✓' : '') + '</div>';
      html += '</div>';
      if (mode === 'individual' && pair.m) {
        var ma = parseInt(pair.m.my_allocation, 10) || 0;
        var my = parseInt(pair.m.my_actual, 10) || 0;
        var yPct = ma > 0 ? Math.min(100, Math.round(my / ma * 100)) : (my > 0 ? 100 : 0);
        var yDone = ma > 0 && my >= ma;
        var yBar = ma === 0 ? 'linear-gradient(90deg,#a0988a,#c0b8a8)' : yDone ? 'linear-gradient(90deg,#b8860b,#f0c870)' : 'linear-gradient(90deg,#c8a84b,#f0c870)';
        html += '<div class="plan-sex-row synd-plan-yours">';
        html += '<div class="plan-sex-icon"></div>';
        html += '<div class="plan-sex-lbl">Yours</div>';
        html += '<div class="plan-bar-wrap"><div class="plan-bar" style="width:' + yPct + '%;background:' + yBar + ';"></div></div>';
        html += '<div class="plan-count ' + (yDone ? 'plan-count-done' : my === 0 ? 'plan-count-zero' : '') + '" style="font-size:10px;">' + my + '/' + (ma || '–') + (yDone ? ' ✓' : '') + '</div>';
        html += '</div>';
      }
    }
    if (fTarget > 0 || fActual > 0) {
      var fPct = fTarget > 0 ? Math.min(100, Math.round(fActual / fTarget * 100)) : (fActual > 0 ? 100 : 0);
      var fDone = fTarget > 0 && fActual >= fTarget;
      var fBar = fTarget === 0 ? 'linear-gradient(90deg,#a0988a,#c0b8a8)' : fDone ? 'linear-gradient(90deg,#2d7a1a,#7adf7a)' : 'linear-gradient(90deg,#5a7a30,#7adf7a)';
      html += '<div class="plan-sex-row">';
      html += '<div class="plan-sex-icon">♀</div>';
      html += '<div class="plan-sex-lbl">' + esc(sp.fLbl) + '</div>';
      html += '<div class="plan-bar-wrap"><div class="plan-bar" style="width:' + fPct + '%;background:' + fBar + ';"></div></div>';
      html += '<div class="plan-count ' + (fDone ? 'plan-count-done' : fActual === 0 ? 'plan-count-zero' : '') + '">' + fActual + '/' + fTarget + (fDone ? ' ✓' : '') + '</div>';
      html += '</div>';
      if (mode === 'individual' && pair.f) {
        var fa = parseInt(pair.f.my_allocation, 10) || 0;
        var fy = parseInt(pair.f.my_actual, 10) || 0;
        var fyPct = fa > 0 ? Math.min(100, Math.round(fy / fa * 100)) : (fy > 0 ? 100 : 0);
        var fyDone = fa > 0 && fy >= fa;
        var fyBar = fa === 0 ? 'linear-gradient(90deg,#a0988a,#c0b8a8)' : fyDone ? 'linear-gradient(90deg,#b8860b,#f0c870)' : 'linear-gradient(90deg,#c8a84b,#f0c870)';
        html += '<div class="plan-sex-row synd-plan-yours">';
        html += '<div class="plan-sex-icon"></div>';
        html += '<div class="plan-sex-lbl">Yours</div>';
        html += '<div class="plan-bar-wrap"><div class="plan-bar" style="width:' + fyPct + '%;background:' + fyBar + ';"></div></div>';
        html += '<div class="plan-count ' + (fyDone ? 'plan-count-done' : fy === 0 ? 'plan-count-zero' : '') + '" style="font-size:10px;">' + fy + '/' + (fa || '–') + (fyDone ? ' ✓' : '') + '</div>';
        html += '</div>';
      }
    }
    html += '</div>';
  });

  if (!rendered) {
    return '<div style="font-size:11px;color:var(--muted);padding:4px 0;">No targets for ' + esc(season) + ' yet.</div>';
  }
  var totalPct = totalTarget > 0 ? Math.min(100, Math.round(totalActual / totalTarget * 100)) : 0;
  html += '<div class="plan-total-row">';
  html += '<div class="plan-total-lbl">Total</div>';
  html += '<div class="plan-total-bar"><div class="plan-total-fill" style="width:' + totalPct + '%;"></div></div>';
  html += '<div class="plan-total-count">' + totalActual + '/' + totalTarget + '</div>';
  html += '</div>';
  return html;
}

async function renderOneSyndicateCard(row) {
  var s = row.syndicate;
  var isMgr = row.role === 'manager';
  var season = currentSeason;
  var sum = await fetchSyndicateSummaryRpc(s.id, season);
  var rows = [];
  if (sum.ok) rows = sum.rows || [];
  else {
    var fb = await fetchSyndicateSummaryFallback(s, season, isMgr);
    rows = fb.rows || [];
  }
  var sub = (s.allocation_mode === 'group' ? 'Group targets' : 'Individual allocations') +
    (s.ground_filter ? ' · ' + s.ground_filter : '');
  var btn = isMgr
    ? '<button type="button" class="plan-edit-btn" data-fl-action="open-syndicate-manage" data-syndicate-id="' + esc(s.id) + '">Manage</button>'
    : '<button type="button" class="plan-edit-btn" data-fl-action="open-syndicate-manage" data-syndicate-id="' + esc(s.id) + '">View</button>';
  return '<div class="synd-block">'
    + '<div class="synd-block-hdr">'
    + '<div><div class="synd-block-title">' + esc(s.name) + '</div>'
    + '<div class="synd-block-meta">' + esc(sub) + '</div></div>' + btn + '</div>'
    + renderSyndicateProgressBars(s, rows, season)
    + '</div>';
}

async function renderSyndicateSection() {
  var body = document.getElementById('syndicate-body');
  var outer = document.getElementById('syndicate-card-outer');
  var btn = document.getElementById('syndicate-new-btn');
  if (!body || !outer) return Promise.resolve();
  if (!sb) {
    outer.style.display = 'none';
    return Promise.resolve();
  }
  outer.style.display = '';
  if (!currentUser) {
    try {
      var ses = await sb.auth.getSession();
      if (ses.data && ses.data.session && ses.data.session.user) {
        currentUser = ses.data.session.user;
      }
    } catch (e) { /* ignore */ }
  }
  if (!currentUser) {
    body.innerHTML = '<div class="plan-empty" style="padding:12px 0;"><div class="plan-empty-s" style="font-size:12px;">Sign in to manage syndicate cull targets.</div></div>';
    if (btn) btn.style.display = 'none';
    return Promise.resolve();
  }
  if (btn) btn.style.display = '';
  body.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px;">Loading syndicates…</div>';
  try {
    var list = await loadMySyndicateRows();
    if (list.length) await syncSyndicateGroundFiltersFromRows(list);
    if (!list.length) {
      body.innerHTML = '<div class="plan-empty"><div class="plan-empty-t">No syndicates yet</div>'
        + '<div class="plan-empty-s">Create a group, set shared targets, and invite members with a link.</div>'
        + '<button type="button" class="plan-set-btn" data-fl-action="open-syndicate-create">Create syndicate</button></div>';
      enhanceKeyboardClickables(body);
      return;
    }
    var parts = [];
    for (var i = 0; i < list.length; i++) {
      parts.push(await renderOneSyndicateCard(list[i]));
    }
    body.innerHTML = parts.join('');
    enhanceKeyboardClickables(body);
  } catch (e) {
    body.innerHTML = '<div style="padding:12px;font-size:12px;color:#c62828;">' + esc(e.message || 'Failed to load syndicates') + '</div>';
  }
}

async function openSyndicateCreateSheet() {
  if (!sb) { showToast('⚠️ Supabase not configured'); return; }
  if (!currentUser) {
    try {
      var ses = await sb.auth.getSession();
      if (ses.data && ses.data.session && ses.data.session.user) {
        currentUser = ses.data.session.user;
      }
    } catch (e) { /* ignore */ }
  }
  if (!currentUser) { showToast('⚠️ Sign in first'); return; }
  await refreshSyndicateGroundFilterSetFromNetwork();
  syndicateEditingId = null;
  var tEl = document.getElementById('syn-modal-title');
  var sEl = document.getElementById('syn-modal-sub');
  var bEl = document.getElementById('syn-modal-body');
  if (!tEl || !sEl || !bEl) {
    showToast('⚠️ UI not ready — refresh the page');
    console.warn('Syndicate modal nodes missing');
    return;
  }
  tEl.textContent = 'New syndicate';
  sEl.textContent = 'Create a group and set targets';
  var groundOpts = buildSyndicateCreateGroundSelectInnerHtml();
  bEl.innerHTML =
    '<label style="display:block;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted);margin-bottom:6px;">Name</label>'
    + '<input type="text" id="syn-inp-name" style="width:100%;padding:10px 12px;border:1.5px solid #e0dcd6;border-radius:10px;margin-bottom:14px;font-size:14px;" placeholder="e.g. North Block syndicate">'
    + '<label style="display:block;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted);margin-bottom:6px;">Allocation</label>'
    + '<select id="syn-inp-mode" style="width:100%;padding:10px 12px;border:1.5px solid #e0dcd6;border-radius:10px;margin-bottom:14px;font-size:14px;">'
    + '<option value="group">Group total (shared pool)</option>'
    + '<option value="individual">Per-member allocations</option></select>'
    + '<label style="display:block;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted);margin-bottom:6px;">Ground filter (optional)</label>'
    + '<select id="syn-inp-ground" style="width:100%;padding:10px 12px;border:1.5px solid #e0dcd6;border-radius:10px;margin-bottom:0;font-size:13px;">' + groundOpts + '</select>'
    + '<input type="text" id="syn-inp-ground-custom" autocomplete="off" placeholder="Type ground label (must match entry Permission / Ground)" style="display:none;width:100%;padding:10px 12px;border:1.5px solid #e0dcd6;border-radius:10px;margin-top:8px;margin-bottom:16px;font-size:14px;box-sizing:border-box;">'
    + '<p style="font-size:11px;color:var(--muted);margin-bottom:8px;">Entries must match this ground label to count. Leave empty to count all entries from members.</p>'
    + '<p style="font-size:11px;color:var(--muted);margin-bottom:14px;">This filter applies only to the syndicate you are creating. It does not change syndicates you already belong to.</p>'
    + '<button type="button" class="tsheet-save" style="width:100%;" data-fl-action="save-syndicate-create">Create syndicate</button>';
  enhanceKeyboardClickables(bEl);
  var synG = document.getElementById('syn-inp-ground');
  var synGc = document.getElementById('syn-inp-ground-custom');
  if (synG && synGc) {
    synG.addEventListener('change', function() {
      if (synG.value === '__custom__') {
        synGc.style.display = 'block';
        synGc.focus();
      } else {
        synGc.style.display = 'none';
        synGc.value = '';
      }
    });
  }
  openSynModal();
}

async function saveSyndicateCreate() {
  if (!sb || !currentUser) return;
  var name = document.getElementById('syn-inp-name') && document.getElementById('syn-inp-name').value.trim();
  var mode = document.getElementById('syn-inp-mode') && document.getElementById('syn-inp-mode').value;
  var groundSel = document.getElementById('syn-inp-ground');
  var groundCustom = document.getElementById('syn-inp-ground-custom');
  var g = '';
  if (groundSel) {
    if (groundSel.value === '__custom__' && groundCustom) {
      g = String(groundCustom.value || '').trim();
    } else if (groundSel.value && groundSel.value !== '__custom__') {
      g = String(groundSel.value).trim();
    }
  }
  if (groundSel && groundSel.value === '__custom__' && !g) {
    showToast('⚠️ Enter a ground label or choose “All grounds”');
    return;
  }
  if (!name) { showToast('⚠️ Enter a name'); return; }
  var btn = document.querySelector('[data-fl-action="save-syndicate-create"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
  try {
    if (g) await saveGround(g);
    var r = await sb.rpc('create_syndicate', {
      p_name: name,
      p_allocation_mode: mode,
      p_ground_filter: g || null
    });
    if (r.error) throw r.error;
    showToast('✅ Syndicate created');
    closeSynModal();
    statsNeedsFullRebuild = true;
    await renderSyndicateSection();
    openSyndicateManageSheet(r.data);
  } catch (e) {
    showToast('⚠️ ' + (e.message || 'Could not create'));
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Create syndicate'; }
}

async function openSyndicateManageSheet(sid) {
  if (!sb || !currentUser) return;
  syndicateEditingId = sid || syndicateEditingId;
  if (!syndicateEditingId) return;
  var sr = await sb.from('syndicates').select('*').eq('id', syndicateEditingId).single();
  if (sr.error || !sr.data) { showToast('⚠️ Syndicate not found'); return; }
  var s = sr.data;
  var isMgr = false;
  var mr = await sb.from('syndicate_members').select('role').eq('syndicate_id', s.id).eq('user_id', currentUser.id).eq('status', 'active').limit(1);
  if (mr.data && mr.data[0] && mr.data[0].role === 'manager') isMgr = true;

  var memberRows = null;
  var memberNameById = {};
  if (isMgr) {
    var mfetch = await sb.from('syndicate_members').select('user_id, role, display_name, joined_at').eq('syndicate_id', s.id).eq('status', 'active');
    memberRows = mfetch.data;
    if (memberRows) {
      memberRows.forEach(function(m) {
        memberNameById[m.user_id] = (m.display_name && String(m.display_name).trim())
          ? String(m.display_name).trim()
          : ('Member ' + (m.user_id || '').slice(0, 8));
      });
    }
  }

  document.getElementById('syn-modal-title').textContent = s.name;
  document.getElementById('syn-modal-sub').textContent = (isMgr ? 'Manager' : 'Member') + ' · ' + currentSeason;

  var targets = {};
  var tr = await sb.from('syndicate_targets').select('species, sex, target').eq('syndicate_id', s.id).eq('season', currentSeason);
  if (tr.data) tr.data.forEach(function(row) { targets[row.species + '-' + row.sex] = row.target; });

  var bodyHtml = '';
  if (isMgr && memberRows && memberRows.length) {
    var sortedMembers = memberRows.slice().sort(function(a, b) {
      if (a.role !== b.role) return a.role === 'manager' ? -1 : 1;
      var na = memberNameById[a.user_id] || '';
      var nb = memberNameById[b.user_id] || '';
      return na.localeCompare(nb, undefined, { sensitivity: 'base' });
    });
    bodyHtml += '<div style="font-size:11px;font-weight:700;margin-bottom:8px;color:var(--bark);">Members</div>'
      + '<p style="font-size:11px;color:var(--muted);margin:0 0 10px 0;">Everyone in this syndicate right now. Promote at least one member to manager before you leave.</p>'
      + '<div id="syn-member-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px;">';
    sortedMembers.forEach(function(m) {
      var label = memberNameById[m.user_id] || ('Member ' + (m.user_id || '').slice(0, 8));
      var isSelf = m.user_id === currentUser.id;
      var roleLbl = m.role === 'manager' ? 'Manager' : 'Member';
      var joined = m.joined_at
        ? new Date(m.joined_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : '';
      var rmCell = '';
      if (m.role === 'member' && !isSelf) {
        rmCell = '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">'
          + '<button type="button" class="syn-member-promote" data-fl-action="synd-promote-member" data-member-user-id="' + esc(m.user_id) + '" style="flex-shrink:0;padding:6px 10px;font-size:11px;border:1.5px solid #2d7a1a;color:#2d7a1a;border-radius:8px;background:transparent;font-weight:600;cursor:pointer;">Promote</button>'
          + '<button type="button" class="syn-member-rm" data-fl-action="synd-remove-member" data-member-user-id="' + esc(m.user_id) + '" style="flex-shrink:0;padding:6px 10px;font-size:11px;border:1.5px solid #c62828;color:#c62828;border-radius:8px;background:transparent;font-weight:600;cursor:pointer;">Remove</button>'
          + '</div>';
      } else if (m.role === 'member' && isSelf) {
        rmCell = '<span style="font-size:10px;color:var(--muted);white-space:nowrap;">Use Leave below</span>';
      } else {
        rmCell = '<span style="font-size:10px;color:var(--muted);white-space:nowrap;">—</span>';
      }
      bodyHtml += '<div class="syn-member-row" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;background:#faf8f4;border:1.5px solid #ece8e2;border-radius:10px;">'
        + '<div style="min-width:0;">'
        + '<div style="font-weight:600;font-size:13px;color:var(--bark);">' + esc(label)
        + (isSelf ? ' <span style="color:var(--muted);font-weight:500;">(you)</span>' : '')
        + '</div>'
        + '<div style="font-size:10px;color:var(--muted);">' + esc(roleLbl) + (joined ? ' · Joined ' + esc(joined) : '') + '</div>'
        + '</div>' + rmCell + '</div>';
    });
    bodyHtml += '</div>';
  }

  if (s.allocation_mode === 'group' && isMgr) {
    bodyHtml += '<div style="font-size:11px;font-weight:700;margin-bottom:8px;color:var(--bark);">Group targets · ' + esc(currentSeason) + '</div>'
      + buildSyndicateStepperGrid(targets, 'syntt')
      + '<button type="button" class="tsheet-save" style="width:100%;margin-top:14px;" data-fl-action="save-syndicate-targets">Save targets</button>';
  } else if (s.allocation_mode === 'group' && !isMgr) {
    bodyHtml += '<p style="font-size:12px;color:var(--muted);">Group totals are set by the manager. You see syndicate-wide progress on the Stats card.</p>';
  }

  if (s.allocation_mode === 'individual' && isMgr) {
    var opts = '<option value="">Choose member…</option>';
    if (memberRows) {
      memberRows.forEach(function(m) {
        if (m.role === 'manager') return;
        var label = memberNameById[m.user_id] || ('Member ' + (m.user_id || '').slice(0, 8));
        opts += '<option value="' + esc(m.user_id) + '">' + esc(label) + '</option>';
      });
    }
    var allocVals = {};
    syndicateAllocMemberId = null;
    bodyHtml += '<div style="font-size:11px;font-weight:700;margin-bottom:8px;">Per-member allocations</div>'
      + '<select id="syn-alloc-member" style="width:100%;padding:10px;margin-bottom:10px;border:1.5px solid #e0dcd6;border-radius:10px;font-size:13px;">' + opts + '</select>'
      + '<div id="syn-alloc-grid"></div>'
      + '<button type="button" class="tsheet-save" style="width:100%;margin-top:12px;display:none;" id="syn-alloc-save" data-fl-action="save-syndicate-alloc">Save allocations for member</button>';
  } else if (s.allocation_mode === 'individual' && !isMgr) {
    bodyHtml += '<p style="font-size:12px;color:var(--muted);">Your personal allocation is set by the manager. Syndicate totals are on the Stats card.</p>';
  }

  if (isMgr) {
    var invRows = [];
    try {
      var invFetch = await sb.from('syndicate_invites')
        .select('id, token, created_at, expires_at, max_uses, used_count')
        .eq('syndicate_id', s.id)
        .order('created_at', { ascending: false })
        .limit(12);
      if (invFetch.data) invRows = invFetch.data;
    } catch (e) { /* ignore invite list errors */ }
    var nowMs = Date.now();
    var activeInv = (invRows || []).filter(function(inv) {
      var expMs = Date.parse(String(inv.expires_at || ''));
      var used = parseInt(inv.used_count, 10) || 0;
      var max = parseInt(inv.max_uses, 10) || 0;
      if (!(expMs > 0)) return false;
      return expMs > nowMs && used < max;
    });

    bodyHtml += '<div style="margin-top:20px;padding-top:16px;border-top:1px solid #ece8e2;">'
      + '<div style="font-size:11px;font-weight:700;margin-bottom:8px;">Invite link</div>'
      + '<p style="font-size:11px;color:var(--muted);margin-bottom:8px;">Generate a link and send it to members. They must be signed in to accept.</p>'
      + '<button type="button" class="copy-targets-btn" style="width:100%;margin-bottom:8px;" data-fl-action="synd-generate-invite">Generate new invite link</button>'
      + '<div id="syn-invite-out" class="synd-invite-box" style="display:none;"></div>';

    if (activeInv.length) {
      bodyHtml += '<div style="margin-top:10px;font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">Active invites</div>'
        + '<div style="display:flex;flex-direction:column;gap:8px;margin-top:6px;">';
      activeInv.forEach(function(inv) {
        var left = Math.max(0, (parseInt(inv.max_uses, 10) || 0) - (parseInt(inv.used_count, 10) || 0));
        var expDate = inv.expires_at ? new Date(inv.expires_at) : null;
        var expLbl = (expDate && !isNaN(expDate.getTime()))
          ? expDate.toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
          : 'unknown';
        var shortToken = String(inv.token || '').slice(0, 10) + '…';
        var u = syndicateInviteUrl(inv.token);
        bodyHtml += '<div style="padding:10px 10px;border:1.5px solid #ece8e2;border-radius:10px;background:#faf8f4;">'
          + '<div style="font-size:11px;color:var(--bark);font-weight:600;">' + esc(shortToken) + '</div>'
          + '<div style="font-size:10px;color:var(--muted);margin-top:2px;">Uses left: ' + esc(String(left)) + ' · Expires: ' + esc(expLbl) + '</div>'
          + '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">'
          + '<button type="button" class="copy-targets-btn" style="padding:6px 10px;font-size:11px;" data-fl-action="synd-copy-existing-invite" data-invite-url="' + esc(u) + '">Copy</button>'
          + '<button type="button" style="padding:6px 10px;font-size:11px;border:1.5px solid #c62828;color:#c62828;border-radius:8px;background:transparent;font-weight:600;cursor:pointer;" data-fl-action="synd-revoke-invite" data-invite-id="' + esc(inv.id) + '">Revoke</button>'
          + '</div></div>';
      });
      bodyHtml += '</div>';
    }
    bodyHtml += '</div>';

    var br = await sb.rpc('syndicate_member_actuals_for_manager', { p_syndicate_id: s.id, p_season: currentSeason });
    if (!br.error && br.data && br.data.length) {
      bodyHtml += '<div style="margin-top:16px;"><div style="font-size:11px;font-weight:700;margin-bottom:6px;">Manager · culled by member</div>'
        + '<p style="font-size:10px;color:var(--muted);margin:0 0 6px 0;">Each line is one cull, newest first.</p>'
        + '<div style="font-size:11px;font-family:DM Sans,sans-serif;color:var(--bark);max-height:220px;overflow:auto;line-height:1.45;">';
      br.data.forEach(function(row) {
        var nm = row.user_id
          ? (memberNameById[row.user_id] || ('Member ' + (row.user_id || '').slice(0, 8)))
          : 'Former members (account removed)';
        var sexLbl = row.sex === 'm' ? 'Stags/Bucks' : 'Hinds/Does';
        var dateStr = row.cull_date ? fmtDate(row.cull_date) : '—';
        bodyHtml += '<span style="font-weight:600;">' + esc(nm) + '</span>'
          + ' <span style="color:var(--muted);">·</span> ' + esc(row.species)
          + ' <span style="color:var(--muted);">' + esc(sexLbl) + '</span>'
          + ' <span style="color:var(--muted);">·</span> ' + esc(dateStr)
          + '<br>';
      });
      bodyHtml += '</div></div>';
    }

    bodyHtml += '<div style="margin-top:20px;"><button type="button" style="width:100%;padding:12px;background:none;border:1.5px solid #c62828;color:#c62828;border-radius:12px;font-weight:700;" data-fl-action="synd-delete">Delete syndicate</button></div>';
  }

  bodyHtml += '<div style="margin-top:16px;"><button type="button" style="width:100%;padding:12px;border:1.5px solid #e0dcd6;border-radius:12px;background:#faf8f4;font-weight:600;" data-fl-action="synd-leave">Leave syndicate</button></div>';

  var smb = document.getElementById('syn-modal-body');
  if (smb) {
    smb.innerHTML = bodyHtml;
    enhanceKeyboardClickables(smb);
  }

  if (s.allocation_mode === 'individual' && isMgr) {
    var sel = document.getElementById('syn-alloc-member');
    if (sel) {
      sel.addEventListener('change', function() {
        syndicateAllocMemberId = sel.value || null;
        loadSyndicateAllocGrid(s.id, currentSeason, syndicateAllocMemberId);
      });
    }
  }

  openSynModal();
}

async function loadSyndicateAllocGrid(syndicateId, season, memberUserId) {
  var grid = document.getElementById('syn-alloc-grid');
  var saveBtn = document.getElementById('syn-alloc-save');
  if (!grid || !memberUserId) {
    if (grid) grid.innerHTML = '';
    if (saveBtn) saveBtn.style.display = 'none';
    return;
  }
  var ar = await sb.from('syndicate_member_allocations').select('species, sex, allocation')
    .eq('syndicate_id', syndicateId).eq('season', season).eq('user_id', memberUserId);
  var vals = {};
  if (ar.data) ar.data.forEach(function(row) { vals[row.species + '-' + row.sex] = row.allocation; });
  grid.innerHTML = buildSyndicateStepperGrid(vals, 'synalloc');
  if (saveBtn) saveBtn.style.display = 'block';
  enhanceKeyboardClickables(grid);
}

async function saveSyndicateTargets() {
  if (!sb || !currentUser || !syndicateEditingId) return;
  var o = readSyndicateSteppers('syntt');
  var rows = [];
  PLAN_SPECIES.forEach(function(sp) {
    rows.push({ syndicate_id: syndicateEditingId, season: currentSeason, species: sp.name, sex: 'm', target: o[sp.name + '-m'] || 0 });
    rows.push({ syndicate_id: syndicateEditingId, season: currentSeason, species: sp.name, sex: 'f', target: o[sp.name + '-f'] || 0 });
  });
  var r = await sb.from('syndicate_targets').upsert(rows, { onConflict: 'syndicate_id,season,species,sex' });
  if (r.error) { showToast('⚠️ ' + (r.error.message || 'Save failed')); return; }
  showToast('✅ Targets saved');
  statsNeedsFullRebuild = true;
  await renderSyndicateSection();
}

async function saveSyndicateAlloc() {
  if (!sb || !syndicateEditingId || !syndicateAllocMemberId) { showToast('⚠️ Pick a member'); return; }
  var rows = [];
  var o = readSyndicateSteppers('synalloc');
  PLAN_SPECIES.forEach(function(sp) {
    rows.push({
      syndicate_id: syndicateEditingId,
      user_id: syndicateAllocMemberId,
      season: currentSeason,
      species: sp.name,
      sex: 'm',
      allocation: o[sp.name + '-m'] || 0
    });
    rows.push({
      syndicate_id: syndicateEditingId,
      user_id: syndicateAllocMemberId,
      season: currentSeason,
      species: sp.name,
      sex: 'f',
      allocation: o[sp.name + '-f'] || 0
    });
  });
  var r = await sb.from('syndicate_member_allocations').upsert(rows, { onConflict: 'syndicate_id,user_id,season,species,sex' });
  if (r.error) { showToast('⚠️ ' + (r.error.message || 'Save failed')); return; }
  showToast('✅ Allocations saved');
  statsNeedsFullRebuild = true;
  await renderSyndicateSection();
}

async function syndGenerateInvite() {
  if (!sb || !syndicateEditingId) return;
  var tok = syndicateRandomToken();
  var exp = new Date(Date.now() + SYNDICATE_INVITE_DEFAULT_DAYS * 864e5).toISOString();
  var r = await sb.from('syndicate_invites').insert({
    syndicate_id: syndicateEditingId,
    token: tok,
    created_by: currentUser.id,
    expires_at: exp,
    max_uses: SYNDICATE_INVITE_DEFAULT_MAX_USES,
    used_count: 0
  });
  if (r.error) { showToast('⚠️ ' + (r.error.message || 'Could not create invite')); return; }
  var url = syndicateInviteUrl(tok);
  var out = document.getElementById('syn-invite-out');
  if (out) {
    out.style.display = 'block';
    out.innerHTML = '<span style="color:var(--muted);">Link (' + SYNDICATE_INVITE_DEFAULT_DAYS + ' days, ' + SYNDICATE_INVITE_DEFAULT_MAX_USES + ' uses):</span><br>' + esc(url)
      + '<br><button type="button" class="copy-targets-btn" style="margin-top:8px;" data-fl-action="synd-copy-invite" data-invite-url="' + esc(url) + '">Copy link</button>';
  }
  showToast('✅ Invite link ready');
  await openSyndicateManageSheet(syndicateEditingId);
}

function syndCopyInvite(el) {
  var u = el.getAttribute('data-invite-url');
  if (!u || !navigator.clipboard) { showToast('⚠️ Copy manually'); return; }
  navigator.clipboard.writeText(u).then(function() { showToast('📋 Copied'); }).catch(function() { showToast('⚠️ Copy failed'); });
}

function syndCopyExistingInvite(el) {
  var u = el.getAttribute('data-invite-url');
  if (!u || !navigator.clipboard) { showToast('⚠️ Copy manually'); return; }
  navigator.clipboard.writeText(u).then(function() { showToast('📋 Invite copied'); }).catch(function() { showToast('⚠️ Copy failed'); });
}

async function syndRevokeInvite(inviteId) {
  if (!sb || !syndicateEditingId || !inviteId) return;
  if (!(await flConfirm({
    title: 'Revoke invite link?',
    body: 'The link will stop working immediately. People who already joined the syndicate are unaffected.',
    action: 'Revoke invite',
    tone: 'warn'
  }))) return;
  var r = await sb.from('syndicate_invites')
    .delete()
    .eq('id', inviteId)
    .eq('syndicate_id', syndicateEditingId);
  if (r.error) {
    showToast('⚠️ ' + (r.error.message || 'Could not revoke invite'));
    return;
  }
  showToast('✅ Invite revoked');
  await openSyndicateManageSheet(syndicateEditingId);
}

async function syndLeaveOrClose() {
  if (!sb || !syndicateEditingId) { closeSynModal(); return; }
  if (!(await flConfirm({
    title: 'Leave this syndicate?',
    body: 'You will no longer see team totals or manager exports for this syndicate. Your own diary entries remain untouched. You can rejoin if a manager sends you a new invite.',
    action: 'Leave syndicate',
    tone: 'warn'
  }))) return;
  var leaveRes = await sb.rpc('leave_syndicate_member', { p_syndicate_id: syndicateEditingId });
  if (leaveRes.error) {
    var msg = leaveRes.error.message || 'Could not leave';
    if (msg.toLowerCase().indexOf('promote') !== -1 || msg.toLowerCase().indexOf('manager') !== -1) {
      showToast('⚠️ Promote another manager before leaving');
    } else {
      showToast('⚠️ ' + msg);
    }
    return;
  }
  showToast('✅ Left syndicate');
  closeSynModal();
  statsNeedsFullRebuild = true;
  await renderSyndicateSection();
}

async function syndPromoteMember(userId) {
  if (!sb || !syndicateEditingId || !userId) return;
  if (userId === currentUser.id) {
    showToast('⚠️ You are already manager');
    return;
  }
  if (!(await flConfirm({
    title: 'Promote to manager?',
    body: 'They will be able to invite members, edit syndicate targets, manage allocations, and delete the syndicate. You can demote them later from the member list.',
    action: 'Promote to manager',
    tone: 'warn'
  }))) return;
  var r = await sb.from('syndicate_members')
    .update({ role: 'manager' })
    .eq('syndicate_id', syndicateEditingId)
    .eq('user_id', userId)
    .eq('status', 'active');
  if (r.error) {
    showToast('⚠️ ' + (r.error.message || 'Could not promote member'));
    return;
  }
  showToast('✅ Member promoted to manager');
  statsNeedsFullRebuild = true;
  await renderSyndicateSection();
  await openSyndicateManageSheet(syndicateEditingId);
}

async function syndDelete() {
  if (!sb || !syndicateEditingId) return;
  if (!(await flConfirm({
    title: 'Delete this syndicate for everyone?',
    body: 'Every member loses access immediately. Targets, allocations, and invite links are removed. Individual diary entries stay on each member\u2019s account. This cannot be undone.',
    action: 'Delete syndicate',
    tone: 'danger'
  }))) return;
  var r = await sb.from('syndicates').delete().eq('id', syndicateEditingId);
  if (r.error) { showToast('⚠️ ' + (r.error.message || 'Delete failed')); return; }
  showToast('🗑 Syndicate deleted');
  closeSynModal();
  statsNeedsFullRebuild = true;
  await renderSyndicateSection();
}

async function syndRemoveMember(userId) {
  if (!sb || !syndicateEditingId || !userId) return;
  if (userId === currentUser.id) {
    showToast('⚠️ Use “Leave syndicate” at the bottom to remove yourself');
    return;
  }
  if (!(await flConfirm({
    title: 'Remove this member?',
    body: 'Their diary entries stay private to them. Syndicate totals will no longer include their current-season kills. They can rejoin with a new invite if you send one later.',
    action: 'Remove member',
    tone: 'warn'
  }))) return;
  var r = await sb.from('syndicate_members').update({ status: 'left' }).eq('syndicate_id', syndicateEditingId).eq('user_id', userId);
  if (r.error) {
    showToast('⚠️ ' + (r.error.message || 'Could not remove member'));
    return;
  }
  showToast('✅ Member removed');
  statsNeedsFullRebuild = true;
  await renderSyndicateSection();
  await openSyndicateManageSheet(syndicateEditingId);
}

/**
 * Upsert each active syndicate's `ground_filter` into the current user's `grounds` table
 * (canonical names for the Permission / Ground dropdown vs exact SQL match on cull_entries).
 */
async function syncSyndicateGroundFiltersFromRows(rows) {
  if (!sb || !currentUser) return;
  rebuildSyndicateGroundFilterSet(rows || []);
  if (!rows || !rows.length) {
    populateGroundDropdown();
    return;
  }
  try {
    for (var i = 0; i < rows.length; i++) {
      var s = rows[i].syndicate;
      if (!s) continue;
      var g = s.ground_filter ? String(s.ground_filter).trim() : '';
      if (!g) continue;
      await saveGround(g);
    }
    await loadGrounds({ skipSyndicateRefresh: true });
  } catch (e) {
    console.warn('syncSyndicateGroundFiltersFromRows:', e);
  }
}

async function syncSyndicateGroundFiltersForCurrentUser() {
  if (!sb || !currentUser) return;
  try {
    var list = await loadMySyndicateRows();
    await syncSyndicateGroundFiltersFromRows(list);
  } catch (e) {
    console.warn('syncSyndicateGroundFiltersForCurrentUser:', e);
  }
}

async function tryRedeemSyndicateInviteFromUrl() {
  if (!sb || !currentUser) return;
  var sp = new URLSearchParams(window.location.search);
  var tok = sp.get('syndicate_invite');
  if (!tok) return;
  try {
    var r = await sb.rpc('redeem_syndicate_invite', { p_token: tok });
    if (r.error) throw r.error;
    showToast('✅ Joined syndicate');
    history.replaceState(null, '', window.location.pathname + window.location.hash);
    statsNeedsFullRebuild = true;
    if (document.getElementById('v-stats') && document.getElementById('v-stats').classList.contains('active')) buildStats();
    await renderSyndicateSection();
  } catch (e) {
    showToast('⚠️ Invite: ' + (e.message || 'invalid'));
    history.replaceState(null, '', window.location.pathname + window.location.hash);
  }
}


// ── Ground Stats ───────────────────────────────────────────────
function buildGroundStats(entries) {
  var card  = document.getElementById('ground-card');
  var chart = document.getElementById('ground-chart');
  if (!card || !chart) return;

  // Group by ground — blank ground = 'Untagged'
  var counts = {};
  entries.forEach(function(e) {
    var g = (e.ground && e.ground.trim()) ? e.ground.trim() : null;
    if (g) counts[g] = (counts[g]||0) + 1;
    else   counts['__untagged__'] = (counts['__untagged__']||0) + 1;
  });

  var grounds = Object.keys(counts).filter(function(g){ return g !== '__untagged__'; });

  // Hide if only one ground or no grounds at all
  if (grounds.length === 0) { card.style.display = 'none'; return; }
  card.style.display = 'block';

  grounds.sort(function(a,b){ return counts[b]-counts[a]; });
  var maxCnt = Math.max.apply(null, grounds.map(function(g){ return counts[g]; }).concat([1]));

  var html = '';
  grounds.forEach(function(g, i) {
    var cnt = counts[g];
    var pct = Math.round(cnt/maxCnt*100);
    var barClr = i === 0
      ? 'linear-gradient(90deg,#5a7a30,#7adf7a)'
      : 'linear-gradient(90deg,#c8a84b,#f0c870)';
    html += '<div class="bar-row">'
      + '<div class="bar-lbl">' + esc(g) + '</div>'
      + '<div class="bar-track"><div class="bar-fill" style="width:'+pct+'%;background:'+barClr+';"></div></div>'
      + '<div class="bar-cnt">'+cnt+'</div>'
      + '</div>';
  });

  // Untagged at bottom in grey if any
  if (counts['__untagged__']) {
    var uCnt = counts['__untagged__'];
    var uPct = Math.round(uCnt/maxCnt*100);
    html += '<div class="bar-row">'
      + '<div class="bar-lbl" style="color:var(--muted);font-style:italic;">Untagged</div>'
      + '<div class="bar-track"><div class="bar-fill" style="width:'+uPct+'%;background:#e0dcd6;"></div></div>'
      + '<div class="bar-cnt" style="color:var(--muted);">'+uCnt+'</div>'
      + '</div>';
  }

  chart.innerHTML = html;
}


// ── Ground Management (add / delete from targets sheet) ───────
function showAddGroundInput() {
  var row = document.getElementById('ground-add-row');
  var inp = document.getElementById('ground-add-inp');
  if (row) { row.style.display = 'flex'; }
  if (inp) { inp.value = ''; inp.focus(); }
}

function hideAddGroundInput() {
  var row = document.getElementById('ground-add-row');
  if (row) row.style.display = 'none';
}

async function seedUnassignedBufferFromCullIfNeeded() {
  if (!sb || !currentUser || savedGrounds.length !== 1) return;
  var named = savedGrounds[0];
  var namedBucket = groundTargets[named] || {};
  var namedSum = Object.keys(namedBucket).reduce(function(s, k) {
    return s + (parseInt(namedBucket[k], 10) || 0);
  }, 0);
  var u = groundTargets['__unassigned__'] || {};
  var uSum = Object.keys(u).reduce(function(s, k) {
    return s + (parseInt(u[k], 10) || 0);
  }, 0);
  if (namedSum > 0 || uSum > 0) return;
  var cullSum = Object.keys(cullTargets || {}).reduce(function(s, k) {
    return s + (parseInt(cullTargets[k], 10) || 0);
  }, 0);
  if (cullSum === 0) return;
  var rows = [];
  PLAN_SPECIES.forEach(function(sp) {
    var m = cullTargets[sp.name + '-m'] || 0;
    var f = cullTargets[sp.name + '-f'] || 0;
    rows.push({ user_id: currentUser.id, season: currentSeason, ground: '__unassigned__', species: sp.name, sex: 'm', target: m });
    rows.push({ user_id: currentUser.id, season: currentSeason, ground: '__unassigned__', species: sp.name, sex: 'f', target: f });
  });
  try {
    var r = await sb.from('ground_targets').upsert(rows, { onConflict: 'user_id,season,ground,species,sex' });
    if (r.error) throw r.error;
    await loadGroundTargets(currentSeason);
    await syncCullTargetsFromGroundTargetsAgg(sumGroundTargetsAgg(groundTargets));
  } catch (e) {
    console.warn('seedUnassignedBufferFromCullIfNeeded:', e);
  }
}

async function confirmAddGround() {
  var inp = document.getElementById('ground-add-inp');
  var name = inp ? inp.value.trim() : '';
  if (!name) { showToast('⚠️ Enter a ground name'); return; }
  if (savedGrounds.indexOf(name) !== -1) { showToast('⚠️ Ground already exists'); return; }

  await saveGround(name);
  hideAddGroundInput();
  await seedUnassignedBufferFromCullIfNeeded();
  renderGroundSections();
  renderPlanGroundFilter();
  renderPlanCard(allEntries, currentSeason);
  showToast('✅ ' + name + ' added');
}

// Called from dynamically generated buttons using data-gi index attribute
function deleteGroundByIdx(btn) {
  var idx = parseInt(btn.getAttribute('data-gi'));
  if (isNaN(idx) || idx < 0 || idx >= savedGrounds.length) return;
  deleteGround(savedGrounds[idx]);
}

async function deleteGround(name) {
  if (!(await flConfirm({
    title: 'Remove \u201C' + name + '\u201D from your grounds?',
    body: 'Targets for this ground will be deleted. Diary entries are kept, but any entry tagged with this ground will no longer show one.',
    action: 'Remove ground',
    tone: 'warn'
  }))) return;
  if (!sb || !currentUser) return;

  try {
    // Clear ground on existing diary rows (entries are not deleted)
    var clearRes = await sb.from('cull_entries')
      .update({ ground: null })
      .eq('user_id', currentUser.id)
      .eq('ground', name);
    if (clearRes.error) throw clearRes.error;

    // Remove from grounds table
    await sb.from('grounds')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('name', name);

    // Remove ground targets for this ground
    await sb.from('ground_targets')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('ground', name);

    // Remove from local array
    savedGrounds = savedGrounds.filter(function(g){ return g !== name; });
    delete groundTargets[name];

    if (planGroundFilter === name) planGroundFilter = 'overview';

    await loadGroundTargets(currentSeason);
    if (savedGrounds.length === 0) {
      var aggDel = sumGroundTargetsAgg(groundTargets);
      if (summedGroundTargetsAnyPositive(aggDel)) await syncCullTargetsFromGroundTargetsAgg(aggDel);
    }

    populateGroundDropdown();
    renderGroundSections();
    renderPlanGroundFilter();
    await loadEntries();
    renderPlanCard(allEntries, currentSeason);
    if (document.getElementById('v-stats') && document.getElementById('v-stats').classList.contains('active')) buildStats();

    showToast('🗑 ' + name + ' removed');
  } catch(e) {
    showToast('⚠️ Could not remove ground');
    console.warn('deleteGround error:', e);
  }
}


// ── Summary Filter ──────────────────────────────────────────
function closeSummaryFilterModal() {
  var sm = document.getElementById('summary-filter-modal');
  if (sm) sm.style.display = 'none';
  summaryEntryPool = null;
}

async function openSummaryFilter() {
  if (!sb || !currentUser) {
    showToast('⚠️ Sign in to export');
    return;
  }

  summaryEntryPool = null;

  if (navigator.onLine) {
    try {
      showToast('⏳ Loading diary…');
      var r = await sb.from('cull_entries')
        .select(CULL_ENTRY_LIST_COLUMNS)
        .eq('user_id', currentUser.id)
        .order('date', { ascending: false });
      if (r.error) throw r.error;
      summaryEntryPool = r.data || [];
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) console.warn('openSummaryFilter fetch:', err);
      summaryEntryPool = allEntries.slice();
      showToast('⚠️ Could not load full history — using current season only');
    }
  } else {
    summaryEntryPool = allEntries.slice();
    if (summaryEntryPool.length) {
      showToast('📶 Offline — summary uses loaded season only');
    }
  }

  if (!summaryEntryPool.length) {
    showToast('⚠️ No entries to export');
    return;
  }

  var modal = document.getElementById('summary-filter-modal');

  // Populate season dropdown from full pool (not current-season slice)
  var seasonSel = document.getElementById('summary-season-sel');
  seasonSel.innerHTML = '<option value="__all__">All Seasons</option>';
  var seasonSet = {};
  summaryEntryPool.forEach(function(e) {
    var s = buildSeasonFromEntry(e.date);
    seasonSet[s] = true;
  });
  seasonSet[currentSeason] = true;
  var seasons = Object.keys(seasonSet).sort().reverse();
  seasons.forEach(function(s) {
    var opt = document.createElement('option');
    opt.value = s;
    opt.textContent = seasonLabel(s);
    if (s === currentSeason) opt.selected = true;
    seasonSel.appendChild(opt);
  });

  var groundSel = document.getElementById('summary-ground-sel');
  groundSel.innerHTML = '<option value="__all__">All grounds</option>';
  var groundSet = {};
  summaryEntryPool.forEach(function(e) {
    if (e.ground && e.ground.trim()) groundSet[e.ground.trim()] = true;
  });
  Object.keys(groundSet).sort().forEach(function(g) {
    var opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    groundSel.appendChild(opt);
  });

  function updateCount() {
    var sel = getFilteredSummaryEntries();
    document.getElementById('summary-count').textContent = sel.length;
  }
  seasonSel.onchange = updateCount;
  groundSel.onchange = updateCount;
  updateCount();

  modal.style.display = 'flex';
}

function getFilteredSummaryEntries() {
  var pool = summaryEntryPool && summaryEntryPool.length ? summaryEntryPool : allEntries;
  var season = document.getElementById('summary-season-sel').value;
  var ground = document.getElementById('summary-ground-sel').value;
  return pool.filter(function(e) {
    var inSeason = season === '__all__' || buildSeasonFromEntry(e.date) === season;
    var inGround = ground === '__all__' || (e.ground && e.ground.trim() === ground);
    return inSeason && inGround;
  });
}

async function doExportSummaryFiltered() {
  var entries = getFilteredSummaryEntries();
  if (!entries.length) { showToast('⚠️ No entries match selection'); return; }

  var season = document.getElementById('summary-season-sel').value;
  var ground = document.getElementById('summary-ground-sel').value;
  var groundLabel = ground === '__all__' ? 'All Grounds' : ground;
  var seasonForPdf = season === '__all__' ? currentSeason : season;
  /** Match cull plan targets to this season; skip plan section for “All Seasons” */
  var planSeasonKey = season === '__all__' ? null : season;

  closeSummaryFilterModal();

  window._summarySeasonLabel = season === '__all__' ? 'All Seasons' : null;
  window._summaryGroundOverride = groundLabel !== 'All Grounds' ? groundLabel : null;

  var _allEntries = allEntries;
  var _currentSeason = currentSeason;
  allEntries = entries;
  currentSeason = seasonForPdf;

  try {
    cullTargets = {};
    if (planSeasonKey && sb && currentUser) {
      await loadTargets(planSeasonKey);
    }
    exportSeasonSummary();
  } finally {
    allEntries = _allEntries;
    currentSeason = _currentSeason;
    delete window._summarySeasonLabel;
    delete window._summaryGroundOverride;
    if (sb && currentUser) {
      await loadTargets(_currentSeason);
    }
  }
}


// ── Offline photo storage warning ──────────────────────────
// Callers pass a fire-and-forget callback; internally we now await a themed
// flConfirm() in the low-storage branch so the user sees a properly-styled
// modal instead of a native browser confirm. The case-handler call sites
// ignore the returned Promise, which is fine — their only job is to invoke
// the file-input click once the user has consented (or to skip it cleanly).
async function offlinePhotoWarn(callback) {
  if (navigator.onLine) { callback(); return; }
  var queueStr = localStorage.getItem(OFFLINE_KEY) || '';
  var kb = Math.round(queueStr.length / 1024);
  var remaining = Math.max(0, 5000 - kb);
  if (remaining < 400) {
    // OK = "I still want the photo" (accepts storage-full risk).
    // Cancel = "skip the photo this time" (the safer default for someone
    // who has just been warned their browser storage is almost full).
    var ok = await flConfirm({
      title: 'Low offline storage',
      body: 'Only ' + remaining + 'KB of browser storage left. Adding a photo may stop this entry being saved at all. You can take the photo anyway, or skip it and save just the text — the entry still syncs the moment you are back online.',
      action: 'Take photo anyway',
      tone: 'warn'
    });
    if (!ok) return;
  } else {
    showToast('📶 Offline — photo will be stored locally (~200KB) until synced');
  }
  callback();
}

// ── UK place labels (aligned with app.js / index Nominatim handling) ──
function normalizeUkPlaceName(raw) {
  if (!raw || typeof raw !== 'string') return '';
  var s = raw.trim();
  s = s.replace(
    /^(Metropolitan Borough of |London Borough of |Royal Borough of |Borough of |City of |County of |District of |Unitary Authority of )/i,
    ''
  );
  return s.trim();
}
function primaryPlaceFromAddress(a, displayNameFirstPart) {
  a = a || {};
  var p =
    a.neighbourhood ||
    a.suburb ||
    a.village ||
    a.hamlet ||
    a.locality ||
    a.isolated_dwelling ||
    a.town ||
    a.city ||
    a.municipality ||
    '';
  if (p) return p;
  return (displayNameFirstPart || '').trim();
}
function formatUkLocationLabel(addr, displayNameFirstPart) {
  var a = addr || {};
  var rawPrimary = primaryPlaceFromAddress(a, displayNameFirstPart);
  var primary = normalizeUkPlaceName(rawPrimary);
  var county = normalizeUkPlaceName(a.county || a.state_district || '');
  var parts = [];
  if (primary) parts.push(primary);
  if (county) parts.push(county);
  return parts.join(', ') || normalizeUkPlaceName(displayNameFirstPart) || '';
}
function diaryReverseGeocodeLabel(d, latFallback, lngFallback) {
  var a = d.address || {};
  var displayFirst = (d.display_name || '').split(',')[0].trim();
  var raw = primaryPlaceFromAddress(a, displayFirst) || a.county || '';
  if (!raw) return latFallback + ', ' + lngFallback;
  return normalizeUkPlaceName(raw);
}
function diaryEscHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function diaryEscAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// ── Pin map location search ──────────────────────────────────
var _pinSearchTimer = null;

function pinmapSearchDebounce(val) {
  clearTimeout(_pinSearchTimer);
  if (!val.trim()) { document.getElementById('pinmap-search-results').style.display = 'none'; return; }
  _pinSearchTimer = setTimeout(function() { pinmapSearchNow(val); }, 500);
}

function pinmapSearchNow(val) {
  if (!val.trim()) return;
  var resultsEl = document.getElementById('pinmap-search-results');
  resultsEl.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:rgba(255,255,255,0.5);">Searching…</div>';
  resultsEl.style.display = 'block';
  nominatimFetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(val) + '&format=json&countrycodes=gb&limit=5&addressdetails=1')
    .then(function(r) { return r.json(); })
    .then(function(results) {
      if (!results.length) {
        resultsEl.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:rgba(255,255,255,0.4);">No results found</div>';
        return;
      }
      resultsEl.innerHTML = results.map(function(r) {
        var displayFirst = (r.display_name || '').split(',')[0].trim();
        var name = formatUkLocationLabel(r.address || {}, displayFirst) || displayFirst || 'Location';
        var enc = encodeURIComponent(name);
        var tip = r.display_name ? ' title="' + diaryEscAttr(r.display_name) + '"' : '';
        return '<div tabindex="0" role="button" data-fl-action="pinmap-select" data-lat="' + r.lat + '" data-lng="' + r.lon + '" data-place-name="' + enc + '" '
          + tip
          + ' style="padding:10px 14px;font-size:12px;color:white;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.08);">'
          + '<div style="font-weight:600;">' + diaryEscHtml(name) + '</div>'
          + '</div>';
      }).join('');
    })
    .catch(function() {
      resultsEl.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:rgba(255,255,255,0.4);">Search failed or timed out — check connection</div>';
    });
}

function pinmapSelectResult(lat, lng, name) {
  document.getElementById('pinmap-search-results').style.display = 'none';
  document.getElementById('pinmap-search').value = name;
  if (pinMap) {
    pinMap.setView([lat, lng], 14);
  }
}


function openPhotoLightbox(url) {
  var lb = document.getElementById('photo-lightbox');
  var img = document.getElementById('photo-lightbox-img');
  img.src = url;
  lb.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function closePhotoLightbox() {
  document.getElementById('photo-lightbox').style.display = 'none';
  document.getElementById('photo-lightbox-img').src = '';
  document.body.style.overflow = '';
}

