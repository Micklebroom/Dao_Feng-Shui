#!/usr/bin/env node
/**
 * deploy-verify.mjs — Проверка РАЗВЁРНУТОГО экземпляра (PHASE 13).
 *
 * Отличие от distribution-test.js: там проверялись файлы на диске, здесь —
 * то, что реально отдаёт работающий сервер по HTTP, с заголовками Host и
 * Origin публичного превью. Приложение собирается из СКАЧАННЫХ по сети
 * ресурсов, а не из локальных файлов: так ловятся расхождения, которые
 * появляются именно при развёртывании.
 *
 * Пункты задания: 1 URL, 2 startup, 3 inputs, 4 calculation, 5 graphs,
 * 6 downloads, 7 JSON, 8 direct URL, 9 refresh.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = process.env.PREVIEW_HOST || '8080-i29gopuiz5sxqhtt34kr9.e2b.app';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080';
const HEAD = { Host: HOST, Origin: `https://${HOST}`, Referer: `https://${HOST}/` };

let pass = 0, fail = 0;
const results = [];
const check = (group, name, cond, extra = '') => {
  if (cond) { console.log('  ok: ' + name); pass++; }
  else { console.error('  ОШИБКА: ' + name + (extra ? ' — ' + extra : '')); fail++; }
  results.push({ group, name, ok: !!cond, extra: cond ? '' : String(extra) });
};
const section = (t) => console.log('\n[DEPLOY] ' + t);
const get = (p) => fetch(new URL(p, BASE), { headers: HEAD });

/* ------------------------------------------------------------------ */
section('1-2. LIVE URL и запуск');

const idx = await get('/');
check('startup', 'корневой URL отвечает 200', idx.status === 200);
check('startup', 'отдаётся HTML в UTF-8',
  (idx.headers.get('content-type') || '').includes('text/html'));
const indexHtml = await idx.text();
check('startup', 'разметка приложения получена', indexHtml.includes('id="app"'));
check('startup', 'превью не блокируется X-Frame-Options', !idx.headers.get('x-frame-options'));
check('startup', 'нет CSP, запрещающего встраивание',
  !/frame-ancestors/i.test(idx.headers.get('content-security-policy') || ''));

/* Браузер пользователя НЕ имеет доступа к localhost песочницы. */
check('startup', 'в разметке нет обращений к localhost/127.0.0.1',
  !/(?:https?:\/\/|\/\/)(?:localhost|127\.0\.0\.1)/.test(indexHtml));
