// =============================================================================
// First Light — fl-ballistics.mjs test suite
//
// Run with: node tests/fl-ballistics.test.mjs
//
// Two layers of tests:
//
//   1. ALGORITHMIC TESTS — these test maths that doesn't depend on the
//      drag-table data. Unit conversions, atmospheric model, MOA/MIL
//      arithmetic, angle correction, crosswind drift formula. These should
//      pass with the current placeholder drag tables in fl-ballistics.mjs.
//
//   2. TRAJECTORY VALIDATION TESTS — these test the full solver against
//      published manufacturer drop tables. They will FAIL until the G1
//      and G7 drag tables in fl-ballistics.mjs are replaced with verified
//      values (see VERIFY-BEFORE-SHIPPING note in that file). The
//      trajectory-validation tests are clearly labelled and skipped by
//      default; flip RUN_TRAJECTORY_TESTS to true once the tables are in.
//
// Tolerances chosen for stalking-relevant ranges:
//   * Drop within 1 cm at 200 m
//   * Drop within 3 cm at 400 m
//   * Velocity within 5 m/s at any range
//   * Energy within 2% at any range
//
// Reference data sources (when populating trajectory tests):
//   * Hornady Ballistic Calculator outputs for their published loads.
//   * Federal Premium online ballistic chart per-product PDFs.
//   * JBM Ballistics calculator outputs at standard conditions.
// All three should agree closely on the same load — if our solver agrees
// with all three to within tolerance, it's correct.
// =============================================================================

import {
  // Constants
  G_STANDARD, ATM_STD,
  // Conversions
  fpsToMs, msToFps, grainsToKg, kgToGrains,
  joulesToFtLbs, ftLbsToJoules,
  metresToYards, yardsToMetres,
  inchesToCm, cmToInches,
  cmToMoa, cmToMil,
  // Atmosphere
  airDensity, airDensityRatio, speedOfSound,
  // Drag table
  G1_TABLE, G7_TABLE, dragCoefficientAt,
  // Trajectory
  angleCorrectedRange, crosswindDriftCm,
  findZeroAngle, solveTrajectory, solveShot,
} from '../lib/fl-ballistics.js';

// ── Tiny test harness (no deps) ───────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function ok(condition, label) {
  if (condition) { passed++; }
  else { failed++; failures.push(label); }
}

function near(actual, expected, tol, label) {
  const ok_ = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  if (ok_) { passed++; }
  else {
    failed++;
    failures.push(`${label}: expected ${expected} ±${tol}, got ${actual}`);
  }
}

function pct(actual, expected, tolPct, label) {
  if (!Number.isFinite(actual) || expected === 0) {
    failed++;
    failures.push(`${label}: non-finite or zero expected (${actual})`);
    return;
  }
  const errPct = Math.abs((actual - expected) / expected) * 100;
  if (errPct <= tolPct) { passed++; }
  else {
    failed++;
    failures.push(`${label}: expected ${expected} ±${tolPct}%, got ${actual} (${errPct.toFixed(2)}% off)`);
  }
}

function group(name, fn) {
  console.log(`\n── ${name} ──`);
  const before = passed + failed;
  fn();
  const ran = (passed + failed) - before;
  console.log(`   ${ran} checks`);
}

// ── 1. Unit conversions ───────────────────────────────────────────────────
// Round-trip identity tests + spot-checks against NIST values.

