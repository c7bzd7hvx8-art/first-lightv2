// =============================================================================
// First Light — UK deer law: statutory minimum energy thresholds
//
// Sibling to lib/fl-pure.mjs and lib/fl-ballistics.mjs. Pure data + lookup
// helpers — no DOM, no network, no globals.
//
// Source verification (current as of April 2026)
// ──────────────────────────────────────────────
// All numeric values below have been cross-checked against the primary
// statutory texts on legislation.gov.uk:
//
//   * Deer Act 1991 (E&W) — c. 54, Schedule 2 ("Prohibited Firearms and
//     Ammunition"), as amended by The Regulatory Reform (Deer) (England
//     and Wales) Order 2007 (SI 2007/2183). The 2007 Order added the
//     muntjac/CWD-specific minimums in section 6(2A).
//     https://www.legislation.gov.uk/ukpga/1991/54
//
//   * Deer (Firearms etc.) (Scotland) Order 1985, as amended November
//     2023. The 2023 amendment reduced the bullet-weight minimum for
//     red/sika/fallow from 100gr to 80gr; muzzle velocity (2,450 fps)
//     and muzzle energy (1,750 ft-lb) requirements were unchanged.
//     https://www.nature.scot/professional-advice/protected-areas-and-
//       species/licensing/species-licensing-z-guide/deer/deer-authorisations
//
//   * Wildlife (Northern Ireland) Order 1985 (SI 1985/171 (NI 2)),
//     Schedule 6 (prohibited weapons & ammunition for taking deer), and
//     Article 19(8A) inserted for the muntjac/CWD-specific exception.
//     The larger-species rules in NI come from the Schedule's prohibition
//     on bullets under 100gr and cartridges with muzzle energy under
//     1,700 ft-lb. NB: NI legislation does NOT specify a minimum
//     calibre for the larger species — it specifies bullet weight and
//     muzzle energy only. The often-cited ".236 minimum" appears in
//     some guidance but is not in the statutory text.
//     https://www.legislation.gov.uk/nisi/1985/171
//
// Republic of Ireland is OUT OF SCOPE for this UK app. Irish stalkers
// should consult SI 239/1977 and NPWS guidance — different rules.
//
// What this module is for
// ───────────────────────
// The ballistic calculator (ballistics.html) uses these thresholds to
// flag when a shot would deliver insufficient energy to be lawful. A
// red/amber/green badge in the calculator UI is computed by comparing
// solveShot()'s energy output against minMuzzleEnergyFor().
//
// IMPORTANT NUANCES
// ─────────────────
// 1. Statutory minimums in all three jurisdictions are MUZZLE energy
//    minimums, not impact-energy minimums. The law concerns the
//    rifle/cartridge combination, not the shot taken. So the
//    calculator's red/amber/green at the muzzle reflects legality;
//    red/amber/green at impact reflects ethics-of-shot, which is a
//    separate (and stricter) concern. We currently apply the statutory
//    threshold to impact energy as a conservative simplification — a
//    shot that meets the minimum at impact will always exceed it at
//    the muzzle.
//
// 2. Scotland additionally requires minimum muzzle VELOCITY (2,450 fps
//    for all species). Encoded in the threshold object as
//    minMuzzleVelocityFps and should be checked at the muzzle. The
//    calculator currently does not surface this — TODO for the UI.
//
// 3. All jurisdictions require an EXPANDING bullet (soft-nosed or
//    hollow-nosed in E&W; "expanding bullet designed to deform in a
//    predictable manner" in NI; "expanding type designed to deform in
//    a predictable manner" in Scotland). FMJ ammunition is illegal
//    for deer everywhere in the UK. Encoded per-load in
//    data/ammo-loads.json via the `construction` field.
//
// 4. Minimum bullet weight rules:
//      E&W: 50gr for muntjac/CWD; NO weight restriction for the larger
//           species (only calibre + energy).
//      Scotland: 50gr for roe; 80gr for red/sika/fallow (since Nov 2023).
//           No separate provisions for muntjac/CWD.
//      NI: 50gr for muntjac/CWD; 100gr for the larger species.
//
// 5. Minimum CALIBRE rules:
//      E&W: .220" for muntjac/CWD; .240" for the larger species.
//      Scotland: NO statutory calibre minimum.
//      NI: .220" for muntjac/CWD; NO statutory calibre minimum for the
//           larger species.
//
// 6. UK REACH lead ammunition restriction (SI 2026/195) restricts the
//    sale and use of lead-projectile ammunition for live quarry
//    shooting in E&W and Scotland from 1 April 2029. Encoded as a
//    future-dated informational flag, surfaced as advisory only — not
//    as red/amber/green.
// =============================================================================