check('startup', 'все ресурсы подключены относительными путями',
  [...indexHtml.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1]).filter((u) => !u.startsWith('#') && !u.startsWith('data:'))
    .every((u) => !/^https?:|^\/\//.test(u)));

/* ------------------------------------------------------------------ */
section('3. Поля ввода');

const REQUIRED_INPUTS = ['b-day', 'b-month', 'b-year', 'b-hour', 'b-min', 'b-tz',
  'b-gender', 'b-place', 'b-lon', 'b-lat', 'f-year', 'f-deg', 's-from', 's-count'];
for (const id of REQUIRED_INPUTS) {
  check('inputs', `поле #${id} присутствует`, indexHtml.includes(`id="${id}"`));
}
check('inputs', 'переключатели масштаба на месте',
  ['decade', 'year', 'month', 'day', 'hour'].every((v) => indexHtml.includes(`name="scale" value="${v}"`)));
check('inputs', 'кнопки выгрузки на месте',
  ['btn-dl-app', 'btn-dl-json', 'btn-dl-zip'].every((id) => indexHtml.includes(`id="${id}"`)));

/* ------------------------------------------------------------------ */
section('4-5. Расчёт и графики в развёрнутом приложении');

/* Загружаем граф модулей ПО СЕТИ и исполняем в DOM-шиме. */
const shimSrc = fs.readFileSync(path.join(root, 'tools/browser-test.js'), 'utf8');
const shimCode = shimSrc.slice(
  shimSrc.indexOf('/* ---------------- DOM SHIM ---------------- */'),
  shimSrc.indexOf('/* ---------------- Построение DOM из index.html ---------------- */')
);

const modules = new Map();
const fetchModule = async (rel) => {
  if (modules.has(rel)) return;
  const r = await get('/' + rel);
  if (!r.ok) { modules.set(rel, null); return; }
  const text = await r.text();
  modules.set(rel, text);
  for (const m of text.matchAll(/from\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    let p = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
    if (!/\.js$/.test(p)) p += '.js';
    await fetchModule(p);
  }
};
await fetchModule('src/ui/app.js');
const broken = [...modules.entries()].filter(([, v]) => v === null).map(([k]) => k);
check('calc', `все модули скачаны по сети (${modules.size})`, broken.length === 0, broken.join(', '));

/* Топологический порядок и склейка в один скрипт (как делает сборщик). */
const order = [];
const seen = new Set();
const visit = (rel) => {
  if (seen.has(rel)) return;
  seen.add(rel);
  const src = modules.get(rel) || '';
  for (const m of src.matchAll(/from\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    let p = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
    if (!/\.js$/.test(p)) p += '.js';
    visit(p);
  }
  order.push(rel);
};
visit('src/ui/app.js');

const transform = (rel) => {
  let src = modules.get(rel);
  const names = [];
  src = src.replace(/^\s*import\s+([\s\S]*?)\s+from\s*['"]([^'"]+)['"]\s*;?/gm, (f, clause, spec) => {
    let p = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
    if (!/\.js$/.test(p)) p += '.js';
    clause = clause.trim();
    const out = [];
    const def = clause.match(/^([A-Za-z_$][\w$]*)\s*(?:,|$)/);
    if (def && !clause.startsWith('{') && !clause.startsWith('*')) out.push(`const ${def[1]} = __M[${JSON.stringify(p)}].default;`);
    const named = clause.match(/\{([\s\S]*)\}/);
    if (named) {
      const list = named[1].split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
        const as = s.split(/\s+as\s+/).map((x) => x.trim());
        return as.length === 2 ? `${as[0]}: ${as[1]}` : as[0];
      });
      if (list.length) out.push(`const { ${list.join(', ')} } = __M[${JSON.stringify(p)}];`);
    }
    return out.join('\n');
  });
  // export * from './x.js' — реэкспорт целого модуля (есть в engine/index.js).
  src = src.replace(/^\s*export\s+\*\s+from\s*['"]([^'"]+)['"]\s*;?/gm, (f, spec) => {
    let p = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
    if (!/\.js$/.test(p)) p += '.js';
    return `Object.assign(__E, __M[${JSON.stringify(p)}]);`;
  });
  // export { a, b as c }
  const reexports = [];
  src = src.replace(/^\s*export\s*\{([^}]*)\}\s*;?/gm, (f, list) => {
    list.split(',').map((s) => s.trim()).filter(Boolean).forEach((n) => {
      const as = n.split(/\s+as\s+/).map((x) => x.trim());
      reexports.push([as[1] || as[0], as[0]]);
    });
    return '';
  });
  src = src.replace(/^\s*export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/gm, (f, k, n) => { names.push(n); return `${k} ${n}`; });
  src = src.replace(/^\s*export\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)/gm, (f, a, n) => { names.push(n); return `${a || ''}function ${n}`; });
  src = src.replace(/^\s*export\s+class\s+([A-Za-z_$][\w$]*)/gm, (f, n) => { names.push(n); return `class ${n}`; });
  src = src.replace(/^\s*export\s+default\s+/gm, 'const __default = ');
  const hasDef = /const __default = /.test(src);
  return `__M[${JSON.stringify(rel)}] = (function(){\nconst __E = {};\n${src}\n`
    + names.map((n) => `__E[${JSON.stringify(n)}] = ${n};`).join('\n') + '\n'
    + reexports.map(([ext, loc]) => `__E[${JSON.stringify(ext)}] = ${loc};`).join('\n')
    + (hasDef ? '\n__E["default"] = __default;' : '') + '\nreturn __E;\n})();';
};

const bodyHtml = indexHtml.slice(indexHtml.indexOf('<body>') + 6, indexHtml.indexOf('</body>'))
  .replace(/<script[\s\S]*?<\/script>/g, '');

