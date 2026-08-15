/**
 * flyingstars.js — Летящие звёзды Сюань Кун (玄空飛星).
 * STATUS: VERIFIED (полёт, период, годовая/месячная звезда),
 *         PARTIALLY VERIFIED (дневная звезда — см. docs/CONFLICTS.md#day-star).
 */

import { mod } from './ganzhi.js';

/** Приведение номера звезды в 1..9. */
export const wrap9 = (n) => mod(n - 1, 9) + 1;

/**
 * Полёт звезды по девяти дворцам.
 * STATUS: VERIFIED. Путь: Центр → СЗ → З → СВ → Ю → С → ЮЗ → В → ЮВ.
 * Источник: en.wikibooks.org/wiki/Feng_Shui, en.wikipedia.org/wiki/Flying_Star_Feng_Shui.
 * @returns {Object} карта direction -> номер звезды
 */
export function flyStars(startNumber, forward, luoshu) {
  const path = luoshu.flightPath;
  const out = {};
  for (let k = 0; k < path.length; k++) {
    out[path[k]] = wrap9(startNumber + (forward ? k : -k));
  }
  return out;
}

/** Период (運) по году постройки; год — солнечный (смена на Ли Чунь). */
export function periodForYear(solarYear, luoshu) {
  const p = luoshu.periods.items.find((x) => solarYear >= x.start && solarYear <= x.end);
  if (p) return p.period;
  // Расширение за пределы таблицы по 180-летнему циклу.
  // ARCH-1: якорь и длины циклов — из data/luoshu.json, а не литералы.
  const base = luoshu.periods.items[0].start;
  const cycle = luoshu.periods.cycleYears;
  const periodLen = cycle / luoshu.periods.items.length;
  const offset = mod(solarYear - base, cycle);
  return Math.floor(offset / periodLen) + 1;
}

/**
 * ГОДОВАЯ ЗВЕЗДА (年紫白).
 * STATUS: VERIFIED.
 * Убывающая последовательность с периодом 9. Опорная точка: 2024 солнечный год
 * (год Цзя Чэнь, начало 9 периода) — центральная годовая звезда 3.
 * Проверка по независимому источнику: 2026 -> 1 (fengshuibalanz.com указывает
 * «Annual Flying Star 1 in the CENTRAL Palace» для 2026). Тест закрепляет оба.
 */
export function annualStar(solarYear, anchors) {
  // RT-03 / CONST-1: якорь ОБЯЗАН прийти из data/calendar.json
  // (epochs.annualStarAnchor). Откат на литералы 2024/3 удалён.
  if (!anchors || typeof anchors.annualStarYear !== 'number'
      || typeof anchors.annualStarValue !== 'number') {
    throw new Error('CONST-1: не передан якорь годовой звезды (calendar.json -> epochs.annualStarAnchor)');
  }
  return wrap9(anchors.annualStarValue - (solarYear - anchors.annualStarYear));
}

/**
 * МЕСЯЧНАЯ ЗВЕЗДА (月紫白).
 * STATUS: VERIFIED.
 * Зависит от группы ветви года и порядкового номера солнечного месяца от Инь.
 * Группа Цзы/У/Мао/Ю → месяц Инь = 8; Чэнь/Сюй/Чоу/Вэй → 5; Инь/Шэнь/Сы/Хай → 2.
 * Далее убывает на 1 за каждый следующий солнечный месяц.
 * Источник: классические таблицы 月紫白; согласуется с помесячными визитами
 * звёзд, публикуемыми fengshuibalanz.com для 2026 года (см. тесты).
 */
export function monthlyStar(yearBranchIndex, monthOrdinalFromYin) {
  const group = mod(yearBranchIndex, 3); // 0: zi,mao,wu,you? — вычисляем явно ниже
  // Явное сопоставление по ветви года:
  // zi(0), wu(6), mao(3), you(9)        -> 8
  // chen(4), xu(10), chou(1), wei(7)    -> 5
  // yin(2), shen(8), si(5), hai(11)     -> 2
  const setA = [0, 3, 6, 9];
  const setB = [1, 4, 7, 10];
  let start;
  if (setA.includes(yearBranchIndex)) start = 8;
  else if (setB.includes(yearBranchIndex)) start = 5;
  else start = 2;
  void group;
  return wrap9(start - monthOrdinalFromYin);
}

/**
 * ДНЕВНАЯ ЗВЕЗДА (日紫白).
 * STATUS: PARTIALLY VERIFIED — источники расходятся. См. docs/CONFLICTS.md#day-star.
 *
 * Реализовано КЛАССИЧЕСКОЕ правило Цзя-Цзы (вариант 'jiazi'):
 *   - Ян Дунь (陽遁, восходящий счёт) — от зимнего солнцестояния до летнего;
 *   - Инь Дунь (陰遁, нисходящий счёт) — от летнего до зимнего;
 *   - счёт стартует с ближайшего дня Цзя-Цзы (甲子) после солнцестояния:
 *     в Ян Дунь центральная звезда этого дня = 1, в Инь Дунь = 9.
 * Источник: fengshuidiy.com (правила 1 и 2), Baidu Baike «九宫八卦».
 *
 * Вариант 'solstice' (счёт непосредственно от дня солнцестояния с удвоением
 * звезды) описан 9starki.com и heluo.nl и НЕ совпадает с 'jiazi' на части дат.
 * Мы НЕ выбираем победителя молча: движок поддерживает оба и по умолчанию
 * использует 'jiazi' как опирающийся на китайские первоисточники.
 *
 * @param dayIndex 0-based индекс дня в цикле 60 (0 = Цзя-Цзы)
 * @param daysFromAnchor целое число дней от опорного дня Цзя-Цзы
 * @param yangDun true — восходящий счёт
 */
