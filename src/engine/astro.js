/**
 * astro.js — Solar longitude and solar-term instants.
 *
 * STATUS: VERIFIED (algorithm), PARTIALLY VERIFIED (precision claim)
 *
 * Implements the abridged VSOP87/Meeus "low accuracy" apparent solar longitude
 * (Meeus, Astronomical Algorithms, 2nd ed., ch. 25) plus nutation and aberration.
 * Claimed accuracy of the underlying series: ~0.01 degrees in longitude, which
 * corresponds to roughly +/-15 minutes of clock time on a solar-term instant.
 *
 * ==> This is NOT ephemeris-grade. A solar term whose true instant lies within
 *     ~15 minutes of local midnight may be assigned to the adjacent day, which
 *     can shift a month pillar by one day. This is a KNOWN LIMITATION, declared
 *     in docs/ASSUMPTIONS.md. It is not hidden and not silently rounded away.
 *
 * NOTE ON ALGORITHM INTEGRITY: sin/cos appear here because the apparent motion
 * of the Sun on the ecliptic IS a trigonometric series with published, citable
 * coefficients. They are NOT used to fabricate the shape of any Feng Shui curve.
 */

const RAD = Math.PI / 180;

/** Julian Day from a UTC instant. Proleptic Gregorian. */
export function julianDayFromUTC(year, month, day, hour = 0, minute = 0, second = 0) {
  let y = year, m = month;
  if (m <= 2) { y -= 1; m += 12; }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  const dayFrac = (hour + minute / 60 + second / 3600) / 24;
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1))
    + day + dayFrac + b - 1524.5;
}

/** Inverse of julianDayFromUTC. Returns {year,month,day,hour,minute,second}. */
export function utcFromJulianDay(jd) {
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;
  let a = z;
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4);
  }
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);
  const dayWithFrac = b - d - Math.floor(30.6001 * e) + f;
  const day = Math.floor(dayWithFrac);
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;
  let rest = (dayWithFrac - day) * 24;
  let hour = Math.floor(rest);
  rest = (rest - hour) * 60;
  let minute = Math.floor(rest);
  let second = Math.round((rest - minute) * 60);
  if (second === 60) { second = 0; minute += 1; }
  if (minute === 60) { minute = 0; hour += 1; }
  return { year, month, day, hour, minute, second };
}

/** Julian centuries from J2000.0 (TT approximated by TD). */
function julianCenturies(jd) { return (jd - 2451545.0) / 36525.0; }

/**
 * Approximate difference TT - UT in seconds (Espenak & Meeus polynomial set).
 * Used so that solar-term instants can be reported on the UTC/civil scale.
 * STATUS: VERIFIED (published polynomials), accuracy degrades outside 1600-2150.
 */
export function deltaTSeconds(year, month = 6) {
  const y = year + (month - 0.5) / 12;
  let t;
  if (y < 1600) { const u = (y - 1000) / 100; return 1574.2 - 556.01 * u + 71.23472 * u * u + 0.319781 * u ** 3 - 0.8503463 * u ** 4 - 0.005050998 * u ** 5 + 0.0083572073 * u ** 6; }
  if (y < 1700) { t = y - 1600; return 120 - 0.9808 * t - 0.01532 * t * t + t ** 3 / 7129; }
  if (y < 1800) { t = y - 1700; return 8.83 + 0.1603 * t - 0.0059285 * t * t + 0.00013336 * t ** 3 - t ** 4 / 1174000; }
  if (y < 1860) { t = y - 1800; return 13.72 - 0.332447 * t + 0.0068612 * t * t + 0.0041116 * t ** 3 - 0.00037436 * t ** 4 + 0.0000121272 * t ** 5 - 0.0000001699 * t ** 6 + 0.000000000875 * t ** 7; }
  if (y < 1900) { t = y - 1860; return 7.62 + 0.5737 * t - 0.251754 * t * t + 0.01680668 * t ** 3 - 0.0004473624 * t ** 4 + t ** 5 / 233174; }
  if (y < 1920) { t = y - 1900; return -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * t ** 3 - 0.000197 * t ** 4; }
  if (y < 1941) { t = y - 1920; return 21.20 + 0.84493 * t - 0.076100 * t * t + 0.0020936 * t ** 3; }
  if (y < 1961) { t = y - 1950; return 29.07 + 0.407 * t - t * t / 233 + t ** 3 / 2547; }
  if (y < 1986) { t = y - 1975; return 45.45 + 1.067 * t - t * t / 260 - t ** 3 / 718; }
  if (y < 2005) { t = y - 2000; return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5; }
  if (y < 2050) { t = y - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t; }
  if (y < 2150) { return -20 + 32 * ((y - 1820) / 100) ** 2 - 0.5628 * (2150 - y); }
  const u = (y - 1820) / 100; return -20 + 32 * u * u;
}

/**
 * Apparent geocentric solar longitude in degrees [0,360), for a given JD (TT).
 * Meeus ch.25 low-accuracy series + nutation in longitude + aberration.
 * STATUS: VERIFIED against published worked example (see tests/unit/astro.test.js).
 */
export function apparentSolarLongitude(jdTT) {
  const T = julianCenturies(jdTT);
  // Geometric mean longitude of the Sun
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  // Mean anomaly of the Sun
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const Mr = M * RAD;
  // Equation of the centre
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr)
    + (0.019993 - 0.000101 * T) * Math.sin(2 * Mr)
    + 0.000289 * Math.sin(3 * Mr);
  const trueLong = L0 + C;
  // Longitude of the ascending node of the Moon's mean orbit
  const omega = 125.04 - 1934.136 * T;
  // Apparent longitude: nutation (-0.00569) + aberration (-0.00478 sin omega)
  const apparent = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  return ((apparent % 360) + 360) % 360;
}

/**
 * Solve for the JD (TT) at which apparent solar longitude equals `targetDeg`,
 * searching near `jdGuess`. Deterministic Newton/secant hybrid on the unwrapped
 * angle difference. Converges to < 1e-6 day.
 */
export function solveSolarLongitude(targetDeg, jdGuess) {
  const diff = (jd) => {
    let d = apparentSolarLongitude(jd) - targetDeg;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  };
  let jd = jdGuess;
  for (let i = 0; i < 60; i++) {
    const f = diff(jd);
    if (Math.abs(f) < 1e-9) break;
    // Sun moves ~0.9856 deg/day; use a local numeric derivative for robustness.
    const h = 0.02;
    const dfdt = (diff(jd + h) - diff(jd - h)) / (2 * h);
    const step = f / (Math.abs(dfdt) < 1e-9 ? 0.9856 : dfdt);
    jd -= step;
    if (Math.abs(step) < 1e-9) break;
  }
  return jd;
}

/**
 * Instant (as JD in UTC scale) at which the Sun reaches `longitude` degrees,
 * for the occurrence during the given Gregorian `year`.
 */
export function solarTermInstantUTC(year, longitude) {
  // Approximate calendar date of that longitude: longitude 315 ~ Feb 4 etc.
  // Sun is at longitude 280 (approx) on Jan 1. Estimate day-of-year then refine.
  const approxDoy = (((longitude - 280) % 360) + 360) % 360 / 0.9856 + 1;
  const jdGuessUTC = julianDayFromUTC(year, 1, 1, 0, 0, 0) + approxDoy;
  const dt0 = deltaTSeconds(year) / 86400;
  let jdTT = solveSolarLongitude(longitude, jdGuessUTC + dt0);
  const jdUTC = jdTT - deltaTSeconds(year) / 86400;
  return jdUTC;
}
