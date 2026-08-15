import test from 'node:test';
import assert from 'node:assert/strict';
import {
  flyStars, wrap9, annualStar, monthlyStar, periodForYear,
  computeGeomanticChart, mountainForDegrees, flightDirectionFor
} from '../../src/engine/flyingstars.js';
import { loadTables } from '../../src/data/node-loader.js';

const T = loadTables();

test('wrap9 приводит номера в 1..9', () => {
  assert.equal(wrap9(10), 1);
  assert.equal(wrap9(0), 9);
  assert.equal(wrap9(-1), 8);
  assert.equal(wrap9(9), 9);
  assert.equal(wrap9(18), 9);
});

test('Полёт вперёд из центра 1 даёт классическую раскладку', () => {
  // Источник: en.wikibooks.org/wiki/Feng_Shui — Yang Direction, старт 1
  //  9 5 7 / 8 1 3 / 4 6 2  (в порядке ЮВ Ю ЮЗ / В Ц З / СВ С СЗ)
  const g = flyStars(1, true, T.luoshu);
  assert.equal(g.C, 1);
  assert.equal(g.NW, 2);
  assert.equal(g.W, 3);
  assert.equal(g.NE, 4);
  assert.equal(g.S, 5);
  assert.equal(g.N, 6);
  assert.equal(g.SW, 7);
  assert.equal(g.E, 8);
  assert.equal(g.SE, 9);
});

test('Полёт назад из центра 1 даёт классическую обратную раскладку', () => {
  // Источник: тот же — Yin Direction, старт 1: 2 6 4 / 3 1 8 / 7 5 9
  const g = flyStars(1, false, T.luoshu);
  assert.equal(g.C, 1);
  assert.equal(g.NW, 9);
  assert.equal(g.W, 8);
  assert.equal(g.NE, 7);
  assert.equal(g.S, 6);
  assert.equal(g.N, 5);
  assert.equal(g.SW, 4);
  assert.equal(g.E, 3);
  assert.equal(g.SE, 2);
});

test('Земная основа периода 5 совпадает с базовым квадратом Ло Шу', () => {
  const g = flyStars(5, true, T.luoshu);
  for (const p of T.luoshu.palaces) {
    assert.equal(g[p.direction], p.number, `дворец ${p.direction}`);
  }
});

test('Периоды Сань Юань', () => {
  assert.equal(periodForYear(2024, T.luoshu), 9);
  assert.equal(periodForYear(2043, T.luoshu), 9);
  assert.equal(periodForYear(2004, T.luoshu), 8);
  assert.equal(periodForYear(2023, T.luoshu), 8);
  assert.equal(periodForYear(1984, T.luoshu), 7);
  assert.equal(periodForYear(1864, T.luoshu), 1);
});

test('Годовые звёзды: 2024=3, 2025=2, 2026=1 (независимый источник по 2026)', () => {
  // fengshuibalanz.com: «Annual Flying Star 1 in the CENTRAL Palace» для 2026
  assert.equal(annualStar(2024), 3);
  assert.equal(annualStar(2025), 2);
  assert.equal(annualStar(2026), 1);
  assert.equal(annualStar(2027), 9);
  assert.equal(annualStar(2023), 4);
});

test('Годовые звёзды убывают с периодом 9', () => {
  for (let y = 1900; y < 2100; y++) {
    assert.equal(annualStar(y + 9), annualStar(y), `год ${y}`);
    assert.equal(annualStar(y + 1), wrap9(annualStar(y) - 1));
  }
});

test('Годовая звезда 2026 в центре согласуется с размещением звёзд по дворцам', () => {
  // fengshuibalanz.com для 2026: звезда 8 — Восток, 2 — СЗ, 5 — Юг, 7 — ЮЗ, 3 — Запад
  const g = flyStars(annualStar(2026), true, T.luoshu);
  assert.equal(g.C, 1);
  assert.equal(g.E, 8, 'звезда 8 на востоке');
  assert.equal(g.NW, 2, 'звезда 2 на северо-западе');
  assert.equal(g.S, 5, 'звезда 5 на юге');
  assert.equal(g.SW, 7, 'звезда 7 на юго-западе');
  assert.equal(g.W, 3, 'звезда 3 на западе');
});

test('Месячные звёзды: группы ветви года', () => {
  // Цзы/Мао/У/Ю -> месяц Инь = 8
  for (const b of [0, 3, 6, 9]) assert.equal(monthlyStar(b, 0), 8);
  // Чоу/Чэнь/Вэй/Сюй -> 5
  for (const b of [1, 4, 7, 10]) assert.equal(monthlyStar(b, 0), 5);
  // Инь/Сы/Шэнь/Хай -> 2
  for (const b of [2, 5, 8, 11]) assert.equal(monthlyStar(b, 0), 2);
});

test('Месячные звёзды 2026 совпадают с опубликованными визитами', () => {
  // 2026 — год Бин У (ветвь У, index 6). Месяц Инь (февраль-март) = 8.
  // Источник fengshuibalanz.com (для центрального дворца, годовая 1):
  // «месячная 7 приходит в марте», «5 в мае», «3 в июле», «4 в июне», «2 в августе»
  const b = 6;
  const star = (ord) => monthlyStar(b, ord);
  assert.equal(star(0), 8);  // Инь: ~4 фев - 5 мар
  assert.equal(star(1), 7);  // Мао: ~6 мар - 4 апр -> март: 7  ✔
  assert.equal(star(2), 6);  // Чэнь: апрель
  assert.equal(star(3), 5);  // Сы: ~5 мая - 5 июн -> май: 5  ✔
  assert.equal(star(4), 4);  // У: ~6 июн - 6 июл -> июнь: 4  ✔
  assert.equal(star(5), 3);  // Вэй: ~7 июл - 7 авг -> июль: 3  ✔
  assert.equal(star(6), 2);  // Шэнь: ~8 авг - 7 сен -> август: 2  ✔
});

