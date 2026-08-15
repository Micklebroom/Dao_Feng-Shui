#!/usr/bin/env node
/**
 * build-distribution.js — Сборка финального пакета поставки (PHASE 12).
 *
 * Результат — каталог distribution/:
 *   feng_shui_mvp.html    автономное приложение (один файл, без сервера)
 *   feng_shui_data.json   машиночитаемый пакет расчётных данных
 *   FENG_SHUI_MVP.zip     полный пакет: app, src, data, algorithms, tests, docs
 *   README.md             инструкция к поставке
 *   manifest.json         состав поставки, размеры, контрольные суммы
 *
 * ДЕТЕРМИНИРОВАННОСТЬ.
 *   Сборка обязана давать одинаковые байты при одинаковом дереве исходников:
 *   иначе контрольные суммы в manifest.json бессмысленны. Поэтому:
 *     • время всех файлов в архиве принудительно выставляется в фиксированное;
 *     • zip вызывается с -X (без расширенных атрибутов и uid/gid);
 *     • никаких Date.now() в содержимом.
 *   Проверяется автоматически: tools/distribution-test.js.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_FILES } from '../src/data/loader.js';
import { buildDataPackage, serialiseDataPackage } from '../src/data/package.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'distribution');
const pkgJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

/* Фиксированная отметка времени для архива (детерминированность).
   Значение произвольно, но постоянно; смысловой нагрузки не несёт. */
const FIXED_MTIME = '202001010000.00';

const ZIP_NAME = 'FENG_SHUI_MVP.zip';
const ZIP_ROOT = 'FENG_SHUI_MVP';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const rel = (p) => path.relative(root, p).replace(/\\/g, '/');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

/* ------------------------------------------------------------------ */
/* 1. Автономный HTML                                                  */
/* ------------------------------------------------------------------ */

const standaloneSrc = path.join(root, 'dist', 'feng_shui_mvp.html');
if (!fs.existsSync(standaloneSrc)) {
  throw new Error('Нет dist/feng_shui_mvp.html — сначала выполните: npm run build');
}
const standalone = fs.readFileSync(standaloneSrc);

// Ворота качества: автономный файл не должен требовать сети.
const html = standalone.toString('utf8');
const external = [...html.matchAll(/<(?:script|link|img|iframe)[^>]*(?:src|href)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((u) => !u.startsWith('#') && !u.startsWith('data:'));
if (external.length) {
  throw new Error('Автономный HTML ссылается на внешние ресурсы: ' + external.join(', '));
}
if (!/content="standalone"/.test(html)) {
  throw new Error('В автономном HTML нет маркера сборки standalone');
}
fs.writeFileSync(path.join(out, 'feng_shui_mvp.html'), standalone);

/* ------------------------------------------------------------------ */
/* 2. JSON пакет данных                                                */
/* ------------------------------------------------------------------ */

const rawTables = {};
for (const name of DATA_FILES) {
  rawTables[name] = JSON.parse(fs.readFileSync(path.join(root, 'data', name + '.json'), 'utf8'));
}
const dataText = serialiseDataPackage(
  buildDataPackage(rawTables, { version: pkgJson.version, engineVersion: pkgJson.version })
);
fs.writeFileSync(path.join(out, 'feng_shui_data.json'), dataText, 'utf8');

/* ------------------------------------------------------------------ */
/* 3. ZIP                                                              */
/* ------------------------------------------------------------------ */

const stage = path.join(out, ZIP_ROOT);
fs.mkdirSync(stage, { recursive: true });

const copyInto = (relSrc, relDst) => {
  const src = path.join(root, relSrc);
  if (!fs.existsSync(src)) throw new Error('Отсутствует для поставки: ' + relSrc);
  const dst = path.join(stage, relDst || relSrc);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
};

/* app/ — готовое к запуску приложение.
   index.html здесь — АВТОНОМНАЯ сборка: открывается двойным щелчком,
   без сервера и без относительных зависимостей. */
fs.mkdirSync(path.join(stage, 'app'), { recursive: true });
fs.writeFileSync(path.join(stage, 'app', 'index.html'), standalone);
fs.writeFileSync(path.join(stage, 'app', 'feng_shui_data.json'), dataText, 'utf8');

/* Исходное дерево (версия под сервером). */
['src', 'data', 'algorithms', 'tests', 'docs', 'tools'].forEach((d) => copyInto(d));
['README.md', 'LICENSE', 'package.json', 'index.html'].forEach((f) => copyInto(f));

/* Вычистить служебные артефакты прогонов QA.
   Найдено проверкой детерминированности: tools/.qa-results.json и
   tools/.dist-results.json переписываются при каждом запуске тестов, из-за
   чего архив и его контрольная сумма менялись от сборки к сборке. В поставке
   таким файлам не место — это временные результаты, а не исходники. */
let pruned = 0;
const prune = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { prune(p); continue; }
    if (e.name.startsWith('.') || e.name.endsWith('.log')) {
      fs.rmSync(p); pruned++;
    }
  }
};
prune(stage);

