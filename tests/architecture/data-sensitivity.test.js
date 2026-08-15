/**
 * data-sensitivity.test.js — ТЕСТ НА ЧУВСТВИТЕЛЬНОСТЬ К ДАННЫМ (ARCHITECTURE 9.3).
 *
 * Это ключевой тест против дефекта ARCH-1: «JSON не управляет расчётом».
 * Если константа вынесена в data/*.json, то её изменение ОБЯЗАНО изменить
 * результат. Иначе JSON декоративен, а истина живёт в коде — и два источника
 * неизбежно разойдутся.
 *
 * Для каждой константы: меняем -> результат обязан отличаться;
 *                       возвращаем -> результат обязан совпасть с исходным.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTables } from '../../src/data/node-loader.js';
import { computeLuckPillars } from '../../src/engine/pillars.js';
import { yearIndexFromSolarYear } from '../../src/engine/ganzhi.js';
import { annualStar, periodForYear } from '../../src/engine/flyingstars.js';

const T = loadTables();
const BIRTH = { year: 2022, month: 5, day: 1, hour: 19, minute: 14, gender: 'male', tzOffsetHours: 3 };

test('Чувствительность: конверсия столпов удачи (3 дня = 1 год)', () => {
  const base = computeLuckPillars(BIRTH, { rules: T.luckRules, anchors: T.anchors, zi: T.ziRule });
  const changed = computeLuckPillars(BIRTH, {
    rules: { ...T.luckRules, daysPerYear: T.luckRules.daysPerYear * 2 },
    anchors: T.anchors, zi: T.ziRule
  });
  assert.notEqual(changed.startAge, base.startAge,
    'Изменение daysPerYear не повлияло — константа зашита в коде');
  assert.ok(Math.abs(changed.startAge - base.startAge / 2) < 1e-9,
    'Удвоение daysPerYear обязано вдвое уменьшить начальный возраст');

  const restored = computeLuckPillars(BIRTH, { rules: T.luckRules, anchors: T.anchors, zi: T.ziRule });
  assert.equal(restored.startAge, base.startAge, 'Возврат значения обязан вернуть исходный результат');
});

test('Чувствительность: длина столпа удачи (10 лет)', () => {
  const base = computeLuckPillars(BIRTH, { rules: T.luckRules, anchors: T.anchors, zi: T.ziRule });
  const changed = computeLuckPillars(BIRTH, { rules: { ...T.luckRules, pillarYears: 20 }, anchors: T.anchors, zi: T.ziRule });
  const stepBase = base.pillars[1].startAge - base.pillars[0].startAge;
  const stepChanged = changed.pillars[1].startAge - changed.pillars[0].startAge;
  assert.equal(stepBase, T.luckRules.pillarYears);
  assert.equal(stepChanged, 20, 'Длина столпа не пришла из данных');
});

test('Чувствительность: якорь столпа года (1984)', () => {
  const base = yearIndexFromSolarYear(2026, T.anchors);
  const changed = yearIndexFromSolarYear(2026, { ...T.anchors, yearPillar: T.anchors.yearPillar + 1 });
  assert.notEqual(changed, base, 'Якорь года не пришёл из данных');
  assert.equal(yearIndexFromSolarYear(2026, T.anchors), base);
});

test('Чувствительность: якорь годовой звезды (2024 -> 3)', () => {
  const base = annualStar(2026, T.anchors);
  const changed = annualStar(2026, { ...T.anchors, annualStarValue: T.anchors.annualStarValue + 1 });
  assert.notEqual(changed, base, 'Якорь годовой звезды не пришёл из данных');
});

test('Чувствительность: якорь периодов Сань Юань (1864, 180 лет)', () => {
  // Год за пределами таблицы периодов — работает ветка расширения по циклу.
  const far = 2500;
  const base = periodForYear(far, T.luoshu);
  const shifted = {
    ...T.luoshu,
    periods: { ...T.luoshu.periods, items: T.luoshu.periods.items.map((p, i) => (i === 0 ? { ...p, start: p.start + 20 } : p)) }
  };
  const changed = periodForYear(far, shifted);
  assert.notEqual(changed, base, 'Якорь периодов не пришёл из данных');
});

test('CONST-1: вызов без данных ПАДАЕТ, а не откатывается на литерал (RT-03)', () => {
  // Раньше все три функции имели молчаливый откат вида `anchors ? ... : 1984`,
  // из-за чего правило «JSON управляет расчётом» было фиктивным.
  assert.throws(() => yearIndexFromSolarYear(2026), /CONST-1/);
  assert.throws(() => annualStar(2026), /CONST-1/);
  assert.throws(() => computeLuckPillars(BIRTH, { anchors: T.anchors }), /CONST-1/);
});

test('Значения в данных совпадают с прежними литералами (регрессия не изменила результаты)', () => {
  assert.equal(T.anchors.yearPillar, 1984);
  assert.equal(T.anchors.periodStart, 1864);
  assert.equal(T.anchors.annualStarYear, 2024);
  assert.equal(T.anchors.annualStarValue, 3);
  assert.equal(T.luckRules.daysPerYear, 3);
  assert.equal(T.luckRules.pillarYears, 10);
});
