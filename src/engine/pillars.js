/**
 * pillars.js — Четыре столпа (四柱) и столпы удачи (大運).
 * STATUS: VERIFIED (структура столпов), PARTIALLY VERIFIED (старт столпов удачи).
 *
 * Слой расчёта. Не содержит ничего, связанного с UI.
 */

import { julianDayFromUTC } from './astro.js';
import {
  mod, dayIndexForDate, yearIndexFromSolarYear, monthStemIndex, monthBranchIndex,
  hourBranchIndex, hourStemIndex, splitSexagenary, solarMonthAt, jieTermsForYear
} from './ganzhi.js';

/**
 * Нормализация входа: местное гражданское время -> UTC JD.
 * tzOffsetHours — смещение часового пояса места (например, +3 для Москвы).
 * ВАЖНО: истинное солнечное время (поправка на долготу) НЕ применяется по
 * умолчанию; это отдельная опция, см. docs/ASSUMPTIONS.md#true-solar-time.
 */
export function normalizeInput(input) {
  const {
    year, month, day, hour = 12, minute = 0,
    tzOffsetHours = 0,
    longitude = null,
    useTrueSolarTime = false
  } = input;

  let jdUTC = julianDayFromUTC(year, month, day, hour, minute, 0) - tzOffsetHours / 24;

  let solarCorrectionMinutes = 0;
  if (useTrueSolarTime && longitude !== null) {
    // Поправка на долготу относительно меридиана часового пояса.
    const tzMeridian = tzOffsetHours * 15;
    solarCorrectionMinutes = (longitude - tzMeridian) * 4;
    jdUTC += solarCorrectionMinutes / (60 * 24);
  }

  return { jdUTC, solarCorrectionMinutes, gregorian: { year, month, day, hour, minute } };
}

/**
 * Полный расчёт четырёх столпов.
 * @returns {{year,month,day,hour}} каждый — {stem,branch,index}
 */
export function computeFourPillars(input) {
  const norm = normalizeInput(input);
  const { year, month, day, hour = 12, minute = 0 } = input;
  const { lateZiNewDay = true } = input;

  // Локальный момент, выраженный как JD, для сравнения с границами сезонов.
  const sm = solarMonthAt(norm.jdUTC, year);
  if (!sm) throw new Error('Не удалось определить солнечный месяц');

  const yIdx = yearIndexFromSolarYear(sm.solarYear);
  const ySplit = splitSexagenary(yIdx);

  const mStem = monthStemIndex(ySplit.stem, sm.ordinal);
  const mBranch = monthBranchIndex(sm.ordinal);

  const dIdx = dayIndexForDate(year, month, day, hour, { lateZiNewDay });
  const dSplit = splitSexagenary(dIdx);

  const hBranch = hourBranchIndex(hour);
  const hStem = hourStemIndex(dSplit.stem, hBranch);

  return {
    solarYear: sm.solarYear,
    solarMonth: { ordinal: sm.ordinal, termId: sm.termId, startJD: sm.startJD },
    pillars: {
      year:  { stem: ySplit.stem, branch: ySplit.branch, index: yIdx },
      month: { stem: mStem, branch: mBranch, index: null },
      day:   { stem: dSplit.stem, branch: dSplit.branch, index: dIdx },
      hour:  { stem: hStem, branch: hBranch, index: null }
    },
    normalization: norm
  };
}

/**
 * СТОЛПЫ УДАЧИ (大運).
 * STATUS: VERIFIED (направление и шаг), PARTIALLY VERIFIED (точный возраст старта).
 *
 * Направление: мужчина в год с ЯН-стволом и женщина в год с ИНЬ-стволом —
 * вперёд; иначе назад. Источник: классические таблицы Ба-цзы (инвариантно).
 *
 * Возраст старта: считается расстояние в днях от рождения до следующей (вперёд)
 * или предыдущей (назад) сектантской границы сезона; 3 дня = 1 год.
 * КОНФЛИКТ: часть школ округляет до целых лет, часть переводит остаток в месяцы
 * и дни. Реализованы оба; по умолчанию — точное дробное значение.
 * См. docs/CONFLICTS.md#luck-start-age.
 */
export function computeLuckPillars(input, options = {}) {
  const { gender } = input;
  if (gender !== 'male' && gender !== 'female') {
    throw new Error("gender должен быть 'male' или 'female'");
  }
  const { count = 10, rounding = 'exact' } = options;

  const fp = computeFourPillars(input);
  const yearStem = fp.pillars.year.stem;
  const yearStemIsYang = mod(yearStem, 2) === 0;
  const forward = (gender === 'male') === yearStemIsYang;

  // Границы месяцев вокруг момента рождения
  const terms = [
    ...jieTermsForYear(input.year - 1),
    ...jieTermsForYear(input.year),
    ...jieTermsForYear(input.year + 1)
  ].sort((a, b) => a.jd - b.jd);

  const birthJD = fp.normalization.jdUTC;
  let deltaDays;
  if (forward) {
    const next = terms.find((t) => t.jd > birthJD);
    deltaDays = next.jd - birthJD;
  } else {
    const prevs = terms.filter((t) => t.jd <= birthJD);
    const prev = prevs[prevs.length - 1];
    deltaDays = birthJD - prev.jd;
  }

  let startAge = deltaDays / 3;
  if (rounding === 'floor') startAge = Math.floor(startAge);
  else if (rounding === 'round') startAge = Math.round(startAge);

  const mStem = fp.pillars.month.stem;
  const mBranch = fp.pillars.month.branch;

  const list = [];
  for (let i = 1; i <= count; i++) {
    const step = forward ? i : -i;
    list.push({
      ordinal: i,
      stem: mod(mStem + step, 10),
      branch: mod(mBranch + step, 12),
      startAge: startAge + (i - 1) * 10,
      endAge: startAge + i * 10
    });
  }

  return { forward, startAge, deltaDays, pillars: list, fourPillars: fp };
}

/**
 * Столпы текущей даты (год/месяц/день/час) для произвольного момента.
 */
export function computeDatePillars(input) {
  return computeFourPillars({ ...input, gender: undefined });
}
