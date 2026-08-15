/**
 * chart.js — CHART ENGINE. Рендер SVG без внешних зависимостей.
 * Слой не выполняет расчётов: он получает уже готовую модель результата.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const el = (n, attrs = {}) => {
  const e = document.createElementNS(SVG_NS, n);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

/** Красивый шаг сетки. */
function niceStep(range, target) {
  const raw = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step;
  if (norm <= 1) step = 1; else if (norm <= 2) step = 2;
  else if (norm <= 2.5) step = 2.5; else if (norm <= 5) step = 5; else step = 10;
  return step * mag;
}

/**
 * Линейный график временного ряда.
 * @param {SVGElement} svg целевой элемент
 * @param {Object} cfg { points, series, yLabel, xLabel, visible:Set, onHover }
 */
export function renderLineChart(svg, cfg) {
  const {
    points, series, visible, title = '',
    yMin: forceMin = null, yMax: forceMax = null,
    markers = [],
    // VIS-02: подпись оси Y. Без неё непонятно, что означает число на шкале,
    // а смысл величины меняется при переключении режима графика.
    yLabel = ''
  } = cfg;

  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const W = svg.clientWidth || svg.parentElement.clientWidth || 900;
  const H = svg.clientHeight || 260;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const M = { top: 14, right: 10, bottom: 26, left: yLabel ? 50 : 38 };
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;

  const active = series.filter((s) => visible.has(s.id));

  // Диапазон Y
  let lo = Infinity, hi = -Infinity;
  for (const s of active) {
    for (const p of points) {
      const v = s.accessor(p);
      if (v === null || v === undefined || !Number.isFinite(v)) continue;
      if (v < lo) lo = v; if (v > hi) hi = v;
    }
  }
  if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08;
  let yMin = forceMin !== null ? forceMin : lo - pad;
  let yMax = forceMax !== null ? forceMax : hi + pad;

  const xOf = (i) => M.left + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const yOf = (v) => M.top + ih - ((v - yMin) / (yMax - yMin)) * ih;

  // Фон рабочей области
  svg.appendChild(el('rect', {
    x: M.left, y: M.top, width: iw, height: ih,
    fill: '#ffffff', stroke: '#7a7a7a', 'stroke-width': 1
  }));

  // Горизонтальная сетка
  const gy = niceStep(yMax - yMin, 6);
  const g = el('g');
  for (let v = Math.ceil(yMin / gy) * gy; v <= yMax; v += gy) {
    const y = yOf(v);
    g.appendChild(el('line', {
      x1: M.left, y1: y, x2: M.left + iw, y2: y,
      stroke: '#d8d8d8', 'stroke-width': 1
    }));
    const t = el('text', {
      x: M.left - 4, y: y + 3, 'text-anchor': 'end',
      'font-size': 9, fill: '#333', 'font-family': 'Tahoma, Arial, sans-serif'
    });
    t.textContent = Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(gy < 1 ? 1 : 0);
    g.appendChild(t);
  }

  // Вертикальная сетка и подписи X
  const stepX = Math.max(1, Math.ceil(points.length / 14));
  for (let i = 0; i < points.length; i++) {
    const x = xOf(i);
    if (i % stepX === 0) {
      g.appendChild(el('line', {
        x1: x, y1: M.top, x2: x, y2: M.top + ih,
        stroke: '#e6e6e6', 'stroke-width': 1
      }));
      const t = el('text', {
        x, y: M.top + ih + 12, 'text-anchor': 'middle',
        'font-size': 9, fill: '#333', 'font-family': 'Tahoma, Arial, sans-serif'
      });
      t.textContent = points[i].label;
      g.appendChild(t);
    }
  }
  // VIS-02: название оси Y — вертикально вдоль шкалы, как в технических
  // построителях графиков. Рисуется только если подпись задана.
  if (yLabel) {
    const yt = el('text', {
      x: 9, y: M.top + ih / 2,
      'text-anchor': 'middle', 'font-size': 9, fill: '#333',
      'font-family': 'Tahoma, Arial, sans-serif',
      transform: `rotate(-90 9 ${(M.top + ih / 2).toFixed(1)})`
    });
    yt.textContent = yLabel;
    g.appendChild(yt);
  }

  svg.appendChild(g);

  // Вертикальные маркеры (например, границы столпов удачи)
  for (const mk of markers) {
    if (mk.index < 0 || mk.index >= points.length) continue;
    const x = xOf(mk.index);
    svg.appendChild(el('line', {
      x1: x, y1: M.top, x2: x, y2: M.top + ih,
      stroke: mk.color || '#b03060', 'stroke-width': 1, 'stroke-dasharray': '3,2'
    }));
    if (mk.label) {
      const t = el('text', {
        x: x + 2, y: M.top + 9, 'font-size': 8,
        fill: mk.color || '#b03060', 'font-family': 'Tahoma, Arial, sans-serif'
      });
      t.textContent = mk.label;
      svg.appendChild(t);
    }
  }

  // Линии серий
  for (const s of active) {
    let d = '';
    let started = false;
    points.forEach((p, i) => {
      const v = s.accessor(p);
      if (v === null || v === undefined || !Number.isFinite(v)) { started = false; return; }
      d += (started ? ' L ' : ' M ') + xOf(i).toFixed(2) + ' ' + yOf(v).toFixed(2);
      started = true;
    });
    svg.appendChild(el('path', {
      d, fill: 'none', stroke: s.color,
      'stroke-width': s.width || 1.4,
      'stroke-dasharray': s.dash || 'none',
      'shape-rendering': 'geometricPrecision'
    }));
    // Точки только при небольшом количестве отсчётов
    if (points.length <= 40) {
      points.forEach((p, i) => {
        const v = s.accessor(p);
        if (!Number.isFinite(v)) return;
        svg.appendChild(el('rect', {
          x: xOf(i) - 1.5, y: yOf(v) - 1.5, width: 3, height: 3, fill: s.color
        }));
      });
    }
  }

  // Слой наведения
  const hoverLine = el('line', {
    x1: 0, y1: M.top, x2: 0, y2: M.top + ih,
    stroke: '#444', 'stroke-width': 1, 'stroke-dasharray': '2,2', visibility: 'hidden'
  });
  svg.appendChild(hoverLine);

  const overlay = el('rect', {
    x: M.left, y: M.top, width: iw, height: ih, fill: 'transparent', cursor: 'crosshair'
  });
  svg.appendChild(overlay);

  overlay.addEventListener('mousemove', (ev) => {
    // BUG-02: при пустом ряде индекс наведения вычислялся как -1, и в onHover
    // уходила несуществующая точка (points[-1] === undefined). Наводиться не на
    // что — сообщаем об отсутствии точки тем же способом, что и при уходе мыши.
    if (!points.length) {
      hoverLine.setAttribute('visibility', 'hidden');
      if (cfg.onHover) cfg.onHover(null);
      return;
    }
    const r = svg.getBoundingClientRect();
    const scale = W / r.width;
    const mx = (ev.clientX - r.left) * scale;
    const idx = Math.round(((mx - M.left) / iw) * (points.length - 1));
    const i = Math.max(0, Math.min(points.length - 1, idx));
    hoverLine.setAttribute('x1', xOf(i));
    hoverLine.setAttribute('x2', xOf(i));
    hoverLine.setAttribute('visibility', 'visible');
    if (cfg.onHover) cfg.onHover(i, points[i], { clientX: ev.clientX, clientY: ev.clientY });
  });
  overlay.addEventListener('mouseleave', () => {
    hoverLine.setAttribute('visibility', 'hidden');
    if (cfg.onHover) cfg.onHover(null);
  });

  if (title) {
    const t = el('text', {
      x: M.left + 3, y: M.top + 10, 'font-size': 9,
      fill: '#555', 'font-family': 'Tahoma, Arial, sans-serif'
    });
    t.textContent = title;
    svg.appendChild(t);
  }
}