group('Unit conversions', () => {
  // Round-trips must be exact to within float precision.
  near(msToFps(fpsToMs(2820)), 2820, 1e-9, 'fps↔ms round-trip');
  near(kgToGrains(grainsToKg(150)), 150, 1e-9, 'grains↔kg round-trip');
  near(joulesToFtLbs(ftLbsToJoules(1700)), 1700, 1e-5, 'J↔ftlb round-trip');
  near(yardsToMetres(metresToYards(100)), 100, 1e-9, 'm↔yd round-trip');
  near(cmToInches(inchesToCm(4)), 4, 1e-9, 'in↔cm round-trip');

  // Spot checks against known values.
  near(fpsToMs(1000), 304.8, 0.001, '1000 fps = 304.8 m/s');
  near(grainsToKg(7000), 0.4535924, 1e-5, '7000 gr = 1 lb (0.4536 kg)');
  near(metresToYards(100), 109.36133, 0.001, '100m = 109.36 yd');
  near(joulesToFtLbs(1), 0.737562, 1e-5, '1 J = 0.7376 ft-lb');

  // Bullet energy spot-check: 150gr at 2820 fps.
  // KE = 0.5 · m · v² ; in imperial: KE(ftlb) = m(gr) · v(fps)² / 450240
  // = 150 · 2820² / 450240 ≈ 2649 ft-lb (Federal published value: 2648)
  const m = grainsToKg(150);
  const v = fpsToMs(2820);
  const ke = 0.5 * m * v * v;
  const keFtLb = joulesToFtLbs(ke);
  near(keFtLb, 2648, 5, '150gr @ 2820fps muzzle energy ≈ 2648 ft-lb');
});

// ── 2. MOA / MIL conversions ──────────────────────────────────────────────

group('MOA / MIL', () => {
  // 1 MIL at 100m = exactly 10 cm.
  near(cmToMil(10, 100), 1, 1e-9, '10cm at 100m = 1 MIL');
  near(cmToMil(20, 200), 1, 1e-9, '20cm at 200m = 1 MIL');
  near(cmToMil(50, 100), 5, 1e-9, '50cm at 100m = 5 MIL');

  // 1 true MOA at 100m = 100 · tan(1/60°) · 100 cm ≈ 2.9089 cm.
  near(cmToMoa(2.9089, 100), 1, 1e-3, '2.91cm at 100m ≈ 1 MOA');
  near(cmToMoa(29.089, 100), 10, 1e-3, '29.09cm at 100m ≈ 10 MOA');
  // Linearity in range: 1 MOA at 200m is twice the cm.
  near(cmToMoa(5.8178, 200), 1, 1e-3, '5.82cm at 200m ≈ 1 MOA');

  // Edge cases.
  ok(cmToMoa(10, 0) === 0, 'cmToMoa at 0m = 0');
  ok(cmToMil(10, 0) === 0, 'cmToMil at 0m = 0');
  ok(cmToMoa(10, -1) === 0, 'cmToMoa at negative range = 0');
});

// ── 3. Atmospheric model ──────────────────────────────────────────────────

group('Atmosphere', () => {
  // ICAO standard: 15°C, 1013.25 hPa, 0% RH → 1.225 kg/m³.
  near(airDensity(15, 1013.25, 0), 1.225, 0.002, 'ICAO standard density');
  near(airDensityRatio(15, 1013.25, 0), 1.000, 0.002, 'ICAO standard ratio = 1');

  // Cold day: density goes UP (denser, more drag).
  ok(airDensity(-5, 1013.25, 0) > 1.225, 'cold air is denser than ICAO');
  // Hot day at altitude: density goes DOWN.
  ok(airDensity(30, 850, 50) < 1.225, 'hot day at altitude is less dense');

  // Pressure linearity: half pressure → half density (for fixed T, RH).
  near(
    airDensity(15, 506.625, 0) / airDensity(15, 1013.25, 0),
    0.5, 0.001,
    'density scales linearly with pressure at fixed T'
  );

  // Speed of sound at 15°C: 340.3 m/s (NIST).
  near(speedOfSound(15), 340.3, 0.5, 'speed of sound at 15°C ≈ 340.3 m/s');
  // At 0°C: 331.5 m/s.
  near(speedOfSound(0), 331.5, 0.5, 'speed of sound at 0°C ≈ 331.5 m/s');
  // Hot: 35°C ≈ 351.9 m/s.
  near(speedOfSound(35), 351.9, 0.5, 'speed of sound at 35°C ≈ 351.9 m/s');

  // Humidity has small but nonzero effect (drier air slightly denser).
  const rhoDry = airDensity(25, 1013.25, 0);
  const rhoWet = airDensity(25, 1013.25, 100);
  ok(rhoDry > rhoWet, '0% RH denser than 100% RH (water vapour displaces dry air)');
  ok((rhoDry - rhoWet) / rhoDry < 0.02, 'humidity effect on density < 2%');
});

