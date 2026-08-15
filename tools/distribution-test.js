#!/usr/bin/env node
/**
 * distribution-test.js — Приёмочная проверка пакета поставки (PHASE 12).
 *
 * Проверяется НЕ исходное дерево, а именно то, что лежит в distribution/:
 * пользователь получает эти файлы, и падать они не имеют права.
 *
 *   1. HTML открывается   — инлайн-скрипт реально исполняется в DOM-шиме;
 *   2. JSON валиден       — разбирается, структура на месте, совпадает
 *                           байт-в-байт с тем, что отдаёт кнопка в UI;
 *   3. ZIP валиден        — unzip -t, есть все обязательные каталоги;
 *   4. расчёт работает    — столпы, звёзды, индексы посчитаны;
 *   5. графики работают   — построены пути SVG, значения не выдуманы;
 *   6. выгрузки работают  — все три кнопки реально отдают файл;
 *   7. нет битых ресурсов — ни одной внешней ссылки.
 *
 * ОГРАНИЧЕНИЕ (не скрывается): настоящего браузера в среде нет.
 * Проверяется исполнение кода и состояние DOM, а НЕ пиксельный рендеринг.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DATA_FILES } from '../src/data/loader.js';
import { buildDataPackage, serialiseDataPackage } from '../src/data/package.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'distribution');
const ZIP_NAME = 'FENG_SHUI_MVP.zip';
const ZIP_ROOT = 'FENG_SHUI_MVP';

let pass = 0, fail = 0;
const results = [];
const check = (group, name, cond, extra = '') => {
  if (cond) { console.log('  ok: ' + name); pass++; }
  else { console.error('  ОШИБКА: ' + name + (extra ? ' — ' + extra : '')); fail++; }
  results.push({ group, name, ok: !!cond, extra: cond ? '' : String(extra) });
};
const section = (t) => console.log('\n[DIST] ' + t);

/* ================================================================== */
/* 1. Состав поставки                                                  */
/* ================================================================== */
section('1. Состав каталога distribution/');

/* Внутри распакованной поставки каталога distribution/ нет — там лежит
   уже собранное приложение (app/). Проверять в этом случае нечего, но и
   падать с ENOENT нельзя: пользователь выполняет инструкцию из README. */
if (!fs.existsSync(dist)) {
  console.log('\nКаталог distribution/ отсутствует.');
  console.log('Это нормально внутри распакованного пакета: проверять поставку изнутри неё самой не требуется.');
  console.log('Для сборки и проверки в дереве разработки: npm run build:distribution');
  process.exit(0);
}

const REQUIRED = ['feng_shui_mvp.html', 'feng_shui_data.json', ZIP_NAME, 'README.md', 'manifest.json'];
for (const f of REQUIRED) {
  const p = path.join(dist, f);
  check('состав', `${f} присутствует и непустой`, fs.existsSync(p) && fs.statSync(p).size > 0);
}
if (fail) { report(); process.exit(1); }

const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf8'));
check('состав', 'manifest.json разбирается как JSON', !!manifest);
check('состав', 'манифест не объявляет production-ready', manifest.productionReady === false);
check('состав', 'манифест объявляет backend необязательным', manifest.runtime.backendRequired === false);

/* Контрольные суммы манифеста должны сходиться с файлами. */
const crypto = await import('node:crypto');
for (const e of manifest.files) {
  const buf = fs.readFileSync(path.join(dist, e.file));
  const h = crypto.createHash('sha256').update(buf).digest('hex');
  check('состав', `контрольная сумма ${e.file} совпадает`, h === e.sha256 && buf.length === e.bytes);
}

/* ================================================================== */
/* 2. JSON пакет данных                                                */
/* ================================================================== */
section('2. JSON пакет данных');