const ctx = { console };
vm.createContext(ctx);
let booted = false;
try {
  vm.runInContext(shimCode + '\nglobalThis.__documentEl = documentEl; globalThis.__body = body;', ctx, { filename: 'shim.js' });
  vm.runInContext(`
    __body.innerHTML = ${JSON.stringify(bodyHtml)};
    for (const n of document.querySelectorAll('input')) {
      if (n.getAttribute('value') !== null) n.value = n.getAttribute('value');
      if (n.getAttribute('checked') !== null) n.checked = true;
    }
    document.querySelector('#b-gender').value = 'male';
    globalThis.__saved = [];
    globalThis.Blob = class {
      constructor(parts, opts) { this.parts = parts; this.type = (opts && opts.type) || '';
        this.size = parts.reduce((s, p) => s + (p && p.length ? p.length : 0), 0); }
    };
    globalThis.URL = globalThis.URL || {};
    globalThis.URL.createObjectURL = (b) => { globalThis.__lastBlob = b; return 'blob:test'; };
    globalThis.URL.revokeObjectURL = () => {};
    const __c = document.createElement;
    document.createElement = (t) => { const el = __c(t);
      if (String(t).toLowerCase() === 'a') el.click = function () {
        globalThis.__saved.push({ name: this.download, blob: globalThis.__lastBlob }); };
      return el; };
  `, ctx, { filename: 'markup.js' });
  // Настоящий fetch развёрнутого сервера — как в браузере, по относительному пути.
  ctx.fetch = (p, o) => fetch(new URL(p, BASE), { ...o, headers: HEAD });
  vm.runInContext('"use strict";const __M = {};\n' + order.map(transform).join('\n\n'), ctx, { filename: 'app.js' });
  booted = true;
} catch (e) {
  check('calc', 'приложение стартует из скачанных модулей', false, e.message);
  console.error(e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : e);
}
check('calc', 'приложение стартует из скачанных модулей', booted);

const q = (e) => vm.runInContext(e, ctx);
if (booted) {
  check('calc', 'нет ошибок в строке состояния',
    !/ОШИБКА/.test(q(`document.querySelector('#status-msg').textContent`)),
    q(`document.querySelector('#status-msg').textContent`));
  check('calc', '4 столпа рассчитаны', q(`document.querySelectorAll('#pillars .pillar').length`) === 4);
  check('calc', '9 дворцов Ло Шу', q(`document.querySelectorAll('#luoshu .palace').length`) === 9);
  check('calc', 'таблица меридианов (10+шапка)', q(`document.querySelectorAll('#meridian-table table tr').length`) === 11);
  check('calc', 'таблица сезонов (24+шапка)', q(`document.querySelectorAll('#terms-table table tr').length`) === 25);
  check('calc', 'столпы удачи рассчитаны', q(`document.querySelectorAll('#luck-table table tr').length`) > 1);

  /* Контрольное значение: развёрнутый экземпляр обязан считать так же. */
  const p1 = q(`document.querySelector('#pillars').textContent`);
  q(`(() => { document.querySelector('#b-year').value='1990'; document.querySelector('#btn-calc').click(); })()`);
  check('calc', 'ввод влияет на результат', q(`document.querySelector('#pillars').textContent`) !== p1);
  q(`(() => { document.querySelector('#b-year').value='1967'; document.querySelector('#btn-calc').click(); })()`);
  check('calc', 'возврат к исходным данным даёт исходный результат',
    q(`document.querySelector('#pillars').textContent`) === p1);

  check('graphs', 'линии графика построены', q(`document.querySelectorAll('#main-chart path').length`) >= 10);
  check('graphs', 'подписи осей', q(`document.querySelectorAll('#main-chart text').length`) > 5);
  check('graphs', 'сетка', q(`document.querySelectorAll('#main-chart line').length`) > 0);
  check('graphs', 'легенда 10 меридианов', q(`document.querySelectorAll('#legend .item').length`) === 10);
  check('graphs', 'столбцы стихий', q(`document.querySelectorAll('#el-chart rect').length`) >= 5);
  q(`document.querySelector('#btn-all-off').click()`);
  check('graphs', '«Снять все» работает', q(`document.querySelectorAll('#main-chart path').length`) === 0);
  q(`document.querySelector('#btn-all-on').click()`);
  check('graphs', '«Все серии» работает', q(`document.querySelectorAll('#main-chart path').length`) >= 10);
  for (const s of ['decade', 'month', 'day', 'hour', 'year']) {
    q(`(() => { const r = document.querySelector('input[value="${s}"]'); r.checked = true;
       r.dispatchEvent({type:'change', target:r}); })()`);
    check('graphs', `масштаб «${s}» строится без ошибок`,
      q(`document.querySelectorAll('#main-chart path').length`) > 0
      && !/ОШИБКА/.test(q(`document.querySelector('#status-msg').textContent`)));
  }

  /* ---------------------------------------------------------------- */
  section('6. Выгрузки с развёрнутого сервера');

  check('downloads', 'режим распознан как «с сервера»',
    /с сервера/.test(q(`document.querySelector('#dl-mode').textContent`)),
    q(`document.querySelector('#dl-mode').textContent`));

  q(`globalThis.__saved.length = 0`);
  q(`document.querySelector('#btn-dl-json').click()`);
  await new Promise((r) => setTimeout(r, 50));
  check('downloads', '«Скачать JSON» отдаёт feng_shui_data.json',
    q(`globalThis.__saved.map(s=>s.name)`).includes('feng_shui_data.json'));

  q(`globalThis.__saved.length = 0`);
  q(`document.querySelector('#btn-dl-app').click()`);
  await new Promise((r) => setTimeout(r, 400));
  const appSaved = q(`globalThis.__saved.map(s=>s.name)`);
  check('downloads', '«Скачать программу» отдаёт feng_shui_mvp.html',
    appSaved.includes('feng_shui_mvp.html'), JSON.stringify(appSaved) + ' | ' + q(`document.querySelector('#status-msg').textContent`));

  q(`globalThis.__saved.length = 0`);
  q(`document.querySelector('#btn-dl-zip').click()`);
  await new Promise((r) => setTimeout(r, 800));
  const zipSaved = q(`globalThis.__saved.map(s=>s.name)`);
  check('downloads', '«Скачать полный пакет» отдаёт FENG_SHUI_MVP.zip',
    zipSaved.includes('FENG_SHUI_MVP.zip'), JSON.stringify(zipSaved) + ' | ' + q(`document.querySelector('#status-msg').textContent`));

  check('downloads', 'после выгрузок расчёт продолжает работать',
    q(`document.querySelectorAll('#pillars .pillar').length`) === 4
    && q(`document.querySelectorAll('#main-chart path').length`) >= 10);
}