/** Set to true once a human has reviewed this file against current
 *  legislation. Leaving false displays a pre-release banner in the UI.
 *  The values were cross-referenced against statutory texts on
 *  legislation.gov.uk and NatureScot guidance on 2026-04-26 by Claude
 *  during a verification pass — but the human reviewer (Sohaib Mengal)
 *  should personally read the cited texts before flipping this flag.
 *  In particular, confirm:
 *    (a) the Scottish 80gr threshold is in force as published;
 *    (b) the NI larger-species absence of a calibre minimum matches
 *        your reading of Schedule 6;
 *    (c) the IMPORTANT NUANCES section above is acceptable as a
 *        product-design choice. */
export const flUkDeerLawVerified = false;

// ── Species ───────────────────────────────────────────────────────────────

/** Canonical UK deer species codes. Match the cull diary's species list. */
export const DEER_SPECIES = Object.freeze([
  { code: 'roe',     label: 'Roe' },
  { code: 'red',     label: 'Red' },
  { code: 'fallow',  label: 'Fallow' },
  { code: 'sika',    label: 'Sika' },
  { code: 'muntjac', label: 'Muntjac' },
  { code: 'cwd',     label: 'Chinese water deer' },
]);

// ── Jurisdictions ─────────────────────────────────────────────────────────

/** UK jurisdictions with materially different statutory rules. */
export const JURISDICTIONS = Object.freeze([
  { code: 'england-wales',    label: 'England & Wales' },
  { code: 'scotland',         label: 'Scotland' },
  { code: 'northern-ireland', label: 'Northern Ireland' },
]);

// ── Statutory thresholds (verified 2026-04-26) ───────────────────────────
//
// Schema for each entry:
//   minMuzzleEnergyFtLb     — statutory minimum muzzle energy (ft-lb)
//   minMuzzleVelocityFps    — statutory minimum muzzle velocity (fps),
//                              null where not specified
//   minBulletWeightGrains   — statutory minimum bullet weight (grains),
//                              null where not specified
//   minCalibreInches        — statutory minimum calibre (inches),
//                              null where not specified
//   expandingBulletRequired — true everywhere in the UK
//   citation                — human-readable statutory reference
//   citationUrl             — primary source link
//   notes                   — UI-displayable detail

