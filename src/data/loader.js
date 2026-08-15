/**
 * loader.js — Загрузка JSON-таблиц пакета данных.
 * В браузере используется встроенный бандл (data-bundle.js), в Node — файлы.
 *
 * PHASE 4: пакет реорганизован. Стволы и ветви объединены в stems_branches,
 * сезоны переехали в calendar, взаимодействия — в bazi, веса — в indicators.
 * Чтобы расчётный движок не зависел от физической раскладки файлов,
 * assembleTables() строит СТАБИЛЬНЫЕ ПРОЕКЦИИ (views) поверх пакета.
 */

/** Физические файлы пакета (единственный источник истины). */
export const DATA_FILES = [
  'stems_branches', 'calendar', 'elements', 'bazi', 'luck_pillars',
  'gua', 'meridians', 'indicators', 'colors', 'luoshu', 'mountains24'
];

/** Нормализация имени файла в ключ: stems_branches -> stemsBranches. */
export function keyFor(name) {
  return name.replace(/[-_]([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Сборка объекта таблиц из карты имя->JSON.
 * Возвращает и сами файлы, и проекции для движка.
 */
export function assembleTables(map) {
  const t = {};
  for (const name of DATA_FILES) {
    if (!map[name]) throw new Error('Отсутствует таблица данных: ' + name);
    t[keyFor(name)] = map[name];
  }

  /* --- Проекции: стабильный контракт для расчётного движка. --- */

  // Стволы и ветви подаются в виде {items:[...]} — форма, которую ждёт движок.
  // Скрытые стволы приклеиваются к ветви, т.к. в пакете они хранятся отдельно
  // (у них собственный статус PARTIALLY VERIFIED и конфликт K5).
  const sb = t.stemsBranches;
  t.stems = { $id: 'stems', status: sb.status, items: sb.stems };
  t.branches = {
    $id: 'branches',
    status: sb.statusDetail ? sb.statusDetail.hiddenStems : sb.status,
    items: sb.branches.map((b) => ({ ...b, hidden: sb.hiddenStems.byBranch[b.id] }))
  };

  // 24 сезона живут в calendar.json.
  t.solarTerms = { $id: 'solar-terms', status: t.calendar.status, items: t.calendar.solarTerms };

  // Взаимодействия живут в bazi.json.
  t.interactions = { $id: 'interactions', status: t.bazi.interactions.status, ...t.bazi.interactions };

  // Проекция «weights» поверх indicators.json: движок исторически ждёт плоскую
  // структуру. Значения берутся ТОЛЬКО из INFERRED-блоков; всё, что помечено
  // referenceFormulaKnown:false, остаётся честно INFERRED и в результатах.
  const ind = t.indicators;
  t.weights = {
    $id: 'weights',
    status: ind.status,
    criticalNote: ind.criticalNote,
    positionWeights: ind.positionWeights.values,
    stemBase: ind.pillarBase.stemBase,
    branchBase: ind.pillarBase.branchBase,
    transformRatio: ind.transformRatio.value,
    seasonalMultipliers: ind.seasonalPhaseMultipliers.values,
    meridian: {
      yinShare: ind.meridianStrength.yinShare,
      yangShare: ind.meridianStrength.yangShare,
      scale: ind.meridianStrength.scale
    },
    interpretationBands: ind.interpretationBands.ourBands,
    harmony: ind.harmonyIndex.ourModel
  };

  // Цвета подмешиваются в отображаемые сущности — ТОЛЬКО для UI/графики.
  // Расчётный движок не должен читать эти поля.
  const c = t.colors.palettes;
  t.elementColor = (id) => c.elements.byId[id] || null;
  t.meridianColor = (id) => c.meridians.byId[id] || null;
  t.starColor = (n) => (c.stars.byNumber[String(n)] || {}).hex || null;

  return t;
}
