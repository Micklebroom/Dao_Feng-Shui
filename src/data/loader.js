/**
 * loader.js — Загрузка JSON-таблиц.
 * В браузере используется встроенный бандл (data-bundle.js), в Node — файлы.
 */

export const DATA_FILES = [
  'stems', 'branches', 'elements', 'solar-terms', 'meridians',
  'mountains24', 'luoshu', 'interactions', 'gua', 'weights'
];

/** Нормализация ключей: solar-terms -> solarTerms */
export function keyFor(name) {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/** Сборка объекта таблиц из карты имя->JSON. */
export function assembleTables(map) {
  const tables = {};
  for (const name of DATA_FILES) {
    if (!map[name]) throw new Error('Отсутствует таблица данных: ' + name);
    tables[keyFor(name)] = map[name];
  }
  return tables;
}