/** Столбчатая диаграмма (стихии, Инь/Ян). */
export function renderBarChart(svg, cfg) {
  const { bars, max = null } = cfg;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const W = svg.clientWidth || 200, H = svg.clientHeight || 120;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const M = { top: 6, right: 6, bottom: 16, left: 26 };
  const iw = W - M.left - M.right, ih = H - M.top - M.bottom;
  const hi = max ?? Math.max(1, ...bars.map((b) => b.value));

  svg.appendChild(el('rect', { x: M.left, y: M.top, width: iw, height: ih, fill: '#fff', stroke: '#7a7a7a' }));
  for (let k = 0; k <= 4; k++) {
    const y = M.top + ih - (k / 4) * ih;
    svg.appendChild(el('line', { x1: M.left, y1: y, x2: M.left + iw, y2: y, stroke: '#e0e0e0' }));
    const t = el('text', { x: M.left - 3, y: y + 3, 'text-anchor': 'end', 'font-size': 8, fill: '#333', 'font-family': 'Tahoma, Arial' });
    t.textContent = ((hi * k) / 4).toFixed(0);
    svg.appendChild(t);
  }
  const bw = iw / bars.length;
  bars.forEach((b, i) => {
    const h = (b.value / hi) * ih;
    svg.appendChild(el('rect', {
      x: M.left + i * bw + bw * 0.18, y: M.top + ih - h,
      width: bw * 0.64, height: Math.max(0, h),
      fill: b.color, stroke: '#555', 'stroke-width': 0.5
    }));
    const t = el('text', {
      x: M.left + i * bw + bw / 2, y: M.top + ih + 11,
      'text-anchor': 'middle', 'font-size': 8, fill: '#222', 'font-family': 'Tahoma, Arial'
    });
    t.textContent = b.label;
    svg.appendChild(t);
  });
}
