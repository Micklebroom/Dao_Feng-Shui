/**
 * package.js — Сборка машиночитаемого пакета данных (feng_shui_data.json).
 *
 * ЕДИНСТВЕННЫЙ ИСТОЧНИК ИСТИНЫ для двух потребителей:
 *   1) tools/build-distribution.js — пишет distribution/feng_shui_data.json;
 *   2) src/ui/download.js — кнопка «Скачать JSON» в браузере.
 *
 * Оба обязаны получать БАЙТ-В-БАЙТ одинаковый результат, иначе выгруженный
 * из приложения JSON разойдётся с файлом дистрибутива. Это проверяется
 * автоматически (tools/distribution-test.js, проверка «байтовое совпадение»).
 *
 * Поэтому здесь запрещены: Date.now(), случайные значения, обход ключей
 * через Object.keys(источника) и любые недетерминированные данные.
 * Порядок таблиц задаётся списком DATA_FILES.
 */

import { DATA_FILES, keyFor } from './loader.js';

/**
 * @param {object} source  карта таблиц: либо сырые файлы {stems_branches:...},
 *                         либо собранные таблицы {stemsBranches:...}.
 * @param {object} meta    {version, engineVersion}
 * @returns {object} пакет данных с детерминированным порядком ключей
 */
export function buildDataPackage(source, meta) {
  if (!source) throw new Error('CONST-1: не передан источник таблиц данных');
  if (!meta || !meta.version) throw new Error('CONST-1: не передана версия пакета');

  const tables = {};
  for (const name of DATA_FILES) {
    // Принимаем обе раскладки ключей: файловую и camelCase.
    const table = source[name] || source[keyFor(name)];
    if (!table) throw new Error('CONST-1: отсутствует таблица данных: ' + name);
    tables[keyFor(name)] = table;
  }

  return {
    $package: 'dao-feng-shui-data',
    $comment: 'Машиночитаемый пакет расчётных данных. Ключи — стабильные ID.',
    version: meta.version,
    engineVersion: meta.engineVersion || meta.version,
    status: 'MVP / experimental — НЕ production-ready',
    generated: 'детерминированная сборка; см. src/data/package.js',
    license: 'MIT (код). Данные — традиционные табличные сведения, см. docs/RESEARCH.md',
    reference: 'Референс функциональной модели: «Фэн-Шуй Удачи» (В. Дегтярёв, feng-shui.net.ru). Код референса не использовался.',
    statusLegend: {
      VERIFIED: 'подтверждено независимыми источниками и тестами',
      'PARTIALLY VERIFIED': 'подтверждено частично, есть неразрешённый конфликт источников',
      INFERRED: 'выведено данной реализацией, формула референса не опубликована',
      'NOT VERIFIED': 'алгоритм не восстановлен; значения не выдаются (null)'
    },
    tableCount: DATA_FILES.length,
    tableOrder: DATA_FILES.map(keyFor),
    tables
  };
}

/** Каноническая сериализация пакета (та же во всех потребителях). */
export function serialiseDataPackage(pkg) {
  return JSON.stringify(pkg, null, 2) + '\n';
}
