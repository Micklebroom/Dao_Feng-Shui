/**
 * index.js — RESULT MODEL. Единая точка входа расчётного ядра.
 *
 * АРХИТЕКТУРА: JSON DATA -> CALCULATION ENGINE -> RESULT MODEL -> CHART ENGINE -> UI
 * Этот модуль не знает ничего о DOM, SVG, цветах разметки и локализации UI.
 */

import { mod, splitSexagenary, yearIndexFromSolarYear, jieTermsForYear, dayIndexForDate, jdnAtNoon } from './ganzhi.js';
import { computeFourPillars, computeLuckPillars, normalizeInput } from './pillars.js';
import { computeElementStrength, applyCombinations, toPercent } from './elements.js';
import { computeMeridians, computeHarmony, computeYinYang } from './meridians.js';
import { findInteractions, combinationsForTransform, yearAfflictions, computeGua } from './interactions.js';
import { computeGeomanticChart, annualStar, monthlyStar, periodForYear, dayStarFromAnchor, mountainForDegrees } from './flyingstars.js';
import { solarTermInstantUTC, julianDayFromUTC, utcFromJulianDay } from './astro.js';

export * from './astro.js';
export * from './ganzhi.js';
export * from './pillars.js';
export * from './elements.js';
export * from './meridians.js';
export * from './interactions.js';
export * from './flyingstars.js';

export const ENGINE_VERSION = '0.4.0-mvp';

/**
 * Полный профиль личности.
 */
export function computeProfile(birth, tables, options = {}) {
  const { applyCombos = true } = options;

  const fp = computeFourPillars(birth);
  const roles = ['year', 'month', 'day', 'hour'];
  const pillarArr = roles.map((r) => ({ ...fp.pillars[r], role: r }));

  const monthBranchId = tables.branches.items[fp.pillars.month.branch].id;

  const found = findInteractions(pillarArr, tables);
  const base = computeElementStrength(pillarArr, tables, { monthBranchId });

  let totals = base.totals;
  let comboInfo = null;
  if (applyCombos) {
    const res = applyCombinations(totals, combinationsForTransform(found), tables);
    totals = res.totals;
    comboInfo = res.applied;
  }

  const meridianValues = computeMeridians(totals, tables);
  const gua = computeGua(fp.solarYear, birth.gender, tables);

  return {
    input: birth,
    solarYear: fp.solarYear,
    pillars: fp.pillars,
    pillarLabels: labelPillars(fp.pillars, tables),
    dayMaster: tables.stems.items[fp.pillars.day.stem],
    elements: { raw: base.totals, effective: totals, percent: toPercent(totals) },
    seasonElement: base.seasonElement,
    interactions: found,
    combinationsApplied: comboInfo,
    meridians: meridianValues,
    harmony: computeHarmony(meridianValues),
    yinYang: computeYinYang(meridianValues, tables),
    gua,
    normalization: fp.normalization
  };
}

/** Читаемые подписи столпов. */
export function labelPillars(pillars, tables) {
  const out = {};
  for (const [role, p] of Object.entries(pillars)) {
    const s = tables.stems.items[p.stem];
    const b = tables.branches.items[p.branch];
    out[role] = {
      stem: { id: s.id, han: s.han, ru: s.ru, element: s.element, polarity: s.polarity },
      branch: { id: b.id, han: b.han, ru: b.ru, element: b.element, polarity: b.polarity, animal: b.ruAnimal },
      han: s.han + b.han,
      ru: s.ru + ' ' + b.ru
    };
  }
  return out;
}

/**
 * ВРЕМЕННОЙ РЯД — ядро графиков референсной программы.
 * Строит силу меридианов на последовательности моментов времени.
 *
 * @param scale 'decade' | 'year' | 'month' | 'day'
 * STATUS: INFERRED (модель силы), VERIFIED (сами столпы каждого шага).
 */