fs.writeFileSync(path.join(stage, 'app', 'README.txt'),
`APP — ГОТОВОЕ К ЗАПУСКУ ПРИЛОЖЕНИЕ

  index.html            автономная сборка: откройте двойным щелчком.
                        Сервер, интернет и установка НЕ требуются.
  feng_shui_data.json   пакет расчётных данных (тот же, что отдаёт
                        кнопка «Скачать JSON»).

Версия под сервером — в корне пакета:
  npm run serve   ->  http://localhost:8080

Статус: MVP / экспериментальное приложение. НЕ production-ready.
`, 'utf8');

fs.writeFileSync(path.join(stage, 'START.txt'),
`ФЭН-ШУЙ: РАСЧЁТНЫЙ ДВИЖОК ЦИКЛОВ
Статус: MVP / экспериментальное приложение. НЕ production-ready.

БЫСТРЫЙ ЗАПУСК БЕЗ УСТАНОВКИ
  app/index.html        один файл, без сервера и без интернета

ПОЛНАЯ ВЕРСИЯ (исходное дерево)
  npm run serve   ->  http://localhost:8080
  Требуется Node.js 20+. Внешних зависимостей нет.

ПРОВЕРКА КАЧЕСТВА
  node tools/qa-report.js

СОСТАВ
  app/          готовое приложение (автономная сборка)
  src/          исходный код: engine, model, chart, ui
  data/         JSON-таблицы расчётных данных
  algorithms/   формальная спецификация алгоритмов и статусы
  tests/        модульные, интеграционные и эталонные тесты
  docs/         документация, аудиты, конфликты источников
  tools/        сборка, валидация, тестовые стенды

ВАЖНО
  Показатели меридианов и органов — традиционные метафизические
  расчётные величины. Это НЕ медицинская диагностика.

  Весовая модель силы стихий и меридианов имеет статус INFERRED:
  формула референсной программы не опубликована и не восстановлена.
  См. docs/CONFLICTS.md.
`, 'utf8');

// Детерминированность: фиксированное время у всех файлов архива.
execFileSync('find', [stage, '-exec', 'touch', '-t', FIXED_MTIME, '{}', '+']);

const zipPath = path.join(out, ZIP_NAME);
fs.rmSync(zipPath, { force: true });
// -X: не писать uid/gid и расширенные атрибуты; -r: рекурсивно; -q: тихо.
execFileSync('zip', ['-r', '-q', '-X', '-9', ZIP_NAME, ZIP_ROOT], { cwd: out });
fs.rmSync(stage, { recursive: true, force: true });

/* ------------------------------------------------------------------ */
/* 4. README поставки                                                  */
/* ------------------------------------------------------------------ */

const readme = `# Фэн-шуй: расчётный движок циклов — пакет поставки

**Статус: MVP / экспериментальное расчётное приложение. НЕ production-ready.**

Независимая реализация традиционных китайских циклических расчётов.
Референс функциональной и визуальной модели — программа «Фэн-Шуй Удачи»
(В. Дегтярёв, feng-shui.net.ru). Код референса не использовался и недоступен;
воспроизводится функциональная эквивалентность **подтверждённых** расчётов.

## Состав пакета

| Файл | Назначение |
|---|---|
| \`feng_shui_mvp.html\` | Автономное приложение. Один файл, открывается двойным щелчком. Сервер и интернет не нужны. |
| \`feng_shui_data.json\` | Машиночитаемый пакет расчётных данных: ${DATA_FILES.length} таблиц. |
| \`${ZIP_NAME}\` | Полный пакет: app, src, data, algorithms, tests, docs, tools. |
| \`manifest.json\` | Состав поставки, размеры, контрольные суммы SHA-256. |
| \`README.md\` | Этот файл. |

## Запуск

**Без установки.** Откройте \`feng_shui_mvp.html\` в современном браузере
(Chrome, Firefox, Edge, Safari). Расчёты выполняются полностью на клиенте.
**Backend не требуется.**

**Из полного пакета.** Распакуйте \`${ZIP_NAME}\`:

\`\`\`
unzip ${ZIP_NAME}
cd ${ZIP_ROOT}
# вариант 1 — автономно:
open app/index.html
# вариант 2 — под сервером (Node.js 20+, внешних зависимостей нет):
npm run serve      # http://localhost:8080
\`\`\`

## Проверка качества

\`\`\`
node tools/qa-report.js         # все уровни контроля
node tools/distribution-test.js # проверка самой поставки
\`\`\`

## Выгрузка из приложения

В панели «Загрузка» доступны три кнопки:

* **Скачать программу** — автономный \`feng_shui_mvp.html\`;
* **Скачать JSON** — \`feng_shui_data.json\`, собирается на клиенте
  тем же кодом, что и файл поставки (совпадение байтов проверяется тестом);
* **Скачать полный пакет** — \`${ZIP_NAME}\`.

Архив и готовый HTML отдаёт сервер. В автономном режиме (открытие по
\`file://\`) кнопка JSON работает всегда, а для архива приложение честно
сообщает, что он доступен только при запуске с сервера: подделывать
ZIP на клиенте недопустимо.

## Ограничения

* Статус алгоритмов: 18 ПОДТВЕРЖДЕНО, 9 ЧАСТИЧНО ПОДТВЕРЖДЕНО.
  Весовая модель силы стихий и меридианов — **INFERRED** (гипотеза
  данной реализации; формула референса не опубликована).
* Показатели, алгоритм которых не восстановлен, возвращают \`null\`
  и НЕ заполняются правдоподобными числами.
* Показатели меридианов и органов — традиционные метафизические
  расчётные величины, **не медицинская диагностика**.
* Подробности: \`docs/ALGORITHMS.md\`, \`docs/CONFLICTS.md\`,
  \`docs/FINAL_QA.md\`, \`docs/DISTRIBUTION_QA.md\`.

Лицензия: MIT (код). См. \`LICENSE\` в полном пакете.
`;
fs.writeFileSync(path.join(out, 'README.md'), readme, 'utf8');