test('Определение горы по азимуту', () => {
  assert.equal(mountainForDegrees(0, T.mountains24).code, 'N2');
  assert.equal(mountainForDegrees(359, T.mountains24).code, 'N2');
  assert.equal(mountainForDegrees(180, T.mountains24).code, 'S2');
  assert.equal(mountainForDegrees(90, T.mountains24).code, 'E2');
  assert.equal(mountainForDegrees(270, T.mountains24).code, 'W2');
  assert.equal(mountainForDegrees(45, T.mountains24).code, 'NE2');
  assert.equal(mountainForDegrees(337.5, T.mountains24).code, 'N1');
  assert.equal(mountainForDegrees(352.5, T.mountains24).code, 'N2');
});

test('Гора и её противоположность всегда расходятся на 180°', () => {
  for (const m of T.mountains24.items) {
    const mid = (m.start + 7.5) % 360;
    const opp = mountainForDegrees((mid + 180) % 360, T.mountains24);
    assert.equal(opp.index, (m.index + 12) % 24, `гора ${m.code}`);
  }
});

test('ЭТАЛОН: период 8, фасад S2 (180°) — известная карта 雙星會向', () => {
  // Источник: fengshuied.com/flying-star-natal-charts — подробный разбор
  // этой самой карты: земная основа 8 в центре, горная 4, водная 3,
  // водная летит назад (Ю — небо/инь), горная вперёд (СВ 4 -> ЮВ ян).
  const c = computeGeomanticChart({ period: 8, facingDegrees: 180 }, T);

  assert.equal(c.facing.code, 'S2');
  assert.equal(c.sitting.code, 'N2');
  assert.equal(c.earthBase.C, 8);
  assert.equal(c.earthBase.S, 3, 'основа на юге = 3');
  assert.equal(c.earthBase.N, 4, 'основа на севере = 4');

  assert.equal(c.flight.waterCenter, 3, 'водная звезда центра = 3');
  assert.equal(c.flight.mountainCenter, 4, 'горная звезда центра = 4');
  assert.equal(c.flight.waterForward, false, 'водная летит назад');
  assert.equal(c.flight.mountainForward, true, 'горная летит вперёд');

  // Дворец фасада (Юг) должен содержать 8/8 — «двойные звёзды у фасада»
  assert.equal(c.mountainStars.S, 8);
  assert.equal(c.waterStars.S, 8);
});

test('ЭТАЛОН: период 9, фасад S2 — 雙星會坐 (двойные звёзды у сидения)', () => {
  const c = computeGeomanticChart({ period: 9, facingDegrees: 180 }, T);
  assert.equal(c.facing.code, 'S2');
  assert.equal(c.sitting.code, 'N2');
  assert.equal(c.earthBase.C, 9);
  assert.equal(c.earthBase.S, 4, 'основа юга = 4');
  assert.equal(c.earthBase.N, 5, 'основа севера = 5');
  assert.equal(c.flight.waterCenter, 4);
  assert.equal(c.flight.mountainCenter, 5, 'горная центра = 5 (полярность по периоду)');
  // Обе девятки собираются в дворце СИДЕНИЯ (север) — 雙星會坐
  assert.equal(c.mountainStars.N, 9, 'горная 9 в дворце сидения');
  assert.equal(c.waterStars.N, 9, 'водная 9 в дворце сидения');
});

test('Зеркальность: карта фасад-X является зеркалом карты сидение-X', () => {
  // Разворот здания на 180° меняет ролями горные и водные звёзды.
  const a = computeGeomanticChart({ period: 9, facingDegrees: 180 }, T);   // сидение N2
  const b = computeGeomanticChart({ period: 9, facingDegrees: 0 }, T);     // сидение S2
  for (const d of ['SE', 'S', 'SW', 'E', 'C', 'W', 'NE', 'N', 'NW']) {
    assert.equal(a.mountainStars[d], b.waterStars[d], `${d}: гора(A) = вода(B)`);
    assert.equal(a.waterStars[d], b.mountainStars[d], `${d}: вода(A) = гора(B)`);
    assert.equal(a.earthBase[d], b.earthBase[d], `${d}: основа совпадает`);
  }
});

test('Все 24 направления x 9 периодов дают корректные карты', () => {
  for (let p = 1; p <= 9; p++) {
    for (const m of T.mountains24.items) {
      const deg = (m.start + 7.5) % 360;
      const c = computeGeomanticChart({ period: p, facingDegrees: deg }, T);
      const vals = Object.values(c.mountainStars).concat(Object.values(c.waterStars));
      for (const v of vals) assert.ok(v >= 1 && v <= 9, `период ${p} гора ${m.code}`);
      // Каждая карта содержит все девять номеров ровно по разу
      assert.equal(new Set(Object.values(c.mountainStars)).size, 9);
      assert.equal(new Set(Object.values(c.waterStars)).size, 9);
      assert.equal(new Set(Object.values(c.earthBase)).size, 9);
      // Сидение строго напротив фасада
      assert.equal(c.sitting.index, (c.facing.index + 12) % 24);
    }
  }
});

test('Направление полёта определяется полярностью горы той же триады', () => {
  // Земля/небо/человек сохраняются при переносе в центр
  assert.equal(flightDirectionFor(1, 'heaven', T), false, 'N2 Цзы — инь');
  assert.equal(flightDirectionFor(1, 'earth', T), true, 'N1 Жэнь — ян');
  assert.equal(flightDirectionFor(9, 'heaven', T), false, 'S2 У — инь');
  assert.equal(flightDirectionFor(4, 'heaven', T), true, 'SE2 Сюнь — ян');
});
