// =============================================================================
// First Light — ballistics.html UI module
//
// Orchestrates the calculator page. Connects:
//   * lib/fl-ballistics.mjs   — pure trajectory maths
//   * lib/fl-ammo.mjs         — factory ammo database lookups
//   * lib/fl-deer-law.mjs     — UK statutory energy thresholds
//   * data/ammo-loads.json    — the ammo data, fetched on init
//
// Persistence: rifle profiles live in localStorage under the key
// 'fl-ballistics-profiles-v1'. No Supabase, no auth. Works fully offline
// after the first page load (the SW precaches everything this module
// needs, including ammo-loads.json).
//
// Public entry point: initBallisticsUi() — call once on DOMContentLoaded.
// =============================================================================

import {
  solveShot, fpsToMs, msToFps, grainsToKg,
  inchesToCm, cmToInches, yardsToMetres, metresToYards,
  joulesToFtLbs, ftLbsToJoules,
  airDensityRatio, ATM_STD,
} from '../lib/fl-ballistics.js';
import {
  getCalibres, getManufacturers, getCalibresWithLoads,
  getManufacturersForCalibre, getLoadsFor, getLoadById,
  getCalibreById, getManufacturerById,
  searchLoads, loadDisplayName, preferredBcFor,
} from '../lib/fl-ammo.js';
import {
  flUkDeerLawVerified, DEER_SPECIES, JURISDICTIONS, LEAD_AMMO_RESTRICTION,
  thresholdFor, minMuzzleEnergyFor, citationFor, classifyEnergy,
} from '../lib/fl-deer-law.js';
import { buildDopeCardPDF, downloadDopeCardPDF } from './dope-card.js';

// ── Calibre diameter lookup ──────────────────────────────────────────────
//
// Maps the calibre IDs in data/ammo-loads.json to their bullet diameter in
// inches. Used by the legal compliance check (E&W requires .240" minimum
// for the larger species; .220" for muntjac/CWD). Diameters are nominal
// bullet diameters (the actual projectile), not bore-groove diameters.
//
// Sources: SAAMI / CIP cartridge specifications. Values are bullet
// diameter, which is what the Deer Act means by "calibre" — see s.1 of
// the 1991 Act and the practical interpretation in BASC guidance.
const CALIBRE_DIAMETER_INCHES = Object.freeze({
  '22hornet':  0.224,
  '222rem':    0.224,
  '22250':     0.224,
  '223rem':    0.224,
  '243win':    0.243,
  '2506rem':   0.257,
  '257wbymag': 0.257,
  '65prc':     0.264,
  '65creed':   0.264,
  '65x55':     0.264,
  '270win':    0.277,
  '7mmprc':    0.284,
  '7mm08':     0.284,
  '7x57':      0.284,
  '7x64':      0.284,
  '308win':    0.308,
  '3006':      0.308,
  '3030win':   0.308,
  '300winmag': 0.308,
  '300wbymag': 0.308,
  '8x57is':    0.323,
  '8x57jrs':   0.323,
});

// ── Constants & state ────────────────────────────────────────────────────

const STORAGE_KEY = 'fl-ballistics-profiles-v1';
const SETTINGS_KEY = 'fl-ballistics-settings-v1';

/**
 * Module-private state. Mutable between calls but never exported. The UI
 * is structured so that any state change goes through one of the
 * setXxx() functions which then re-renders the affected DOM regions.
 */
const state = {
  db: null,                 // ammo-loads.json contents
  profiles: [],             // [{id, name, ...}]
  activeProfileId: null,
  conditions: {             // can be auto-filled or manual
    tempC: ATM_STD.temperatureC,
    pressureHpa: ATM_STD.pressureHpa,
    humidityPct: 50,
    windMps: 0,
    windDirDeg: 0,          // 0 = headwind, 90 = full crosswind from R
    shotAngleDeg: 0,
  },
  rangeM: 100,              // current target range
  settings: {
    units: 'metric',        // 'metric' | 'imperial'
    jurisdiction: 'england-wales',
    speciesFilter: ['roe', 'red', 'fallow', 'sika', 'muntjac', 'cwd'],
  },
};

// ── Storage ──────────────────────────────────────────────────────────────

function loadProfilesFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('[ballistics] could not read profiles from localStorage', e);
    return [];
  }
}

function saveProfilesToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.profiles));
  } catch (e) {
    console.warn('[ballistics] could not save profiles to localStorage', e);
    toast('Could not save profile (storage full?)', 'warn');
  }
}

function loadSettingsFromStorage() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

function saveSettingsToStorage() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      activeProfileId: state.activeProfileId,
      units: state.settings.units,
      jurisdiction: state.settings.jurisdiction,
      speciesFilter: state.settings.speciesFilter,
    }));
  } catch (e) { /* non-fatal */ }
}

// ── Profile model ────────────────────────────────────────────────────────

/**
 * Build a fresh profile from a load picked in the setup wizard. All
 * required fields populated; optional fields left to defaults.
 */
function makeProfileFromLoad(name, loadId, opts) {
  const o = opts || {};
  const load = getLoadById(state.db, loadId);
  if (!load) return null;
  const bc = preferredBcFor(load);
  return {
    id: 'p' + Math.random().toString(36).slice(2, 10),
    name: name || 'My rifle',
    loadId,                                          // factory ammo reference
    muzzleVelocityFps: load.muzzleVelocityFps,       // editable copy
    weightGrains: load.weightGrains,
    bcG1: load.bcG1 || 0,
    bcG7: load.bcG7 || 0,
    sightHeightCm: o.sightHeightCm ?? 4.0,
    zeroRangeM: o.zeroRangeM ?? 100,
    barrelInches: o.barrelInches ?? 22,
    species: o.species ?? ['roe', 'red', 'fallow'],
    custom: false,                                   // set true when user edits MV/BC
    createdAt: Date.now(),
  };
}

/** Build a manual-entry profile — no factory load reference. */
function makeManualProfile(name, opts) {
  const o = opts || {};
  return {
    id: 'p' + Math.random().toString(36).slice(2, 10),
    name: name || 'Custom rifle',
    loadId: null,
    muzzleVelocityFps: o.muzzleVelocityFps ?? 2820,
    weightGrains: o.weightGrains ?? 150,
    bcG1: o.bcG1 ?? 0.314,
    bcG7: o.bcG7 ?? 0,
    sightHeightCm: o.sightHeightCm ?? 4.0,
    zeroRangeM: o.zeroRangeM ?? 100,
    barrelInches: o.barrelInches ?? 22,
    species: o.species ?? ['roe', 'red', 'fallow'],
    custom: true,
    createdAt: Date.now(),
  };
}

function getActiveProfile() {
  return state.profiles.find(p => p.id === state.activeProfileId) || null;
}

// ── Solver bridge ────────────────────────────────────────────────────────

/**
 * Run the ballistics solver against the current profile + conditions +
 * range. Returns either the solveShot output or null if no profile.
 */
function computeShot() {
  const p = getActiveProfile();
  if (!p) return null;
  return solveShot({
    muzzleVelocityMs: fpsToMs(p.muzzleVelocityFps),
    bcG1: p.bcG1, bcG7: p.bcG7,
    bulletMassKg: grainsToKg(p.weightGrains),
    sightHeightCm: p.sightHeightCm,
    zeroRangeM: p.zeroRangeM,
    tempC: state.conditions.tempC,
    pressureHpa: state.conditions.pressureHpa,
    humidityPct: state.conditions.humidityPct,
    targetRangeM: state.rangeM,
    windMs: state.conditions.windMps,
    shotAngleDeg: state.conditions.shotAngleDeg,
  });
}

/**
 * Compute a sampled drop curve from 0 to maxRangeM in 10m steps. Used by
 * the chart and the dope card.
 */
function computeDropCurve(maxRangeM) {
  const p = getActiveProfile();
  if (!p) return [];
  const points = [];
  for (let r = 25; r <= maxRangeM; r += 10) {
    const result = solveShot({
      muzzleVelocityMs: fpsToMs(p.muzzleVelocityFps),
      bcG1: p.bcG1, bcG7: p.bcG7,
      bulletMassKg: grainsToKg(p.weightGrains),
      sightHeightCm: p.sightHeightCm,
      zeroRangeM: p.zeroRangeM,
      tempC: state.conditions.tempC,
      pressureHpa: state.conditions.pressureHpa,
      humidityPct: state.conditions.humidityPct,
      targetRangeM: r,
      windMs: 0,
      shotAngleDeg: 0,
    });
    if (result) points.push({ rangeM: r, dropCm: result.dropCm, energyFtLbs: result.energyFtLbs });
  }
  return points;
}

