import test from 'node:test';
import assert from 'node:assert/strict';
import {
  julianDayFromUTC, utcFromJulianDay, apparentSolarLongitude,
  solarTermInstantUTC, deltaTSeconds
} from '../../src/engine/astro.js';

test('Julian Day: опорные значения', () => {
  // Meeus, Astronomical Algorithms, примеры 7.a / 7.b
  assert.equal(julianDayFromUTC(1957, 10, 4, 19, 26, 24), 2436116.31);
  assert.equal(julianDayFromUTC(2000, 1, 1, 12, 0, 0), 2451545.0);
  assert.equal(julianDayFromUTC(1999, 1, 1, 0, 0, 0), 2451179.5);
});

test('Julian Day: обратное преобразование', () => {
  for (const [y, m, d] of [[2024, 2, 4], [1900, 1, 1], [2100, 12, 31], [1987, 6, 19]]) {
    const jd = julianDayFromUTC(y, m, d, 12, 0, 0);
    const back = utcFromJulianDay(jd);
    assert.equal(back.year, y);
    assert.equal(back.month, m);
    assert.equal(back.day, d);
    assert.equal(back.hour, 12);
  }
});

test('Видимая долгота Солнца: пример Meeus 25.a', () => {
  // 1992 октябрь 13.0 TD -> видимая долгота 199°54'21" = 199.90583..;
  // приведённый в книге результат сокращённого метода: 199.90895 deg
  const jd = julianDayFromUTC(1992, 10, 13, 0, 0, 0);
  const lon = apparentSolarLongitude(jd);
  assert.ok(Math.abs(lon - 199.90895) < 0.001, `получено ${lon}`);
});

test('Долгота Солнца монотонно растёт и покрывает 0..360', () => {
  const jd0 = julianDayFromUTC(2025, 1, 1, 0, 0, 0);
  let prev = apparentSolarLongitude(jd0);
  let wraps = 0;
  for (let i = 1; i <= 365; i++) {
    const cur = apparentSolarLongitude(jd0 + i);
    if (cur < prev) wraps++;
    prev = cur;
  }
  assert.equal(wraps, 1, 'за год должен быть ровно один переход через 360°');
});

test('Равноденствия и солнцестояния 2025 совпадают с опубликованными (UTC)', () => {
  // Эталон: астрономические таблицы (US Naval Observatory / timeanddate), UTC.
  const cases = [
    { lon: 0,   name: 'весеннее равноденствие', y: 2025, m: 3,  d: 20, h: 9,  mi: 1 },
    { lon: 90,  name: 'летнее солнцестояние',   y: 2025, m: 6,  d: 21, h: 2,  mi: 42 },
    { lon: 180, name: 'осеннее равноденствие',  y: 2025, m: 9,  d: 22, h: 18, mi: 19 },
    { lon: 270, name: 'зимнее солнцестояние',   y: 2025, m: 12, d: 21, h: 15, mi: 3 }
  ];
  for (const c of cases) {
    const jd = solarTermInstantUTC(c.y, c.lon);
    const g = utcFromJulianDay(jd);
    assert.equal(g.year, c.y, c.name);
    assert.equal(g.month, c.m, c.name);
    assert.equal(g.day, c.d, `${c.name}: получено ${JSON.stringify(g)}`);
    const gotMin = g.hour * 60 + g.minute;
    const expMin = c.h * 60 + c.mi;
    assert.ok(Math.abs(gotMin - expMin) <= 20,
      `${c.name}: отклонение ${Math.abs(gotMin - expMin)} мин (получено ${g.hour}:${g.minute})`);
  }
});

test('Ли Чунь попадает на 3-5 февраля для широкого диапазона лет', () => {
  for (let y = 1900; y <= 2100; y += 7) {
    const g = utcFromJulianDay(solarTermInstantUTC(y, 315));
    assert.equal(g.month, 2, `год ${y}`);
    assert.ok(g.day >= 3 && g.day <= 5, `год ${y}: день ${g.day}`);
  }
});

test('deltaT в разумных пределах', () => {
  assert.ok(Math.abs(deltaTSeconds(2000) - 63.8) < 3);
  assert.ok(Math.abs(deltaTSeconds(1900) - (-2.8)) < 5);
  assert.ok(deltaTSeconds(2025) > 60 && deltaTSeconds(2025) < 80);
});

test('Детерминизм: повторный расчёт даёт бит-в-бит тот же результат', () => {
  const a = solarTermInstantUTC(2024, 315);
  const b = solarTermInstantUTC(2024, 315);
  assert.equal(a, b);
});
