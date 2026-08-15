/**
 * app.js — UI слой. Только представление и события.
 * Все расчёты выполняет src/engine, все данные приходят из JSON-таблиц.
 */
import TABLES from '../data/data-bundle.js';
import {
  computeProfile, computeTimeSeries, computeFlyingStarsView,
  computeLuckPillars, solarTermTable, ENGINE_VERSION, mountainForDegrees, periodForYear
} from '../engine/index.js';
import { renderLineChart, renderBarChart } from '../chart/chart.js';
import { buildProfile, buildTimeSeries } from '../model/profile.js';
import { INDICATOR_CATALOG } from '../model/indicators.js';
import { STATUS_RU } from '../core/provenance.js';

const T = TABLES;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = {
  birth: { year: 1967, month: 6, day: 5, hour: 12, minute: 0, tzOffsetHours: 3, gender: 'male' },
  building: { buildYear: 2010, facingDegrees: 180 },
  moment: { year: 2026, month: 3, day: 15, hour: 12, minute: 0, tzOffsetHours: 3 },
  scale: 'year',
  from: 2000,
  count: 30,
  applyCombos: true,
  visibleMeridians: new Set(T.meridians.items.map((m) => m.id)),
  visibleElements: new Set(['wood', 'fire', 'earth', 'metal', 'water']),
  chartMode: 'meridians',
  result: null,
  stars: null
};

const STATUS_CLASS = (s) =>
  s.startsWith('VERIFIED') ? 'status-VERIFIED'
    : s.startsWith('PARTIALLY') ? 'status-PARTIAL'
      : s.startsWith('INFERRED') ? 'status-INFERRED' : 'status-NOT';

const STATUS_SHORT = (s) =>
  s.startsWith('VERIFIED') ? 'ПОДТВ.'
    : s.startsWith('PARTIALLY') ? 'ЧАСТИЧНО'
      : s.startsWith('INFERRED') ? 'ВЫВЕДЕНО' : 'НЕ ПОДТВ.';

function tag(status) {
  return `<span class="status-tag ${STATUS_CLASS(status)}" title="${status}">${STATUS_SHORT(status)}</span>`;
}

/* ============================ РАСЧЁТ ============================ */

function recalc() {
  const t0 = performance.now();
  try {
    // Слой 3 (Result Model): UI не обращается к движку напрямую.
    state.result = buildTimeSeries(state.birth, T, {
      scale: state.scale, from: state.from, count: state.count,
      applyCombos: state.applyCombos
    });
    state.model = buildProfile(state.birth, T, { applyCombos: state.applyCombos });
    state.luck = computeLuckPillars(state.birth, { count: 12, rules: T.luckRules });
    state.stars = computeFlyingStarsView(state.building, state.moment, T);
    setStatus('Расчёт выполнен за ' + (performance.now() - t0).toFixed(1) + ' мс', '');
  } catch (e) {
    setStatus('ОШИБКА РАСЧЁТА: ' + (e.userMessage || e.message), 'err');
    console.error(e);
    return;
  }
  renderAll();
}

function setStatus(msg, cls) {
  const s = $('#status-msg');
  s.textContent = msg;
  s.className = cls || '';
}

/* ============================ РЕНДЕР ============================ */

function renderAll() {
  renderPillars();
  renderElements();
  renderLuck();
  renderChart();
  renderInteractions();
  renderLuoShu();
  renderMeridianTable();
  renderSolarTerms();
  renderGua();
}

function renderPillars() {
  const p = state.result.profile;
  const roles = [['hour', 'Час'], ['day', 'День'], ['month', 'Месяц'], ['year', 'Год']];
  $('#pillars').innerHTML = roles.map(([r, cap]) => {
    const L = p.pillarLabels[r];
    return `<div class="pillar">
      <div class="cap">${cap}</div>
      <div class="han el-${L.stem.element}">${L.stem.han}</div>
      <div class="han el-${L.branch.element}">${L.branch.han}</div>
      <div class="ru">${L.stem.ru} ${L.branch.ru}</div>
      <div class="ru" style="color:#666">${L.branch.animal}</div>
    </div>`;
  }).join('');

  $('#daymaster').innerHTML =
    `Хозяин дня (日主): <b class="el-${p.dayMaster.element}">${p.dayMaster.han} ${p.dayMaster.ru}</b>
     &nbsp;|&nbsp; Солнечный год: <b>${p.solarYear}</b>
     &nbsp;|&nbsp; Сезон: <b class="el-${p.seasonElement}">${elRu(p.seasonElement)}</b>`;
}

