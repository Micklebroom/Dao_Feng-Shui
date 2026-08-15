/**
 * elements.js — Сила пяти стихий из набора столпов.
 * STATUS: INFERRED (весовая модель) поверх VERIFIED таблиц.
 *
 * ЧЕСТНОЕ ЗАЯВЛЕНИЕ:
 * Референсная программа «Фэн-Шуй Удачи» не публикует свою весовую формулу.
 * Ниже — ПРОЗРАЧНАЯ, детерминированная, полностью декларативная модель:
 * каждый вклад — это (вес позиции) x (доля скрытого ствола) x (сезонный множитель).
 * Никаких случайных чисел, никакой подгонки под форму чужого графика.
 * Все коэффициенты вынесены в JSON (data/weights.json) и могут быть изменены
 * без правки кода.
 */

import { mod } from './ganzhi.js';

export const ELEMENT_IDS = ['wood', 'fire', 'earth', 'metal', 'water'];

/** Пустой аккумулятор стихий. */
export function zeroElements() {
  return { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
}

/**
 * Сила стихий по столпам.
 * @param pillarList массив {stem,branch,role}
 * @param tables {stems,branches,elements,weights}
 * @param opts {monthBranchId, applySeasonal}
 */
export function computeElementStrength(pillarList, tables, opts = {}) {
  const { stems, branches, elements, weights } = tables;
  const { monthBranchId = null, applySeasonal = true } = opts;

  const totals = zeroElements();
  const contributions = [];

  const seasonElement = monthBranchId
    ? elements.seasonByMonthBranch.map[monthBranchId]
    : null;

  const seasonalMultiplier = (elementId) => {
    if (!applySeasonal || !seasonElement) return 1;
    const m = elements.seasonalPhase.multipliers;
    const el = (id) => elements.items.find((e) => e.id === id);
    const se = el(seasonElement);
    if (elementId === seasonElement) return m.wang;
    if (se.generates === elementId) return m.xiang;
    if (el(elementId).generates === seasonElement) return m.xiu;
    if (el(elementId).controls === seasonElement) return m.qiu;
    if (se.controls === elementId) return m.si;
    return 1;
  };

  for (const p of pillarList) {
    const posW = weights.positionWeights[p.role];
    if (posW === undefined) continue;

    // Вклад небесного ствола
    const stem = stems.items[p.stem];
    const sMul = seasonalMultiplier(stem.element);
    const sVal = posW.stem * weights.stemBase * sMul;
    totals[stem.element] += sVal;
    contributions.push({
      role: p.role, source: 'stem', stemId: stem.id,
      element: stem.element, value: sVal, seasonal: sMul
    });

    // Вклад скрытых стволов ветви
    const branch = branches.items[p.branch];
    for (const h of branch.hidden) {
      const hs = stems.items.find((s) => s.id === h.stem);
      const hMul = seasonalMultiplier(hs.element);
      const hVal = posW.branch * weights.branchBase * (h.share / 100) * hMul;
      totals[hs.element] += hVal;
      contributions.push({
        role: p.role, source: 'hidden', branchId: branch.id, stemId: hs.id,
        element: hs.element, share: h.share, value: hVal, seasonal: hMul
      });
    }
  }

  return { totals, contributions, seasonElement };
}

/** Нормализация в проценты (сумма = 100). */
export function toPercent(totals) {
  const sum = ELEMENT_IDS.reduce((a, k) => a + totals[k], 0);
  const out = zeroElements();
  if (sum <= 0) return out;
  for (const k of ELEMENT_IDS) out[k] = (totals[k] / sum) * 100;
  return out;
}

/**
 * Применение слияний стихий (слияния стволов и ветвей).
 * STATUS: INFERRED (степень трансформации).
 * Референс различает графики «без учёта слияний» и «с учётом слияний»
 * (см. progr3a.htm, Рис.1 и Рис.2). Мы воспроизводим ЭТО РАЗЛИЧИЕ как
 * переключатель, а не как подгонку значений: при включении часть силы
 * участников слияния переносится в порождаемую стихию.
 * Коэффициент переноса объявлен в data/weights.json (transformRatio).
 */
export function applyCombinations(totals, foundCombinations, tables, ratioOverride = null) {
  const { weights, stems, branches } = tables;
  const ratio = ratioOverride ?? weights.transformRatio;
  const out = { ...totals };
  const applied = [];

  for (const c of foundCombinations) {
    const produced = c.produces;
    if (!produced) continue;
    // Источник силы — стихии участников комбинации.
    const memberElements = (c.stems || []).map((id) => stems.items.find((s) => s.id === id).element)
      .concat((c.branches || []).map((id) => branches.items.find((b) => b.id === id).element));

    let moved = 0;
    for (const me of memberElements) {
      if (me === produced) continue;
      const take = out[me] * ratio;
      out[me] -= take;
      moved += take;
    }
    out[produced] += moved;
    applied.push({ id: c.id, produces: produced, moved });
  }

  return { totals: out, applied };
}