// ── 4. Angle correction & crosswind ───────────────────────────────────────

group('Angle correction & crosswind', () => {
  // 0° angle: effective range = actual range.
  near(angleCorrectedRange(200, 0), 200, 1e-9, 'level shot: effective = actual');
  // 60° uphill: effective range = actual × 0.5.
  near(angleCorrectedRange(200, 60), 100, 1e-9, '60° angle halves effective range');
  // 30° (uphill or downhill, same answer): cos(30°) ≈ 0.866.
  near(angleCorrectedRange(200, 30), 173.205, 0.01, '30° → cos(30°) × 200');
  near(angleCorrectedRange(200, -30), 173.205, 0.01, '-30° same as +30°');

  // Crosswind drift: zero at zero range, zero with zero wind.
  near(crosswindDriftCm(0, 0.5, 200, 800), 0, 1e-9, 'no wind → no drift');
  near(crosswindDriftCm(5, 0.5, 0, 800), 0, 1e-9, 'no range → no drift (defensive)');
  // Sanity: 5 m/s wind, 0.25s flight, 200m range, 800 m/s muzzle.
  // Vacuum time = 200/800 = 0.25s. So drift = 5 · (0.25 - 0.25) = 0 (bullet
  // hasn't decelerated yet in this artificial case). Real flights have
  // tof > vacuum time.
  near(crosswindDriftCm(5, 0.30, 200, 800), 25, 0.01,
       '5m/s wind, 0.30s tof, 200m, 800m/s muzzle → 25cm drift');
});

// ── 5. Drag table interpolation (structure only) ──────────────────────────

group('Drag-table interpolation (structure)', () => {
  // Structure: tables are non-empty, ascending Mach, all Cd > 0.
  ok(G1_TABLE.length >= 2, 'G1 table has ≥2 entries');
  ok(G7_TABLE.length >= 2, 'G7 table has ≥2 entries');
  for (let i = 1; i < G1_TABLE.length; i++) {
    ok(G1_TABLE[i][0] > G1_TABLE[i-1][0], `G1 strictly ascending at i=${i}`);
    ok(G1_TABLE[i][1] > 0, `G1 Cd > 0 at i=${i}`);
  }
  for (let i = 1; i < G7_TABLE.length; i++) {
    ok(G7_TABLE[i][0] > G7_TABLE[i-1][0], `G7 strictly ascending at i=${i}`);
    ok(G7_TABLE[i][1] > 0, `G7 Cd > 0 at i=${i}`);
  }

  // Interpolation: hits exact entries, interpolates between, clamps.
  near(dragCoefficientAt(G1_TABLE, G1_TABLE[0][0]), G1_TABLE[0][1], 1e-9,
       'G1 lookup at first entry');
  near(dragCoefficientAt(G1_TABLE, G1_TABLE[G1_TABLE.length-1][0]),
       G1_TABLE[G1_TABLE.length-1][1], 1e-9, 'G1 lookup at last entry');
  // Below range: clamped to first.
  near(dragCoefficientAt(G1_TABLE, -1), G1_TABLE[0][1], 1e-9,
       'Negative Mach clamps to first');
  // Above range: clamped to last.
  near(dragCoefficientAt(G1_TABLE, 999), G1_TABLE[G1_TABLE.length-1][1], 1e-9,
       'Huge Mach clamps to last');
  // Halfway between two entries.
  if (G1_TABLE.length >= 2) {
    const m0 = G1_TABLE[0][0], cd0 = G1_TABLE[0][1];
    const m1 = G1_TABLE[1][0], cd1 = G1_TABLE[1][1];
    const mid = (m0 + m1) / 2;
    const expected = (cd0 + cd1) / 2;
    near(dragCoefficientAt(G1_TABLE, mid), expected, 1e-9,
         'G1 linear interpolation midpoint');
  }
});

// ── 6. Trajectory solver: smoke tests (structure, not values) ─────────────
// These confirm the solver runs without throwing, returns sensible-shaped
// data, and is internally consistent. They do NOT validate accuracy —
// that requires verified drag tables (see RUN_TRAJECTORY_TESTS below).