const elRu = (id) => T.elements.items.find((e) => e.id === id).ru;
// Цвета берутся ТОЛЬКО из colors.json через проекции загрузчика (единственный источник цвета).
const elColor = (id) => T.elementColor(id);

function renderElements() {
  const p = state.result.profile;
  const bars = ['wood', 'fire', 'earth', 'metal', 'water'].map((id) => ({
    label: elRu(id).slice(0, 4), value: p.elements.percent[id], color: elColor(id)
  }));
  renderBarChart($('#el-chart'), { bars });

  $('#el-table').innerHTML =
    `<table class="grid"><tr><th>Стихия</th><th>%</th><th>Полоса</th></tr>` +
    ['wood', 'fire', 'earth', 'metal', 'water'].map((id) => {
      const v = p.elements.percent[id];
      return `<tr><td class="l el-${id}">${elRu(id)}</td><td>${v.toFixed(1)}</td>
        <td>${v > 26 ? 'избыток' : v < 14 ? 'недостаток' : 'норма'}</td></tr>`;
    }).join('') + `</table>`;

  const yy = p.yinYang;
  $('#yinyang').innerHTML =
    `Инь ${yy.yinPercent.toFixed(1)}% / Ян ${yy.yangPercent.toFixed(1)}%
     &nbsp;|&nbsp; Гармоничность: <b>${p.harmony.toFixed(0)}</b> / 100`;
}

function renderLuck() {
  const l = state.luck;
  $('#luck-info').textContent =
    `Направление: ${l.forward ? 'вперёд' : 'назад'} | старт: ${l.startAge.toFixed(2)} лет`;
  $('#luck-table').innerHTML =
    `<table class="grid"><tr><th>№</th><th>Ствол</th><th>Ветвь</th><th>Возраст</th><th>Годы</th></tr>` +
    l.pillars.map((p) => {
      const s = T.stems.items[p.stem], b = T.branches.items[p.branch];
      const y0 = state.result.profile.solarYear + Math.floor(p.startAge);
      return `<tr><td>${p.ordinal}</td>
        <td class="han el-${s.element}">${s.han}</td>
        <td class="han el-${b.element}">${b.han}</td>
        <td>${p.startAge.toFixed(1)}</td>
        <td>${y0}–${y0 + 9}</td></tr>`;
    }).join('') + `</table>`;
}

/**
 * VIS-02: подпись оси Y для текущего режима.
 * Указывает И величину, И её статус достоверности, чтобы шкала
 * INFERRED-значений не выглядела как измеренная.
 */
function yLabelForMode() {
  if (state.chartMode === 'meridians') return 'Сила меридиана, усл. ед. (INFERRED)';
  if (state.chartMode === 'elements') return 'Доля стихии, % (INFERRED)';
  if (state.chartMode === 'yinyang') return 'Инь / Ян, усл. ед. и % (INFERRED)';
  return 'Индекс, 0–100 (INFERRED)';
}

