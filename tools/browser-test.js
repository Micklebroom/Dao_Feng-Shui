#!/usr/bin/env node
/**
 * browser-test.js — BROWSER TESTS.
 *
 * В песочнице отсутствует бинарник браузера (проверено: chromium/firefox не
 * установлены, сеть для npm-загрузки Playwright недоступна). Поэтому здесь
 * реализован минимальный DOM/SVG-шим, на котором РЕАЛЬНО исполняются
 * src/ui/app.js и src/chart/chart.js — то есть проверяется не «компилируется
 * ли код», а то, что интерфейс строится, графики рисуются и события работают.
 *
 * ЧЕСТНОЕ ОГРАНИЧЕНИЕ: это не заменяет прогон в настоящем браузере
 * (нет layout, шрифтов, реального рендеринга). См. docs/TESTING.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { console.log('  ok: ' + name); pass++; }
  else { console.error('  ОШИБКА: ' + name + (extra ? ' — ' + extra : '')); fail++; }
};

/* ---------------- DOM SHIM ---------------- */
class ClassList {
  constructor(el) { this.el = el; this.set = new Set(); }
  add(...c) { c.forEach((x) => x && this.set.add(x)); }
  remove(...c) { c.forEach((x) => this.set.delete(x)); }
  toggle(c, f) { if (f === undefined) f = !this.set.has(c); if (f) this.set.add(c); else this.set.delete(c); return f; }
  contains(c) { return this.set.has(c); }
  get value() { return [...this.set].join(' '); }
}

class Node {
  constructor(tag, ns = null) {
    this.tagName = String(tag).toUpperCase();
    this.localName = String(tag);
    this.namespaceURI = ns;
    this.children = [];
    this.childNodes = this.children;
    this.attributes = {};
    this.style = {};
    this.dataset = {};
    this.listeners = {};
    this.parentElement = null;
    this._text = '';
    this.classList = new ClassList(this);
    this.value = '';
    this.checked = false;
    this.clientWidth = 900;
    this.clientHeight = 260;
  }
  get className() { return this.classList.value; }
  set className(v) { this.classList.set = new Set(String(v).split(/\s+/).filter(Boolean)); }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === 'class') this.className = v;
    if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v);
    if (k === 'id') this.id = v;
  }
  getAttribute(k) { return this.attributes[k] ?? null; }
  removeAttribute(k) { delete this.attributes[k]; }
  appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; }
  get firstChild() { return this.children[0] || null; }
  set textContent(v) { this._text = String(v); this.children.length = 0; }
  get textContent() {
    return this._text + this.children.map((c) => c.textContent).join('');
  }
  set innerHTML(html) {
    this.children.length = 0; this._text = '';
    this._html = String(html);
    parseInto(this, String(html));
  }
  get innerHTML() { return this._html || ''; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter((f) => f !== fn); }
  dispatchEvent(ev) { (this.listeners[ev.type] || []).forEach((f) => f.call(this, ev)); return true; }
  click() { this.dispatchEvent({ type: 'click', target: this }); }
  closest(sel) {
    let n = this;
    while (n) { if (matches(n, sel)) return n; n = n.parentElement; }
    return null;
  }
  querySelector(sel) { return queryAll(this, sel)[0] || null; }
  querySelectorAll(sel) { return queryAll(this, sel); }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; }
  showModal() { this._open = true; }
  close() { this._open = false; }
}

// Очень простой парсер тегов для innerHTML (достаточно для наших шаблонов).
function parseInto(parent, html) {
  // Атрибуты могут быть как со значением, так и без него (checked, disabled).
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
  let stack = [parent], last = 0, m;
  while ((m = re.exec(html))) {
    const text = html.slice(last, m.index);
    if (text.trim()) stack[stack.length - 1]._text += text;
    last = re.lastIndex;
    const [, closing, tag, attrs, selfClose] = m;
    if (closing) { if (stack.length > 1) stack.pop(); continue; }
    const node = new Node(tag);
    const ar = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let a;
    while ((a = ar.exec(attrs))) {
      if (!a[1]) continue;
      node.setAttribute(a[1], a[2] ?? a[3] ?? a[4] ?? a[1]);
    }
    stack[stack.length - 1].appendChild(node);
    const VOID = ['input', 'br', 'hr', 'img', 'meta', 'link'];
    if (!selfClose && !VOID.includes(tag.toLowerCase())) stack.push(node);
  }
  const tail = html.slice(last);
  if (tail.trim()) stack[stack.length - 1]._text += tail;
}

