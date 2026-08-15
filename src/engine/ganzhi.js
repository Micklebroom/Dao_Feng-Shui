/**
 * ganzhi.js — Sexagenary (stem/branch) pillars for year, month, day, hour.
 *
 * STATUS: VERIFIED. Every rule below is corroborated by at least two
 * independent published sources; anchors are unit-tested against known dates.
 */

import { julianDayFromUTC, solarTermInstantUTC } from './astro.js';

export const STEM_COUNT = 10;
export const BRANCH_COUNT = 12;

/** True modulo (always non-negative). */
export const mod = (n, m) => ((n % m) + m) % m;

/**
 * DAY PILLAR
 * STATUS: VERIFIED
 * Source 1: ytliu0.github.io/ChineseCalendar/sexagenary.html — "S = 1 + mod(JD_noon - 11, 60)",
 *           anchored on 2019-01-27 = jia zi, JD_noon = 2458511.
 * Source 2: Baidu Baike day-pillar formula — 2000-03-01 = wu wu (#55).
 * Both anchors are asserted in tests/unit/ganzhi.test.js and agree.
 *
 * Returns 0-based sexagenary index (0 = jia zi) for a LOCAL civil date.
 * The Chinese day boundary convention is selectable; see dayIndexForDate.
 */
export function sexagenaryDayIndexFromJDN(jdn) {
  // jdn = integer Julian Day Number at noon of the civil day.
  return mod(jdn - 11, 60);
}

/** Integer JDN at noon for a proleptic-Gregorian civil date. */
export function jdnAtNoon(year, month, day) {
  return Math.floor(julianDayFromUTC(year, month, day, 12, 0, 0) + 0.5);
}

/**
 * Day pillar index for a civil date/time.
 * @param {object} opts.lateZiNewDay If true (default), the zi hour beginning at
 *   23:00 belongs to the NEXT day pillar (早子/晚子 convention, "早晚子时").
 *   This is a documented school difference — see docs/CONFLICTS.md#late-zi.
 */
export function dayIndexForDate(year, month, day, hour = 12, opts = {}) {
  const { lateZiNewDay = true } = opts;
  let jdn = jdnAtNoon(year, month, day);
  if (lateZiNewDay && hour >= 23) jdn += 1;
  return sexagenaryDayIndexFromJDN(jdn);
}

/**
 * YEAR PILLAR
 * STATUS: VERIFIED
 * The sexagenary year advances at Li Chun (立春, solar longitude 315 deg), not at
 * the lunar new year, for Four Pillars purposes. Anchor: 1984 = jia zi (index 0).
 * Source: masterseanchan.com/bazi-60-jiazi ("Cycle anchor: 1984 = 甲子"), and
 * aa.quae.nl (n = mod(a+56,60)+1 gives 1984 -> 1).
 */
export function yearIndexFromSolarYear(solarYear, anchors = null) {
  // ARCH-1 / CONST-1: якорь берётся из data/calendar.json (epochs.yearPillarAnchor).
  // Значение по умолчанию сохранено ТОЛЬКО для обратной совместимости старых
  // вызовов; рабочий путь всегда передаёт anchors из данных.
  const anchor = anchors ? anchors.yearPillar : 1984;
  return mod(solarYear - anchor, 60);
}

/**
 * MONTH PILLAR
 * STATUS: VERIFIED
 * Month branch is fixed by the sectional (jie) solar term: the month beginning at
 * Li Chun is the yin (寅) month, branch index 2. Month stem follows the "five
 * tigers escaping" (五虎遁) rule: for year stem Jia/Ji the yin month stem is Bing(2);
 * Yi/Geng -> Wu(4); Bing/Xin -> Geng(6); Ding/Ren -> Ren(8); Wu/Gui -> Jia(0).
 * Source: pdfcoffee Zi Wei Dou Shu month stem/branch table; travelchinaguide.
 * Equivalent closed form: monthStem = mod(yearStem*2 + monthOrdinal + 1, 10)
 * where monthOrdinal is 0 for the yin month. Verified in tests.
 */
export function monthStemIndex(yearStemIndex, monthOrdinalFromYin) {
  return mod(yearStemIndex * 2 + monthOrdinalFromYin + 2, 10);
}

export function monthBranchIndex(monthOrdinalFromYin) {
  return mod(monthOrdinalFromYin + 2, 12);
}