function seriesForMode() {
  if (state.chartMode === 'meridians') {
    return T.meridians.items.map((m) => ({
      id: m.id, label: m.ru, color: T.meridianColor(m.id),
      accessor: (p) => p.meridians.find((x) => x.id === m.id).value
    }));
  }
  if (state.chartMode === 'elements') {
    return T.elements.items.map((e) => ({
      id: e.id, label: e.ru, color: T.elementColor(e.id),
      accessor: (p) => p.elements[e.id]
    }));
  }
  if (state.chartMode === 'yinyang') {
    // Суммы Инь и Ян по 10 меридианам. Значения INFERRED: они наследуют
    // статус исходных величин меридианов (формула референса не опубликована).
    return [
      { id: 'yin', label: 'Сумма Инь', color: T.colors.palettes.polarity.byId.yin, width: 2,
        accessor: (p) => p.yinYang.yin },
      { id: 'yang', label: 'Сумма Ян', color: T.colors.palettes.polarity.byId.yang, width: 2,
        accessor: (p) => p.yinYang.yang },
      { id: 'yinPct', label: 'Инь %', color: '#5b8db8', accessor: (p) => p.yinYang.yinPercent },
      { id: 'yangPct', label: 'Ян %', color: '#d08a8a', accessor: (p) => p.yinYang.yangPercent }
    ];
  }
  return [
    { id: 'harmony', label: 'Гармоничность', color: '#16325c', width: 2, accessor: (p) => p.harmony },
    { id: 'yin', label: 'Инь %', color: '#1565c0', accessor: (p) => p.yinYang.yinPercent },
    { id: 'yang', label: 'Ян %', color: '#c62828', accessor: (p) => p.yinYang.yangPercent }
  ];
}

/** Показатель, алгоритм которого не подтверждён: вместо графика — объяснение. */
function renderUnverified(cat) {
  const svg = $('#main-chart');
  svg.innerHTML = '';
  $('#legend').innerHTML = '';
  const box = document.createElement('div');
  box.className = 'unverified-box';
  box.innerHTML =
    `<div class="unverified-title">Алгоритм не подтверждён</div>
     <div class="unverified-name">${cat.ru}</div>
     <p>${cat.note}</p>
     <p class="unverified-refs">
       ${cat.placeholderRef ? 'Заглушка: <b>' + cat.placeholderRef + '</b>. ' : ''}
       Статус: <b>${STATUS_RU[cat.status] || cat.status}</b>.
     </p>
     <p class="unverified-policy">
       График не строится намеренно. Подстановка правдоподобных чисел вместо
       неизвестной формулы referenсe-программы означала бы выдумывание алгоритма.
     </p>`;
  const holder = $('#unverified-holder');
  holder.innerHTML = '';
  holder.appendChild(box);
  holder.style.display = 'block';
  svg.style.display = 'none';
}

/** Панель «Показатели»: честный список того, что подтверждено, а что нет. */
function renderIndicatorList() {
  const rows = INDICATOR_CATALOG.map((c) => {
    const computable = c.status !== 'NOT_VERIFIED';
    return `<tr class="ind-row ${computable ? '' : 'ind-off'}" data-ind="${c.id}" title="${c.note.replace(/"/g, '&quot;')}">
      <td class="l">${c.ru}</td>
      <td>${tag(c.status)}</td>
      <td>${c.placeholderRef || (c.algorithmRef || '—')}</td>
    </tr>`;
  }).join('');
  $('#indicator-list').innerHTML =
    `<table class="grid"><tr><th>Показатель</th><th>Статус</th><th>Ссылка</th></tr>${rows}</table>
     <div class="note">Строки без расчёта: формула референсной программы не опубликована.
     Нажмите на строку, чтобы увидеть причину.</div>`;

  $$('#indicator-list .ind-row').forEach((tr) => tr.addEventListener('click', () => {
    const cat = INDICATOR_CATALOG.find((c) => c.id === tr.dataset.ind);
    if (!cat) return;
    if (cat.status === 'NOT_VERIFIED') {
      state.chartMode = 'unverified';
      state.unverifiedId = cat.id;
      $$('input[name="cmode"]').forEach((r) => { r.checked = false; });
      $('#cmode-unverified').value = cat.id;
      renderChart();
    }
  }));
}

/**
 * VIS-01: цвета стихий генерируются из colors.json — единственного источника.
 * Раньше палитра дублировалась в styles.css и разошлась с данными.
 */
function injectElementColors() {
  const pal = T.colors.palettes.elements.byId;
  const rules = Object.entries(pal)
    .map(([id, hex]) => `.el-${id}{color:${hex}}`)
    .join('\n');
  // Точка вставки: head в браузере, иначе — корень документа.
  // Тестовая DOM-заглушка не имеет head, а падать из-за оформления нельзя.
  const host = document.head || document.body || document.documentElement;
  if (!host || typeof host.appendChild !== 'function') return;
  const style = document.createElement('style');
  style.id = 'element-colors';
  style.textContent = '/* сгенерировано из data/colors.json */\n' + rules;
  host.appendChild(style);
}