function matches(node, sel) {
  sel = sel.trim();
  if (sel.startsWith('#')) return node.id === sel.slice(1);
  if (sel.startsWith('.')) return node.classList.contains(sel.slice(1));
  const attr = sel.match(/^(\w*)\[([\w-]+)="([^"]*)"\]$/);
  if (attr) {
    const [, tag, k, v] = attr;
    return (!tag || node.localName === tag) && node.getAttribute(k) === v;
  }
  const tagCls = sel.match(/^(\w+)\.([\w-]+)$/);
  if (tagCls) return node.localName === tagCls[1] && node.classList.contains(tagCls[2]);
  return node.localName === sel.toLowerCase();
}

function queryAll(rootNode, sel) {
  const parts = sel.split(',').map((s) => s.trim());
  const out = [];
  const walk = (n) => {
    for (const c of n.children) {
      for (const p of parts) {
        const seq = p.split(/\s+/);
        if (seq.length === 1) { if (matches(c, seq[0])) { out.push(c); break; } }
        else {
          if (matches(c, seq[seq.length - 1])) {
            let ok = true, cur = c.parentElement, i = seq.length - 2;
            while (i >= 0) {
              let found = false;
              while (cur) { if (matches(cur, seq[i])) { found = true; cur = cur.parentElement; break; } cur = cur.parentElement; }
              if (!found) { ok = false; break; }
              i--;
            }
            if (ok) { out.push(c); break; }
          }
        }
      }
      walk(c);
    }
  };
  walk(rootNode);
  return out;
}

const documentEl = new Node('html');
const body = new Node('body');
documentEl.appendChild(body);

globalThis.document = {
  documentElement: documentEl,
  body,
  readyState: 'complete',
  createElement: (t) => new Node(t),
  createElementNS: (ns, t) => new Node(t, ns),
  querySelector: (s) => queryAll(documentEl, s)[0] || null,
  querySelectorAll: (s) => queryAll(documentEl, s),
  addEventListener: () => {},
  getElementById: (id) => queryAll(documentEl, '#' + id)[0] || null
};
globalThis.window = {
  innerWidth: 1400, innerHeight: 900,
  addEventListener: () => {},
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }
};
globalThis.performance = { now: () => Date.now() };
globalThis.Blob = class { constructor(p) { this.parts = p; this.size = String(p[0]).length; } };
if (typeof globalThis.URL === 'undefined') globalThis.URL = {};
globalThis.URL.createObjectURL = () => 'blob:x';
globalThis.URL.revokeObjectURL = () => {};

/* ---------------- Построение DOM из index.html ---------------- */
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const bodyHtml = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
body.innerHTML = bodyHtml.replace(/<script[\s\S]*?<\/script>/g, '');

console.log('\n[BROWSER] Разбор index.html');
check('корневой контейнер #app найден', !!document.querySelector('#app'));
check('панель столпов #pillars найдена', !!document.querySelector('#pillars'));
check('основной график #main-chart найден', !!document.querySelector('#main-chart'));
check('квадрат Ло Шу #luoshu найден', !!document.querySelector('#luoshu'));
check('легенда #legend найдена', !!document.querySelector('#legend'));
check('строка состояния найдена', !!document.querySelector('#status-msg'));

// Обязательные для app.js элементы
const required = ['#b-year', '#b-month', '#b-day', '#b-hour', '#b-min', '#b-tz', '#b-gender',
  '#f-year', '#f-deg', '#f-mountain', '#f-period', '#m-year', '#m-month', '#m-day',
  '#btn-calc', '#btn-today', '#btn-export', '#btn-about', '#s-from', '#s-count',
  '#chk-combos', '#chk-year', '#chk-month', '#chk-day', '#el-chart', '#el-table',
  '#yinyang', '#luck-info', '#luck-table', '#interactions', '#meridian-table',
  '#terms-table', '#gua-info', '#gua-table', '#stars-info', '#daymaster',
  '#tooltip', '#engine-ver', '#data-ver', '#btn-all-on', '#btn-all-off', '#about'];
const missing = required.filter((s) => !document.querySelector(s));
check('все элементы, требуемые app.js, присутствуют', missing.length === 0, missing.join(', '));

// Значения по умолчанию для input
for (const n of document.querySelectorAll('input')) {
  if (n.getAttribute('value') !== null) n.value = n.getAttribute('value');
  if (n.getAttribute('checked') !== null) n.checked = true;
}
document.querySelectorAll('input[type="radio"]').forEach((n) => {
  if (n.getAttribute('checked') !== null) n.checked = true;
});
const genderSel = document.querySelector('#b-gender');
genderSel.value = 'male';

/* ---------------- Запуск приложения ---------------- */
console.log('\n[BROWSER] Загрузка и инициализация приложения');
let app;
try {
  app = await import(pathToFileURL(path.join(root, 'src/ui/app.js')).href);
  check('модуль app.js импортирован без исключений', true);
} catch (e) {
  check('модуль app.js импортирован без исключений', false, e.message);
  console.error(e);
  process.exit(1);
}

