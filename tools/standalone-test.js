#!/usr/bin/env node
/**
 * standalone-test.js — проверка, что автономный HTML действительно исполняется.
 * Извлекает инлайн-скрипт из dist/fengshui-standalone.html и запускает его
 * в том же DOM-шиме, что и browser-test.js.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (n, c, e = '') => {
  if (c) { console.log('  ok: ' + n); pass++; }
  else { console.error('  ОШИБКА: ' + n + (e ? ' — ' + e : '')); fail++; }
};

// Переиспользуем DOM-шим из browser-test через отдельный процесс невозможно,
// поэтому подключаем его как модуль-побочный эффект.
const shim = fs.readFileSync(path.join(root, 'tools/browser-test.js'), 'utf8');
const shimCode = shim.slice(
  shim.indexOf('/* ---------------- DOM SHIM ---------------- */'),
  shim.indexOf('/* ---------------- Построение DOM из index.html ---------------- */')
);

const file = path.join(root, 'dist/fengshui-standalone.html');
const html = fs.readFileSync(file, 'utf8');

console.log('\n[STANDALONE] Структура файла');
check('файл существует и непустой', html.length > 50000);
check('нет внешних <link rel=stylesheet>', !/<link[^>]+stylesheet/.test(html));
check('нет внешних <script src>', !/<script[^>]+src=/.test(html));
check('стили инлайн', /<style>/.test(html));
check('данные инлайн (таблицы)', /Небесных стволов|Ten Heavenly Stems|stems/.test(html));

const scriptMatch = html.match(/<script>\n"use strict";([\s\S]*?)<\/script>/);
check('инлайн-скрипт найден', !!scriptMatch);
if (!scriptMatch) { console.log(`\nИТОГО STANDALONE: пройдено ${pass}, провалено ${fail}`); process.exit(1); }

const bodyHtml = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script[\s\S]*?<\/script>/g, '');

console.log('\n[STANDALONE] Исполнение инлайн-скрипта');
const ctx = { console };
vm.createContext(ctx);
try {
  // 1. DOM-шим
  vm.runInContext(shimCode + `
    globalThis.__documentEl = documentEl;
    globalThis.__body = body;
  `, ctx, { filename: 'shim.js' });

  // 2. Разметка
  vm.runInContext(`
    __body.innerHTML = ${JSON.stringify(bodyHtml)};
    for (const n of document.querySelectorAll('input')) {
      if (n.getAttribute('value') !== null) n.value = n.getAttribute('value');
      if (n.getAttribute('checked') !== null) n.checked = true;
    }
    document.querySelector('#b-gender').value = 'male';
  `, ctx, { filename: 'markup.js' });

  check('разметка построена, #app найден',
    vm.runInContext(`!!document.querySelector('#app')`, ctx));

  // 3. Собственно автономный скрипт
  vm.runInContext('"use strict";' + scriptMatch[1], ctx, { filename: 'standalone.js' });
  check('инлайн-скрипт выполнен без исключений', true);
} catch (e) {
  check('инлайн-скрипт выполнен без исключений', false, e.message);
  console.error(e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e);
  console.log(`\nИТОГО STANDALONE: пройдено ${pass}, провалено ${fail}`);
  process.exit(1);
}

console.log('\n[STANDALONE] Результат работы');
const q = (expr) => vm.runInContext(expr, ctx);
check('статус без ошибок', !/ОШИБКА/.test(q(`document.querySelector('#status-msg').textContent`)),
  q(`document.querySelector('#status-msg').textContent`));
check('отрисованы 4 столпа', q(`document.querySelectorAll('#pillars .pillar').length`) === 4);
check('график построен', q(`document.querySelectorAll('#main-chart path').length`) >= 12);
check('9 дворцов Ло Шу', q(`document.querySelectorAll('#luoshu .palace').length`) === 9);
check('легенда из 12 меридианов', q(`document.querySelectorAll('#legend .item').length`) === 12);
check('таблица меридианов заполнена', q(`document.querySelectorAll('#meridian-table table tr').length`) === 13);
check('таблица сезонов заполнена', q(`document.querySelectorAll('#terms-table table tr').length`) === 25);
check('версия движка выведена', q(`document.querySelector('#engine-ver').textContent.length`) > 0);

console.log('\n[STANDALONE] Интерактивность в автономной сборке');
q(`document.querySelector('#btn-all-off').click()`);
check('«Снять все» работает', q(`document.querySelectorAll('#main-chart path').length`) === 0);
q(`document.querySelector('#btn-all-on').click()`);
check('«Все серии» работает', q(`document.querySelectorAll('#main-chart path').length`) >= 12);

q(`(() => { const r = document.querySelector('input[value="month"]'); r.checked = true;
   r.dispatchEvent({type:'change', target:r}); })()`);
check('переключение масштаба работает',
  !/ОШИБКА/.test(q(`document.querySelector('#status-msg').textContent`)));
check('график перерисован после смены масштаба',
  q(`document.querySelectorAll('#main-chart path').length`) > 0);

q(`(() => { document.querySelector('#b-year').value='1990';
   document.querySelector('#btn-calc').click(); })()`);
check('пересчёт по кнопке работает',
  !/ОШИБКА/.test(q(`document.querySelector('#status-msg').textContent`)));

console.log(`\nИТОГО STANDALONE: пройдено ${pass}, провалено ${fail}`);
process.exit(fail > 0 ? 1 : 0);