/** Заполнение списка мест рождения из data/places.json. */
function fillPlaces() {
  const sel = $('#b-place');
  sel.innerHTML = T.places.items
    .map((p) => `<option value="${p.id}">${p.ru}${p.tz === null ? '' : ' (UTC' + (p.tz >= 0 ? '+' : '') + p.tz + ')'}</option>`)
    .join('');
  sel.value = 'moscow';
}

/** Заполнение списка неподтверждённых показателей. */
function fillUnverifiedSelect() {
  const sel = $('#cmode-unverified');
  const list = INDICATOR_CATALOG.filter((c) => c.status === 'NOT_VERIFIED');
  sel.innerHTML = '<option value="">— не подтверждённые —</option>' +
    list.map((c) => `<option value="${c.id}">${c.ru}</option>`).join('');
}

function visibleSet() {
  if (state.chartMode === 'meridians') return state.visibleMeridians;
  if (state.chartMode === 'elements') return state.visibleElements;
  if (state.chartMode === 'yinyang') {
    if (!state.visibleYinYang) state.visibleYinYang = new Set(['yin', 'yang', 'yinPct', 'yangPct']);
    return state.visibleYinYang;
  }
  if (!state.visibleIndex) state.visibleIndex = new Set(['harmony', 'yin', 'yang']);
  return state.visibleIndex;
}

function renderChart() {
  // Показатели без опубликованной формулы не рисуются — показывается причина.
  if (state.chartMode === 'unverified') {
    const cat = INDICATOR_CATALOG.find((c) => c.id === state.unverifiedId);
    if (cat) { renderUnverified(cat); return; }
  }
  $('#unverified-holder').style.display = 'none';
  $('#main-chart').style.display = '';
  const pts = state.result.points;
  const series = seriesForMode();
  const visible = visibleSet();

  // Маркеры границ столпов удачи на годовой/декадной шкале
  const markers = [];
  if (state.luck && (state.scale === 'year' || state.scale === 'decade')) {
    for (const lp of state.luck.pillars) {
      const y = state.result.profile.solarYear + lp.startAge;
      const idx = pts.findIndex((p) => p.decimalYear >= y);
      if (idx > 0) {
        const s = T.stems.items[lp.stem], b = T.branches.items[lp.branch];
        markers.push({ index: idx, label: s.han + b.han });
      }
    }
  }

  renderLineChart($('#main-chart'), {
    points: pts, series, visible, markers,
    yLabel: yLabelForMode(),
    onHover: (i, pt, ev) => {
      const tt = $('#tooltip');
      if (i === null) { tt.style.display = 'none'; return; }
      const rows = series.filter((s) => visible.has(s.id))
        .map((s) => `<span style="color:${s.color}">■</span> ${s.label}: <b>${s.accessor(pt).toFixed(2)}</b>`)
        .join('<br>');
      tt.innerHTML = `<b>${pt.label}</b><br>${rows}`;
      tt.style.display = 'block';
      tt.style.left = Math.min(window.innerWidth - 310, ev.clientX + 14) + 'px';
      tt.style.top = Math.min(window.innerHeight - 200, ev.clientY + 14) + 'px';
    }
  });

  $('#legend').innerHTML = series.map((s) =>
    `<span class="item ${visible.has(s.id) ? '' : 'off'}" data-sid="${s.id}">
      <span class="sw" style="background:${s.color}"></span>${s.label}</span>`
  ).join('');

  $$('#legend .item').forEach((n) => n.addEventListener('click', () => {
    const id = n.dataset.sid;
    const v = visibleSet();
    if (v.has(id)) v.delete(id); else v.add(id);
    renderChart();
  }));
}