/* ------------------------------------------------------------------ */
section('7. JSON с развёрнутого сервера');

const jr = await get('/distribution/feng_shui_data.json');
check('json', 'JSON отдаётся 200', jr.status === 200);
check('json', 'тип содержимого application/json',
  (jr.headers.get('content-type') || '').includes('application/json'));
const jtext = await jr.text();
let jdata = null;
try { jdata = JSON.parse(jtext); } catch (e) { check('json', 'JSON разбирается', false, e.message); }
if (jdata) {
  check('json', 'JSON разбирается', true);
  check('json', '12 таблиц данных', Object.keys(jdata.tables).length === 12);
  check('json', 'статус MVP объявлен', /experimental|НЕ production-ready/i.test(jdata.status));
  check('json', 'совпадает с файлом поставки',
    jtext === fs.readFileSync(path.join(root, 'distribution/feng_shui_data.json'), 'utf8'));
}

/* ------------------------------------------------------------------ */
section('8-9. Прямой доступ по URL и обновление страницы');

for (const p of ['/index.html', '/distribution/feng_shui_mvp.html', '/distribution/FENG_SHUI_MVP.zip',
  '/distribution/manifest.json', '/data/bundle.json', '/src/ui/download.js']) {
  const r = await get(p);
  check('direct', `прямой доступ ${p}`, r.status === 200, 'код ' + r.status);
}
const r404 = await get('/nope-not-here');
check('direct', 'несуществующий путь даёт 404', r404.status === 404);

const sizes = [];
for (let i = 0; i < 3; i++) { const r = await get('/'); sizes.push((await r.text()).length); }
check('refresh', 'обновление страницы стабильно (одинаковый размер)',
  sizes.every((s) => s === sizes[0]), sizes.join(', '));

const zr = await get('/distribution/FENG_SHUI_MVP.zip');
const zbuf = Buffer.from(await zr.arrayBuffer());
check('refresh', 'архив по сети совпадает с файлом на диске',
  Buffer.compare(zbuf, fs.readFileSync(path.join(root, 'distribution/FENG_SHUI_MVP.zip'))) === 0);
check('refresh', 'архив начинается с сигнатуры PK', zbuf[0] === 0x50 && zbuf[1] === 0x4b);

/* ------------------------------------------------------------------ */
const groups = [...new Set(results.map((r) => r.group))];
console.log('\n' + '='.repeat(64));
console.log('ПРОВЕРКА РАЗВЁРНУТОГО ЭКЗЕМПЛЯРА');
console.log('='.repeat(64));
for (const g of groups) {
  const rs = results.filter((r) => r.group === g);
  console.log(`  ${g.padEnd(12)} проверок ${String(rs.length).padStart(3)}, провалено ${rs.filter((r) => !r.ok).length}`);
}
console.log('='.repeat(64));
console.log(`ИТОГО DEPLOY: пройдено ${pass}, провалено ${fail}`);
fs.writeFileSync(path.join(root, 'tools/.deploy-results.json'),
  JSON.stringify({ host: HOST, pass, fail, results }, null, 2), 'utf8');
process.exit(fail > 0 ? 1 : 0);