const THRESHOLDS = Object.freeze({
  'england-wales': {
    'roe':     { minMuzzleEnergyFtLb: 1700, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: null, minCalibreInches: 0.240,
                 expandingBulletRequired: true,
                 citation: 'Deer Act 1991, Sch. 2 (E&W)',
                 citationUrl: 'https://www.legislation.gov.uk/ukpga/1991/54/schedule/2',
                 notes: 'Min calibre .240"; min muzzle energy 1,700 ft-lb (2,305 J). No bullet-weight minimum.' },
    'red':     { minMuzzleEnergyFtLb: 1700, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: null, minCalibreInches: 0.240,
                 expandingBulletRequired: true,
                 citation: 'Deer Act 1991, Sch. 2 (E&W)',
                 citationUrl: 'https://www.legislation.gov.uk/ukpga/1991/54/schedule/2',
                 notes: 'Min calibre .240"; min muzzle energy 1,700 ft-lb (2,305 J). No bullet-weight minimum.' },
    'fallow':  { minMuzzleEnergyFtLb: 1700, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: null, minCalibreInches: 0.240,
                 expandingBulletRequired: true,
                 citation: 'Deer Act 1991, Sch. 2 (E&W)',
                 citationUrl: 'https://www.legislation.gov.uk/ukpga/1991/54/schedule/2',
                 notes: 'Min calibre .240"; min muzzle energy 1,700 ft-lb (2,305 J). No bullet-weight minimum.' },
    'sika':    { minMuzzleEnergyFtLb: 1700, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: null, minCalibreInches: 0.240,
                 expandingBulletRequired: true,
                 citation: 'Deer Act 1991, Sch. 2 (E&W)',
                 citationUrl: 'https://www.legislation.gov.uk/ukpga/1991/54/schedule/2',
                 notes: 'Min calibre .240"; min muzzle energy 1,700 ft-lb (2,305 J). No bullet-weight minimum.' },
    'muntjac': { minMuzzleEnergyFtLb: 1000, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: 50, minCalibreInches: 0.220,
                 expandingBulletRequired: true,
                 citation: 'Deer Act 1991 s.6(2A) (E&W), as amended by SI 2007/2183',
                 citationUrl: 'https://www.legislation.gov.uk/uksi/2007/2183',
                 notes: 'Min calibre .220"; min muzzle energy 1,000 ft-lb (1,356 J); min bullet 50 grains; soft- or hollow-nosed.' },
    'cwd':     { minMuzzleEnergyFtLb: 1000, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: 50, minCalibreInches: 0.220,
                 expandingBulletRequired: true,
                 citation: 'Deer Act 1991 s.6(2A) (E&W), as amended by SI 2007/2183',
                 citationUrl: 'https://www.legislation.gov.uk/uksi/2007/2183',
                 notes: 'Min calibre .220"; min muzzle energy 1,000 ft-lb (1,356 J); min bullet 50 grains; soft- or hollow-nosed.' },
  },
  'scotland': {
    'roe':     { minMuzzleEnergyFtLb: 1000, minMuzzleVelocityFps: 2450,
                 minBulletWeightGrains: 50, minCalibreInches: null,
                 expandingBulletRequired: true,
                 citation: 'Deer (Firearms etc.) (Scotland) Order 1985, as amended by SSI 2023/251 (in force 3 Nov 2023)',
                 citationUrl: 'https://www.legislation.gov.uk/ssi/2023/251/made',
                 notes: 'Roe-specific: min bullet 50gr; min muzzle velocity 2,450 fps; min muzzle energy 1,000 ft-lb. No statutory calibre minimum.' },
    'red':     { minMuzzleEnergyFtLb: 1750, minMuzzleVelocityFps: 2450,
                 minBulletWeightGrains: 80, minCalibreInches: null,
                 expandingBulletRequired: true,
                 citation: 'Deer (Firearms etc.) (Scotland) Order 1985, as amended by SSI 2023/251 (in force 3 Nov 2023)',
                 citationUrl: 'https://www.legislation.gov.uk/ssi/2023/251/made',
                 notes: 'Min bullet 80gr (reduced from 100gr in Nov 2023); min muzzle velocity 2,450 fps; min muzzle energy 1,750 ft-lb. No statutory calibre minimum.' },
    'fallow':  { minMuzzleEnergyFtLb: 1750, minMuzzleVelocityFps: 2450,
                 minBulletWeightGrains: 80, minCalibreInches: null,
                 expandingBulletRequired: true,
                 citation: 'Deer (Firearms etc.) (Scotland) Order 1985, as amended by SSI 2023/251 (in force 3 Nov 2023)',
                 citationUrl: 'https://www.legislation.gov.uk/ssi/2023/251/made',
                 notes: 'Min bullet 80gr (reduced from 100gr in Nov 2023); min muzzle velocity 2,450 fps; min muzzle energy 1,750 ft-lb. No statutory calibre minimum.' },
    'sika':    { minMuzzleEnergyFtLb: 1750, minMuzzleVelocityFps: 2450,
                 minBulletWeightGrains: 80, minCalibreInches: null,
                 expandingBulletRequired: true,
                 citation: 'Deer (Firearms etc.) (Scotland) Order 1985, as amended by SSI 2023/251 (in force 3 Nov 2023)',
                 citationUrl: 'https://www.legislation.gov.uk/ssi/2023/251/made',
                 notes: 'Min bullet 80gr (reduced from 100gr in Nov 2023); min muzzle velocity 2,450 fps; min muzzle energy 1,750 ft-lb. No statutory calibre minimum.' },
    'muntjac': { minMuzzleEnergyFtLb: null, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: null, minCalibreInches: null,
                 expandingBulletRequired: true,
                 citation: 'Not specified — species not naturalised in Scotland',
                 citationUrl: null,
                 notes: 'Muntjac are not naturalised in Scotland. The Deer (Firearms etc.) (Scotland) Order 1985 does not list specific thresholds. The larger-species regime (80gr / 2,450 fps / 1,750 ft-lb) would apply if encountered.' },
    'cwd':     { minMuzzleEnergyFtLb: null, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: null, minCalibreInches: null,
                 expandingBulletRequired: true,
                 citation: 'Not specified — species not naturalised in Scotland',
                 citationUrl: null,
                 notes: 'Chinese water deer are not naturalised in Scotland. The Deer (Firearms etc.) (Scotland) Order 1985 does not list specific thresholds. The larger-species regime (80gr / 2,450 fps / 1,750 ft-lb) would apply if encountered.' },
  },
  'northern-ireland': {
    'roe':     { minMuzzleEnergyFtLb: 1700, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: 100, minCalibreInches: null,
                 expandingBulletRequired: true,
                 citation: 'Wildlife (NI) Order 1985, Schedule 6',
                 citationUrl: 'https://www.legislation.gov.uk/nisi/1985/171',
                 notes: 'Min bullet 100 grains; min muzzle energy 1,700 ft-lb (2,305 J); expanding bullet required. No statutory calibre minimum.' },
    'red':     { minMuzzleEnergyFtLb: 1700, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: 100, minCalibreInches: null,
                 expandingBulletRequired: true,
                 citation: 'Wildlife (NI) Order 1985, Schedule 6',
                 citationUrl: 'https://www.legislation.gov.uk/nisi/1985/171',
                 notes: 'Min bullet 100 grains; min muzzle energy 1,700 ft-lb (2,305 J); expanding bullet required. No statutory calibre minimum.' },
    'fallow':  { minMuzzleEnergyFtLb: 1700, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: 100, minCalibreInches: null,
                 expandingBulletRequired: true,
                 citation: 'Wildlife (NI) Order 1985, Schedule 6',
                 citationUrl: 'https://www.legislation.gov.uk/nisi/1985/171',
                 notes: 'Min bullet 100 grains; min muzzle energy 1,700 ft-lb (2,305 J); expanding bullet required. No statutory calibre minimum.' },
    'sika':    { minMuzzleEnergyFtLb: 1700, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: 100, minCalibreInches: null,
                 expandingBulletRequired: true,
                 citation: 'Wildlife (NI) Order 1985, Schedule 6',
                 citationUrl: 'https://www.legislation.gov.uk/nisi/1985/171',
                 notes: 'Min bullet 100 grains; min muzzle energy 1,700 ft-lb (2,305 J); expanding bullet required. No statutory calibre minimum.' },
    'muntjac': { minMuzzleEnergyFtLb: 1000, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: 50, minCalibreInches: 0.220,
                 expandingBulletRequired: true,
                 citation: 'Wildlife (NI) Order 1985, Art. 19(8A)',
                 citationUrl: 'https://www.legislation.gov.uk/nisi/1985/171/article/19',
                 notes: 'Min calibre .220"; min muzzle energy 1,000 ft-lb (1,356 J); min bullet 50 grains; soft- or hollow-nosed.' },
    'cwd':     { minMuzzleEnergyFtLb: 1000, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: 50, minCalibreInches: 0.220,
                 expandingBulletRequired: true,
                 citation: 'Wildlife (NI) Order 1985, Art. 19(8A)',
                 citationUrl: 'https://www.legislation.gov.uk/nisi/1985/171/article/19',
                 notes: 'Min calibre .220"; min muzzle energy 1,000 ft-lb (1,356 J); min bullet 50 grains; soft- or hollow-nosed.' },
  },
});