function renderInteractions() {
  const it = state.result.profile.interactions;
  const groups = [
    ['Слияния стволов', it.stemCombinations],
    ['Шесть слияний', it.sixCombinations],
    ['Треугольники', it.threeHarmonies],
    ['Сезонные группы', it.directionalCombinations],
    ['Столкновения', it.clashes],
    ['Вред', it.harms],
    ['Наказания', it.punishments]
  ];
  const rows = [];
  for (const [name, arr] of groups) {
    for (const x of arr) {
      rows.push(`<tr><td class="l">${name}</td><td class="l">${x.ru}</td>
        <td>${(x.roles || []).map(roleRu).join('+')}</td></tr>`);
    }
  }
  $('#interactions').innerHTML = rows.length
    ? `<table class="grid"><tr><th>Тип</th><th>Состав</th><th>Столпы</th></tr>${rows.join('')}</table>`
    : '<div class="note">Взаимодействий в натальных столпах не обнаружено.</div>';
}

const roleRu = (r) => ({ year: 'Г', month: 'М', day: 'Д', hour: 'Ч', luck: 'У', annual: 'ТГ', monthly: 'ТМ', daily: 'ТД' }[r] || r);

function renderLuoShu() {
  const v = state.stars;
  const order = ['SE', 'S', 'SW', 'E', 'C', 'W', 'NE', 'N', 'NW'];
  const showY = $('#chk-year').checked, showM = $('#chk-month').checked, showD = $('#chk-day').checked;

  $('#luoshu').innerHTML = order.map((d) => {
    const pal = T.luoshu.palaces.find((p) => p.direction === d);
    const mtn = v.chart.mountainStars[d], wtr = v.chart.waterStars[d], base = v.chart.earthBase[d];
    const guests = [];
    if (showY) guests.push(`<span title="год">${v.annual.grid[d]}</span>`);
    if (showM) guests.push(`<span title="месяц">${v.monthly.grid[d]}</span>`);
    if (showD && v.daily) guests.push(`<span title="день">${v.daily.grid[d]}</span>`);
    const affl = [];
    if (v.afflictions.threeSha && v.afflictions.threeSha.direction === d) affl.push('▲3Ша');
    const isFacing = v.chart.facing.sector === d;
    const isSitting = v.chart.sitting.sector === d;
    return `<div class="palace ${d === 'C' ? 'center' : ''} bg-${starEl(base)}">
      <div class="dir">${pal.ru}${isFacing ? ' ◄фасад' : ''}${isSitting ? ' ◄тыл' : ''}</div>
      <div class="stars"><span class="mtn el-${starEl(mtn)}">${mtn}</span>
        <span class="wtr el-${starEl(wtr)}">${wtr}</span></div>
      <div class="base el-${starEl(base)}">${base}</div>
      <div class="guests">${guests.join(' ')}</div>
      <div class="affl">${affl.join('')}</div>
    </div>`;
  }).join('');

  const a = v.afflictions;
  $('#stars-info').innerHTML =
    `Период: <b>${v.period}</b> | Фасад: <b>${v.chart.facing.code} ${v.chart.facing.han}</b>
     (${v.chart.facing.degrees.toFixed(1)}°) | Тыл: <b>${v.chart.sitting.code} ${v.chart.sitting.han}</b><br>
     Годовая: <b>${v.annual.center}</b> | Месячная: <b>${v.monthly.center}</b>
     | Дневная: <b>${v.daily ? v.daily.center : '—'}</b> ${v.daily ? (v.daily.yangDun ? '(Ян Дунь)' : '(Инь Дунь)') : ''}<br>
     Тай Суй: <b>${a.taiSui ? a.taiSui.code : '—'}</b> | Суй По: <b>${a.suiPo ? a.suiPo.code : '—'}</b>
     | Три Ша: <b>${a.threeSha ? a.threeSha.direction : '—'}</b>`;
}

const starEl = (n) => T.luoshu.stars.find((s) => s.number === n).element;

