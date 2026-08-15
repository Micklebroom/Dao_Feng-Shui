/**
 * pillars.js — Четыре столпа (四柱) и столпы удачи (大運).
 * STATUS: VERIFIED (структура столпов), PARTIALLY VERIFIED (старт столпов удачи).
 *
 * Слой расчёта. Не содержит ничего, связанного с UI.
 */

import { julianDayFromUTC, utcFromJulianDay } from './astro.js';
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
export function computeFourPillars(input, anchors = null, zi = null) {
  const norm = normalizeInput(input);
  const { year, month, day, hour = 12, minute = 0 } = input;

  // Локальный момент, выраженный как JD, для сравнения с границами сезонов.
  const sm = solarMonthAt(norm.jdUTC, year);
  if (!sm) throw new Error('Не удалось определить солнечный месяц');

  const yIdx = yearIndexFromSolarYear(sm.solarYear, anchors);
  const ySplit = splitSexagenary(yIdx);

  const mStem = monthStemIndex(ySplit.stem, sm.ordinal);
  const mBranch = monthBranchIndex(sm.ordinal);

  /*
   * RT-10 / правила TZ-3 и TZ-4. Раньше столпы дня и часа брались из СЫРЫХ
   * локальных чисел input.{year,month,day,hour}, тогда как год и месяц шли от
   * instantJD. Это и есть дефект A-08: при поправке истинного солнечного
   * времени или сдвиге пояса шкалы расходились, а golden-случай GT-B3-04
   * (столпы дня при UTC+12 и UTC-12 обязаны различаться) проваливался.
   *
   * Теперь локальная гражданская дата ВОССТАНАВЛИВАЕТСЯ из единого момента:
   *   localJD = instantJD + tzOffsetHours/24
   * и столп дня берётся уже по ней. Все четыре столпа выведены из одной шкалы.
   *
   * Режим часа Цзы (конфликт K4) приходит из данных: см. RT-02.
   */
  const tz = input.tzOffsetHours || 0;
  const localJD = norm.jdUTC + tz / 24;
  const loc = utcFromJulianDay(localJD);

  const earlyZiNewDay = zi ? zi.earlyZiNewDay : true;
  const dIdx = dayIndexForDate(loc.year, loc.month, loc.day, loc.hour, { earlyZiNewDay });
  const dSplit = splitSexagenary(dIdx);

  const hBranch = hourBranchIndex(loc.hour);
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
  // ARCH-1: rules приходит из data/luck_pillars.json через движок.
  const { count = 10, rounding = 'exact', rules = null } = options;

  const fp = computeFourPillars(input, options.anchors || null, options.zi || null);
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

  // RT-03 / CONST-1: конверсия «3 дня = 1 год» и длина столпа обязаны
  // прийти из data/luck_pillars.json. Молчаливый откат удалён.
  if (!rules || typeof rules.daysPerYear !== 'number' || typeof rules.pillarYears !== 'number') {
    throw new Error('CONST-1: не переданы правила столпов удачи (luck_pillars.json -> conversion/pillarLength)');
  }
  const daysPerYear = rules.daysPerYear;
  const pillarYears = rules.pillarYears;
  let startAge = deltaDays / daysPerYear;
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
      startAge: startAge + (i - 1) * pillarYears,
      endAge: startAge + i * pillarYears
    });
  }

  return { forward, startAge, deltaDays, pillars: list, fourPillars: fp };
}

/**
 * Столпы текущей даты (год/месяц/день/час) для произвольного момента.
 */
export function computeDatePillars(input, anchors = null, zi = null) {
  return computeFourPillars({ ...input, gender: undefined }, anchors, zi);
}
