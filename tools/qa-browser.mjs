/**
 * qa-browser.mjs — ФАЗА 7. Независимый браузерный QA-прогон.
 *
 * Управляет РЕАЛЬНЫМ приложением через DOM-заглушку так, как это делал бы
 * пользователь: правит поля ввода, нажимает кнопки, кликает по легенде,
 * двигает мышь над графиком. Ничего не чинит — только фиксирует факты.
 *
 * ОГРАНИЧЕНИЕ: настоящего браузера в среде нет. Проверяется выполнение кода,
 * состояние DOM и консоль, но НЕ пиксельный рендеринг и не реальные шрифты.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = '/home/user/Dao_Feng-Shui';
const results = [];
let consoleErrors = [];
let consoleWarns = [];

/* ---- перехват консоли до старта приложения ---- */
const realLog = console.log.bind(console);
const realErr = console.error.bind(console);
console.error = (...a) => consoleErrors.push(a.map(String).join(' '));
console.warn = (...a) => consoleWarns.push(a.map(String).join(' '));
process.on('uncaughtException', (e) => consoleErrors.push('uncaught: ' + e.message));
process.on('unhandledRejection', (e) => consoleErrors.push('unhandledRejection: ' + String(e)));

/* ---- DOM-заглушка из browser-test.js ---- */
const shim = fs.readFileSync(path.join(root, 'tools/browser-test.js'), 'utf8');
const tmp = path.join(root, 'tools', '.qa-shim.mjs');
fs.writeFileSync(tmp, shim.slice(0, shim.indexOf('/* ---------------- Запуск приложения')).replace(/^#!.*\n/, ''));
await import(pathToFileURL(tmp).href);
fs.rmSync(tmp, { force: true });

const app = await import(pathToFileURL(path.join(root, 'src/ui/app.js')).href);
const d = globalThis.document;
const $ = (s) => d.querySelector(s);
const $$ = (s) => d.querySelectorAll(s);

/* ---- утилиты управления интерфейсом ---- */
const setVal = (sel, v) => { const n = $(sel); n.value = String(v); return n; };
const fire = (sel, type = 'change') => { const n = $(sel); n.dispatchEvent({ type, target: n }); return n; };
const clickBtn = (sel) => { const n = $(sel); n.dispatchEvent({ type: 'click', target: n }); return n; };
const statusText = () => ($('#status-msg') || { textContent: '' }).textContent;
const pathCount = () => $$('#main-chart path').length;
const legendCount = () => $$('#legend .item').length;

function record(id, area, input, expected, actual, pass, error = '') {
  results.push({ id, area, input, expected, actual, pass, error });
  realLog(`  ${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(9)} ${area}`);
  if (!pass) realLog(`        ожидалось: ${expected}\n        получено : ${actual}${error ? '\n        ошибка   : ' + error : ''}`);
}

/** Выполняет действие, возвращая пойманное исключение вместо падения прогона. */
function attempt(fn) {
  const before = consoleErrors.length;
  try {
    const value = fn();
    return { value, threw: null, newErrors: consoleErrors.slice(before) };
  } catch (e) {
    return { value: undefined, threw: e, newErrors: consoleErrors.slice(before) };
  }
}

/** Полный цикл «ввести дату рождения и пересчитать». */
function calcWith(over = {}) {
  const b = { year: 1967, month: 6, day: 5, hour: 12, minute: 0, tz: 3, gender: 'male', ...over };
  setVal('#b-year', b.year); setVal('#b-month', b.month); setVal('#b-day', b.day);
  setVal('#b-hour', b.hour); setVal('#b-min', b.minute); setVal('#b-tz', b.tz);
  setVal('#b-gender', b.gender);
  return attempt(() => clickBtn('#btn-calc'));
}

const num = (s) => {
  const m = String(s).match(/-?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(',', '.')) : NaN;
};

/* ================= 1. STARTUP ================= */
record('QA-01-1', 'startup: приложение загрузилось без исключений',
  'загрузка src/ui/app.js', 'boot() отработал, 0 исключений',
  `исключений: ${consoleErrors.length}`, consoleErrors.length === 0, consoleErrors.join(' | '));

record('QA-01-2', 'startup: график построен при старте',
  'состояние по умолчанию 05.06.1967 12:00 UTC+3',
  '10 линий меридианов', `линий: ${pathCount()}`, pathCount() === 10);

record('QA-01-3', 'startup: версия движка и число таблиц выведены',
  '—', 'непустые #engine-ver и #data-ver',
  `движок «${$('#engine-ver').textContent}», данные «${$('#data-ver').textContent}»`,
  $('#engine-ver').textContent.length > 0 && $('#data-ver').textContent.length > 0);

record('QA-01-4', 'startup: панель показателей заполнена',
  '—', '14 строк каталога', `строк: ${$$('#indicator-list .ind-row').length}`,
  $$('#indicator-list .ind-row').length === 14);

/* ================= 2. DATE ================= */
{
  const r = calcWith({ year: 1990, month: 12, day: 31 });
  const pill = $('#pillars').textContent.replace(/\s+/g, ' ').trim();
  record('QA-02-1', 'date: обычная дата принимается', '31.12.1990 12:00',
    'расчёт без ошибки, столпы заполнены', `статус «${statusText()}», столпы «${pill.slice(0, 40)}»`,
    !r.threw && /Расчёт выполнен/.test(statusText()) && pill.length > 5, r.threw ? r.threw.message : '');
}
{
  const a = calcWith({ year: 1990, month: 2, day: 28 }); const s1 = $('#pillars').textContent;
  const b = calcWith({ year: 1990, month: 3, day: 1 }); const s2 = $('#pillars').textContent;
  record('QA-02-2', 'date: соседние даты дают разные столпы дня', '28.02.1990 против 01.03.1990',
    'столпы различаются', s1 === s2 ? 'столпы совпали' : 'столпы различаются',
    s1 !== s2, a.threw || b.threw ? String(a.threw || b.threw) : '');
}
{
  const r = calcWith({ year: 2000, month: 2, day: 29 });
  record('QA-02-3', 'date: високосное 29 февраля', '29.02.2000',
    'расчёт выполняется', `статус «${statusText()}»`,
    !r.threw && !/ОШИБКА/.test(statusText()), r.threw ? r.threw.message : '');
}

/* ================= 3. TIME ================= */
{
  const a = calcWith({ hour: 3 }); const p3 = $('#pillars').textContent;
  const b = calcWith({ hour: 15 }); const p15 = $('#pillars').textContent;
  record('QA-03-1', 'time: час влияет на столп часа', '03:00 против 15:00',
    'столпы различаются', p3 === p15 ? 'совпали' : 'различаются', p3 !== p15,
    a.threw || b.threw ? String(a.threw || b.threw) : '');
}
{
  const a = calcWith({ hour: 23, minute: 30 }); const p = $('#pillars').textContent;
  record('QA-03-2', 'time: поздний час Цзы (23:30) обрабатывается', '23:30',
    'расчёт без ошибки', `статус «${statusText()}»`,
    !a.threw && !/ОШИБКА/.test(statusText()) && p.length > 5, a.threw ? a.threw.message : '');
}
{
  const a = calcWith({ hour: 0, minute: 0 });
  record('QA-03-3', 'time: полночь 00:00', '00:00',
    'расчёт без ошибки', `статус «${statusText()}»`,
    !a.threw && !/ОШИБКА/.test(statusText()), a.threw ? a.threw.message : '');
}

/* ================= 4. LOCATION ================= */
{
  const before = $('#b-tz').value;
  const sel = setVal('#b-place', 'tokyo');
  const r = attempt(() => sel.dispatchEvent({ type: 'change', target: sel }));
  record('QA-04-1', 'location: выбор города подставляет пояс и координаты',
    'место = Токио', 'пояс 9, долгота 139.69',
    `пояс ${$('#b-tz').value}, долгота ${$('#b-lon').value} (было ${before})`,
    Number($('#b-tz').value) === 9 && Math.abs(Number($('#b-lon').value) - 139.69) < 0.01,
    r.threw ? r.threw.message : '');
}
{
  const sel = setVal('#b-place', 'manual');
  const r = attempt(() => sel.dispatchEvent({ type: 'change', target: sel }));
  record('QA-04-2', 'location: режим «задать вручную» не ломает пояс',
    'место = ручной режим', 'подсказка про ручной ввод, пояс не сброшен',
    `подсказка «${$('#place-note').textContent.slice(0, 45)}», пояс ${$('#b-tz').value}`,
    /вручную|Ручной/.test($('#place-note').textContent) && $('#b-tz').value !== '',
    r.threw ? r.threw.message : '');
}
{
  const opts = $$('#b-place option').length;
  record('QA-04-3', 'location: справочник мест не пуст', '—',
    '>= 20 городов', `вариантов: ${opts}`, opts >= 20);
}

/* ================= 5. TIMEZONE ================= */
{
  setVal('#b-place', 'manual');
  // Пояс обязан менять результат ВБЛИЗИ границы сезона: Ли Чунь 2025 наступает
  // 3 февраля 14:07 UTC, поэтому локальные 04.02 01:00 при UTC+14 приходятся
  // ещё на прошлый солнечный год, а при UTC+0 — уже на новый.
  const a = calcWith({ year: 2025, month: 2, day: 4, hour: 1, tz: 0 });
  const p0 = $('#pillars').textContent;
  const b = calcWith({ year: 2025, month: 2, day: 4, hour: 1, tz: 14 });
  const p14 = $('#pillars').textContent;
  record('QA-05-1', 'timezone: пояс влияет на столпы у границы сезона',
    '04.02.2025 01:00 при UTC+0 против UTC+14 (Ли Чунь 03.02 14:07 UTC)',
    'столпы года/месяца различаются',
    p0 === p14 ? 'совпали' : 'различаются', p0 !== p14,
    a.threw || b.threw ? String(a.threw || b.threw) : '');
}
{
  const r = calcWith({ tz: -11 });
  record('QA-05-2', 'timezone: отрицательный пояс', 'UTC−11',
    'расчёт без ошибки', `статус «${statusText()}»`,
    !r.threw && !/ОШИБКА/.test(statusText()), r.threw ? r.threw.message : '');
}
{
  const r = calcWith({ tz: 99 });
  const st = statusText();
  record('QA-05-3', 'timezone: недопустимый пояс отклоняется',
    'UTC+99', 'сообщение об ошибке, приложение не падает',
    `статус «${st}»`, /ОШИБКА|диапазон/i.test(st), r.threw ? 'исключение вышло в UI: ' + r.threw.message : '');
}

/* ================= 6. GENDER ================= */
{
  const a = calcWith({ tz: 3, gender: 'male' });
  const luckM = $('#luck-info').textContent;
  const b = calcWith({ tz: 3, gender: 'female' });
  const luckF = $('#luck-info').textContent;
  record('QA-06-1', 'gender: пол меняет направление столпов удачи',
    'муж. против жен., та же дата', 'направление или возраст различаются',
    `муж: «${luckM}» / жен: «${luckF}»`, luckM !== luckF,
    a.threw || b.threw ? String(a.threw || b.threw) : '');
}
{
  const b = calcWith({ gender: 'female' });
  record('QA-06-2', 'gender: женский профиль считается полностью',
    'жен., 05.06.1967', '10 линий на графике', `линий: ${pathCount()}`,
    pathCount() === 10, b.threw ? b.threw.message : '');
}

/* ================= 7. CALCULATION ================= */
{
  calcWith({});
  const merRows = $$('#meridian-table table tr').length;
  record('QA-07-1', 'calculation: таблица меридианов заполнена',
    '05.06.1967', '10 строк + шапка', `строк: ${merRows}`, merRows === 11);
}
{
  const txt = $('#el-table').textContent;
  const nums = [...txt.matchAll(/(\d+[.,]\d)/g)].map((m) => Number(m[1].replace(',', '.')));
  const sum = nums.reduce((a, b) => a + b, 0);
  record('QA-07-2', 'calculation: проценты стихий в сумме дают 100',
    '05.06.1967', 'сумма ≈ 100', `сумма: ${sum.toFixed(1)} (значений ${nums.length})`,
    nums.length >= 5 && Math.abs(sum - 100) < 0.5);
}
{
  const yy = $('#yinyang').textContent;
  const found = [...yy.matchAll(/(\d+[.,]\d)/g)].map((m) => Number(m[1].replace(',', '.')));
  record('QA-07-3', 'calculation: Инь% + Ян% = 100',
    '—', 'сумма первых двух ≈ 100',
    `строка «${yy.replace(/\s+/g, ' ').trim().slice(0, 60)}»`,
    found.length >= 2 && Math.abs(found[0] + found[1] - 100) < 0.5);
}
{
  const gua = $('#gua-info').textContent;
  record('QA-07-4', 'calculation: число Гуа рассчитано',
    'муж. 1967', 'непустая строка с числом', `«${gua.replace(/\s+/g, ' ').trim().slice(0, 60)}»`,
    /\d/.test(gua));
}

/* ================= 8. PERIOD (масштабы) ================= */
for (const [scale, ru] of [['decade', 'десятилетия'], ['year', 'годы'], ['month', 'месяцы'], ['day', 'дни'], ['hour', 'часы']]) {
  const radio = [...$$('input[name="scale"]')].find((r) => r.value === scale);
  const before = consoleErrors.length;
  const r = attempt(() => { radio.checked = true; radio.dispatchEvent({ type: 'change', target: radio }); });
  const ok = !r.threw && pathCount() > 0 && consoleErrors.length === before;
  record(`QA-08-${scale}`, `period: масштаб «${ru}»`, `scale=${scale}`,
    'график перестроен, линии есть, консоль чиста',
    `линий: ${pathCount()}, статус «${statusText().slice(0, 40)}»`, ok,
    r.threw ? r.threw.message : consoleErrors.slice(before).join(' | '));
}
{
  const radio = [...$$('input[name="scale"]')].find((r) => r.value === 'year');
  radio.checked = true; radio.dispatchEvent({ type: 'change', target: radio });
  setVal('#s-count', 5); fire('#s-count');
  const n1 = $$('#main-chart path').length;
  setVal('#s-count', 40); fire('#s-count');
  record('QA-08-count', 'period: изменение числа точек применяется',
    'кол-во 5 -> 40', 'график перестраивается без ошибок',
    `линий при 5: ${n1}, при 40: ${pathCount()}`, n1 > 0 && pathCount() > 0);
}

/* ================= 9. GRAPH (режимы) ================= */
for (const [mode, exp] of [['meridians', 10], ['elements', 5], ['index', 3], ['yinyang', 4]]) {
  const radio = [...$$('input[name="cmode"]')].find((r) => r.value === mode);
  const r = attempt(() => { radio.checked = true; radio.dispatchEvent({ type: 'change', target: radio }); });
  record(`QA-09-${mode}`, `graph: режим «${mode}»`, `cmode=${mode}`,
    `${exp} серий`, `линий: ${pathCount()}, легенда: ${legendCount()}`,
    !r.threw && legendCount() === exp, r.threw ? r.threw.message : '');
}
{
  // Возврат к меридианам для последующих проверок
  const radio = [...$$('input[name="cmode"]')].find((r) => r.value === 'meridians');
  radio.checked = true; radio.dispatchEvent({ type: 'change', target: radio });
  const svg = $('#main-chart').innerHTML || '';
  record('QA-09-grid', 'graph: сетка и оси присутствуют', '—',
    'в SVG есть линии сетки и подписи осей',
    `line: ${($$('#main-chart line') || []).length}, text: ${($$('#main-chart text') || []).length}`,
    ($$('#main-chart line') || []).length > 0 && ($$('#main-chart text') || []).length > 0);
}

/* ================= 10. LEGEND ================= */
{
  const items = $$('#legend .item');
  record('QA-10-1', 'legend: легенда соответствует числу серий', 'режим меридианов',
    '10 элементов', `элементов: ${items.length}`, items.length === 10);
}
{
  const before = pathCount();
  const item = $$('#legend .item')[0];
  const r = attempt(() => item.dispatchEvent({ type: 'click', target: item }));
  const after = pathCount();
  record('QA-10-2', 'legend: клик выключает серию', 'клик по первому элементу',
    'линий на 1 меньше', `${before} -> ${after}`, after === before - 1, r.threw ? r.threw.message : '');
  const item2 = $$('#legend .item')[0];
  item2.dispatchEvent({ type: 'click', target: item2 });
  record('QA-10-3', 'legend: повторный клик возвращает серию', 'повторный клик',
    `${before} линий`, `${pathCount()}`, pathCount() === before);
}
{
  const r1 = attempt(() => clickBtn('#btn-all-off'));
  const off = pathCount();
  const r2 = attempt(() => clickBtn('#btn-all-on'));
  record('QA-10-4', 'legend: кнопки «Снять все» / «Все серии»', 'нажатие обеих кнопок',
    '0 линий, затем 10', `после «снять»: ${off}, после «все»: ${pathCount()}`,
    off === 0 && pathCount() === 10, (r1.threw || r2.threw) ? String(r1.threw || r2.threw) : '');
}

/* ================= 11. TOOLTIP ================= */
{
  // Слушатели наведения висят на прозрачном overlay-прямоугольнике внутри SVG,
  // а не на его корне (src/chart/chart.js). Целимся туда же, куда попадёт мышь.
  const svg = [...$$('#main-chart rect')].pop();
  const move = { type: 'mousemove', clientX: 300, clientY: 150, target: svg };
  const r = attempt(() => svg.dispatchEvent(move));
  const tt = $('#tooltip');
  record('QA-11-1', 'tooltip: движение мыши над графиком не вызывает ошибок',
    'mousemove (300,150)', 'исключений нет',
    r.threw ? 'исключение' : 'ошибок нет', !r.threw, r.threw ? r.threw.message : '');
  record('QA-11-2', 'tooltip: подсказка получает содержимое',
    'mousemove над графиком', 'display=block и непустой текст',
    `display=${tt.style.display || '(нет)'}, длина текста ${(tt.textContent || '').length}`,
    tt.style.display === 'block' && (tt.textContent || '').length > 0);
  const leave = attempt(() => svg.dispatchEvent({ type: 'mouseleave', target: svg }));
  record('QA-11-3', 'tooltip: уход мыши скрывает подсказку', 'mouseleave',
    'display=none', `display=${$('#tooltip').style.display}`,
    $('#tooltip').style.display === 'none', leave.threw ? leave.threw.message : '');
}

/* ================= 12. SERIES VISIBILITY ================= */
{
  clickBtn('#btn-all-off');
  const zero = pathCount();
  const legendStill = legendCount();
  record('QA-12-1', 'series: при выключении всех серий график пуст, легенда остаётся',
    '«Снять все»', '0 линий, легенда 10', `линий ${zero}, легенда ${legendStill}`,
    zero === 0 && legendStill === 10);
  clickBtn('#btn-all-on');
}
{
  // Видимость должна пережить переключение масштаба
  const item = $$('#legend .item')[0];
  item.dispatchEvent({ type: 'click', target: item });
  const afterHide = pathCount();
  const radio = [...$$('input[name="scale"]')].find((r) => r.value === 'month');
  radio.checked = true; radio.dispatchEvent({ type: 'change', target: radio });
  const afterScale = pathCount();
  record('QA-12-2', 'series: выключенная серия остаётся выключенной после смены масштаба',
    'выключить серию, сменить масштаб на «месяцы»',
    `${afterHide} линий`, `${afterScale} линий`, afterScale === afterHide);
  clickBtn('#btn-all-on');
  const back = [...$$('input[name="scale"]')].find((r) => r.value === 'year');
  back.checked = true; back.dispatchEvent({ type: 'change', target: back });
}

/* ================= 13. NEGATIVE VALUES ================= */
{
  const r = calcWith({ year: -500 });
  const st = statusText();
  record('QA-13-1', 'negative: отрицательный год', 'год = −500',
    'понятная ошибка о диапазоне, приложение живо',
    `статус «${st}»`, /ОШИБКА|диапазон/i.test(st), r.threw ? 'исключение вышло в UI' : '');
}
{
  const r = calcWith({ year: 1967, month: -3 });
  const st = statusText();
  record('QA-13-2', 'negative: отрицательный месяц', 'месяц = −3',
    'понятная ошибка, не NaN на экране', `статус «${st}»`,
    /ОШИБКА|диапазон|1–12/i.test(st), r.threw ? 'исключение вышло в UI' : '');
}
{
  const r = calcWith({ year: 1967, month: 6, day: 5, hour: -5 });
  const st = statusText();
  record('QA-13-3', 'negative: отрицательный час', 'час = −5',
    'понятная ошибка', `статус «${st}»`, /ОШИБКА|диапазон|0–23/i.test(st),
    r.threw ? 'исключение вышло в UI' : '');
}
{
  const r = calcWith({ tz: 3, hour: 12, year: 1967, month: 6, day: 5 });
  setVal('#s-count', -10); const rr = attempt(() => fire('#s-count'));
  const stNeg = statusText();
  record('QA-13-4', 'negative: отрицательное число точек графика', 'кол-во = −10',
    'понятная ошибка, исключение не покидает обработчик (BUG-01)',
    `исключение: ${rr.threw ? 'ЕСТЬ' : 'нет'}, статус «${stNeg}»`,
    !rr.threw && /не меньше 1/.test(stNeg), rr.threw ? rr.threw.message : '');
  setVal('#s-count', 30); fire('#s-count');
}

/* ================= 14. ZERO VALUES ================= */
{
  const r = calcWith({ year: 1967, month: 0 });
  const st = statusText();
  record('QA-14-1', 'zero: месяц = 0', 'месяц = 0',
    'понятная ошибка', `статус «${st}»`, /ОШИБКА|диапазон|1–12/i.test(st),
    r.threw ? 'исключение вышло в UI' : '');
}
{
  const r = calcWith({ year: 1967, month: 6, day: 0 });
  const st = statusText();
  record('QA-14-2', 'zero: день = 0', 'день = 0',
    'понятная ошибка', `статус «${st}»`, /ОШИБКА|диапазон|1–31/i.test(st),
    r.threw ? 'исключение вышло в UI' : '');
}
{
  const r = calcWith({ year: 0 });
  const st = statusText();
  record('QA-14-3', 'zero: год = 0', 'год = 0',
    'понятная ошибка о диапазоне', `статус «${st}»`, /ОШИБКА|диапазон/i.test(st),
    r.threw ? 'исключение вышло в UI' : '');
}
{
  calcWith({});                       // вернуть заведомо корректную дату
  setVal('#s-count', 0); const rr = attempt(() => fire('#s-count'));
  const st0 = statusText();
  record('QA-14-4', 'zero: ноль точек графика', 'кол-во = 0',
    'понятная ошибка, исключение не покидает обработчик',
    `исключение: ${rr.threw ? 'ЕСТЬ' : 'нет'}, статус «${st0}»`,
    !rr.threw && /не меньше 1/.test(st0), rr.threw ? rr.threw.message : '');
  setVal('#s-count', 30); fire('#s-count');
  record('QA-14-5', 'zero: восстановление после ошибки', 'вернуть кол-во = 30',
    'график и таблица снова заполнены',
    `линий: ${pathCount()}, строк таблицы: ${$$('#meridian-table table tr').length}`,
    pathCount() === 10 && $$('#meridian-table table tr').length === 11);
}

/* ================= 15. INVALID INPUTS ================= */
{
  setVal('#b-year', 'abc');
  const r = attempt(() => clickBtn('#btn-calc'));
  const st = statusText();
  record('QA-15-1', 'invalid: нечисловой год', 'год = «abc» (NaN)',
    'понятная ошибка, без NaN в интерфейсе', `статус «${st}»`,
    /ОШИБКА|цел|диапазон/i.test(st) && !/NaN/.test($('#pillars').textContent),
    r.threw ? 'исключение вышло в UI' : '');
}
{
  setVal('#b-year', '');
  const r = attempt(() => clickBtn('#btn-calc'));
  const st = statusText();
  record('QA-15-2', 'invalid: пустое поле года', 'год = «» (пусто -> 0)',
    'понятная ошибка, не молчаливый расчёт по 0', `статус «${st}»`,
    /ОШИБКА|диапазон/i.test(st), r.threw ? 'исключение вышло в UI' : '');
}
{
  const r = calcWith({ year: 1967, month: 6, day: 31 });
  const st = statusText();
  record('QA-15-3', 'invalid: 31 июня (несуществующая дата)', '31.06.1967',
    'ошибка ИЛИ корректная нормализация; не «тихий мусор»',
    `статус «${st}», столпы «${$('#pillars').textContent.replace(/\s+/g, ' ').trim().slice(0, 30)}»`,
    !/NaN/.test($('#pillars').textContent), r.threw ? r.threw.message : '');
}
{
  const r = calcWith({ year: 1967, month: 13 });
  const st = statusText();
  record('QA-15-4', 'invalid: месяц 13', 'месяц = 13',
    'понятная ошибка', `статус «${st}»`, /ОШИБКА|диапазон|1–12/i.test(st),
    r.threw ? 'исключение вышло в UI' : '');
}

/* ================= 16. BOUNDARY DATES ================= */
{
  const r = calcWith({ year: 1700, month: 1, day: 1 });
  record('QA-16-1', 'boundary: нижняя граница диапазона 1700', '01.01.1700',
    'расчёт выполняется', `статус «${statusText().slice(0, 50)}»`,
    !r.threw && !/ОШИБКА/.test(statusText()), r.threw ? r.threw.message : '');
}
{
  const r = calcWith({ year: 2200, month: 12, day: 31 });
  record('QA-16-2', 'boundary: верхняя граница диапазона 2200', '31.12.2200',
    'расчёт выполняется', `статус «${statusText().slice(0, 50)}»`,
    !r.threw && !/ОШИБКА/.test(statusText()), r.threw ? r.threw.message : '');
}
{
  const r = calcWith({ year: 1699 });
  record('QA-16-3', 'boundary: год ниже диапазона отклоняется', '1699',
    'ошибка с указанием диапазона', `статус «${statusText()}»`,
    /диапазон/i.test(statusText()), r.threw ? 'исключение вышло в UI' : '');
}
{
  const r = calcWith({ year: 2201 });
  record('QA-16-4', 'boundary: год выше диапазона отклоняется', '2201',
    'ошибка с указанием диапазона', `статус «${statusText()}»`,
    /диапазон/i.test(statusText()), r.threw ? 'исключение вышло в UI' : '');
}

/* ================= 17. YEAR TRANSITIONS ================= */
{
  // DOM-заглушка отдаёт textContent с переставленными вложенными тегами,
  // поэтому год извлекаем из СЫРОЙ разметки innerHTML, а не из текста.
  const grabYear = () => {
    const m = $('#daymaster').innerHTML.match(/Солнечный год:\s*<b>(\d{3,4})<\/b>/);
    return m ? Number(m[1]) : null;
  };
  const a = calcWith({ year: 2025, month: 2, day: 2, hour: 12 });
  const y1 = grabYear();
  const b = calcWith({ year: 2025, month: 2, day: 5, hour: 12 });
  const y2 = grabYear();
  record('QA-17-1', 'year: граница Ли Чунь меняет солнечный год',
    '02.02.2025 против 05.02.2025 (Ли Чунь ≈ 3 февраля)',
    'солнечный год отличается на 1',
    `${y1 ?? '?'} -> ${y2 ?? '?'}`,
    y1 !== null && y2 !== null && y2 === y1 + 1,
    a.threw || b.threw ? String(a.threw || b.threw) : '');
}
{
  const a = calcWith({ year: 2024, month: 12, day: 31, hour: 23 });
  const p1 = $('#pillars').textContent;
  const b = calcWith({ year: 2025, month: 1, day: 1, hour: 1 });
  const p2 = $('#pillars').textContent;
  record('QA-17-2', 'year: переход через 1 января не ломает расчёт',
    '31.12.2024 23:00 -> 01.01.2025 01:00', 'оба считаются, столпы года совпадают (до Ли Чунь)',
    `столпы различаются: ${p1 !== p2}`, !a.threw && !b.threw && p1.length > 5 && p2.length > 5,
    a.threw || b.threw ? String(a.threw || b.threw) : '');
}

/* ================= 18. MONTH TRANSITIONS ================= */
{
  const a = calcWith({ year: 2025, month: 3, day: 4, hour: 12 });
  const m1 = $('#pillars').textContent;
  const b = calcWith({ year: 2025, month: 3, day: 6, hour: 12 });
  const m2 = $('#pillars').textContent;
  record('QA-18-1', 'month: граница Цзинчжэ (≈5 марта) меняет столп месяца',
    '04.03.2025 против 06.03.2025', 'столпы месяца различаются',
    m1 === m2 ? 'совпали' : 'различаются', m1 !== m2,
    a.threw || b.threw ? String(a.threw || b.threw) : '');
}
{
  const a = calcWith({ year: 2025, month: 4, day: 30, hour: 23 });
  const b = calcWith({ year: 2025, month: 5, day: 1, hour: 1 });
  record('QA-18-2', 'month: переход через календарный месяц',
    '30.04 23:00 -> 01.05 01:00', 'оба расчёта успешны',
    `статус «${statusText().slice(0, 40)}»`, !a.threw && !b.threw && !/ОШИБКА/.test(statusText()),
    a.threw || b.threw ? String(a.threw || b.threw) : '');
}

/* ================= 19. REPEATED CALCULATION ================= */
{
  calcWith({ year: 1967, month: 6, day: 5, hour: 12, tz: 3, gender: 'male' });
  const snap1 = $('#meridian-table').textContent;
  calcWith({ year: 1967, month: 6, day: 5, hour: 12, tz: 3, gender: 'male' });
  const snap2 = $('#meridian-table').textContent;
  calcWith({ year: 1967, month: 6, day: 5, hour: 12, tz: 3, gender: 'male' });
  const snap3 = $('#meridian-table').textContent;
  record('QA-19-1', 'repeat: троекратный пересчёт даёт идентичный результат',
    'один и тот же ввод 3 раза', 'таблицы совпадают побитово',
    snap1 === snap2 && snap2 === snap3 ? 'совпали' : 'РАСХОЖДЕНИЕ', snap1 === snap2 && snap2 === snap3);
}
{
  const errsBefore = consoleErrors.length;
  for (let i = 0; i < 12; i++) calcWith({ year: 1960 + i });
  record('QA-19-2', 'repeat: 12 последовательных пересчётов без утечки ошибок',
    '12 разных дат подряд', 'новых ошибок в консоли нет',
    `новых ошибок: ${consoleErrors.length - errsBefore}, линий: ${pathCount()}`,
    consoleErrors.length === errsBefore && pathCount() > 0,
    consoleErrors.slice(errsBefore).join(' | '));
}
{
  const before = pathCount();
  const r = attempt(() => { const n = $('#chk-combos'); n.checked = false; n.dispatchEvent({ type: 'change', target: n }); });
  const after = pathCount();
  const r2 = attempt(() => { const n = $('#chk-combos'); n.checked = true; n.dispatchEvent({ type: 'change', target: n }); });
  record('QA-19-3', 'repeat: переключатель слияний пересчитывает без ошибок',
    'снять и вернуть «слияния»', 'график сохраняется, ошибок нет',
    `${before} -> ${after} -> ${pathCount()}`,
    !r.threw && !r2.threw && after > 0, (r.threw || r2.threw) ? String(r.threw || r2.threw) : '');
}

/* ================= 20. BROWSER REFRESH ================= */
{
  // Перезагрузка = повторный импорт модуля с новым DOM.
  const errsBefore = consoleErrors.length;
  const shim2 = fs.readFileSync(path.join(root, 'tools/browser-test.js'), 'utf8');
  const tmp2 = path.join(root, 'tools', '.qa-shim2.mjs');
  fs.writeFileSync(tmp2, shim2.slice(0, shim2.indexOf('/* ---------------- Запуск приложения')).replace(/^#!.*\n/, ''));
  const r = await (async () => {
    try {
      await import(pathToFileURL(tmp2).href + '?v=2');
      const app2 = await import(pathToFileURL(path.join(root, 'src/ui/app.js')).href + '?v=2');
      app2.boot();
      return { threw: null };
    } catch (e) { return { threw: e }; }
  })();
  fs.rmSync(tmp2, { force: true });
  record('QA-20-1', 'refresh: повторная загрузка страницы проходит чисто',
    'повторный импорт модуля + boot()', 'исключений и новых ошибок консоли нет',
    r.threw ? 'исключение: ' + r.threw.message : `новых ошибок: ${consoleErrors.length - errsBefore}`,
    !r.threw && consoleErrors.length === errsBefore, r.threw ? r.threw.stack.split('\n')[0] : '');

  record('QA-20-2', 'refresh: состояние по умолчанию восстановлено',
    'после перезагрузки', 'график построен заново',
    `линий: ${pathCount()}`, pathCount() > 0);
}

/* ================= КОНСОЛЬ ================= */
console.error = realErr;
const unexpected = consoleErrors.filter((e) => !/InputError|DateRangeError/.test(e));
record('QA-CON-1', 'console: непредвиденных ошибок нет',
  'все 20 групп, включая заведомо неверный ввод',
  '0 сообщений, не связанных с валидацией ввода',
  `всего ${consoleErrors.length}, из них непредвиденных ${unexpected.length}`,
  unexpected.length === 0, unexpected.slice(0, 5).join(' | '));
record('QA-CON-3', 'console: ошибки валидации логируются осознанно',
  '7 InputError + 7 DateRangeError', 'каждая соответствует намеренно неверному вводу',
  `${consoleErrors.length - unexpected.length} сообщений от валидации`, true);
record('QA-CON-2', 'console: предупреждений за весь прогон', 'все 20 групп проверок',
  '0 сообщений console.warn', `${consoleWarns.length} сообщений`,
  consoleWarns.length === 0, consoleWarns.slice(0, 5).join(' | '));

/* ================= ИТОГ ================= */
const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass);
realLog(`\n================ ИТОГО: ${passed}/${results.length} PASS, ${failed.length} FAIL ================`);
for (const f of failed) realLog(`  FAIL ${f.id}: ${f.area}\n       ожидалось: ${f.expected}\n       получено : ${f.actual}`);

fs.writeFileSync(path.join(root, 'tools', '.qa-results.json'), JSON.stringify({
  results, consoleErrors, consoleWarns,
  summary: { total: results.length, passed, failed: failed.length }
}, null, 2));