export function computeTimeSeries(birth, tables, options = {}) {
  const {
    scale = 'year',
    from = null,
    count = null,
    applyCombos = true,
    includeLuck = true
  } = options;

  const profile = computeProfile(birth, tables, { applyCombos });
  const natal = ['year', 'month', 'day', 'hour'].map((r) => ({ ...profile.pillars[r], role: r }));

  let luck = null;
  if (includeLuck && (birth.gender === 'male' || birth.gender === 'female')) {
    luck = computeLuckPillars(birth, { count: 12 });
  }

  const points = [];
  const steps = buildSteps(scale, from, count, birth, profile);

  for (const step of steps) {
    const extra = [];

    // Столп удачи, действующий в этот момент
    if (luck) {
      const age = step.decimalYear - profile.solarYear;
      const lp = luck.pillars.find((p) => age >= p.startAge && age < p.endAge);
      if (lp) extra.push({ stem: lp.stem, branch: lp.branch, role: 'luck' });
    }

    // Столпы текущего времени
    for (const t of step.transitPillars) extra.push(t);

    const all = [...natal, ...extra];
    const monthBranchId = tables.branches.items[
      (extra.find((e) => e.role === 'monthly') || { branch: profile.pillars.month.branch }).branch
    ].id;

    const found = findInteractions(all, tables);
    const es = computeElementStrength(all, tables, { monthBranchId });
    let totals = es.totals;
    if (applyCombos) {
      totals = applyCombinations(totals, combinationsForTransform(found), tables).totals;
    }
    const meridians = computeMeridians(totals, tables);

    points.push({
      label: step.label,
      decimalYear: step.decimalYear,
      key: step.key,
      elements: toPercent(totals),
      meridians,
      harmony: computeHarmony(meridians),
      yinYang: computeYinYang(meridians, tables),
      transit: step.transitLabels
    });
  }

  return { profile, luck, scale, points };
}

/** Построение шагов временной шкалы. */
function buildSteps(scale, from, count, birth, profile) {
  const steps = [];
  const startYear = from ?? profile.solarYear;

  if (scale === 'decade') {
    const n = count ?? 10;
    for (let i = 0; i < n; i++) {
      const y = startYear + i * 10;
      const idx = yearIndexFromSolarYear(y);
      const sp = splitSexagenary(idx);
      steps.push({
        key: 'D' + y,
        label: String(y),
        decimalYear: y,
        transitPillars: [{ stem: sp.stem, branch: sp.branch, role: 'annual' }],
        transitLabels: { year: y }
      });
    }
  } else if (scale === 'year') {
    const n = count ?? 30;
    for (let i = 0; i < n; i++) {
      const y = startYear + i;
      const idx = yearIndexFromSolarYear(y);
      const sp = splitSexagenary(idx);
      steps.push({
        key: 'Y' + y,
        label: String(y),
        decimalYear: y,
        transitPillars: [{ stem: sp.stem, branch: sp.branch, role: 'annual' }],
        transitLabels: { year: y }
      });
    }
  } else if (scale === 'month') {
    const n = count ?? 24;
    const y0 = startYear;
    for (let i = 0; i < n; i++) {
      const y = y0 + Math.floor(i / 12);
      const ord = mod(i, 12);
      const yIdx = yearIndexFromSolarYear(y);
      const ySp = splitSexagenary(yIdx);
      const mStem = mod(ySp.stem * 2 + ord + 2, 10);
      const mBranch = mod(ord + 2, 12);
      steps.push({
        key: 'M' + y + '-' + ord,
        label: monthLabel(y, ord),
        decimalYear: y + ord / 12,
        transitPillars: [
          { stem: ySp.stem, branch: ySp.branch, role: 'annual' },
          { stem: mStem, branch: mBranch, role: 'monthly' }
        ],
        transitLabels: { year: y, monthOrdinal: ord }
      });
    }
  } else if (scale === 'day') {
    const n = count ?? 60;
    const y = startYear;
    const base = jdnAtNoon(y, birth.month ?? 1, birth.day ?? 1);
    for (let i = 0; i < n; i++) {
      const jdn = base + i;
      const dIdx = mod(jdn - 11, 60);
      const sp = splitSexagenary(dIdx);
      const g = utcFromJulianDay(jdn - 0.5);
      const yIdx = yearIndexFromSolarYear(g.year);
      const ySp = splitSexagenary(yIdx);
      steps.push({
        key: 'd' + jdn,
        label: `${String(g.day).padStart(2, '0')}.${String(g.month).padStart(2, '0')}`,
        decimalYear: g.year + (g.month - 1) / 12 + g.day / 365,
        transitPillars: [
          { stem: ySp.stem, branch: ySp.branch, role: 'annual' },
          { stem: sp.stem, branch: sp.branch, role: 'daily' }
        ],
        transitLabels: { date: `${g.day}.${g.month}.${g.year}` }
      });
    }
  }
  return steps;
}