export function dayStarFromAnchor(daysFromAnchor, yangDun) {
  return yangDun ? wrap9(1 + daysFromAnchor) : wrap9(9 - daysFromAnchor);
}

/**
 * Полный геомантический расчёт (三盤): земная основа, горные и водные звёзды.
 * STATUS: VERIFIED.
 *
 * Правило направления полёта (инь/ян горы) подтверждено двумя источниками:
 *  - en.wikibooks.org/wiki/Feng_Shui (Constructing Mountain/Facing Stars)
 *  - fengshuied.com/flying-star-natal-charts (разбор на примере периода 8, S2)
 *
 * Алгоритм:
 *  1. Звезда периода в центр, полёт вперёд → земная основа (地盤).
 *  2. Число земной основы в дворце СИДЕНИЯ → центр горной карты (山盤).
 *  3. Число земной основы в дворце ФАСАДА → центр водной карты (向盤).
 *  4. Направление полёта каждой карты определяется инь/ян ТОЙ ГОРЫ, которая
 *     соответствует полученному числу в секторе, взятой в той же триаде
 *     (земля/небо/человек), что и измеренный азимут.
 */
export function computeGeomanticChart(params, tables) {
  const { period, facingDegrees } = params;
  const { luoshu, mountains24 } = tables;

  const facing = mountainForDegrees(facingDegrees, mountains24);
  const sittingDeg = mod(facingDegrees + 180, 360);
  const sitting = mountainForDegrees(sittingDeg, mountains24);

  // 1. Земная основа
  const earthBase = flyStars(period, true, luoshu);

  // 2/3. Числа основы в дворцах сидения и фасада
  const facingPalace = luoshu.palaces.find((p) => p.direction === facing.sector);
  const sittingPalace = luoshu.palaces.find((p) => p.direction === sitting.sector);
  const facingBaseNumber = earthBase[facingPalace.direction];
  const sittingBaseNumber = earthBase[sittingPalace.direction];

  // 4. Направление полёта
  const facingDir = flightDirectionFor(facingBaseNumber, facing.triad, tables, period);
  const sittingDir = flightDirectionFor(sittingBaseNumber, sitting.triad, tables, period);

  const waterStars = flyStars(facingBaseNumber, facingDir, luoshu);
  const mountainStars = flyStars(sittingBaseNumber, sittingDir, luoshu);

  return {
    period,
    facing: { ...facing, degrees: facingDegrees },
    sitting: { ...sitting, degrees: sittingDeg },
    earthBase,
    mountainStars,
    waterStars,
    flight: {
      mountainForward: sittingDir,
      waterForward: facingDir,
      mountainCenter: sittingBaseNumber,
      waterCenter: facingBaseNumber
    }
  };
}

/**
 * Направление полёта для звезды `starNumber`, попавшей в центр,
 * с учётом триады измеренного направления.
 * Правило: находим сектор, которому в квадрате Ло Шу принадлежит starNumber,
 * берём в этом секторе гору той же триады и читаем её инь/ян.
 * Ян → вперёд, Инь → назад.
 */
export function flightDirectionFor(starNumber, triad, tables, periodNumber = null) {
  const { luoshu, mountains24 } = tables;
  let effective = starNumber;
  if (starNumber === 5) {
    // Звезда 5 не имеет собственного дворца в квадрате Ло Шу.
    // ПРАВИЛО: полярность звезды 5 берётся по НОМЕРУ ПЕРИОДА.
    // STATUS: VERIFIED.
    // Источник 1: en.wikipedia.org/wiki/Flying_Star_Feng_Shui — «To determine
    //   the polarity of number 5 star, go by the polarity of the Period number».
    // Источник 2: alchetron.com/Flying-Star-Feng-Shui — та же формулировка.
    // Источник 3 (числовая проверка): en.wikibooks.org — карта Период 9,
    //   сидение S2 / фасад N2: водная звезда центра 5 летит НАЗАД, что
    //   воспроизводится только этим правилом (закреплено тестом).
    if (periodNumber === null || periodNumber === 5) {
      throw new Error('Для звезды 5 в центре требуется номер периода (не равный 5)');
    }
    effective = periodNumber;
  }
  const palace = luoshu.palaces.find((p) => p.number === effective);
  const mtn = mountains24.items.find(
    (m) => m.sector === palace.direction && m.triad === triad
  );
  return mtn.polarity === 'yang';
}

/** Гора по азимуту (0..360). */
export function mountainForDegrees(deg, mountains24) {
  const d = mod(deg, 360);
  for (const m of mountains24.items) {
    if (m.start < m.end) {
      if (d >= m.start && d < m.end) return m;
    } else if (d >= m.start || d < m.end) {
      // Сектор, пересекающий 0 градусов (N2 Цзы).
      return m;
    }
  }
  return mountains24.items[0];
}