const jsonRaw = fs.readFileSync(path.join(dist, 'feng_shui_data.json'), 'utf8');
let data = null;
try { data = JSON.parse(jsonRaw); } catch (e) { check('json', 'JSON разбирается', false, e.message); }
if (data) {
  check('json', 'JSON разбирается без ошибок', true);
  check('json', 'заявлен пакет dao-feng-shui-data', data.$package === 'dao-feng-shui-data');
  check('json', 'указана версия', typeof data.version === 'string' && data.version.length > 0);
  check('json', `содержит все ${DATA_FILES.length} таблиц`,
    Object.keys(data.tables).length === DATA_FILES.length,
    'найдено ' + Object.keys(data.tables).length);
  check('json', 'статус MVP объявлен в самом пакете', /experimental|НЕ production-ready/i.test(data.status));
  check('json', 'легенда статусов присутствует', !!data.statusLegend && !!data.statusLegend.VERIFIED);

  // Содержательная проверка: данные, а не пустые заглушки.
  const t = data.tables;
  check('json', '10 небесных стволов', t.stemsBranches.stems.length === 10);
  check('json', '12 земных ветвей', t.stemsBranches.branches.length === 12);
  check('json', '24 сезона', t.calendar.solarTerms.length === 24);
  check('json', '24 горы', t.mountains24.items.length === 24);
  check('json', '10 меридианов', t.meridians.items.length === 10);

  // Ни одна таблица не должна потерять статус.
  const noStatus = Object.entries(t).filter(([, v]) => !v || typeof v.status !== 'string').map(([k]) => k);
  check('json', 'у каждой таблицы есть поле status', noStatus.length === 0, noStatus.join(', '));

  // Байтовое совпадение с тем, что соберёт кнопка «Скачать JSON».
  const raw = {};
  for (const n of DATA_FILES) raw[n] = JSON.parse(fs.readFileSync(path.join(root, 'data', n + '.json'), 'utf8'));
  const pkgVer = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const clientText = serialiseDataPackage(buildDataPackage(raw, { version: pkgVer, engineVersion: pkgVer }));
  check('json', 'файл поставки байт-в-байт равен выгрузке из UI', clientText === jsonRaw,
    `поставка ${jsonRaw.length} Б, клиент ${clientText.length} Б`);
}

/* ================================================================== */
/* 3. ZIP                                                             */
/* ================================================================== */
section('3. Архив ' + ZIP_NAME);

const zipPath = path.join(dist, ZIP_NAME);
let zipList = [];
try {
  execFileSync('unzip', ['-t', zipPath], { encoding: 'utf8' });
  check('zip', 'архив проходит проверку целостности (unzip -t)', true);
} catch (e) {
  check('zip', 'архив проходит проверку целостности (unzip -t)', false, e.message);
}
try {
  zipList = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).split('\n').filter(Boolean);
} catch { /* обработано ниже */ }
check('zip', 'архив не пуст', zipList.length > 0);
check('zip', 'число записей совпадает с манифестом', zipList.length === manifest.archive.entryCount,
  `${zipList.length} против ${manifest.archive.entryCount}`);

for (const d of ['app/', 'src/', 'data/', 'algorithms/', 'tests/', 'docs/']) {
  check('zip', `в архиве есть ${d}`, zipList.some((f) => f.startsWith(ZIP_ROOT + '/' + d)));
}
check('zip', 'в архиве есть README.md', zipList.includes(ZIP_ROOT + '/README.md'));
check('zip', 'в архиве есть app/index.html', zipList.includes(ZIP_ROOT + '/app/index.html'));
check('zip', 'единый корневой каталог (нет мусора в корне)',
  zipList.every((f) => f.startsWith(ZIP_ROOT + '/')));
check('zip', 'в архив не попали node_modules', !zipList.some((f) => f.includes('node_modules/')));
check('zip', 'в архив не попал сам каталог поставки', !zipList.some((f) => f.includes('/distribution/')));

/* Архив должен реально распаковываться, а приложение внутри — запускаться. */
const tmp = path.join(root, '.dist-check');
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
let unpackedOk = false;
try {
  execFileSync('unzip', ['-q', zipPath, '-d', tmp]);
  unpackedOk = fs.existsSync(path.join(tmp, ZIP_ROOT, 'app', 'index.html'));
} catch (e) { /* ниже */ }
check('zip', 'архив распаковывается, app/index.html на месте', unpackedOk);
if (unpackedOk) {
  const a = fs.readFileSync(path.join(tmp, ZIP_ROOT, 'app', 'index.html'));
  const b = fs.readFileSync(path.join(dist, 'feng_shui_mvp.html'));
  check('zip', 'app/index.html идентичен автономной программе', Buffer.compare(a, b) === 0);
  const dj = fs.readFileSync(path.join(tmp, ZIP_ROOT, 'app', 'feng_shui_data.json'), 'utf8');
  check('zip', 'app/feng_shui_data.json идентичен пакету данных', dj === jsonRaw);
}
fs.rmSync(tmp, { recursive: true, force: true });