const RU_MONTHS = ['Инь', 'Мао', 'Чэнь', 'Сы', 'У', 'Вэй', 'Шэнь', 'Ю', 'Сюй', 'Хай', 'Цзы', 'Чоу'];
function monthLabel(year, ordinal) {
  return `${RU_MONTHS[ordinal]} ${String(year).slice(2)}`;
}

/**
 * Расчёт окна «Летящие звёзды» на конкретную дату.
 */
export function computeFlyingStarsView(building, moment, tables) {
  const { buildYear, facingDegrees } = building;
  const period = building.period ?? periodForYear(buildYear, tables.luoshu);
  const chart = computeGeomanticChart({ period, facingDegrees }, tables);

  const mp = computeFourPillars({ ...moment, gender: undefined });
  const yBranch = tables.branches.items[mp.pillars.year.branch];

  const yStar = annualStar(mp.solarYear);
  const mStar = monthlyStar(mp.pillars.year.branch, mp.solarMonth.ordinal);
  const dStar = computeDayStar(moment, tables);

  const { flyStars } = { flyStars: (s, f) => {
    const out = {}; const path = tables.luoshu.flightPath;
    for (let k = 0; k < path.length; k++) out[path[k]] = mod(s + k - 1, 9) + 1;
    void f; return out;
  } };

  return {
    chart,
    period,
    moment: { solarYear: mp.solarYear, pillars: mp.pillars, labels: labelPillars(mp.pillars, tables) },
    annual: { center: yStar, grid: flyStars(yStar, true) },
    monthly: { center: mStar, grid: flyStars(mStar, true) },
    daily: dStar ? { center: dStar.star, grid: flyStars(dStar.star, true), mode: dStar.mode, yangDun: dStar.yangDun } : null,
    afflictions: yearAfflictions(yBranch.id, tables)
  };
}

/**
 * Дневная звезда.
 * STATUS: PARTIALLY VERIFIED — см. docs/CONFLICTS.md#day-star.
 * Реализовано правило «ближайший день Цзя-Цзы после солнцестояния».
 */
export function computeDayStar(moment, tables, mode = 'jiazi') {
  void tables;
  const { year, month, day } = moment;
  const jdn = jdnAtNoon(year, month, day);

  // Ближайшие солнцестояния вокруг даты
  const wsPrev = Math.floor(solarTermInstantUTC(year - 1, 270) + 0.5);
  const ss = Math.floor(solarTermInstantUTC(year, 90) + 0.5);
  const ws = Math.floor(solarTermInstantUTC(year, 270) + 0.5);

  let anchorSolstice, yangDun;
  if (jdn >= ws) { anchorSolstice = ws; yangDun = true; }
  else if (jdn >= ss) { anchorSolstice = ss; yangDun = false; }
  else { anchorSolstice = wsPrev; yangDun = true; }

  // Первый день Цзя-Цзы, начиная с солнцестояния (включительно)
  const idxAt = (j) => mod(j - 11, 60);
  let anchor = anchorSolstice;
  const offset = mod(-idxAt(anchorSolstice), 60);
  anchor = anchorSolstice + offset;

  // Если опорный Цзя-Цзы ещё впереди относительно нашей даты,
  // берём предыдущий цикл (за 60 дней до него).
  if (anchor > jdn) anchor -= 60;

  const daysFrom = jdn - anchor;
  return { star: dayStarFromAnchor(daysFrom, yangDun), yangDun, mode, anchorJDN: anchor, daysFrom };
}

/** Границы солнечных месяцев года — для таблиц и подписей. */
export function solarTermTable(year, tables) {
  const rows = [];
  for (const t of tables.solarTerms.items) {
    const jd = solarTermInstantUTC(year, t.longitude);
    const g = utcFromJulianDay(jd);
    rows.push({ ...t, jd, utc: g });
  }
  rows.sort((a, b) => a.jd - b.jd);
  return rows;
}

export { jieTermsForYear, dayIndexForDate, julianDayFromUTC, utcFromJulianDay, normalizeInput, mountainForDegrees, periodForYear };