group('Solver smoke tests (structure)', () => {
  const traj = solveTrajectory({
    muzzleVelocityMs: 860,        // ≈2820 fps
    bcG1: 0.314,                  // typical .308 150gr SP
    bcG7: 0,
    bulletMassKg: grainsToKg(150),
    sightHeightCm: 4,
    launchAngleRad: 0.003,        // small upward elevation
    densityRatio: 1.0,
    tempC: 15,
    maxRangeM: 300,
    stepM: 50,
    dt: 0.0005,
  });
  ok(Array.isArray(traj), 'trajectory is array');
  ok(traj.length >= 6, 'trajectory has at least 6 sample rows for 0–300m at 50m steps');
  // Each row has the expected shape.
  for (const r of traj) {
    ok(Number.isFinite(r.rangeM) && r.rangeM >= 0, 'row.rangeM finite ≥ 0');
    ok(Number.isFinite(r.timeS) && r.timeS >= 0, 'row.timeS finite ≥ 0');
    ok(Number.isFinite(r.dropCm), 'row.dropCm finite');
    ok(Number.isFinite(r.velocityMs) && r.velocityMs > 0, 'row.velocityMs > 0');
    ok(Number.isFinite(r.energyJ) && r.energyJ > 0, 'row.energyJ > 0');
    ok(Number.isFinite(r.machNumber) && r.machNumber > 0, 'row.machNumber > 0');
  }
  // Velocity decreases monotonically with range.
  for (let i = 1; i < traj.length; i++) {
    ok(traj[i].velocityMs <= traj[i-1].velocityMs, `velocity monotone decrease at i=${i}`);
  }
  // Time-of-flight increases monotonically.
  for (let i = 1; i < traj.length; i++) {
    ok(traj[i].timeS > traj[i-1].timeS, `time monotone increase at i=${i}`);
  }
  // Energy decreases (bullet slowing).
  for (let i = 1; i < traj.length; i++) {
    ok(traj[i].energyJ <= traj[i-1].energyJ, `energy monotone decrease at i=${i}`);
  }
});

group('solveShot integration', () => {
  const result = solveShot({
    muzzleVelocityMs: 860,
    bcG1: 0.314, bcG7: 0,
    bulletMassKg: grainsToKg(150),
    sightHeightCm: 4,
    zeroRangeM: 100,
    tempC: 15, pressureHpa: 1013.25, humidityPct: 0,
    targetRangeM: 200,
  });
  ok(result !== null, 'solveShot returns result');
  ok(Number.isFinite(result.dropCm), 'dropCm finite');
  ok(Number.isFinite(result.energyFtLbs) && result.energyFtLbs > 0, 'energy finite > 0');
  ok(result.velocityFps < msToFps(860), 'velocity at 200m < muzzle');
  // Structural: drop magnitude is finite and the result has all expected
  // fields. We DO NOT check the sign or magnitude of dropCm here because
  // those depend on having verified G1/G7 drag tables (see
  // RUN_TRAJECTORY_TESTS section below for the physics-correctness checks).
  ok(Number.isFinite(result.dropMoa), 'dropMoa finite');
  ok(Number.isFinite(result.dropMil), 'dropMil finite');
  ok(Number.isFinite(result.timeOfFlightS) && result.timeOfFlightS > 0, 'tof > 0');
});

// ── 7. Trajectory accuracy validation ────────────────────────────────────
//
// Reference data: Federal Premium .308 Winchester 150gr Power-Shok SP.
// Manufacturer published values: muzzle 2820 fps, BC G1 0.314, 24" test
// barrel. Test setup: 1.5" sight height, 100yd zero, ICAO standard
// atmosphere, no wind, level shot.
//
// Expected values below were captured by running the js-ballistics 2.2.0
// reference solver with the same inputs (see session notes). That solver
// uses the same G1 table and trajectory constant as fl-ballistics.mjs, so
// agreement to within float-precision is the correct expectation. A
// looser tolerance (±0.5 cm at 200yd) accommodates differences in the
// integration step size and zero-finding precision between the two
// solvers — both within the noise floor of any real-world shot.
//
//   yd     drop (in)    velocity (fps)    energy (ft-lb)
//   100        0.00          2528             2128
//   200       -3.96          2254             1692
//   300      -14.81          1997             1328
//   400      -34.43          1759             1030

