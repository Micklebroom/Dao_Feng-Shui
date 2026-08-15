/**
 * provenance.js — Происхождение значения (СЛОЙ 0).
 *
 * Каждая величина, показываемая пользователю, обязана нести свой статус.
 * Без этого INFERRED-число неотличимо от VERIFIED (дефект ARCH-3),
 * и «85» на экране выглядит одинаково независимо от того,
 * проверено оно или предположено нами.
 */

export const STATUS = {
  VERIFIED: 'VERIFIED',
  PARTIAL: 'PARTIALLY VERIFIED',
  INFERRED: 'INFERRED',
  NOT_VERIFIED: 'NOT_VERIFIED'
};

/** Понятная подпись статуса для интерфейса. */
export const STATUS_RU = {
  VERIFIED: 'подтверждено',
  'PARTIALLY VERIFIED': 'частично подтверждено',
  INFERRED: 'модельная гипотеза',
  NOT_VERIFIED: 'алгоритм не подтверждён'
};

/**
 * Величина с происхождением.
 * @param value число или null (null = не рассчитывается, это нормально)
 */
export function indicator(value, status, opts = {}) {
  return {
    value,
    status,
    algorithmRef: opts.algorithmRef || null,
    placeholderRef: opts.placeholderRef || null,
    conflictRef: opts.conflictRef || null,
    note: opts.note || null
  };
}

/** Подтверждённая величина. */
export const verified = (value, algorithmRef, note = null) =>
  indicator(value, STATUS.VERIFIED, { algorithmRef, note });

/** Наша модельная гипотеза: значение есть, но это НЕ формула референса. */
export const inferred = (value, opts = {}) =>
  indicator(value, STATUS.INFERRED, opts);

/**
 * Не рассчитывается: формула не опубликована.
 * value ВСЕГДА null — подставить сюда число невозможно, не изменив контракт.
 */
export const notVerified = (opts = {}) =>
  indicator(null, STATUS.NOT_VERIFIED, opts);

/** Сводка по набору величин — для честного показа «сколько чего». */
export function summarize(indicators) {
  const out = { verified: 0, partial: 0, inferred: 0, notVerified: 0 };
  for (const ind of indicators) {
    if (!ind || typeof ind !== 'object' || !ind.status) continue;
    if (ind.status === STATUS.VERIFIED) out.verified++;
    else if (ind.status === STATUS.PARTIAL) out.partial++;
    else if (ind.status === STATUS.INFERRED) out.inferred++;
    else if (ind.status === STATUS.NOT_VERIFIED) out.notVerified++;
  }
  return out;
}
