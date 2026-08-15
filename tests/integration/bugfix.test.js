/**
 * bugfix.test.js — РЕГРЕССИОННЫЕ ТЕСТЫ ФАЗЫ 8.
 *
 * Каждый тест закрепляет конкретный дефект из tests/browser_test_report.md.
 * Если исправление когда-нибудь откатят, эти тесты покраснеют.
 *
 * Важно: тесты проверяют ОТСУТСТВИЕ СБОЯ и КОРРЕКТНУЮ ОШИБКУ,
 * а не подменяют расчёт заглушками.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTables } from '../../src/data/node-loader.js';
import {
  buildTimeSeries, buildProfile, validateSeriesOptions, MAX_SERIES_POINTS
} from '../../src/model/profile.js';
import { InputError, DateRangeError } from '../../src/core/errors.js';

const T = loadTables();
const BIRTH = { year: 1967, month: 6, day: 5, hour: 12, minute: 0, gender: 'male', tzOffsetHours: 3 };

/* ================= BUG-03: параметры ряда не проверялись ================= */

test('BUG-03: количество точек 0 отклоняется понятной ошибкой', () => {
  assert.throws(() => buildTimeSeries(BIRTH, T, { scale: 'year', count: 0 }), InputError);
  try { buildTimeSeries(BIRTH, T, { scale: 'year', count: 0 }); }
  catch (e) { assert.match(e.userMessage, /не меньше 1/); }
});

test('BUG-03: отрицательное количество точек отклоняется', () => {
  assert.throws(() => buildTimeSeries(BIRTH, T, { scale: 'year', count: -10 }), InputError);
});

test('BUG-03: чрезмерное количество точек отклоняется (защита от зависания)', () => {
  assert.throws(() => buildTimeSeries(BIRTH, T, { scale: 'year', count: MAX_SERIES_POINTS + 1 }), InputError);
  // Граничное значение обязано проходить.
  const ok = buildTimeSeries(BIRTH, T, { scale: 'year', count: MAX_SERIES_POINTS });
  assert.equal(ok.points.length, MAX_SERIES_POINTS);
});

test('BUG-03: начальный год вне диапазона отклоняется так же, как дата рождения', () => {
  assert.throws(() => buildTimeSeries(BIRTH, T, { scale: 'year', from: 99999, count: 5 }), DateRangeError);
  assert.throws(() => buildTimeSeries(BIRTH, T, { scale: 'year', from: 1000, count: 5 }), DateRangeError);
});

test('BUG-03: неизвестный масштаб отклоняется, а не игнорируется молча', () => {
  assert.throws(() => buildTimeSeries(BIRTH, T, { scale: 'week', count: 5 }), InputError);
});

test('BUG-03: корректные параметры по-прежнему работают', () => {
  for (const [scale, n] of [['decade', 8], ['year', 30], ['month', 24], ['day', 30], ['hour', 24]]) {
    const ts = buildTimeSeries(BIRTH, T, { scale, count: n, from: 2000 });
    assert.equal(ts.points.length, n, `масштаб ${scale}`);
  }
});

test('BUG-03: validateSeriesOptions пропускает пустые параметры (значения по умолчанию)', () => {
  assert.doesNotThrow(() => validateSeriesOptions({}, T));
  assert.doesNotThrow(() => validateSeriesOptions({ scale: 'year' }, T));
});

/* ============ Регрессия расчёта: правки не изменили значения ============ */

test('РЕГРЕССИЯ: правки фазы 8 не изменили расчётные значения', () => {
  const p = buildProfile(BIRTH, T);
  // Значения зафиксированы ДО внесения правок (прогон на сборке d0ba269).
  assert.equal(p.meridians.length, 10);
  assert.equal(p.indicators.harmony.value.toFixed(6), '41.235591');
  assert.equal(p.pillars.year.stem, 3);
  assert.equal(p.pillars.year.branch, 7);
  assert.equal(p.pillars.day.stem, 6);
  assert.equal(p.pillars.day.branch, 0);
});

test('РЕГРЕССИЯ: политика «не выдумывать» не нарушена правками', () => {
  const p = buildProfile(BIRTH, T);
  for (const k of ['health', 'activity', 'emotions', 'luckIndicator', 'relations', 'desires', 'will', 'spirit']) {
    assert.equal(p.indicators[k].value, null, `indicators.${k} обязан оставаться null`);
  }
  assert.equal(p.indicators.tripleBurner.available, false);
});