function renderMeridianTable() {
  const pts = state.result.points;
  // BUG-01: при пустом ряде Math.min(length-1, ...) даёт -1, а pts[-1] —
  // undefined. Пустой ряд не ошибка расчёта, поэтому таблица показывает
  // причину, а не падает и не подставляет вымышленные значения.
  if (!pts.length) {
    $('#meridian-table').innerHTML =
      '<div class="note">Нет данных для таблицы: временной ряд пуст. '
      + 'Задайте количество точек больше нуля.</div>';
    return;
  }
  const cur = pts[Math.min(pts.length - 1, Math.floor(pts.length / 2))];
  // Полосы интерпретации INFERRED и живут в indicators.json (проекция weights).
  const bandRu = (id) => T.weights.interpretationBands.find((b) => b.id === id).ru;
  $('#meridian-table').innerHTML =
    `<table class="grid"><tr><th>Меридиан</th><th>Стихия</th><th>Знач.</th><th>Отн.</th><th>Оценка</th></tr>` +
    cur.meridians.map((m) => {
      const def = T.meridians.items.find((x) => x.id === m.id);
      return `<tr><td class="l">${def.ru}</td>
        <td class="el-${def.element}">${elRu(def.element)}</td>
        <td>${m.value.toFixed(1)}</td>
        <td>${m.ratio.toFixed(2)}</td>
        <td>${bandRu(m.band)}</td></tr>`;
    }).join('') + `</table>` +
    `<div class="note">Точка: ${cur.label}. Традиционные энергетические показатели, не медицинская диагностика.</div>`;
}

function renderSolarTerms() {
  const y = state.moment.year;
  const rows = solarTermTable(y, T);
  $('#terms-table').innerHTML =
    `<table class="grid"><tr><th>Сезон</th><th>Дата (UTC)</th><th>Тип</th></tr>` +
    rows.map((r) => `<tr><td class="l">${r.ru} <span style="color:#888">${r.han}</span></td>
      <td>${String(r.utc.day).padStart(2, '0')}.${String(r.utc.month).padStart(2, '0')} ${String(r.utc.hour).padStart(2, '0')}:${String(r.utc.minute).padStart(2, '0')}</td>
      <td>${r.type === 'jie' ? 'граница' : 'середина'}</td></tr>`).join('') + `</table>`;
}

function renderGua() {
  const g = state.result.profile.gua;
  const L = T.gua.directionLabels;
  $('#gua-info').innerHTML = `Число Гуа: <b>${g.gua}</b> (${g.group === 'east' ? 'восточная' : 'западная'} группа)`;
  $('#gua-table').innerHTML =
    `<table class="grid"><tr><th>Направление</th><th>Сектор</th><th>Качество</th></tr>` +
    Object.entries(g.directions).sort((a, b) => L[a[0]].rank - L[b[0]].rank)
      .map(([k, dir]) => `<tr><td class="l">${L[k].ru}</td><td><b>${dir}</b></td>
        <td style="color:${L[k].quality === 'auspicious' ? '#1b5e20' : '#a00'}">${L[k].quality === 'auspicious' ? 'благопр.' : 'неблагопр.'}</td></tr>`).join('') +
    `</table>`;
}

/* ============================ СОБЫТИЯ ============================ */

