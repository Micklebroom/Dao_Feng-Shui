/**
 * model.test.js — СЛОЙ 3 (Result Model) и политика «не выдумывать».
 *
 * Ключевые регрессии этой фазы: показатель без опубликованной формулы
 * ОБЯЗАН возвращать null. Если кто-то однажды подставит туда правдоподобное
 * число ради красивого графика, эти тесты упадут.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTables } from '../../src/data/node-loader.js';
import { buildProfile, buildTimeSeries, validateInput } from '../../src/model/profile.js';
import { INDICATOR_CATALOG, healthIndex, tripleBurner } from '../../src/model/indicators.js';
import { DateRangeError, InputError, NotVerifiedError } from '../../src/core/errors.js';

const T = loadTables();
const BIRTH = { year: 1967, month: 6, day: 5, hour: 12, minute: 0, gender: 'male', tzOffsetHours: 3 };

test('Профиль строится и содержит 10 меридианов', () => {
  const m = buildProfile(BIRTH, T);
  assert.equal(m.meridians.length, 10);
  assert.ok(!m.meridians.some((x) => x.id === 'pericardium' || x.id === 'tripleBurner'));
  assert.equal(m.modelVersion, '1.0.0');
});

test('Каждое значение меридиана несёт статус происхождения', () => {
  const m = buildProfile(BIRTH, T);
  for (const mer of m.meridians) {
    assert.equal(mer.value.status, 'INFERRED');
    assert.equal(mer.value.placeholderRef, 'PH-F1');
    assert.equal(typeof mer.value.value, 'number');
  }
});

test('ПОЛИТИКА: итоговый индекс здоровья не рассчитывается (PH-F5)', () => {
  const h = healthIndex();
  assert.equal(h.value, null, 'Формула не опубликована — значение обязано быть null');
  assert.equal(h.status, 'NOT_VERIFIED');
});

test('ПОЛИТИКА: Три обогревателя не агрегируются (U-24)', () => {
  const tb = tripleBurner([], T);
  assert.equal(tb.available, false);
  assert.equal(tb.groups.length, 3);
  for (const g of tb.groups) assert.equal(g.value.value, null);
});

test('ПОЛИТИКА: все NOT_VERIFIED показатели профиля пусты', () => {
  const m = buildProfile(BIRTH, T);
  const mustBeNull = ['health', 'activity', 'emotions', 'luckIndicator', 'relations', 'desires', 'will', 'spirit'];
  for (const k of mustBeNull) {
    assert.equal(m.indicators[k].value, null, `indicators.${k} обязан быть null`);
    assert.equal(m.indicators[k].status, 'NOT_VERIFIED');
  }
});

test('ПОЛИТИКА: каталог показателей не помечает неизвестное как подтверждённое', () => {
  for (const c of INDICATOR_CATALOG) {
    assert.ok(['VERIFIED', 'PARTIALLY VERIFIED', 'INFERRED', 'NOT_VERIFIED'].includes(c.status));
    assert.ok(c.note && c.note.length > 20, `${c.id}: обязано быть объяснение статуса`);
    if (c.status === 'NOT_VERIFIED') {
      assert.ok(c.placeholderRef, `${c.id}: NOT_VERIFIED обязан ссылаться на заглушку`);
    }
  }
  // Ни один показатель ТЗ не может быть объявлен VERIFIED: формулы графиков
  // референса не опубликованы ни для одного из них.
  assert.equal(INDICATOR_CATALOG.filter((c) => c.status === 'VERIFIED').length, 0);
});

test('Все пять масштабов времени работают', () => {
  for (const [scale, n] of [['decade', 8], ['year', 12], ['month', 24], ['day', 30], ['hour', 24]]) {
    const ts = buildTimeSeries(BIRTH, T, { scale, count: n });
    assert.equal(ts.points.length, n, `масштаб ${scale}`);
    assert.ok(ts.points.every((p) => p.meridians.length === 10));
    assert.ok(ts.points.every((p) => Number.isFinite(p.harmony)));
  }
});

test('Масштаб «час» даёт различающиеся столпы часа', () => {
  const ts = buildTimeSeries(BIRTH, T, { scale: 'hour', count: 12 });
  const labels = ts.points.map((p) => p.label);
  assert.equal(labels[0], '12:00');
  assert.equal(new Set(labels).size, 12, 'метки часов обязаны различаться');
});

test('Проверка ввода: год вне диапазона', () => {
  assert.throws(() => validateInput({ ...BIRTH, year: 1500 }, T), DateRangeError);
  assert.throws(() => validateInput({ ...BIRTH, year: 3000 }, T), DateRangeError);
});

test('Проверка ввода: пол и часовой пояс', () => {
  assert.throws(() => validateInput({ ...BIRTH, gender: 'x' }, T), InputError);
  assert.throws(() => validateInput({ ...BIRTH, tzOffsetHours: 99 }, T), InputError);
  assert.throws(() => validateInput({ ...BIRTH, month: 13 }, T), InputError);
});

test('Ошибки несут понятное пользователю сообщение на русском', () => {
  try { validateInput({ ...BIRTH, year: 1500 }, T); assert.fail('должно бросить'); }
  catch (e) {
    assert.ok(e.userMessage.includes('1500'));
    assert.ok(/диапазон/i.test(e.userMessage));
  }
});

test('NotVerifiedError — отдельный класс, а не общий сбой', () => {
  const e = new NotVerifiedError('Индикатор Удачи', 'PH-G2');
  assert.equal(e.code, 'NOT_VERIFIED');
  assert.equal(e.placeholderRef, 'PH-G2');
  assert.equal(e.userMessage, 'Алгоритм не подтверждён');
});

test('Детерминизм: повторный расчёт даёт тот же результат', () => {
  const a = buildProfile(BIRTH, T);
  const b = buildProfile(BIRTH, T);
  assert.deepEqual(a.meridians.map((x) => x.value.value), b.meridians.map((x) => x.value.value));
  assert.equal(a.indicators.harmony.value, b.indicators.harmony.value);
});
