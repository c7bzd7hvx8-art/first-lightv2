/**
 * One-off audit: First Light solar vs sunrise-sunset.org (Solihull).
 * Run: node scripts/audit-solihull-solar.mjs
 */

const SOLIHULL = { lat: 52.4118, lng: -1.7776 }; // town centre approx.
const DATES = ['2026-04-11', '2026-04-12', '2026-06-21', '2026-12-21'];

function ukHourMin(dateObj) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(dateObj);
  return {
    h: parseInt(parts.find((p) => p.type === 'hour').value, 10),
    m: parseInt(parts.find((p) => p.type === 'minute').value, 10),
  };
}

function ukCalendarYmdLondon(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  let y, m, d;
  for (const p of parts) {
    if (p.type === 'year') y = parseInt(p.value, 10);
    else if (p.type === 'month') m = parseInt(p.value, 10);
    else if (p.type === 'day') d = parseInt(p.value, 10);
  }
  return { y, m, d };
}

function londonWallClockToDate(y, mo, d, hh, mm) {
  const lo = Date.UTC(y, mo - 1, d - 1);
  const hi = Date.UTC(y, mo - 1, d + 2);
  for (let ms = lo; ms <= hi; ms += 60000) {
    const p = ukCalendarYmdLondon(new Date(ms));
    const hm = ukHourMin(new Date(ms));
    if (p.y === y && p.m === mo && p.d === d && hm.h === hh && hm.m === mm) {
      return new Date(ms);
    }
  }
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
}

function calcSunTime(date, lat, lng, isSunrise) {
  const ymd = ukCalendarYmdLondon(date);
  const y = ymd.y;
  const mo = ymd.m;
  const d = ymd.d;
  if (y == null || mo == null || d == null || Number.isNaN(y)) return null;

  const rad = Math.PI / 180;
  const lngHour = lng / 15;
  const jan1 = Date.UTC(y, 0, 1);
  const cur = Date.UTC(y, mo - 1, d);
  const dayOfYear = Math.round((cur - jan1) / 86400000) + 1;

  const t = isSunrise
    ? dayOfYear + (6 - lngHour) / 24
    : dayOfYear + (18 - lngHour) / 24;
  const M = 0.9856 * t - 3.289;
  let L = M + 1.916 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 282.634;
  L = ((L % 360) + 360) % 360;
  let RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad;
  RA = ((RA % 360) + 360) % 360;
  const Lquad = Math.floor(L / 90) * 90;
  const RAquad = Math.floor(RA / 90) * 90;
  RA = (RA + Lquad - RAquad) / 15;
  const sinDec = 0.39782 * Math.sin(L * rad);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH =
    (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) /
    (cosDec * Math.cos(lat * rad));
  if (cosH > 1 || cosH < -1) return null;
  const H = isSunrise
    ? 360 - Math.acos(cosH) / rad
    : Math.acos(cosH) / rad;
  const H15 = H / 15;
  const T = H15 + RA - 0.06571 * t - 6.622;
  const UT = ((T - lngHour) % 24 + 24) % 24;
  const utcMs = Date.UTC(y, mo - 1, d) + UT * 3600000;
  return new Date(utcMs);
}

function addMins(dateObj, mins) {
  return new Date(dateObj.getTime() + mins * 60000);
}

function fmt(h, m) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function fmtHm(date) {
  const { h, m } = ukHourMin(date);
  return fmt(h, m);
}

async function fetchApi(ymd) {
  const url = `https://api.sunrise-sunset.org/json?lat=${SOLIHULL.lat}&lng=${SOLIHULL.lng}&date=${ymd}&formatted=0`;
  const res = await fetch(url);
  const j = await res.json();
  if (j.status !== 'OK') throw new Error(JSON.stringify(j));
  return {
    sunrise: new Date(j.results.sunrise),
    sunset: new Date(j.results.sunset),
    solar_noon: new Date(j.results.solar_noon),
  };
}

console.log('Solihull audit — First Light formula vs https://sunrise-sunset.org (API, astronomical sunrise/sunset)\n');
console.log('Legal window in app: 1h before sunrise → 1h after sunset (UK display Europe/London)\n');

for (const ymd of DATES) {
  const [Y, M, D] = ymd.split('-').map(Number);
  const anchor = londonWallClockToDate(Y, M, D, 12, 0);
  const sr = calcSunTime(anchor, SOLIHULL.lat, SOLIHULL.lng, true);
  const ss = calcSunTime(anchor, SOLIHULL.lat, SOLIHULL.lng, false);
  const legalStart = addMins(sr, -60);
  const legalEnd = addMins(ss, 60);

  let api;
  try {
    api = await fetchApi(ymd);
  } catch (e) {
    console.error(ymd, e.message);
    continue;
  }

  const apiLs = addMins(api.sunrise, -60);
  const apiLe = addMins(api.sunset, 60);

  function diffMins(a, b) {
    const ta = a.getTime();
    const tb = b.getTime();
    return Math.round((ta - tb) / 60000);
  }

  console.log(`--- ${ymd} (Europe/London wall times) ---`);
  console.log('  First Light:  sunrise', fmtHm(sr), ' sunset', fmtHm(ss));
  console.log('  API:           sunrise', fmtHm(api.sunrise), ' sunset', fmtHm(api.sunset));
  console.log('  Δ sunrise (app − API):', diffMins(sr, api.sunrise), 'minutes');
  console.log('  Δ sunset  (app − API):', diffMins(ss, api.sunset), 'minutes');
  console.log('  Legal start  app', fmtHm(legalStart), ' | API-derived', fmtHm(apiLs), ' | Δ', diffMins(legalStart, apiLs), 'min');
  console.log('  Legal end    app', fmtHm(legalEnd), ' | API-derived', fmtHm(apiLe), ' | Δ', diffMins(legalEnd, apiLe), 'min');
  console.log('');
}