check('boot() экспортирован', typeof app.boot === 'function');

const status = document.querySelector('#status-msg');
check('расчёт при старте прошёл без ошибок', !/ОШИБКА/.test(status.textContent), status.textContent);
console.log('    статус: ' + status.textContent);

/* ---------------- Проверка отрисовки ---------------- */
console.log('\n[BROWSER] Проверка построенного интерфейса');
const pillars = document.querySelectorAll('#pillars .pillar');
check('отрисованы 4 столпа', pillars.length === 4, 'получено ' + pillars.length);

const hanNodes = document.querySelectorAll('#pillars .han');
check('в столпах есть иероглифы (8 знаков)', hanNodes.length === 8, 'получено ' + hanNodes.length);

const chart = document.querySelector('#main-chart');
const paths = chart.querySelectorAll('path');
check('на основном графике построены линии', paths.length >= 12, 'путей: ' + paths.length);
check('линии имеют непустой атрибут d', paths.every((p) => (p.getAttribute('d') || '').length > 10));
check('линии имеют цвет обводки', paths.every((p) => !!p.getAttribute('stroke')));

const texts = chart.querySelectorAll('text');
check('на графике есть подписи осей', texts.length >= 8, 'подписей: ' + texts.length);
const lines = chart.querySelectorAll('line');
check('на графике есть линии сетки', lines.length >= 8, 'линий: ' + lines.length);
const rects = chart.querySelectorAll('rect');
check('есть область построения и слой наведения', rects.length >= 2);

const legendItems = document.querySelectorAll('#legend .item');
check('легенда содержит 12 меридианов', legendItems.length === 12, 'элементов: ' + legendItems.length);

const palaces = document.querySelectorAll('#luoshu .palace');
check('квадрат Ло Шу содержит 9 дворцов', palaces.length === 9, 'дворцов: ' + palaces.length);

const merRows = document.querySelectorAll('#meridian-table table tr');
check('таблица меридианов заполнена (12 строк + шапка)', merRows.length === 13, 'строк: ' + merRows.length);

const luckRows = document.querySelectorAll('#luck-table table tr');
check('таблица столпов удачи заполнена', luckRows.length === 13, 'строк: ' + luckRows.length);

const termRows = document.querySelectorAll('#terms-table table tr');
check('таблица сезонов содержит 24 записи', termRows.length === 25, 'строк: ' + termRows.length);

const guaRows = document.querySelectorAll('#gua-table table tr');
check('таблица направлений Гуа содержит 8 записей', guaRows.length === 9, 'строк: ' + guaRows.length);

const elBars = document.querySelectorAll('#el-chart rect');
check('диаграмма стихий построена', elBars.length >= 5, 'прямоугольников: ' + elBars.length);

check('строка «Хозяин дня» заполнена', /日主|Хозяин дня/.test(document.querySelector('#daymaster').textContent));
check('сведения о звёздах заполнены', document.querySelector('#stars-info').textContent.includes('Период'));
check('версия движка выведена', document.querySelector('#engine-ver').textContent.length > 0);

/* ---------------- Интерактивность ---------------- */
console.log('\n[BROWSER] Проверка интерактивности');

const before = document.querySelectorAll('#main-chart path').length;
legendItems[0].dispatchEvent({ type: 'click', target: legendItems[0] });
const after = document.querySelectorAll('#main-chart path').length;
check('клик по легенде выключает серию', after === before - 1, `${before} -> ${after}`);
legendItems[0].dispatchEvent({ type: 'click', target: legendItems[0] });

document.querySelector('#btn-all-off').click();
check('кнопка «Снять все» убирает все линии',
  document.querySelectorAll('#main-chart path').length === 0);
document.querySelector('#btn-all-on').click();
check('кнопка «Все серии» возвращает линии',
  document.querySelectorAll('#main-chart path').length >= 12);

// Переключение масштаба
for (const sc of ['decade', 'month', 'day', 'year']) {
  const radio = document.querySelector(`input[value="${sc}"]`);
  radio.checked = true;
  radio.dispatchEvent({ type: 'change', target: radio });
  const st = document.querySelector('#status-msg').textContent;
  check(`масштаб «${sc}» пересчитан без ошибок`, !/ОШИБКА/.test(st), st);
  check(`масштаб «${sc}»: график перерисован`,
    document.querySelectorAll('#main-chart path').length > 0);
}

// Переключение режима графика
for (const mode of ['elements', 'index', 'meridians']) {
  const radio = document.querySelector(`input[value="${mode}"]`);
  radio.checked = true;
  radio.dispatchEvent({ type: 'change', target: radio });
  check(`режим «${mode}» отрисован`,
    document.querySelectorAll('#main-chart path').length > 0);
}