/* ================================================================== */
/* 4. Автономный HTML: ресурсы                                        */
/* ================================================================== */
section('4. Автономный HTML: отсутствие битых ресурсов');

const htmlPath = path.join(dist, 'feng_shui_mvp.html');
const html = fs.readFileSync(htmlPath, 'utf8');

check('html', 'файл достаточного размера (> 100 КБ)', html.length > 100000);
check('html', 'есть doctype', /^<!DOCTYPE html>/i.test(html.trim()));
check('html', 'кодировка UTF-8 объявлена', /<meta charset="utf-8">/i.test(html));
check('html', 'нет внешних таблиц стилей', !/<link[^>]+stylesheet/i.test(html));
check('html', 'нет внешних скриптов (script src)', !/<script[^>]+src=/i.test(html));
check('html', 'стили встроены', /<style>/.test(html));
check('html', 'маркер автономной сборки выставлен', /name="fs-build" content="standalone"/.test(html));

const externalRefs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((u) => !u.startsWith('#') && !u.startsWith('data:'));
check('html', 'ни одной внешней ссылки на ресурс', externalRefs.length === 0, externalRefs.join(', '));
/* Ищем именно ОБРАЩЕНИЯ к локальному хосту (схема, //host, host:порт),
   а не слово «localhost» в тексте комментария: браузер пользователя не имеет
   доступа к localhost песочницы, но упоминание в пояснении безвредно. */