// ── Lead-ammunition restriction (REACH SI 2026/195) ─────────────────────

export const LEAD_AMMO_RESTRICTION = Object.freeze({
  inForceFromIso: '2029-04-01',
  appliesToJurisdictions: ['england-wales', 'scotland'],
  citation: 'The REACH (Amendment) Regulations 2026 (SI 2026/195)',
  citationUrl: 'https://www.gov.uk/government/publications/uk-reach-restriction-for-lead-in-ammunition-27-june-2025',
  description: 'Lead-projectile ammunition for live quarry shooting is restricted in Great Britain from 1 April 2029.',
});

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Look up the statutory thresholds for a (jurisdiction, species) pair.
 * Returns null if unknown. The returned object is frozen — do not mutate.
 */
export function thresholdFor(jurisdictionCode, speciesCode) {
  const j = THRESHOLDS[jurisdictionCode];
  if (!j) return null;
  const t = j[speciesCode];
  return t || null;
}

/**
 * Convenience: minimum muzzle energy in ft-lb. Returns null if unknown
 * OR if the jurisdiction does not specify a minimum for that species
 * (e.g. muntjac in Scotland).
 */
export function minMuzzleEnergyFor(jurisdictionCode, speciesCode) {
  const t = thresholdFor(jurisdictionCode, speciesCode);
  return t ? t.minMuzzleEnergyFtLb : null;
}

/** Statutory citation string for a (jurisdiction, species) pair. */
export function citationFor(jurisdictionCode, speciesCode) {
  const t = thresholdFor(jurisdictionCode, speciesCode);
  return t ? t.citation : null;
}

/**
 * Classify an energy value against the statutory threshold:
 *   'green'   — comfortably above (>= threshold + 10%)
 *   'amber'   — at or just above threshold (within +10%)
 *   'red'     — below threshold
 *   'unknown' — no threshold available
 *
 * The +10% buffer is a UI choice, not a legal one.
 */
export function classifyEnergy(energyFtLb, jurisdictionCode, speciesCode) {
  const min = minMuzzleEnergyFor(jurisdictionCode, speciesCode);
  if (min == null || !Number.isFinite(energyFtLb)) return 'unknown';
  if (energyFtLb < min) return 'red';
  if (energyFtLb < min * 1.10) return 'amber';
  return 'green';
}

/** Is this jurisdiction code known to the module? */
export function isKnownJurisdiction(code) {
  return JURISDICTIONS.some(j => j.code === code);
}

/** Is this species code known to the module? */
export function isKnownSpecies(code) {
  return DEER_SPECIES.some(s => s.code === code);
}