function bind() {
  const readBirth = () => {
    state.birth = {
      year: +$('#b-year').value, month: +$('#b-month').value, day: +$('#b-day').value,
      hour: +$('#b-hour').value, minute: +$('#b-min').value,
      tzOffsetHours: +$('#b-tz').value,
      gender: $('#b-gender').value
    };
  };
  const readBuilding = () => {
    state.building = { buildYear: +$('#f-year').value, facingDegrees: +$('#f-deg').value };
    const m = mountainForDegrees(state.building.facingDegrees, T.mountains24);
    $('#f-mountain').textContent = `${m.code} ${m.han} ${m.ru} (${m.polarity === 'yang' ? 'ян' : 'инь'})`;
    $('#f-period').textContent = periodForYear(state.building.buildYear, T.luoshu);
  };
  const readMoment = () => {
    state.moment = {
      year: +$('#m-year').value, month: +$('#m-month').value, day: +$('#m-day').value,
      hour: 12, minute: 0, tzOffsetHours: +$('#b-tz').value
    };
  };

  // Место рождения подставляет часовой пояс и координаты.
  $('#b-place').addEventListener('change', (e) => {
    const pl = T.places.items.find((x) => x.id === e.target.value);
    if (!pl || pl.tz === null) {
      $('#place-note').textContent = 'Ручной режим: задайте часовой пояс самостоятельно.';
      return;
    }
    $('#b-tz').value = pl.tz;
    $('#b-lon').value = pl.lon;
    $('#b-lat').value = pl.lat;
    $('#place-note').textContent = T.places.limitation;
    readBirth(); recalc();
  });

  // Выбор неподтверждённого показателя.
  $('#cmode-unverified').addEventListener('change', (e) => {
    if (!e.target.value) { state.chartMode = 'meridians'; $('input[name="cmode"][value="meridians"]').checked = true; }
    else { state.chartMode = 'unverified'; state.unverifiedId = e.target.value; }
    renderChart();
  });

  $('#btn-calc').addEventListener('click', () => { readBirth(); readBuilding(); readMoment(); recalc(); });
  $('#btn-today').addEventListener('click', () => {
    const d = new Date();
    $('#m-year').value = d.getFullYear(); $('#m-month').value = d.getMonth() + 1; $('#m-day').value = d.getDate();
    readMoment(); recalc();
  });

  $$('input[name="scale"]').forEach((r) => r.addEventListener('change', () => {
    state.scale = r.value;
    state.count = { decade: 12, year: 30, month: 24, day: 60 }[state.scale];
    $('#s-count').value = state.count;
    recalc();
  }));
  $('#s-from').addEventListener('change', () => { state.from = +$('#s-from').value; recalc(); });
  $('#s-count').addEventListener('change', () => { state.count = +$('#s-count').value; recalc(); });
  $('#chk-combos').addEventListener('change', (e) => { state.applyCombos = e.target.checked; recalc(); });

  $$('input[name="cmode"]').forEach((r) => r.addEventListener('change', () => {
    $('#cmode-unverified').value = '';
    state.chartMode = r.value; renderChart();
  }));

  ['#chk-year', '#chk-month', '#chk-day'].forEach((s) =>
    $(s).addEventListener('change', renderLuoShu));

  $('#f-deg').addEventListener('input', readBuilding);
  $('#f-year').addEventListener('input', readBuilding);

  $('#btn-all-on').addEventListener('click', () => {
    const v = visibleSet();
    seriesForMode().forEach((s) => v.add(s.id));
    renderChart();
  });
  $('#btn-all-off').addEventListener('click', () => { visibleSet().clear(); renderChart(); });

  $$('.tabs button').forEach((b) => b.addEventListener('click', () => {
    const grp = b.closest('.tabs').dataset.group;
    $$(`.tabs[data-group="${grp}"] button`).forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    $$(`.tabpage[data-group="${grp}"]`).forEach((p) => p.classList.toggle('active', p.dataset.tab === b.dataset.tab));
    if (b.dataset.tab === 'chart') renderChart();
  }));

  $('#btn-export').addEventListener('click', exportJSON);
  $('#btn-about').addEventListener('click', () => $('#about').showModal());
  $$('#about .close').forEach((b) => b.addEventListener('click', () => $('#about').close()));

  window.addEventListener('resize', () => { if (state.result) renderChart(); });

  readBuilding();
}

function exportJSON() {
  const out = {
    engineVersion: ENGINE_VERSION,
    status: 'MVP / experimental — НЕ production-ready',
    input: { birth: state.birth, building: state.building, moment: state.moment },
    profile: state.result.profile,
    luck: state.luck,
    timeSeries: { scale: state.scale, points: state.result.points },
    flyingStars: state.stars,
    algorithmStatus: Object.fromEntries(
      Object.entries(T).map(([k, v]) => [k, v.status])
    )
  };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `fengshui-result-${state.birth.year}-${state.scale}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus('Результат выгружен в JSON', '');
}

/* ============================ СТАРТ ============================ */

export function boot() {
  injectElementColors();
  fillPlaces();
  fillUnverifiedSelect();
  bind();
  recalc();
  renderIndicatorList();
  $('#engine-ver').textContent = ENGINE_VERSION;
  $('#data-ver').textContent = Object.keys(T).length + ' таблиц';
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
