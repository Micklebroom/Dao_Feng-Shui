/**
 * profile.js — СЛОЙ 3 (Result Model).
 *
 * Превращает сырой результат движка в модель, у которой видно происхождение
 * каждой величины. Слой существует, чтобы UI не читал внутренности движка
 * (дефект ARCH-3) и чтобы статус VERIFIED / INFERRED / NOT_VERIFIED
 * доходил до экрана вместе с числом.
 */
import { computeProfile, computeTimeSeries } from '../engine/index.js';
import { inferred, notVerified, summarize, STATUS } from '../core/provenance.js';
import { INDICATOR_CATALOG, tripleBurner, healthIndex } from './indicators.js';
import { DateRangeError, InputError } from '../core/errors.js';

export const MODEL_VERSION = '1.0.0';

/**
 * Верхний предел числа точек ряда. Обоснование: 5000 точек считаются ~213 мс,
 * что уже заметно; предел защищает интерфейс от зависания на случайном вводе.
 * Это ограничение ПРОИЗВОДИТЕЛЬНОСТИ, а не расчётной модели.
 */
export const MAX_SERIES_POINTS = 1200;

/** Проверка ввода до расчёта: понятные ошибки вместо NaN в глубине движка. */
export function validateInput(birth, tables) {
  const r = tables.dateRange;
  if (!Number.isInteger(birth.year)) throw new InputError('Год должен быть целым числом');
  if (birth.year < r.from || birth.year > r.to) throw new DateRangeError(birth.year, r.from, r.to);
  if (birth.month < 1 || birth.month > 12) throw new InputError('Месяц должен быть в диапазоне 1–12');
  if (birth.day < 1 || birth.day > 31) throw new InputError('День должен быть в диапазоне 1–31');
  if (birth.hour < 0 || birth.hour > 23) throw new InputError('Час должен быть в диапазоне 0–23');
  if (birth.minute < 0 || birth.minute > 59) throw new InputError('Минута должна быть в диапазоне 0–59');
  if (birth.gender !== 'male' && birth.gender !== 'female') {
    throw new InputError('Пол должен быть указан: мужской или женский');
  }
  const tz = birth.tzOffsetHours;
  if (typeof tz !== 'number' || tz < -12 || tz > 14) {
    throw new InputError('Часовой пояс должен быть в диапазоне −12…+14');
  }
}

/** Профиль с происхождением значений. */
export function buildProfile(birth, tables, options = {}) {
  validateInput(birth, tables);
  const raw = computeProfile(birth, tables, options);

  const meridians = raw.meridians.map((m) => {
    const def = tables.meridians.items.find((x) => x.id === m.id);
    return {
      id: m.id, ru: def.ru, han: def.han, element: def.element,
      polarity: def.polarity, organType: def.organType, burner: def.burner,
      value: inferred(m.value, { placeholderRef: 'PH-F1' }),
      ratio: m.ratio, band: m.band
    };
  });

  return {
    modelVersion: MODEL_VERSION,
    input: birth,
    solarYear: raw.solarYear,
    pillars: raw.pillars,
    pillarLabels: raw.pillarLabels,
    dayMaster: raw.dayMaster,
    normalization: raw.normalization,
    elements: {
      percent: raw.elements.percent,
      raw: raw.elements.raw,
      effective: raw.elements.effective,
      status: STATUS.INFERRED
    },
    seasonElement: raw.seasonElement,
    interactions: raw.interactions,
    gua: raw.gua,
    meridians,
    yinYang: {
      yin: inferred(raw.yinYang.yin, { placeholderRef: 'PH-F4' }),
      yang: inferred(raw.yinYang.yang, { placeholderRef: 'PH-F4' }),
      yinPercent: raw.yinYang.yinPercent,
      yangPercent: raw.yinYang.yangPercent
    },
    indicators: {
      harmony: inferred(raw.harmony, { placeholderRef: 'PH-F3' }),
      health: healthIndex(),
      tripleBurner: tripleBurner(raw.meridians, tables),
      activity: notVerified({ placeholderRef: 'PH-G1' }),
      emotions: notVerified({ placeholderRef: 'PH-E1' }),
      luckIndicator: notVerified({ placeholderRef: 'PH-G2' }),
      relations: notVerified({ placeholderRef: 'PH-G3' }),
      desires: notVerified({ placeholderRef: 'PH-DESIRES' }),
      will: notVerified({ placeholderRef: 'PH-DESIRES' }),
      spirit: notVerified({ placeholderRef: 'PH-DESIRES' })
    },
    provenance: summarize(INDICATOR_CATALOG.map((c) => ({ status: c.status }))),
    catalog: INDICATOR_CATALOG
  };
}

/** Временной ряд для графиков. */
/**
 * Проверка параметров временного ряда.
 * BUG-03: раньше проверялась только дата рождения, а count и from приходили
 * в движок без контроля. Ряд из нуля точек и год за пределами объявленного
 * диапазона считались молча — при том, что для даты рождения тот же выход
 * за диапазон отвергался. Устраняем это расхождение.
 */
export function validateSeriesOptions(options, tables) {
  const { count, from, scale } = options;
  const SCALES = ['decade', 'year', 'month', 'day', 'hour'];
  if (scale !== undefined && scale !== null && !SCALES.includes(scale)) {
    throw new InputError(`Неизвестный масштаб «${scale}». Допустимы: ${SCALES.join(', ')}`);
  }
  if (count !== undefined && count !== null) {
    if (!Number.isFinite(count)) throw new InputError('Количество точек должно быть числом');
    if (count < 1) throw new InputError('Количество точек должно быть не меньше 1');
    if (count > MAX_SERIES_POINTS) {
      throw new InputError(`Количество точек не должно превышать ${MAX_SERIES_POINTS}`);
    }
  }
  if (from !== undefined && from !== null) {
    const r = tables.dateRange;
    if (!Number.isFinite(from)) throw new InputError('Начальный год должен быть числом');
    if (from < r.from || from > r.to) throw new DateRangeError(from, r.from, r.to);
  }
}

export function buildTimeSeries(birth, tables, options = {}) {
  validateInput(birth, tables);
  validateSeriesOptions(options, tables);
  const ts = computeTimeSeries(birth, tables, options);
  return {
    modelVersion: MODEL_VERSION,
    scale: ts.scale,
    points: ts.points,
    luck: ts.luck,
    profile: ts.profile,
    seriesStatus: {
      meridians: STATUS.INFERRED,
      elements: STATUS.INFERRED,
      yinYang: STATUS.INFERRED,
      harmony: STATUS.INFERRED
    }
  };
}