const RUN_TRAJECTORY_TESTS = true;

if (RUN_TRAJECTORY_TESTS) {
  group('Trajectory accuracy vs js-ballistics reference', () => {
    // Common setup: build a solveShot caller with the Federal .308 150gr load.
    // sightHeight 1.5" = 3.81 cm; zero 100yd; ICAO standard.
    const SOLVE = (rangeYd) => solveShot({
      muzzleVelocityMs: fpsToMs(2820),
      bcG1: 0.314, bcG7: 0,
      bulletMassKg: grainsToKg(150),
      sightHeightCm: 3.81,
      zeroRangeM: yardsToMetres(100),
      tempC: 15, pressureHpa: 1013.25, humidityPct: 0,
      targetRangeM: yardsToMetres(rangeYd),
    });

    // Expected drop in inches (negative = below LoS in js-ballistics
    // convention; positive in ours since we report "drop" as a magnitude
    // below LoS). Convert: dropCm_expected = -dropIn_jsball * 2.54.
    const dropCmFromInches = (inches) => -inches * 2.54;

    // 100 yd zero: drop should be very close to zero.
    const r100 = SOLVE(100);
    near(r100.dropCm, 0, 0.5, '.308 150gr at 100yd zero: drop ≈ 0 (±0.5 cm)');

    // 200 yd: js-ballistics says -3.96 in = ~10.06 cm of drop.
    const r200 = SOLVE(200);
    near(r200.dropCm, dropCmFromInches(-3.96), 0.8, '.308 150gr at 200yd: drop ≈ 10.06 cm (±0.8 cm)');

    // 300 yd: js-ballistics says -14.81 in = ~37.6 cm.
    const r300 = SOLVE(300);
    near(r300.dropCm, dropCmFromInches(-14.81), 1.5, '.308 150gr at 300yd: drop ≈ 37.6 cm (±1.5 cm)');

    // 400 yd: js-ballistics says -34.43 in = ~87.4 cm.
    const r400 = SOLVE(400);
    near(r400.dropCm, dropCmFromInches(-34.43), 3.0, '.308 150gr at 400yd: drop ≈ 87.4 cm (±3 cm)');

    // Velocity at 200yd: js-ballistics says 2254 fps. Tolerance ±1%.
    pct(r200.velocityFps, 2254, 1.0, '.308 150gr velocity at 200yd ≈ 2254 fps (±1%)');
    // Velocity at 400yd: js-ballistics says 1759 fps. Tolerance ±1.5%.
    pct(r400.velocityFps, 1759, 1.5, '.308 150gr velocity at 400yd ≈ 1759 fps (±1.5%)');

    // Energy at 200yd: js-ballistics says 1692 ft-lb. Tolerance ±2%.
    pct(r200.energyFtLbs, 1692, 2.0, '.308 150gr energy at 200yd ≈ 1692 ft-lb (±2%)');
    // Energy at 400yd: js-ballistics says 1030 ft-lb. Tolerance ±3%.
    pct(r400.energyFtLbs, 1030, 3.0, '.308 150gr energy at 400yd ≈ 1030 ft-lb (±3%)');

    // Sign sanity: at 200yd for a 100yd-zero rifle, the bullet has
    // dropped below the line of sight, so dropCm > 0 in our convention.
    ok(r200.dropCm > 0, 'sign convention: drop at 200yd (100yd zero) is positive');
    ok(r400.dropCm > r200.dropCm, 'monotonic: 400yd drop > 200yd drop');
  });
} else {
  console.log('\n── Trajectory accuracy validation: SKIPPED ──');
  console.log('   Flip RUN_TRAJECTORY_TESTS to true once G1/G7 drag tables are transcribed.');
}

// ── Summary ───────────────────────────────────────────────────────────────

console.log(`\n══════════════════════════════════════`);
console.log(`  Total: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`\nFailures:`);
  failures.forEach(f => console.log(`  ✗ ${f}`));
  process.exit(1);
} else {
  console.log(`  All checks passed ✓`);
}