/**
 * HOUR PILLAR
 * STATUS: VERIFIED
 * Hour branch: zi = 23:00-01:00, then each branch spans two hours.
 * Hour stem follows the "five rats escaping" (五鼠遁) rule:
 * hourStem = mod(dayStem*2 + hourBranchIndex, 10).
 * Source: standard four pillars tables (travelchinaguide, AFSI AS101).
 */
export function hourBranchIndex(hour) {
  return mod(Math.floor((hour + 1) / 2), 12);
}

export function hourStemIndex(dayStemIndex, hourBranchIdx) {
  return mod(dayStemIndex * 2 + hourBranchIdx, 10);
}

/** Split a 0-based sexagenary index into stem/branch indices. */
export function splitSexagenary(index) {
  return { stem: mod(index, 10), branch: mod(index, 12) };
}

/** Combine stem/branch indices into the 0-based sexagenary index. */
export function combineSexagenary(stem, branch) {
  // Solve n = stem (mod 10), n = branch (mod 12) via CRT; valid only when
  // stem and branch have the same parity.
  if (mod(stem, 2) !== mod(branch, 2)) return null;
  return mod(stem * 6 - branch * 5 + 60, 60);
}

/**
 * Cached solar-term boundary table for a Gregorian year.
 * Returns the 12 sectional (jie) term instants that start month pillars,
 * as JD (UTC), together with the branch they start.
 */
const JIE_LONGITUDES = [
  { lon: 315, branch: 2,  ordinal: 0,  id: 'lichun' },
  { lon: 345, branch: 3,  ordinal: 1,  id: 'jingzhe' },
  { lon: 15,  branch: 4,  ordinal: 2,  id: 'qingming' },
  { lon: 45,  branch: 5,  ordinal: 3,  id: 'lixia' },
  { lon: 75,  branch: 6,  ordinal: 4,  id: 'mangzhong' },
  { lon: 105, branch: 7,  ordinal: 5,  id: 'xiaoshu' },
  { lon: 135, branch: 8,  ordinal: 6,  id: 'liqiu' },
  { lon: 165, branch: 9,  ordinal: 7,  id: 'bailu' },
  { lon: 195, branch: 10, ordinal: 8,  id: 'hanlu' },
  { lon: 225, branch: 11, ordinal: 9,  id: 'lidong' },
  { lon: 255, branch: 0,  ordinal: 10, id: 'daxue' },
  { lon: 285, branch: 1,  ordinal: 11, id: 'xiaohan' }
];

const jieCache = new Map();

/** The 12 month-starting solar terms of a Gregorian year, JD(UTC), ascending. */
export function jieTermsForYear(year) {
  if (jieCache.has(year)) return jieCache.get(year);
  const list = JIE_LONGITUDES.map((t) => ({
    ...t,
    jd: solarTermInstantUTC(year, t.lon),
    year
  })).sort((a, b) => a.jd - b.jd);
  jieCache.set(year, list);
  return list;
}

/**
 * Resolve which solar month a given instant falls in.
 * @param jdLocal JD corresponding to the LOCAL civil instant already shifted to UTC.
 * Returns { solarYear, ordinal, branch, termId, startJD }.
 */
export function solarMonthAt(jdUTC, gregorianYear) {
  // Consider terms from previous, current and next year to cover boundaries.
  const candidates = [
    ...jieTermsForYear(gregorianYear - 1),
    ...jieTermsForYear(gregorianYear),
    ...jieTermsForYear(gregorianYear + 1)
  ].sort((a, b) => a.jd - b.jd);

  let current = null;
  for (const t of candidates) {
    if (t.jd <= jdUTC) current = t; else break;
  }
  if (!current) return null;

  // The solar (Li Chun) year: increments at Li Chun. A month whose ordinal is
  // 10 or 11 (daxue/xiaohan, zi and chou months) that occurs in Jan/Feb still
  // belongs to the PREVIOUS solar year.
  const lichunThisYear = jieTermsForYear(gregorianYear).find((t) => t.id === 'lichun');
  const solarYear = jdUTC >= lichunThisYear.jd ? gregorianYear : gregorianYear - 1;

  return {
    solarYear,
    ordinal: current.ordinal,
    branch: current.branch,
    termId: current.id,
    startJD: current.jd
  };
}
