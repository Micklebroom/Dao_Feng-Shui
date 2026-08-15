/**
 * meridians.js — Перевод силы пяти стихий в силу 10 меридианов + индекс гармоничности.
 * STATUS: INFERRED (формула референса неизвестна, см. indicators.json -> modelPolicy).
 *
 * ИСПРАВЛЕНО по аудиту A-02/A-13: меридианов 10, а не 12. Перикард и тройной
 * обогреватель исключены; «Три обогревателя» — группировка тех же 10.
 *
 * ОГРАНИЧЕНИЕ: это традиционные метафизические/энергетические расчётные
 * показатели. Это НЕ медицинская диагностика и НЕ медицинский прогноз.
 */

import { ELEMENT_IDS, toPercent } from './elements.js';

/**
 * @param totals сила стихий (произвольная шкала)
 * @param tables {meridians, weights}
 * @returns {Array<{id, value, ratio, band}>}
 */
export function computeMeridians(totals, tables) {
  const { meridians, weights } = tables;
  const w = weights.meridian;
  const pct = toPercent(totals);

  const values = {};
  for (const m of meridians.items) {
    const elementValue = pct[m.element];
    // На каждую стихию приходится ровно 2 меридиана (цзан + фу): делим поровну.
    const share = m.polarity === 'yin' ? w.yinShare : w.yangShare;
    values[m.id] = elementValue * share * (w.scale / 100);
  }

  const arr = meridians.items.map((m) => ({ id: m.id, value: values[m.id] }));
  const mean = arr.reduce((a, x) => a + x.value, 0) / arr.length;

  return arr.map((x) => {
    const ratio = mean > 0 ? x.value / mean : 0;
    const band = tables.weights.interpretationBands.find(
      (b) => b.maxRatio === null || ratio <= b.maxRatio
    );
    return { ...x, ratio, band: band.id };
  });
}

/**
 * Индекс гармоничности меридианов 0..100.
 * STATUS: INFERRED (см. data/weights.json -> harmony).
 */
export function computeHarmony(meridianValues) {
  const vals = meridianValues.map((m) => m.value);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (mean <= 0) return 0;
  const mad = vals.reduce((a, v) => a + Math.abs(v - mean), 0) / vals.length;
  const score = (1 - mad / mean) * 100;
  return Math.max(0, Math.min(100, score));
}

/** Сумма Инь / Ян по меридианам. */
export function computeYinYang(meridianValues, tables) {
  const { meridians } = tables;
  let yin = 0, yang = 0;
  for (const mv of meridianValues) {
    const def = meridians.items.find((m) => m.id === mv.id);
    if (def.polarity === 'yin') yin += mv.value; else yang += mv.value;
  }
  const total = yin + yang;
  return { yin, yang, yinPercent: total ? (yin / total) * 100 : 0, yangPercent: total ? (yang / total) * 100 : 0 };
}