// ── Auto-fill conditions from device location + Open-Meteo ───────────────

/**
 * Best-effort current-conditions fetch. Tries device geolocation, then
 * Open-Meteo's current weather endpoint. Silently no-ops on any failure
 * (calculator still works with manual entry).
 */
async function autoFillConditions() {
  try {
    const pos = await new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error('no geolocation'));
      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, maximumAge: 600000 });
    });
    const lat = pos.coords.latitude.toFixed(3);
    const lng = pos.coords.longitude.toFixed(3);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
                `&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m` +
                `&wind_speed_unit=ms&timezone=auto`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('fetch ' + r.status);
    const data = await r.json();
    const c = data && data.current;
    if (!c) throw new Error('no current data');
    state.conditions.tempC = c.temperature_2m ?? state.conditions.tempC;
    state.conditions.pressureHpa = c.surface_pressure ?? state.conditions.pressureHpa;
    state.conditions.humidityPct = c.relative_humidity_2m ?? state.conditions.humidityPct;
    state.conditions.windMps = c.wind_speed_10m ?? state.conditions.windMps;
    state.conditions.windDirDeg = c.wind_direction_10m ?? state.conditions.windDirDeg;
    renderConditions();
    renderOutput();
    toast('Conditions updated from location', 'ok');
  } catch (e) {
    toast('Could not get current conditions', 'warn');
  }
}

// ── Legal compliance helper ──────────────────────────────────────────────

/**
 * Run all four statutory checks for a (profile, jurisdiction, species)
 * triple. Returns a structured result the UI can render.
 *
 * The returned object is shaped as:
 *   {
 *     speciesCode, speciesLabel,
 *     overall: 'pass' | 'fail' | 'unknown',  // worst-case across checks
 *     checks: [
 *       { kind, label, status, detail, statutoryValue, actualValue }
 *     ],
 *     citation: string | null,
 *     citationUrl: string | null,
 *   }
 *
 * Each individual check has status:
 *   'pass'    — actual value meets or exceeds the statutory minimum
 *   'fail'    — actual value falls short
 *   'na'      — statute does not specify a minimum for this dimension
 *   'unknown' — actual value missing (e.g. profile lacks construction tag)
 *
 * The four checks are:
 *   muzzleEnergy   — profile MV+weight → ME (ft-lb) vs threshold
 *   muzzleVelocity — profile MV (fps) vs threshold (Scotland-only)
 *   bulletWeight   — profile bullet weight (gr) vs threshold
 *   calibre        — calibre diameter (inches) vs threshold
 *   construction   — load construction is expanding-type
 *
 * The energy check uses MUZZLE energy (not impact), since that's what
 * the statutes specify. This is the lawful-equipment check, distinct
 * from the calculator's at-impact red/amber/green which is about the
 * shot itself.
 */
/**
 * The UK absolute floor for any deer species in any jurisdiction is
 * 1,000 ft-lb of muzzle energy (the muntjac/CWD threshold in E&W and NI).
 * Below this, the load is unlawful for any deer in the UK regardless of
 * jurisdiction or species. Surfaced as a separate hard warning above the
 * per-species compliance rows.
 *
 * Returns null if the profile passes the floor, or { muzzleEnergyFtLb,
 * floor } if it doesn't.
 */
function checkAbsoluteFloor(profile) {
  if (!profile.muzzleVelocityFps || !profile.weightGrains) return null;
  const ME = (profile.muzzleVelocityFps * profile.muzzleVelocityFps * profile.weightGrains) / 450400;
  const FLOOR = 1000;
  if (ME < FLOOR) {
    return { muzzleEnergyFtLb: Math.round(ME), floor: FLOOR };
  }
  return null;
}

function checkLegalCompliance(profile, jurisdictionCode, speciesCode) {
  const t = thresholdFor(jurisdictionCode, speciesCode);
  const speciesLabel = DEER_SPECIES.find(s => s.code === speciesCode)?.label || speciesCode;
  if (!t) {
    return {
      speciesCode, speciesLabel,
      overall: 'unknown',
      checks: [],
      citation: null,
      citationUrl: null,
    };
  }

  // Compute muzzle energy from profile (MV in fps, bullet in grains).
  // E_ftlb = (MV² × grains) / 450,400 — standard ballistics formula.
  const muzzleEnergyFtLb = profile.muzzleVelocityFps && profile.weightGrains
    ? (profile.muzzleVelocityFps * profile.muzzleVelocityFps * profile.weightGrains) / 450400
    : null;

  // Resolve calibre diameter from the load's calibre ID, or null for
  // manual-entry profiles (which don't carry a calibre code).
  const load = profile.loadId ? getLoadById(state.db, profile.loadId) : null;
  const calibreDiameter = load ? CALIBRE_DIAMETER_INCHES[load.calibre] : null;

  // Construction: expanding-type means anything other than FMJ or
  // unspecified non-expanding. Subsonic loads with bonded soft-points
  // count as expanding; Federal/Remington 190gr Subsonic loads have
  // non-expanding designs by default but the verified seed marks these
  // explicitly. Treat null/missing as 'unknown' rather than fail-shut.
  const isExpanding = load
    ? (load.construction !== 'fmj' && load.construction !== 'subsonic-non-expanding')
    : null;

  const checks = [];

  // ── Muzzle energy ──
  if (t.minMuzzleEnergyFtLb != null) {
    if (muzzleEnergyFtLb == null) {
      checks.push({
        kind: 'muzzleEnergy', label: 'Muzzle energy',
        status: 'unknown',
        detail: 'Cannot compute — missing MV or bullet weight',
        statutoryValue: t.minMuzzleEnergyFtLb + ' ft-lb',
        actualValue: '—',
      });
    } else {
      checks.push({
        kind: 'muzzleEnergy', label: 'Muzzle energy',
        status: muzzleEnergyFtLb >= t.minMuzzleEnergyFtLb ? 'pass' : 'fail',
        detail: muzzleEnergyFtLb >= t.minMuzzleEnergyFtLb
          ? null
          : `Below ${t.minMuzzleEnergyFtLb} ft-lb minimum`,
        statutoryValue: t.minMuzzleEnergyFtLb + ' ft-lb',
        actualValue: Math.round(muzzleEnergyFtLb) + ' ft-lb',
      });
    }
  } else {
    checks.push({
      kind: 'muzzleEnergy', label: 'Muzzle energy',
      status: 'na',
      detail: 'Not specified by statute',
      statutoryValue: '—',
      actualValue: muzzleEnergyFtLb != null ? Math.round(muzzleEnergyFtLb) + ' ft-lb' : '—',
    });
  }

  // ── Muzzle velocity (Scotland's distinctive requirement) ──
  if (t.minMuzzleVelocityFps != null) {
    if (!profile.muzzleVelocityFps) {
      checks.push({
        kind: 'muzzleVelocity', label: 'Muzzle velocity',
        status: 'unknown',
        detail: 'Profile missing muzzle velocity',
        statutoryValue: t.minMuzzleVelocityFps + ' fps',
        actualValue: '—',
      });
    } else {
      checks.push({
        kind: 'muzzleVelocity', label: 'Muzzle velocity',
        status: profile.muzzleVelocityFps >= t.minMuzzleVelocityFps ? 'pass' : 'fail',
        detail: profile.muzzleVelocityFps >= t.minMuzzleVelocityFps
          ? null
          : `Below ${t.minMuzzleVelocityFps} fps minimum`,
        statutoryValue: t.minMuzzleVelocityFps + ' fps',
        actualValue: profile.muzzleVelocityFps + ' fps',
      });
    }
  }
  // Velocity not specified outside Scotland — skip the check entirely
  // rather than render an "n/a" row that adds noise.

  // ── Bullet weight ──
  if (t.minBulletWeightGrains != null) {
    if (!profile.weightGrains) {
      checks.push({
        kind: 'bulletWeight', label: 'Bullet weight',
        status: 'unknown',
        detail: 'Profile missing bullet weight',
        statutoryValue: t.minBulletWeightGrains + ' gr',
        actualValue: '—',
      });
    } else {
      checks.push({
        kind: 'bulletWeight', label: 'Bullet weight',
        status: profile.weightGrains >= t.minBulletWeightGrains ? 'pass' : 'fail',
        detail: profile.weightGrains >= t.minBulletWeightGrains
          ? null
          : `Below ${t.minBulletWeightGrains} gr minimum`,
        statutoryValue: t.minBulletWeightGrains + ' gr',
        actualValue: profile.weightGrains + ' gr',
      });
    }
  }

  // ── Calibre ──
  if (t.minCalibreInches != null) {
    if (calibreDiameter == null) {
      checks.push({
        kind: 'calibre', label: 'Calibre',
        status: 'unknown',
        detail: profile.loadId
          ? 'Calibre diameter not in lookup'
          : 'Manual-entry profile — calibre cannot be checked',
        statutoryValue: '.' + Math.round(t.minCalibreInches * 1000) + '"',
        actualValue: '—',
      });
    } else {
      const passes = calibreDiameter >= t.minCalibreInches - 0.0005;  // tolerance for nominal vs actual
      checks.push({
        kind: 'calibre', label: 'Calibre',
        status: passes ? 'pass' : 'fail',
        detail: passes ? null : `Below .${Math.round(t.minCalibreInches * 1000)}" minimum`,
        statutoryValue: '.' + Math.round(t.minCalibreInches * 1000) + '"',
        actualValue: '.' + Math.round(calibreDiameter * 1000) + '"',
      });
    }
  }

  // ── Construction (expanding bullet) ──
  if (isExpanding === true) {
    checks.push({
      kind: 'construction', label: 'Bullet type',
      status: 'pass',
      detail: null,
      statutoryValue: 'Expanding',
      actualValue: load && load.construction ? load.construction : 'expanding',
    });
  } else if (isExpanding === false) {
    checks.push({
      kind: 'construction', label: 'Bullet type',
      status: 'fail',
      detail: 'Non-expanding (FMJ etc.) is illegal for deer in the UK',
      statutoryValue: 'Expanding',
      actualValue: load.construction,
    });
  } else {
    checks.push({
      kind: 'construction', label: 'Bullet type',
      status: 'unknown',
      detail: 'Construction not recorded — verify your ammunition is expanding type',
      statutoryValue: 'Expanding',
      actualValue: '—',
    });
  }

  // Roll up to overall status: any 'fail' → fail; any 'unknown' (and no
  // fail) → unknown; otherwise pass.
  let overall = 'pass';
  for (const c of checks) {
    if (c.status === 'fail') { overall = 'fail'; break; }
    if (c.status === 'unknown') overall = 'unknown';
  }

  return {
    speciesCode, speciesLabel,
    overall,
    checks,
    citation: t.citation || null,
    citationUrl: t.citationUrl || null,
  };
}