/* ------------------------------------------------------------------ */
/* 5. manifest.json                                                    */
/* ------------------------------------------------------------------ */

const zipList = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' })
  .split('\n').filter(Boolean);

const entry = (name, role) => {
  const buf = fs.readFileSync(path.join(out, name));
  return { file: name, role, bytes: buf.length, sha256: sha256(buf) };
};

const manifest = {
  $manifest: 'dao-feng-shui-distribution',
  version: pkgJson.version,
  engineVersion: pkgJson.version,
  status: 'MVP / experimental — НЕ production-ready',
  productionReady: false,
  build: {
    deterministic: true,
    note: 'Одинаковое дерево исходников даёт одинаковые контрольные суммы. Время файлов в архиве фиксировано.',
    generator: 'tools/build-distribution.js',
    nodeRequired: '>=20',
    externalDependencies: 0
  },
  runtime: {
    backendRequired: false,
    networkRequired: false,
    note: 'Все подтверждённые расчёты выполняются на клиенте. Автономный HTML работает по file://.'
  },
  files: [
    entry('feng_shui_mvp.html', 'автономное приложение (один файл)'),
    entry('feng_shui_data.json', 'машиночитаемый пакет расчётных данных'),
    entry(ZIP_NAME, 'полный пакет исходников, тестов и документации'),
    entry('README.md', 'инструкция к поставке')
  ],
  dataPackage: {
    tableCount: DATA_FILES.length,
    tables: DATA_FILES
  },
  archive: {
    file: ZIP_NAME,
    rootDirectory: ZIP_ROOT,
    entryCount: zipList.length,
    includes: ['app/', 'src/', 'data/', 'algorithms/', 'tests/', 'docs/', 'tools/', 'README.md', 'LICENSE', 'package.json', 'index.html', 'START.txt']
  },
  downloads: {
    'btn-dl-app': { label: 'Скачать программу', file: 'feng_shui_mvp.html' },
    'btn-dl-json': { label: 'Скачать JSON', file: 'feng_shui_data.json' },
    'btn-dl-zip': { label: 'Скачать полный пакет', file: ZIP_NAME }
  },
  limitations: [
    'Весовая модель силы стихий и меридианов имеет статус INFERRED.',
    'Показатели с невосстановленным алгоритмом возвращают null.',
    'Расчёты меридианов не являются медицинской диагностикой.',
    'Референсные изображения недоступны: пиксельное соответствие не проверялось.'
  ],
  documentation: fs.readdirSync(path.join(root, 'docs')).filter((f) => /\.(md|txt)$/.test(f)).sort()
};

fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

/* ------------------------------------------------------------------ */

const kb = (n) => (n / 1024).toFixed(1) + ' КБ';
console.log('OK: distribution/');
for (const f of manifest.files) console.log(`  ${f.file.padEnd(22)} ${kb(f.bytes).padStart(10)}  ${f.sha256.slice(0, 12)}…`);
console.log(`  manifest.json          ${kb(fs.statSync(path.join(out, 'manifest.json')).size).padStart(10)}`);
console.log(`  архив: ${zipList.length} записей, корень ${ZIP_ROOT}/`);
console.log(`  ${rel(out)} готов`);