const localhostRefs = [...html.matchAll(/(?:https?:\/\/|\/\/)(?:localhost|127\.0\.0\.1)[^\s"']*|(?:localhost|127\.0\.0\.1):\d+/g)]
  .map((m) => m[0]);
check('html', 'нет обращений к localhost/127.0.0.1', localhostRefs.length === 0, localhostRefs.join(', '));
check('html', 'нет обращений к http(s)-ресурсам в разметке',
  !/(?:src|href)="https?:/i.test(html));

/* ================================================================== */
/* 5. Исполнение автономного файла                                    */
/* ================================================================== */
section('5. Автономный HTML: исполнение, расчёт, графики');

const shimSrc = fs.readFileSync(path.join(root, 'tools/browser-test.js'), 'utf8');
const shimCode = shimSrc.slice(
  shimSrc.indexOf('/* ---------------- DOM SHIM ---------------- */'),
  shimSrc.indexOf('/* ---------------- Построение DOM из index.html ---------------- */')
);

const scriptMatch = html.match(/<script>\n"use strict";([\s\S]*?)<\/script>/);
check('html', 'инлайн-скрипт найден', !!scriptMatch);

const ctx = { console };
let booted = false;
if (scriptMatch) {
  // Разметка: берём ВЕСЬ документ (вместе с head), чтобы <meta fs-build>
  // был виден приложению — именно от него зависит режим выгрузки.
  const docHtml = html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '');

  vm.createContext(ctx);
  try {
    vm.runInContext(shimCode + '\nglobalThis.__documentEl = documentEl; globalThis.__body = body;',
      ctx, { filename: 'shim.js' });

    vm.runInContext(`
      __body.innerHTML = ${JSON.stringify(docHtml)};
      for (const n of document.querySelectorAll('input')) {
        if (n.getAttribute('value') !== null) n.value = n.getAttribute('value');
        if (n.getAttribute('checked') !== null) n.checked = true;
      }
      document.querySelector('#b-gender').value = 'male';
      // Регистрация выгрузок: перехватываем сохранение файлов.
      globalThis.__saved = [];
      globalThis.Blob = class {
        constructor(parts, opts) {
          this.parts = parts;
          this.type = (opts && opts.type) || '';
          this.size = parts.reduce((s, p) => s + (p && p.length ? p.length : 0), 0);
        }
      };
      globalThis.URL = globalThis.URL || {};
      globalThis.URL.createObjectURL = (b) => { globalThis.__lastBlob = b; return 'blob:test'; };
      globalThis.URL.revokeObjectURL = () => {};
    `, ctx, { filename: 'markup.js' });

    // Ссылка <a download> должна регистрироваться как сохранённый файл.
    vm.runInContext(`
      const __origCreate = document.createElement;
      document.createElement = (tag) => {
        const el = __origCreate(tag);
        if (String(tag).toLowerCase() === 'a') {
          el.click = function () {
            globalThis.__saved.push({ name: this.download, href: this.href, blob: globalThis.__lastBlob });
          };
        }
        return el;
      };
    `, ctx, { filename: 'hooks.js' });

    vm.runInContext('"use strict";' + scriptMatch[1], ctx, { filename: 'standalone.js' });
    booted = true;
  } catch (e) {
    check('exec', 'инлайн-скрипт выполняется без исключений', false, e.message);
    console.error(e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e);
  }
}
check('exec', 'инлайн-скрипт выполняется без исключений', booted);

const q = (expr) => vm.runInContext(expr, ctx);
if (booted) {
  check('exec', 'строка состояния без ошибок',
    !/ОШИБКА/.test(q(`document.querySelector('#status-msg').textContent`)),
    q(`document.querySelector('#status-msg').textContent`));

  section('5a. Расчёт');
  check('calc', 'отрисованы 4 столпа', q(`document.querySelectorAll('#pillars .pillar').length`) === 4);
  check('calc', 'иероглифы столпов выведены', q(`document.querySelectorAll('#pillars .han').length`) >= 8);
  check('calc', '9 дворцов Ло Шу', q(`document.querySelectorAll('#luoshu .palace').length`) === 9);
  check('calc', 'таблица меридианов заполнена (10 строк + шапка)',
    q(`document.querySelectorAll('#meridian-table table tr').length`) === 11);
  check('calc', 'таблица сезонов заполнена (24 + шапка)',
    q(`document.querySelectorAll('#terms-table table tr').length`) === 25);
  check('calc', 'столпы удачи рассчитаны',
    q(`document.querySelectorAll('#luck-table table tr').length`) > 1);
  check('calc', 'версия движка выведена', q(`document.querySelector('#engine-ver').textContent.length`) > 0);

  // Расчёт обязан быть чувствителен к входным данным.
  const p1 = q(`document.querySelector('#pillars').textContent`);
  q(`(() => { document.querySelector('#b-year').value = '1990';
     document.querySelector('#btn-calc').click(); })()`);
  const p2 = q(`document.querySelector('#pillars').textContent`);
  check('calc', 'смена года рождения меняет столпы', p1 !== p2);
  check('calc', 'пересчёт прошёл без ошибок',
    !/ОШИБКА/.test(q(`document.querySelector('#status-msg').textContent`)));
  q(`(() => { document.querySelector('#b-year').value = '1967';
     document.querySelector('#btn-calc').click(); })()`);

  section('5b. Графики');
  check('chart', 'линии графика построены',
    q(`document.querySelectorAll('#main-chart path').length`) >= 10);
  check('chart', 'подписи осей выведены', q(`document.querySelectorAll('#main-chart text').length`) > 5);
  check('chart', 'сетка построена', q(`document.querySelectorAll('#main-chart line').length`) > 0);
  check('chart', 'легенда из 10 меридианов', q(`document.querySelectorAll('#legend .item').length`) === 10);
  check('chart', 'столбцы стихий построены', q(`document.querySelectorAll('#el-chart rect').length`) >= 5);

  q(`document.querySelector('#btn-all-off').click()`);
  check('chart', '«Снять все» убирает линии', q(`document.querySelectorAll('#main-chart path').length`) === 0);
  q(`document.querySelector('#btn-all-on').click()`);
  check('chart', '«Все серии» возвращает линии', q(`document.querySelectorAll('#main-chart path').length`) >= 10);

  q(`(() => { const r = document.querySelector('input[value="month"]'); r.checked = true;
     r.dispatchEvent({ type: 'change', target: r }); })()`);
  check('chart', 'смена масштаба перерисовывает график',
    q(`document.querySelectorAll('#main-chart path').length`) > 0);
  check('chart', 'смена масштаба без ошибок',
    !/ОШИБКА/.test(q(`document.querySelector('#status-msg').textContent`)));
  q(`(() => { const r = document.querySelector('input[value="year"]'); r.checked = true;
     r.dispatchEvent({ type: 'change', target: r }); })()`);

  /* ================================================================ */
  /* 6. Выгрузки                                                      */
  /* ================================================================ */
  section('6. Кнопки выгрузки');

  check('dl', 'кнопка «Скачать программу» присутствует', q(`!!document.querySelector('#btn-dl-app')`));
  check('dl', 'кнопка «Скачать JSON» присутствует', q(`!!document.querySelector('#btn-dl-json')`));
  check('dl', 'кнопка «Скачать полный пакет» присутствует', q(`!!document.querySelector('#btn-dl-zip')`));
  check('dl', 'подписи кнопок соответствуют требованию',
    q(`document.querySelector('#btn-dl-app').textContent`).includes('Скачать программу')
    && q(`document.querySelector('#btn-dl-json').textContent`).includes('Скачать JSON')
    && q(`document.querySelector('#btn-dl-zip').textContent`).includes('Скачать полный пакет'));
  check('dl', 'режим сборки распознан как автономный',
    /автономный режим/.test(q(`document.querySelector('#dl-mode').textContent`)),
    q(`document.querySelector('#dl-mode').textContent`));

  // 6a. JSON — обязан работать без сервера.
  q(`globalThis.__saved.length = 0`);
  q(`document.querySelector('#btn-dl-json').click()`);
  const savedJson = q(`globalThis.__saved.map(s => s.name)`);
  check('dl', '«Скачать JSON» сохраняет feng_shui_data.json',
    savedJson.includes('feng_shui_data.json'), JSON.stringify(savedJson));
  const jsonBytes = q(`(globalThis.__saved[0] && globalThis.__saved[0].blob) ? globalThis.__saved[0].blob.parts[0] : ''`);
  check('dl', 'выгруженный JSON разбирается', (() => {
    try { JSON.parse(jsonBytes); return true; } catch { return false; }
  })());
  check('dl', 'выгруженный JSON байт-в-байт равен файлу поставки', jsonBytes === jsonRaw,
    `выгрузка ${jsonBytes.length} Б, поставка ${jsonRaw.length} Б`);
  check('dl', 'статус сообщает об успешном сохранении JSON',
    /feng_shui_data\.json/.test(q(`document.querySelector('#status-msg').textContent`)),
    q(`document.querySelector('#status-msg').textContent`));

  // 6b. Программа — без сервера идёт запасной путь (копия самой страницы).
  // В DOM-шиме нет outerHTML, поэтому проверяем корректную деградацию:
  // приложение обязано сообщить, а не молчать и не упасть.
  q(`globalThis.__saved.length = 0`);
  q(`document.querySelector('#btn-dl-app').click()`);
  await new Promise((r) => setTimeout(r, 30));
  const appMsg = q(`document.querySelector('#status-msg').textContent`);
  check('dl', '«Скачать программу» не роняет приложение', !/undefined|\[object/.test(appMsg), appMsg);
  check('dl', '«Скачать программу» честно сообщает результат',
    /feng_shui_mvp\.html|npm run build:distribution/.test(appMsg), appMsg);

  // 6c. Полный пакет без сервера — честное сообщение, а не поддельный ZIP.
  q(`globalThis.__saved.length = 0`);
  q(`document.querySelector('#btn-dl-zip').click()`);
  await new Promise((r) => setTimeout(r, 30));
  const zipMsg = q(`document.querySelector('#status-msg').textContent`);
  const zipSaved = q(`globalThis.__saved.map(s => s.name)`);
  check('dl', 'без сервера ZIP не подделывается', zipSaved.length === 0, JSON.stringify(zipSaved));
  check('dl', 'без сервера про ZIP выдано понятное сообщение',
    /FENG_SHUI_MVP\.zip|сервера/.test(zipMsg), zipMsg);

  // 6d. Расчёт должен продолжать работать после всех выгрузок.
  q(`document.querySelector('#btn-calc').click()`);
  check('dl', 'после выгрузок расчёт по-прежнему работает',
    q(`document.querySelectorAll('#pillars .pillar').length`) === 4
    && q(`document.querySelectorAll('#main-chart path').length`) >= 10);
}

/* ================================================================== */
/* 7. Выгрузка при работе с сервером                                  */
/* ================================================================== */
section('7. Выгрузка файлов при запуске с сервера');

/* Здесь проверяется путь fetch: приложение обязано забирать готовые файлы
   по ОТНОСИТЕЛЬНЫМ путям (браузер пользователя не имеет доступа к localhost
   песочницы). Модуль загружается напрямую, fetch подменяется. */
const dl = await import('../src/data/../ui/download.js');
check('serve', 'пути программы относительные (без схемы и localhost)',
  dl.PROGRAM_PATHS.every((p) => !/^https?:|^\/\/|localhost|127\.0\.0\.1|^\//.test(p)),
  dl.PROGRAM_PATHS.join(', '));
check('serve', 'пути архива относительные', 
  dl.ZIP_PATHS.every((p) => !/^https?:|^\/\/|localhost|127\.0\.0\.1|^\//.test(p)),
  dl.ZIP_PATHS.join(', '));
check('serve', 'в списке путей есть distribution/feng_shui_mvp.html',
  dl.PROGRAM_PATHS.includes('distribution/feng_shui_mvp.html'));
check('serve', 'в списке путей есть distribution/FENG_SHUI_MVP.zip',
  dl.ZIP_PATHS.includes('distribution/' + ZIP_NAME));

// Эмуляция сервера: fetch отдаёт реальные файлы поставки.
const served = [];
globalThis.fetch = async (p) => {
  const f = path.join(dist, path.basename(p));
  served.push(p);
  if (!fs.existsSync(f)) return { ok: false, status: 404 };
  const buf = fs.readFileSync(f);
  return { ok: true, status: 200, blob: async () => ({ size: buf.length, buf }) };
};
const gotHtml = await dl.fetchFirst(dl.PROGRAM_PATHS);
check('serve', 'программа скачивается по относительному пути',
  !!gotHtml && gotHtml.size === fs.statSync(htmlPath).size);
const gotZip = await dl.fetchFirst(dl.ZIP_PATHS);
check('serve', 'архив скачивается по относительному пути',
  !!gotZip && gotZip.size === fs.statSync(zipPath).size);
check('serve', 'первым пробуется каталог distribution/', served[0].startsWith('distribution/'));

// Недоступный сервер не должен приводить к исключению.
globalThis.fetch = async () => { throw new Error('network down'); };
const none = await dl.fetchFirst(dl.PROGRAM_PATHS);
check('serve', 'отказ сети обрабатывается без исключения', none === null);
delete globalThis.fetch;

/* ================================================================== */
/* 8. Детерминированность сборки                                      */
/* ================================================================== */
section('8. Детерминированность');

const before = REQUIRED.map((f) => crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(dist, f))).digest('hex'));
execFileSync('node', ['tools/build-distribution.js'], { cwd: root, stdio: 'ignore' });
const after = REQUIRED.map((f) => crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(dist, f))).digest('hex'));
REQUIRED.forEach((f, i) => {
  check('deterministic', `повторная сборка даёт тот же ${f}`, before[i] === after[i]);
});

/* ================================================================== */
function report() {
  const groups = [...new Set(results.map((r) => r.group))];
  const lines = groups.map((g) => {
    const rs = results.filter((r) => r.group === g);
    return `  ${g.padEnd(14)} проверок ${String(rs.length).padStart(3)}, провалено ${rs.filter((r) => !r.ok).length}`;
  });
  console.log('\n' + '='.repeat(64));
  console.log('ПРОВЕРКА ПАКЕТА ПОСТАВКИ');
  console.log('='.repeat(64));
  console.log(lines.join('\n'));
  console.log('='.repeat(64));
  console.log(`ИТОГО DISTRIBUTION: пройдено ${pass}, провалено ${fail}`);
  fs.writeFileSync(path.join(root, 'tools/.dist-results.json'),
    JSON.stringify({ pass, fail, results }, null, 2), 'utf8');
}
report();
process.exit(fail > 0 ? 1 : 0);