// ── DOM helpers ──────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

let toastTimer = null;
function toast(msg, kind) {
  const el = $('bx-toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'bx-toast bx-toast-' + (kind || 'info');
  el.style.display = 'block';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, 2400);
}

// ── Rendering ────────────────────────────────────────────────────────────

function renderProfileBar() {
  const bar = $('bx-profile-bar');
  if (!bar) return;
  const p = getActiveProfile();
  if (!p) {
    bar.innerHTML = `<button class="bx-profile-empty" id="bx-profile-setup-btn">+ Set up rifle</button>`;
    $('bx-profile-setup-btn').addEventListener('click', openSetupWizard);
    return;
  }
  const summary = p.loadId
    ? loadDisplayName(state.db, p.loadId) + (p.custom ? ' (custom)' : '')
    : `${p.muzzleVelocityFps} fps · ${p.weightGrains}gr · BC ${p.bcG7 > 0 ? 'G7 ' + p.bcG7 : 'G1 ' + p.bcG1}`;
  bar.innerHTML = `
    <div class="bx-profile-name">${escapeHtml(p.name)}</div>
    <div class="bx-profile-summary">${escapeHtml(summary)} · ${p.zeroRangeM}m zero</div>
    <div class="bx-profile-actions">
      <button class="bx-link" id="bx-profile-edit-btn">Edit</button>
      ${state.profiles.length > 1
        ? `<button class="bx-link" id="bx-profile-switch-btn">Switch</button>` : ''}
      <button class="bx-link" id="bx-profile-add-btn">+ Add</button>
    </div>
  `;
  $('bx-profile-edit-btn').addEventListener('click', () => openProfileEditor(p.id));
  $('bx-profile-add-btn').addEventListener('click', openSetupWizard);
  if (state.profiles.length > 1) {
    $('bx-profile-switch-btn').addEventListener('click', openProfileSwitcher);
  }
}

function renderRangeControl() {
  const slider = $('bx-range-slider');
  const display = $('bx-range-display');
  if (!slider || !display) return;
  slider.value = state.rangeM;
  const yd = metresToYards(state.rangeM);
  display.innerHTML = state.settings.units === 'imperial'
    ? `<span class="bx-range-num">${Math.round(yd)}</span><span class="bx-range-unit">yd</span>`
    : `<span class="bx-range-num">${state.rangeM}</span><span class="bx-range-unit">m</span>`;
}

function renderConditions() {
  const strip = $('bx-conditions-strip');
  if (!strip) return;
  const c = state.conditions;
  strip.innerHTML = `
    <span><strong>${c.tempC.toFixed(0)}°C</strong></span>
    <span class="bx-sep">·</span>
    <span><strong>${c.pressureHpa.toFixed(0)}</strong> hPa</span>
    <span class="bx-sep">·</span>
    <span>${c.windMps > 0 ? `<strong>${c.windMps.toFixed(1)}</strong> m/s wind` : 'No wind'}</span>
    ${c.shotAngleDeg !== 0 ? `<span class="bx-sep">·</span><span>${c.shotAngleDeg > 0 ? '↑' : '↓'} ${Math.abs(c.shotAngleDeg)}°</span>` : ''}
  `;
}