// Смена входных данных
document.querySelector('#b-year').value = '1990';
document.querySelector('#b-month').value = '11';
document.querySelector('#b-day').value = '23';
document.querySelector('#b-gender').value = 'female';
document.querySelector('#btn-calc').click();
const st2 = document.querySelector('#status-msg').textContent;
check('пересчёт по новым данным без ошибок', !/ОШИБКА/.test(st2), st2);
check('столпы перерисованы', document.querySelectorAll('#pillars .pillar').length === 4);

// Изменение азимута
document.querySelector('#f-deg').value = '15';
document.querySelector('#f-deg').dispatchEvent({ type: 'input', target: document.querySelector('#f-deg') });
check('азимут 15° определяется как гора N3',
  document.querySelector('#f-mountain').textContent.includes('N3'),
  document.querySelector('#f-mountain').textContent);

document.querySelector('#f-deg').value = '180';
document.querySelector('#f-deg').dispatchEvent({ type: 'input', target: document.querySelector('#f-deg') });
document.querySelector('#btn-calc').click();
check('возврат к азимуту 180° даёт гору S2',
  document.querySelector('#f-mountain').textContent.includes('S2'));

// Переключатель слияний
const combos = document.querySelector('#chk-combos');
combos.checked = false;
combos.dispatchEvent({ type: 'change', target: combos });
check('отключение слияний пересчитывает без ошибок',
  !/ОШИБКА/.test(document.querySelector('#status-msg').textContent));
combos.checked = true;
combos.dispatchEvent({ type: 'change', target: combos });

// Гостевые звёзды
const chkDay = document.querySelector('#chk-day');
chkDay.checked = true;
chkDay.dispatchEvent({ type: 'change', target: chkDay });
check('включение дневной звезды перерисовывает Ло Шу',
  document.querySelectorAll('#luoshu .palace').length === 9);

// Вкладки
const tabBtns = document.querySelectorAll('.tabs button');
check('вкладки найдены', tabBtns.length === 4);
tabBtns[1].dispatchEvent({ type: 'click', target: tabBtns[1] });
check('переключение вкладки «Взаимодействия» работает',
  tabBtns[1].classList.contains('active'));
tabBtns[0].dispatchEvent({ type: 'click', target: tabBtns[0] });

// Экспорт
let exported = null;
const origBlob = global.Blob;
globalThis.Blob = class { constructor(p) { exported = p[0]; this.parts = p; } };
document.querySelector('#btn-export').click();
globalThis.Blob = origBlob;
check('экспорт JSON сформирован', typeof exported === 'string' && exported.length > 500);
let parsed = null;
try { parsed = JSON.parse(exported); } catch (e) { void e; }
check('экспортированный JSON корректен', !!parsed);
check('экспорт содержит статусы алгоритмов', !!parsed && !!parsed.algorithmStatus);
check('экспорт помечен как MVP/экспериментальный',
  !!parsed && /MVP/.test(parsed.status));
check('экспорт содержит временной ряд',
  !!parsed && Array.isArray(parsed.timeSeries.points) && parsed.timeSeries.points.length > 0);

// Наведение
const overlay = document.querySelectorAll('#main-chart rect').slice(-1)[0];
overlay.dispatchEvent({ type: 'mousemove', clientX: 400, clientY: 200, target: overlay });
const tt = document.querySelector('#tooltip');
check('всплывающая подсказка появляется при наведении', tt.style.display === 'block');
check('подсказка содержит значения', (tt.innerHTML || '').length > 10);
overlay.dispatchEvent({ type: 'mouseleave', target: overlay });
check('подсказка скрывается при уходе курсора', tt.style.display === 'none');

/* ---------------- Визуальные требования ---------------- */
console.log('\n[BROWSER] Визуальная спецификация');
const css = fs.readFileSync(path.join(root, 'src/ui/styles.css'), 'utf8');
check('фон рабочей области серый (не белый)', /background:\s*#d6d3ce/.test(css));
check('используется компактный технический шрифт', /Tahoma/.test(css));
check('базовый размер шрифта <= 11px', /font:\s*11px/.test(css));
check('нет glassmorphism (backdrop-filter)', !/backdrop-filter/.test(css));
check('нет декоративных теней-карточек', !/box-shadow:\s*0\s+\d+px\s+\d+px/.test(css));
check('нет скруглений в стиле SaaS', !/border-radius:\s*(8|10|12|16|20|24)px/.test(css));
check('таблицы с тонкими рамками', /border-collapse:\s*collapse/.test(css));
check('определены цвета пяти стихий', /\.el-wood/.test(css) && /\.el-water/.test(css));
check('трёхколоночная компоновка', /grid-template-columns:\s*268px 1fr 232px/.test(css));

console.log(`\nИТОГО BROWSER: пройдено ${pass}, провалено ${fail}`);
process.exit(fail > 0 ? 1 : 0);