function renderOutput() {
  const out = $('bx-output');
  if (!out) return;
  const p = getActiveProfile();
  if (!p) {
    out.innerHTML = `<div class="bx-output-empty">Set up your rifle to see results.</div>`;
    return;
  }
  const r = computeShot();
  if (!r) {
    out.innerHTML = `<div class="bx-output-empty">Could not compute solution.</div>`;
    return;
  }

  // Drop arrow direction. dropCm > 0 means bullet is below LoS at target.
  const dropArrow = r.dropCm > 0.5 ? '↓' : (r.dropCm < -0.5 ? '↑' : '·');
  const dropMag = Math.abs(r.dropCm);

  // Energy classification — pick the most-conservative species in the
  // user's filter (the one with the highest energy threshold).
  let classification = 'unknown';
  let citation = null;
  let thresholdFtLb = null;
  let speciesUsed = null;
  for (const sp of state.settings.speciesFilter) {
    const min = minMuzzleEnergyFor(state.settings.jurisdiction, sp);
    if (min == null) continue;
    if (thresholdFtLb == null || min > thresholdFtLb) {
      thresholdFtLb = min;
      speciesUsed = sp;
      citation = citationFor(state.settings.jurisdiction, sp);
    }
  }
  if (thresholdFtLb != null) {
    classification = classifyEnergy(r.energyFtLbs, state.settings.jurisdiction, speciesUsed);
  }

  const speciesLabel = speciesUsed
    ? (DEER_SPECIES.find(s => s.code === speciesUsed)?.label || speciesUsed)
    : null;

  const energyClass = `bx-energy-${classification}`;
  const energyMsg = thresholdFtLb == null
    ? ''
    : (classification === 'red'
        ? `Below ${thresholdFtLb} ft-lb minimum for ${escapeHtml(speciesLabel)}`
        : classification === 'amber'
          ? `Marginal — minimum ${thresholdFtLb} ft-lb for ${escapeHtml(speciesLabel)}`
          : `Above ${thresholdFtLb} ft-lb minimum for ${escapeHtml(speciesLabel)}`);

  // MOA / MIL with sensible signs.
  const moaStr = (r.dropMoa >= 0 ? '+' : '') + r.dropMoa.toFixed(1);
  const milStr = (r.dropMil >= 0 ? '+' : '') + r.dropMil.toFixed(2);

  out.innerHTML = `
    <div class="bx-output-card">
      <div class="bx-output-section">
        <div class="bx-output-label">Hold</div>
        <div class="bx-output-hold">
          <span class="bx-output-arrow">${dropArrow}</span>
          <span class="bx-output-bignum">${dropMag.toFixed(1)}</span>
          <span class="bx-output-bigunit">cm</span>
        </div>
        <div class="bx-output-sub">
          <span>${moaStr} MOA</span>
          <span class="bx-sep">·</span>
          <span>${milStr} MIL</span>
        </div>
      </div>

      <div class="bx-output-section ${energyClass}">
        <div class="bx-output-label">Energy at target</div>
        <div class="bx-output-energy">
          <span class="bx-output-bignum">${Math.round(r.energyFtLbs)}</span>
          <span class="bx-output-bigunit">ft-lb</span>
        </div>
        <div class="bx-output-sub">
          ${Math.round(r.energyJ)} J
          ${energyMsg ? '<span class="bx-sep">·</span><span class="bx-energy-msg">' + energyMsg + '</span>' : ''}
        </div>
        ${citation ? `<div class="bx-output-citation">${escapeHtml(citation)}</div>` : ''}
      </div>

      <div class="bx-output-section">
        <div class="bx-output-label">Velocity at target</div>
        <div class="bx-output-vel">
          <span class="bx-output-bignum">${Math.round(r.velocityFps)}</span>
          <span class="bx-output-bigunit">fps</span>
          <span class="bx-output-secondary">${Math.round(r.velocityMs)} m/s</span>
        </div>
        ${r.isSubsonic
          ? '<div class="bx-output-warn">⚠ Subsonic at this range — ethical shot range exceeded</div>'
          : r.isTransonic
            ? '<div class="bx-output-warn">⚠ Approaching transonic — accuracy may degrade</div>'
            : ''}
      </div>

      ${r.windDriftCm !== 0
        ? `<div class="bx-output-section">
            <div class="bx-output-label">Wind drift</div>
            <div class="bx-output-sub">
              ${Math.abs(r.windDriftCm).toFixed(1)} cm
              <span class="bx-sep">·</span>
              ${r.windDriftMoa.toFixed(1)} MOA
            </div>
          </div>` : ''}

      ${renderComplianceSection(p)}
    </div>
  `;

  renderDropChart();
}

/**
 * Render the legal compliance section. Returns an HTML string that the
 * caller pastes into the output card. Lays out one row per species in
 * the user's filter, with a status badge and the four/five checks
 * underneath. Compact layout — one screen on a phone.
 */
function renderComplianceSection(profile) {
  const filter = state.settings.speciesFilter;
  if (!filter || filter.length === 0) return '';

  const results = filter
    .map(sp => checkLegalCompliance(profile, state.settings.jurisdiction, sp))
    .filter(r => r.checks.length > 0);  // skip species without statutory thresholds

  if (results.length === 0) return '';

  // Sort: failed first (most important), then unknown, then passed.
  const order = { fail: 0, unknown: 1, pass: 2 };
  results.sort((a, b) => (order[a.overall] ?? 9) - (order[b.overall] ?? 9));

  const jurLabel = JURISDICTIONS.find(j => j.code === state.settings.jurisdiction)?.label || '';

  // Pre-release banner if law data is unverified.
  const preReleaseBanner = !flUkDeerLawVerified
    ? `<div class="bx-compliance-prerelease">⚠ Statutory thresholds in this calculator have not yet been independently verified. Use as guidance only and check your equipment against the current statutory text for your jurisdiction.</div>`
    : '';

  // Absolute UK floor: any load below 1000 ft-lb at the muzzle is
  // unlawful for ANY deer in ANY jurisdiction. Worth a hard, separate
  // warning above the per-species rows.
  const floorFail = checkAbsoluteFloor(profile);
  const absoluteWarning = floorFail
    ? `<div class="bx-compliance-floor-warn">
         <strong>UNLAWFUL FOR DEER ANYWHERE IN THE UK</strong><br>
         Muzzle energy ${floorFail.muzzleEnergyFtLb} ft-lb is below the
         ${floorFail.floor} ft-lb absolute minimum (the muntjac/CWD floor
         in E&amp;W and NI). This load cannot be used lawfully on any
         deer in the UK.
       </div>`
    : '';

  return `
    <div class="bx-output-section bx-compliance-section">
      <div class="bx-output-label">Legal compliance · ${escapeHtml(jurLabel)}</div>
      ${preReleaseBanner}
      ${absoluteWarning}
      <div class="bx-compliance-list">
        ${results.map(r => renderComplianceRow(r)).join('')}
      </div>
    </div>
  `;
}

function renderComplianceRow(r) {
  const overallBadge = r.overall === 'fail'
    ? '<span class="bx-compliance-badge bx-compliance-fail">Fail</span>'
    : r.overall === 'unknown'
      ? '<span class="bx-compliance-badge bx-compliance-unknown">Check</span>'
      : '<span class="bx-compliance-badge bx-compliance-pass">Pass</span>';

  const checksHtml = r.checks.map(c => {
    const statusIcon = c.status === 'pass' ? '✓' : c.status === 'fail' ? '✗' : c.status === 'na' ? '–' : '?';
    const statusClass = 'bx-compliance-check-' + c.status;
    const value = c.actualValue;
    const statutory = c.statutoryValue !== '—' ? ` / min ${escapeHtml(c.statutoryValue)}` : '';
    return `
      <div class="bx-compliance-check ${statusClass}">
        <span class="bx-compliance-icon">${statusIcon}</span>
        <span class="bx-compliance-check-label">${escapeHtml(c.label)}:</span>
        <span class="bx-compliance-check-value">${escapeHtml(value)}${statutory}</span>
        ${c.detail ? `<span class="bx-compliance-check-detail">${escapeHtml(c.detail)}</span>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="bx-compliance-row bx-compliance-row-${r.overall}">
      <div class="bx-compliance-row-header">
        <span class="bx-compliance-species">${escapeHtml(r.speciesLabel)}</span>
        ${overallBadge}
      </div>
      <div class="bx-compliance-checks">${checksHtml}</div>
      ${r.citation ? `<div class="bx-output-citation">${escapeHtml(r.citation)}</div>` : ''}
    </div>
  `;
}

function renderDropChart() {
  const canvas = $('bx-drop-chart');
  if (!canvas) return;
  const p = getActiveProfile();
  if (!p) { canvas.style.display = 'none'; return; }
  canvas.style.display = 'block';

  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const W = canvas.clientWidth;
  const H = 220;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const maxRange = 400;
  const curve = computeDropCurve(maxRange);
  if (curve.length < 2) return;

  const pad = { l: 40, r: 12, t: 12, b: 26 };
  const cw = W - pad.l - pad.r;
  const ch = H - pad.t - pad.b;

  const maxDrop = Math.max(0, ...curve.map(p => p.dropCm)) * 1.05;
  const minDrop = Math.min(0, ...curve.map(p => p.dropCm)) * 1.05;
  const dropSpan = Math.max(20, maxDrop - minDrop);

  const xAt = r => pad.l + (r / maxRange) * cw;
  const yAt = d => pad.t + ((maxDrop - d) / dropSpan) * ch;

  // Grid + axis labels
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.font = '10px "DM Mono", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  for (let r = 100; r <= maxRange; r += 100) {
    const x = xAt(r);
    ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ch); ctx.stroke();
    ctx.fillText(r + 'm', x - 12, H - 8);
  }
  // y=0 line
  const y0 = yAt(0);
  ctx.strokeStyle = 'rgba(200,168,75,0.3)';
  ctx.beginPath(); ctx.moveTo(pad.l, y0); ctx.lineTo(pad.l + cw, y0); ctx.stroke();
  ctx.fillStyle = 'rgba(200,168,75,0.6)';
  ctx.fillText('0', pad.l - 14, y0 + 3);

  // Energy threshold shading: red zone where energy < threshold for the
  // most-restrictive species in the filter.
  let thresholdFtLb = null;
  for (const sp of state.settings.speciesFilter) {
    const min = minMuzzleEnergyFor(state.settings.jurisdiction, sp);
    if (min != null && (thresholdFtLb == null || min > thresholdFtLb)) thresholdFtLb = min;
  }
  if (thresholdFtLb != null) {
    // Find first range where energy drops below threshold.
    let belowFromR = null;
    for (const pt of curve) {
      if (pt.energyFtLbs < thresholdFtLb) { belowFromR = pt.rangeM; break; }
    }
    if (belowFromR != null) {
      ctx.fillStyle = 'rgba(198,40,40,0.10)';
      ctx.fillRect(xAt(belowFromR), pad.t, xAt(maxRange) - xAt(belowFromR), ch);
      // Vertical line at threshold
      ctx.strokeStyle = 'rgba(198,40,40,0.5)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(xAt(belowFromR), pad.t);
      ctx.lineTo(xAt(belowFromR), pad.t + ch);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(198,40,40,0.85)';
      ctx.font = '9px "DM Mono", monospace';
      ctx.fillText('< ' + thresholdFtLb + ' ft-lb', xAt(belowFromR) + 4, pad.t + 12);
    }
  }

  // Trajectory curve
  ctx.strokeStyle = '#c8a84b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < curve.length; i++) {
    const pt = curve[i];
    const x = xAt(pt.rangeM);
    const y = yAt(pt.dropCm);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Current target range marker
  ctx.strokeStyle = 'rgba(122,223,122,0.7)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(xAt(state.rangeM), pad.t);
  ctx.lineTo(xAt(state.rangeM), pad.t + ch);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ── Setup wizard ─────────────────────────────────────────────────────────

function openSetupWizard() {
  const modal = $('bx-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="bx-modal-card">
      <div class="bx-modal-title">Set up your rifle</div>
      <div class="bx-modal-body" id="bx-wizard-body"></div>
      <div class="bx-modal-actions">
        <button class="bx-btn bx-btn-secondary" id="bx-wizard-cancel">Cancel</button>
        <button class="bx-btn" id="bx-wizard-next">Next</button>
      </div>
    </div>
  `;
  $('bx-wizard-cancel').addEventListener('click', closeModal);

  const wizard = { step: 1, name: '', loadId: null,
                   sightHeightCm: 4.0, zeroRangeM: 100, barrelInches: 22,
                   manual: false,
                   muzzleVelocityFps: 2820, weightGrains: 150, bcG1: 0.314, bcG7: 0,
                   species: ['roe', 'red', 'fallow'] };

  function renderStep() {
    const body = $('bx-wizard-body');
    if (wizard.step === 1) {
      body.innerHTML = `
        <div class="bx-field">
          <label for="bx-w-name">Rifle name</label>
          <input type="text" id="bx-w-name" placeholder="e.g. Tikka T3X .308" value="${escapeHtml(wizard.name)}">
        </div>
        <div class="bx-field">
          <label for="bx-w-zero">Zero distance</label>
          <select id="bx-w-zero">
            <option value="100" ${wizard.zeroRangeM===100?'selected':''}>100 m</option>
            <option value="150" ${wizard.zeroRangeM===150?'selected':''}>150 m</option>
            <option value="200" ${wizard.zeroRangeM===200?'selected':''}>200 m</option>
          </select>
        </div>
        <div class="bx-field">
          <label for="bx-w-sight">Sight height above bore (cm)</label>
          <input type="number" id="bx-w-sight" min="2" max="10" step="0.1" value="${wizard.sightHeightCm}">
          <div class="bx-field-hint">Typical 3.8–4.5cm for standard scope rings</div>
        </div>
        <div class="bx-field">
          <label for="bx-w-barrel">Barrel length (inches)</label>
          <input type="number" id="bx-w-barrel" min="16" max="30" step="0.5" value="${wizard.barrelInches}">
        </div>
      `;
    } else if (wizard.step === 2) {
      const cals = getCalibresWithLoads(state.db);
      body.innerHTML = `
        <div class="bx-field">
          <label>Pick your ammunition</label>
          <div class="bx-tabs">
            <button class="bx-tab ${!wizard.manual?'on':''}" data-tab="factory">Factory load</button>
            <button class="bx-tab ${wizard.manual?'on':''}" data-tab="manual">Manual entry</button>
          </div>
          ${wizard.manual ? `
            <div class="bx-row-2">
              <div class="bx-field"><label>Muzzle velocity (fps)</label><input type="number" id="bx-w-mv" value="${wizard.muzzleVelocityFps}"></div>
              <div class="bx-field"><label>Bullet weight (gr)</label><input type="number" id="bx-w-wt" value="${wizard.weightGrains}"></div>
            </div>
            <div class="bx-row-2">
              <div class="bx-field"><label>BC (G1)</label><input type="number" id="bx-w-bc1" step="0.001" value="${wizard.bcG1}"></div>
              <div class="bx-field"><label>BC (G7) — optional</label><input type="number" id="bx-w-bc7" step="0.001" value="${wizard.bcG7}"></div>
            </div>
          ` : `
            <div class="bx-row-2">
              <div class="bx-field">
                <label>Calibre</label>
                <select id="bx-w-cal">
                  <option value="">— pick —</option>
                  ${cals.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
                </select>
              </div>
              <div class="bx-field">
                <label>Manufacturer</label>
                <select id="bx-w-mfr"><option value="">—</option></select>
              </div>
            </div>
            <div class="bx-field">
              <label>Load</label>
              <select id="bx-w-load"><option value="">—</option></select>
              <div class="bx-field-hint" id="bx-w-load-hint"></div>
            </div>
          `}
        </div>
      `;
      // Tab switching
      body.querySelectorAll('.bx-tab').forEach(t => {
        t.addEventListener('click', () => {
          wizard.manual = (t.dataset.tab === 'manual');
          captureStep(); renderStep();
        });
      });
      // Cascading select for factory mode
      if (!wizard.manual) {
        const calSel = $('bx-w-cal');
        const mfrSel = $('bx-w-mfr');
        const loadSel = $('bx-w-load');
        const hint = $('bx-w-load-hint');
        const refreshMfrs = () => {
          const calId = calSel.value;
          const mfrs = getManufacturersForCalibre(state.db, calId);
          mfrSel.innerHTML = '<option value="">—</option>' +
            mfrs.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
          loadSel.innerHTML = '<option value="">—</option>';
          hint.textContent = '';
        };
        const refreshLoads = () => {
          const calId = calSel.value, mfrId = mfrSel.value;
          const loads = getLoadsFor(state.db, calId, mfrId);
          loadSel.innerHTML = '<option value="">—</option>' +
            loads.map(l => `<option value="${l.id}">${escapeHtml(l.weightGrains + 'gr ' + l.name)}</option>`).join('');
          hint.textContent = '';
        };
        // Build a hint string for a selected load, optionally including a
        // compliance flash for the species the user has chosen so far in
        // this wizard pass. Wizard step 3 is where species are picked, so
        // at step 2 we use the wizard's current species selection (or the
        // sensible default ['roe','red','fallow']).
        const buildHint = (ld) => {
          const base = `${ld.muzzleVelocityFps} fps · BC ${ld.bcG7 > 0 ? 'G7 ' + ld.bcG7 : 'G1 ' + ld.bcG1} · ${ld.testBarrelInches}" test barrel`;
          // Quick compliance probe: build a synthetic profile from this
          // load + the wizard's other inputs, run checks against the
          // currently-selected species under the active jurisdiction.
          const probeProfile = {
            muzzleVelocityFps: ld.muzzleVelocityFps,
            weightGrains: ld.weightGrains,
            loadId: ld.id,
          };
          const failedChecks = [];
          for (const sp of (wizard.species || [])) {
            const r = checkLegalCompliance(probeProfile, state.settings.jurisdiction, sp);
            if (r.overall === 'fail') {
              const failures = r.checks.filter(c => c.status === 'fail');
              failures.forEach(f => failedChecks.push({ species: r.speciesLabel, label: f.label, detail: f.detail }));
            }
          }
          if (failedChecks.length === 0) return base;
          // Group failures by species for readable display
          const grouped = {};
          for (const f of failedChecks) {
            grouped[f.species] = grouped[f.species] || [];
            grouped[f.species].push(f.label.toLowerCase());
          }
          const summary = Object.entries(grouped)
            .map(([sp, labels]) => `${sp}: ${labels.join(', ')}`)
            .join(' · ');
          return base + `\n⚠ Below statutory minimum for — ${summary}`;
        };
        const setHint = (ld) => {
          if (!ld) { hint.textContent = ''; hint.classList.remove('bx-field-hint-warn'); return; }
          hint.textContent = buildHint(ld);
          // Add warning style when the hint contains a fail message
          if (hint.textContent.includes('⚠')) hint.classList.add('bx-field-hint-warn');
          else hint.classList.remove('bx-field-hint-warn');
        };
        calSel.addEventListener('change', refreshMfrs);
        mfrSel.addEventListener('change', refreshLoads);
        loadSel.addEventListener('change', () => {
          setHint(getLoadById(state.db, loadSel.value));
        });
        // Restore previous selection
        if (wizard.loadId) {
          const ld = getLoadById(state.db, wizard.loadId);
          if (ld) {
            calSel.value = ld.calibre; refreshMfrs();
            mfrSel.value = ld.manufacturer; refreshLoads();
            loadSel.value = ld.id;
            setHint(ld);
          }
        }
      }
    } else if (wizard.step === 3) {
      body.innerHTML = `
        <div class="bx-field">
          <label>What deer do you stalk? <span class="bx-field-hint-inline">(used for legal energy thresholds)</span></label>
          <div class="bx-species-grid">
            ${DEER_SPECIES.map(s => `
              <label class="bx-species-chip">
                <input type="checkbox" data-sp="${s.code}" ${wizard.species.includes(s.code) ? 'checked' : ''}>
                <span>${escapeHtml(s.label)}</span>
              </label>
            `).join('')}
          </div>
        </div>
      `;
    }

    $('bx-wizard-next').textContent = wizard.step === 3 ? 'Save' : 'Next';
  }

  function captureStep() {
    if (wizard.step === 1) {
      wizard.name = $('bx-w-name')?.value || '';
      wizard.zeroRangeM = parseInt($('bx-w-zero')?.value, 10) || 100;
      wizard.sightHeightCm = parseFloat($('bx-w-sight')?.value) || 4.0;
      wizard.barrelInches = parseFloat($('bx-w-barrel')?.value) || 22;
    } else if (wizard.step === 2) {
      if (wizard.manual) {
        wizard.muzzleVelocityFps = parseFloat($('bx-w-mv')?.value) || 0;
        wizard.weightGrains = parseFloat($('bx-w-wt')?.value) || 0;
        wizard.bcG1 = parseFloat($('bx-w-bc1')?.value) || 0;
        wizard.bcG7 = parseFloat($('bx-w-bc7')?.value) || 0;
      } else {
        wizard.loadId = $('bx-w-load')?.value || null;
      }
    } else if (wizard.step === 3) {
      const checked = Array.from(document.querySelectorAll('[data-sp]:checked')).map(el => el.dataset.sp);
      wizard.species = checked.length ? checked : ['roe'];
    }
  }

  function next() {
    captureStep();
    if (wizard.step === 1 && !wizard.name.trim()) { toast('Give your rifle a name', 'warn'); return; }
    if (wizard.step === 2) {
      if (!wizard.manual && !wizard.loadId) { toast('Pick an ammunition load', 'warn'); return; }
      if (wizard.manual && (!wizard.muzzleVelocityFps || !wizard.weightGrains)) {
        toast('Enter muzzle velocity and bullet weight', 'warn'); return;
      }
      if (wizard.manual && !(wizard.bcG1 > 0 || wizard.bcG7 > 0)) {
        toast('Enter at least one ballistic coefficient', 'warn'); return;
      }
    }
    if (wizard.step < 3) { wizard.step++; renderStep(); return; }
    // Save
    const profile = wizard.manual
      ? makeManualProfile(wizard.name, {
          sightHeightCm: wizard.sightHeightCm, zeroRangeM: wizard.zeroRangeM,
          barrelInches: wizard.barrelInches,
          muzzleVelocityFps: wizard.muzzleVelocityFps, weightGrains: wizard.weightGrains,
          bcG1: wizard.bcG1, bcG7: wizard.bcG7, species: wizard.species })
      : makeProfileFromLoad(wizard.name, wizard.loadId, {
          sightHeightCm: wizard.sightHeightCm, zeroRangeM: wizard.zeroRangeM,
          barrelInches: wizard.barrelInches, species: wizard.species });
    if (!profile) { toast('Could not build profile', 'warn'); return; }
    state.profiles.push(profile);
    state.activeProfileId = profile.id;
    state.settings.speciesFilter = profile.species.slice();
    saveProfilesToStorage();
    saveSettingsToStorage();
    closeModal();
    renderAll();
    toast('Profile saved', 'ok');
  }
  $('bx-wizard-next').addEventListener('click', next);

  renderStep();
}

function openProfileSwitcher() {
  const modal = $('bx-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="bx-modal-card">
      <div class="bx-modal-title">Switch profile</div>
      <div class="bx-modal-body">
        ${state.profiles.map(p => `
          <button class="bx-profile-row ${p.id === state.activeProfileId ? 'on' : ''}" data-pid="${p.id}">
            <div class="bx-profile-row-name">${escapeHtml(p.name)}</div>
            <div class="bx-profile-row-summary">${escapeHtml(p.loadId ? loadDisplayName(state.db, p.loadId) : (p.muzzleVelocityFps + ' fps · ' + p.weightGrains + 'gr'))}</div>
          </button>
        `).join('')}
      </div>
      <div class="bx-modal-actions">
        <button class="bx-btn bx-btn-secondary" id="bx-switch-cancel">Cancel</button>
      </div>
    </div>
  `;
  modal.querySelectorAll('[data-pid]').forEach(b => {
    b.addEventListener('click', () => {
      state.activeProfileId = b.dataset.pid;
      const p = getActiveProfile();
      if (p) state.settings.speciesFilter = p.species.slice();
      saveSettingsToStorage();
      closeModal();
      renderAll();
    });
  });
  $('bx-switch-cancel').addEventListener('click', closeModal);
}

function openProfileEditor(pid) {
  const p = state.profiles.find(x => x.id === pid);
  if (!p) return;
  const modal = $('bx-modal');
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="bx-modal-card">
      <div class="bx-modal-title">Edit profile</div>
      <div class="bx-modal-body">
        <div class="bx-field"><label>Name</label><input type="text" id="bx-e-name" value="${escapeHtml(p.name)}"></div>
        <div class="bx-row-2">
          <div class="bx-field"><label>Muzzle velocity (fps)</label><input type="number" id="bx-e-mv" value="${p.muzzleVelocityFps}"></div>
          <div class="bx-field"><label>Bullet weight (gr)</label><input type="number" id="bx-e-wt" value="${p.weightGrains}"></div>
        </div>
        <div class="bx-row-2">
          <div class="bx-field"><label>BC (G1)</label><input type="number" id="bx-e-bc1" step="0.001" value="${p.bcG1}"></div>
          <div class="bx-field"><label>BC (G7)</label><input type="number" id="bx-e-bc7" step="0.001" value="${p.bcG7}"></div>
        </div>
        <div class="bx-row-2">
          <div class="bx-field"><label>Sight height (cm)</label><input type="number" id="bx-e-sh" step="0.1" value="${p.sightHeightCm}"></div>
          <div class="bx-field"><label>Zero range (m)</label><input type="number" id="bx-e-zero" value="${p.zeroRangeM}"></div>
        </div>
        <div class="bx-field">
          <label>Stalking species (for energy thresholds)</label>
          <div class="bx-species-grid">
            ${DEER_SPECIES.map(s => `
              <label class="bx-species-chip">
                <input type="checkbox" data-sp="${s.code}" ${p.species.includes(s.code) ? 'checked' : ''}>
                <span>${escapeHtml(s.label)}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="bx-field-hint" style="margin-top:12px;color:#c62828;">
          Editing muzzle velocity / BC marks this profile as customised. Use values from your chronograph if you have one.
        </div>
      </div>
      <div class="bx-modal-actions">
        <button class="bx-btn bx-btn-danger" id="bx-e-delete">Delete</button>
        <button class="bx-btn bx-btn-secondary" id="bx-e-cancel">Cancel</button>
        <button class="bx-btn" id="bx-e-save">Save</button>
      </div>
    </div>
  `;
  $('bx-e-cancel').addEventListener('click', closeModal);
  $('bx-e-delete').addEventListener('click', () => {
    if (!confirm('Delete this profile?')) return;
    state.profiles = state.profiles.filter(x => x.id !== p.id);
    if (state.activeProfileId === p.id) state.activeProfileId = state.profiles[0]?.id || null;
    saveProfilesToStorage(); saveSettingsToStorage();
    closeModal(); renderAll();
  });
  $('bx-e-save').addEventListener('click', () => {
    const newMv = parseFloat($('bx-e-mv').value);
    const newW = parseFloat($('bx-e-wt').value);
    const newBc1 = parseFloat($('bx-e-bc1').value);
    const newBc7 = parseFloat($('bx-e-bc7').value);
    if (!(newMv > 0) || !(newW > 0)) { toast('MV and weight must be > 0', 'warn'); return; }
    if (!(newBc1 > 0 || newBc7 > 0)) { toast('Need at least one BC', 'warn'); return; }
    const wasCustom = p.custom;
    p.name = $('bx-e-name').value || p.name;
    if (newMv !== p.muzzleVelocityFps || newBc1 !== p.bcG1 || newBc7 !== p.bcG7) p.custom = true;
    p.muzzleVelocityFps = newMv;
    p.weightGrains = newW;
    p.bcG1 = newBc1; p.bcG7 = newBc7;
    p.sightHeightCm = parseFloat($('bx-e-sh').value) || p.sightHeightCm;
    p.zeroRangeM = parseInt($('bx-e-zero').value, 10) || p.zeroRangeM;
    p.species = Array.from(document.querySelectorAll('[data-sp]:checked')).map(el => el.dataset.sp);
    if (p.species.length === 0) p.species = ['roe'];
    if (state.activeProfileId === p.id) state.settings.speciesFilter = p.species.slice();
    saveProfilesToStorage(); saveSettingsToStorage();
    closeModal(); renderAll();
    toast('Profile saved', 'ok');
  });
}

function openReticleEstimator() {
  // Range from scope reticle subtension. The maths is the standard
  // mil-relation formula: range = target_size / angular_size, with the
  // unit conversion baked in.
  //
  //   For MIL: range_m = (target_height_cm / 100) / mils * 1000
  //   For MOA: range_m = (target_height_cm / 100) / (moa * (π/10800))
  //
  // Reference target heights are typical UK deer body depths (chest,
  // back-to-belly). The user picks a species/preset; we assume average
  // values. Actual deer vary ±20%, so this is for orientation, not
  // precision — a 220m estimate could realistically be 180–270m.
  //
  // Common reference body depths (cm), brisket-to-back, mature animal:
  //   Roe ............ 35
  //   Muntjac/CWD .... 28
  //   Fallow ......... 50
  //   Sika ........... 50
  //   Red ............ 70
  const presets = [
    { code: 'roe',     label: 'Roe (35cm)',         cm: 35 },
    { code: 'muntjac', label: 'Muntjac/CWD (28cm)', cm: 28 },
    { code: 'fallow',  label: 'Fallow (50cm)',      cm: 50 },
    { code: 'sika',    label: 'Sika (50cm)',        cm: 50 },
    { code: 'red',     label: 'Red (70cm)',         cm: 70 },
  ];

  const modal = $('bx-modal');
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="bx-modal-card">
      <div class="bx-modal-title">Estimate range from reticle</div>
      <div class="bx-modal-body">
        <p style="font-size:12px;color:rgba(255,255,255,0.6);margin-bottom:14px;line-height:1.5;">
          If you can measure how much of your reticle the deer's body fills
          (brisket to back), this gives a rough range. Accuracy is ±20% —
          treat it as orientation, not gospel.
        </p>
        <div class="bx-field">
          <label>Deer (body depth)</label>
          <select id="bx-r-species">
            ${presets.map(p => `<option value="${p.cm}">${p.label}</option>`).join('')}
          </select>
        </div>
        <div class="bx-field">
          <label>Reticle measurement</label>
          <div class="bx-tabs">
            <button class="bx-tab on" data-unit="mil">MIL</button>
            <button class="bx-tab" data-unit="moa">MOA</button>
          </div>
          <input type="number" id="bx-r-value" step="0.1" min="0" placeholder="e.g. 1.6" autofocus>
        </div>
        <div id="bx-r-result" style="margin-top:18px;padding:14px;background:rgba(200,168,75,0.08);border:1px solid rgba(200,168,75,0.18);border-radius:10px;text-align:center;display:none;">
          <div style="font-size:11px;color:rgba(200,168,75,0.7);text-transform:uppercase;letter-spacing:0.5px;font-family:'DM Mono',monospace;">Estimated range</div>
          <div id="bx-r-range" style="font-family:'DM Mono',monospace;font-size:32px;color:white;font-weight:500;letter-spacing:-1px;margin-top:4px;"></div>
        </div>
      </div>
      <div class="bx-modal-actions">
        <button class="bx-btn bx-btn-secondary" id="bx-r-cancel">Cancel</button>
        <button class="bx-btn" id="bx-r-use">Use this range</button>
      </div>
    </div>
  `;

  let unit = 'mil';
  let lastRangeM = null;

  function recalc() {
    const cm = parseFloat($('bx-r-species').value);
    const v = parseFloat($('bx-r-value').value);
    const result = $('bx-r-result');
    if (!Number.isFinite(cm) || !Number.isFinite(v) || v <= 0) {
      result.style.display = 'none';
      lastRangeM = null;
      return;
    }
    const sizeM = cm / 100;
    let rangeM;
    if (unit === 'mil') {
      rangeM = (sizeM / v) * 1000;
    } else {
      rangeM = sizeM / (v * Math.PI / 10800);
    }
    lastRangeM = Math.round(rangeM);
    if (lastRangeM < 25 || lastRangeM > 500) {
      result.style.display = 'block';
      $('bx-r-range').innerHTML = `${lastRangeM} m <span style="font-size:11px;color:rgba(255,255,255,0.5);">— outside slider range</span>`;
    } else {
      result.style.display = 'block';
      $('bx-r-range').textContent = lastRangeM + ' m';
    }
  }

  modal.querySelectorAll('.bx-tab').forEach(t => {
    t.addEventListener('click', () => {
      modal.querySelectorAll('.bx-tab').forEach(x => x.classList.remove('on'));
      t.classList.add('on');
      unit = t.dataset.unit;
      recalc();
    });
  });
  $('bx-r-species').addEventListener('change', recalc);
  $('bx-r-value').addEventListener('input', recalc);
  $('bx-r-cancel').addEventListener('click', closeModal);
  $('bx-r-use').addEventListener('click', () => {
    if (lastRangeM == null) { toast('Enter a measurement first', 'warn'); return; }
    state.rangeM = Math.max(25, Math.min(500, lastRangeM));
    closeModal();
    renderRangeControl();
    renderOutput();
    toast('Range set to ' + state.rangeM + ' m', 'ok');
  });
}

function openConditionsEditor() {
  const modal = $('bx-modal');
  modal.style.display = 'flex';
  const c = state.conditions;
  modal.innerHTML = `
    <div class="bx-modal-card">
      <div class="bx-modal-title">Conditions</div>
      <div class="bx-modal-body">
        <div class="bx-row-2">
          <div class="bx-field"><label>Temperature (°C)</label><input type="number" id="bx-c-t" step="0.5" value="${c.tempC}"></div>
          <div class="bx-field"><label>Pressure (hPa)</label><input type="number" id="bx-c-p" value="${c.pressureHpa}"></div>
        </div>
        <div class="bx-row-2">
          <div class="bx-field"><label>Humidity (%)</label><input type="number" id="bx-c-h" min="0" max="100" value="${c.humidityPct}"></div>
          <div class="bx-field"><label>Shot angle (°, +up)</label><input type="number" id="bx-c-a" min="-60" max="60" value="${c.shotAngleDeg}"></div>
        </div>
        <div class="bx-row-2">
          <div class="bx-field">
            <label>Wind</label>
            <select id="bx-c-w">
              <option value="0" ${c.windMps===0?'selected':''}>None</option>
              <option value="2" ${c.windMps===2?'selected':''}>Light (2 m/s)</option>
              <option value="5" ${c.windMps===5?'selected':''}>Moderate (5 m/s)</option>
              <option value="8" ${c.windMps===8?'selected':''}>Strong (8 m/s)</option>
              <option value="12" ${c.windMps===12?'selected':''}>Very strong (12 m/s)</option>
            </select>
          </div>
          <div class="bx-field bx-field-actions">
            <button class="bx-btn bx-btn-secondary" id="bx-c-auto">Use current location</button>
          </div>
        </div>
        <div class="bx-field-hint">
          Defaults are ICAO standard atmosphere (15°C, 1013 hPa, sea level).
          Wind drift is approximate; downrange wind is rarely the same as muzzle wind.
        </div>
      </div>
      <div class="bx-modal-actions">
        <button class="bx-btn bx-btn-secondary" id="bx-c-cancel">Cancel</button>
        <button class="bx-btn" id="bx-c-save">Save</button>
      </div>
    </div>
  `;
  $('bx-c-cancel').addEventListener('click', closeModal);
  $('bx-c-auto').addEventListener('click', () => { closeModal(); autoFillConditions(); });
  $('bx-c-save').addEventListener('click', () => {
    state.conditions.tempC = parseFloat($('bx-c-t').value) || 15;
    state.conditions.pressureHpa = parseFloat($('bx-c-p').value) || 1013.25;
    state.conditions.humidityPct = parseFloat($('bx-c-h').value) || 50;
    state.conditions.shotAngleDeg = parseFloat($('bx-c-a').value) || 0;
    state.conditions.windMps = parseFloat($('bx-c-w').value) || 0;
    closeModal(); renderConditions(); renderOutput();
  });
}

function closeModal() {
  const modal = $('bx-modal');
  if (!modal) return;
  modal.style.display = 'none';
  modal.innerHTML = '';
}

function renderAll() {
  renderProfileBar();
  renderRangeControl();
  renderConditions();
  renderOutput();
}

// ── Dope card export ─────────────────────────────────────────────────────

/**
 * Build and trigger download of the dope card PDF for the active profile.
 * Reuses the in-memory drop curve plus enriches it with MOA values and
 * ft-lb energy needed by the PDF table.
 */
function exportDopeCard(sizeName) {
  const p = getActiveProfile();
  if (!p) { toast('Set up a rifle first', 'warn'); return; }
  if (!window.jspdf || !window.jspdf.jsPDF) {
    toast('PDF library not loaded — try reloading the page', 'warn');
    return;
  }

  // The chart curve only carries dropCm + energyFtLbs; we need the full
  // per-row data the dope card table prints. Recompute through solveShot
  // at exact 25m steps so MOA + velocity are also populated.
  const curve = [];
  for (let r = 25; r <= 400; r += 25) {
    const result = solveShot({
      muzzleVelocityMs: fpsToMs(p.muzzleVelocityFps),
      bcG1: p.bcG1, bcG7: p.bcG7,
      bulletMassKg: grainsToKg(p.weightGrains),
      sightHeightCm: p.sightHeightCm,
      zeroRangeM: p.zeroRangeM,
      tempC: state.conditions.tempC,
      pressureHpa: state.conditions.pressureHpa,
      humidityPct: state.conditions.humidityPct,
      targetRangeM: r,
      windMs: 0,
      shotAngleDeg: 0,
    });
    if (result) curve.push({
      rangeM: r,
      dropCm: result.dropCm,
      dropMoa: result.dropMoa,
      dropMil: result.dropMil,
      velocityFps: result.velocityFps,
      velocityMs: result.velocityMs,
      energyFtLbs: result.energyFtLbs,
      energyJ: result.energyJ,
    });
  }

  // Pick the most-restrictive species in the user's filter for the
  // threshold band on the card. Same logic the output card uses.
  let thresholdFtLb = null;
  let speciesUsed = null;
  for (const sp of state.settings.speciesFilter) {
    const min = minMuzzleEnergyFor(state.settings.jurisdiction, sp);
    if (min == null) continue;
    if (thresholdFtLb == null || min > thresholdFtLb) {
      thresholdFtLb = min;
      speciesUsed = sp;
    }
  }
  const speciesLabel = speciesUsed
    ? (DEER_SPECIES.find(s => s.code === speciesUsed)?.label || speciesUsed)
    : null;
  const jurLabel = JURISDICTIONS.find(j => j.code === state.settings.jurisdiction)?.label || '';

  const ammoDisplay = p.loadId
    ? loadDisplayName(state.db, p.loadId) + (p.custom ? ' (custom MV/BC)' : '')
    : null;

  try {
    const doc = buildDopeCardPDF({
      profile: p,
      ammoLoad: ammoDisplay,
      conditions: { ...state.conditions },
      dropCurve: curve,
      sizeName: sizeName === 'A4' ? 'A4' : 'A6',
      jurisdictionLabel: jurLabel,
      speciesLabel,
      thresholdFtLb,
    });
    downloadDopeCardPDF(doc, p.name, sizeName);
    toast('Dope card downloaded', 'ok');
  } catch (e) {
    console.error('[ballistics] dope-card error', e);
    toast('Could not generate PDF', 'warn');
  }
}

// ── Public init ─────────────────────────────────────────────────────────

export async function initBallisticsUi() {
  // Load profiles + settings from localStorage.
  state.profiles = loadProfilesFromStorage();
  const settings = loadSettingsFromStorage();
  if (settings) {
    state.activeProfileId = settings.activeProfileId || null;
    state.settings.units = settings.units || 'metric';
    state.settings.jurisdiction = settings.jurisdiction || 'england-wales';
    state.settings.speciesFilter = Array.isArray(settings.speciesFilter) && settings.speciesFilter.length
      ? settings.speciesFilter
      : ['roe', 'red', 'fallow', 'sika', 'muntjac', 'cwd'];
  }
  if (!state.activeProfileId && state.profiles.length > 0) {
    state.activeProfileId = state.profiles[0].id;
  }
  // Default speciesFilter from active profile if available
  const ap = getActiveProfile();
  if (ap) state.settings.speciesFilter = ap.species.slice();

  // Load ammo database.
  try {
    const res = await fetch('./data/ammo-loads.json');
    state.db = await res.json();
  } catch (e) {
    console.error('[ballistics] could not load ammo database', e);
    state.db = { calibres: [], manufacturers: [], loads: [], verified: false };
  }

  // Wire up controls.
  const slider = $('bx-range-slider');
  if (slider) {
    slider.addEventListener('input', () => {
      state.rangeM = parseInt(slider.value, 10) || 100;
      renderRangeControl();
      renderOutput();
    });
  }
  const condBtn = $('bx-conditions-edit');
  if (condBtn) condBtn.addEventListener('click', openConditionsEditor);

  const reticleBtn = $('bx-range-from-reticle');
  if (reticleBtn) reticleBtn.addEventListener('click', openReticleEstimator);

  const jurSelect = $('bx-jurisdiction');
  if (jurSelect) {
    jurSelect.innerHTML = JURISDICTIONS.map(j =>
      `<option value="${j.code}" ${j.code === state.settings.jurisdiction ? 'selected' : ''}>${escapeHtml(j.label)}</option>`).join('');
    jurSelect.addEventListener('change', () => {
      state.settings.jurisdiction = jurSelect.value;
      saveSettingsToStorage(); renderOutput();
    });
  }

  const exportA6 = $('bx-export-a6');
  if (exportA6) exportA6.addEventListener('click', () => exportDopeCard('A6'));
  const exportA4 = $('bx-export-a4');
  if (exportA4) exportA4.addEventListener('click', () => exportDopeCard('A4'));

  // If pre-release law data, show banner.
  if (!flUkDeerLawVerified) {
    const banner = $('bx-law-banner');
    if (banner) banner.style.display = 'block';
  }

  // First-run: open setup wizard if no profiles.
  if (state.profiles.length === 0) {
    setTimeout(openSetupWizard, 250);
  }

  renderAll();
}
