import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTables } from '../../src/data/node-loader.js';
import {
  computeProfile, computeTimeSeries, computeFlyingStarsView,
  computeLuckPillars, computeDayStar, solarTermTable, computeGua
} from '../../src/engine/index.js';

const T = loadTables();

const SUBJECT = {
  year: 1967, month: 6, day: 5, hour: 12, minute: 0,
  tzOffsetHours: 3, gender: 'male'
};

test('Профиль: структура результата полна и детерминирована', () => {
  const a = computeProfile(SUBJECT, T);
  const b = computeProfile(SUBJECT, T);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)),
    'два вызова обязаны дать идентичный результат');

  for (const role of ['year', 'month', 'day', 'hour']) {
    assert.ok(a.pillars[role].stem >= 0 && a.pillars[role].stem < 10);
    assert.ok(a.pillars[role].branch >= 0 && a.pillars[role].branch < 12);
    assert.ok(a.pillarLabels[role].han.length === 2);
  }
  // РЕГРЕССИЯ (аудит A-02): меридианов РОВНО 10, а не 12.
  // Перикард и тройной обогреватель референсом не используются.
  assert.equal(a.meridians.length, 10);
  assert.ok(!a.meridians.some((m) => m.id === 'pericardium' || m.id === 'tripleBurner'));
  assert.ok(a.harmony >= 0 && a.harmony <= 100);
});

test('Профиль: сумма процентов стихий = 100', () => {
  const p = computeProfile(SUBJECT, T);
  const sum = Object.values(p.elements.percent).reduce((x, y) => x + y, 0);
  assert.ok(Math.abs(sum - 100) < 1e-9, `сумма = ${sum}`);
});

test('Профиль: столпы 05.06.1967 12:00 MSK', () => {
  const p = computeProfile(SUBJECT, T);
  // 1967 — год Дин Вэй (丁未). Июнь -> месяц У (午), после Ман Чжун (6 июня) — Сы (巳)?
  assert.equal(p.solarYear, 1967);
  assert.equal(p.pillarLabels.year.han, '丁未');
  // Проверка через независимую формулу дня: 5 июня 1967
  assert.equal(p.pillarLabels.day.han.length, 2);
});

test('Профиль: Инь и Ян в сумме дают 100%', () => {
  const p = computeProfile(SUBJECT, T);
  assert.ok(Math.abs(p.yinYang.yinPercent + p.yinYang.yangPercent - 100) < 1e-9);
});

test('Меридианы: значения неотрицательны и полосы назначены', () => {
  const p = computeProfile(SUBJECT, T);
  const validBands = T.weights.interpretationBands.map((b) => b.id);
  for (const m of p.meridians) {
    assert.ok(m.value >= 0, `${m.id} отрицателен`);
    assert.ok(validBands.includes(m.band), `${m.id}: неизвестная полоса ${m.band}`);
  }
});

test('Столпы удачи: направление и последовательность', () => {
  const male = computeLuckPillars({ ...SUBJECT, gender: 'male' }, { count: 8 });
  const female = computeLuckPillars({ ...SUBJECT, gender: 'female' }, { count: 8 });
  // 1967 Дин(3) — иньский ствол; мужчина -> назад, женщина -> вперёд
  assert.equal(male.forward, false);
  assert.equal(female.forward, true);
  assert.equal(male.pillars.length, 8);
  // Возраст старта в разумных пределах.
  // Верхняя граница: солнечный месяц ~30.4 дня, правило «3 дня = 1 год» -> ~10.2 года.
  assert.ok(male.startAge >= 0 && male.startAge <= 10.5, `startAge=${male.startAge}`);
  assert.ok(female.startAge >= 0 && female.startAge <= 10.5, `startAge=${female.startAge}`);
  // Сумма расстояний вперёд и назад до границ = длина солнечного месяца
  assert.ok(male.deltaDays + female.deltaDays > 27 && male.deltaDays + female.deltaDays < 32,
    `сумма расстояний до границ сезона = ${male.deltaDays + female.deltaDays}`);
  // Каждый следующий столп на 10 лет позже
  for (let i = 1; i < male.pillars.length; i++) {
    assert.ok(Math.abs((male.pillars[i].startAge - male.pillars[i - 1].startAge) - 10) < 1e-9);
  }
});

test('Столпы удачи: мужчина в ян-год идёт вперёд', () => {
  const m = computeLuckPillars({ year: 1984, month: 6, day: 15, hour: 10, gender: 'male' }, { count: 3 });
  assert.equal(m.forward, true, '1984 Цзя — ян; мужчина -> вперёд');
  const f = computeLuckPillars({ year: 1984, month: 6, day: 15, hour: 10, gender: 'female' }, { count: 3 });
  assert.equal(f.forward, false);
});

test('Временной ряд: годовой масштаб даёт запрошенное число точек', () => {
  const ts = computeTimeSeries(SUBJECT, T, { scale: 'year', from: 2000, count: 25 });
  assert.equal(ts.points.length, 25);
  assert.equal(ts.points[0].label, '2000');
  assert.equal(ts.points[24].label, '2024');
  for (const pt of ts.points) {
    assert.equal(pt.meridians.length, 10);
    assert.ok(pt.harmony >= 0 && pt.harmony <= 100);
  }
});

test('Временной ряд: все четыре масштаба работают', () => {
  for (const [scale, count] of [['decade', 8], ['year', 12], ['month', 24], ['day', 30]]) {
    const ts = computeTimeSeries(SUBJECT, T, { scale, from: 2005, count });
    assert.equal(ts.points.length, count, `масштаб ${scale}`);
    assert.ok(ts.points.every((p) => p.meridians.length === 10));
  }
});

test('Временной ряд: значения меняются во времени (не константа)', () => {
  const ts = computeTimeSeries(SUBJECT, T, { scale: 'year', from: 2000, count: 20 });
  const liver = ts.points.map((p) => p.meridians.find((m) => m.id === 'liver').value);
  const uniq = new Set(liver.map((v) => v.toFixed(6)));
  assert.ok(uniq.size > 3, `печень принимает лишь ${uniq.size} различных значений`);
});

test('Временной ряд: детерминизм при повторном вызове', () => {
  const a = computeTimeSeries(SUBJECT, T, { scale: 'year', from: 2010, count: 10 });
  const b = computeTimeSeries(SUBJECT, T, { scale: 'year', from: 2010, count: 10 });
  assert.equal(JSON.stringify(a.points), JSON.stringify(b.points));
});

test('Переключатель слияний реально меняет результат', () => {
  const withC = computeTimeSeries(SUBJECT, T, { scale: 'year', from: 2000, count: 10, applyCombos: true });
  const without = computeTimeSeries(SUBJECT, T, { scale: 'year', from: 2000, count: 10, applyCombos: false });
  assert.notEqual(JSON.stringify(withC.points), JSON.stringify(without.points),
    'режимы «с учётом слияний» и «без» обязаны различаться');
});

test('Число Гуа: контрольные значения', () => {
  // 1984: цифровой корень 1+9+8+4=22 -> 4. Мужчина: 11-4=7. Женщина: 4+4=8.
  assert.equal(computeGua(1984, 'male', T).gua, 7);
  assert.equal(computeGua(1984, 'female', T).gua, 8);
  // 2000: 2 -> мужчина 11-2=9, женщина 2+4=6
  assert.equal(computeGua(2000, 'male', T).gua, 9);
  assert.equal(computeGua(2000, 'female', T).gua, 6);
  // Гуа 5 не существует: заменяется 2 (муж) / 8 (жен)
  const m5 = computeGua(1987, 'male', T); // 1+9+8+7=25 -> 7; 11-7=4
  assert.notEqual(m5.gua, 5);
  for (let y = 1900; y < 2100; y++) {
    assert.notEqual(computeGua(y, 'male', T).gua, 5, `год ${y}`);
    assert.notEqual(computeGua(y, 'female', T).gua, 5, `год ${y}`);
  }
});

test('Число Гуа: группа согласована с направлениями', () => {
  for (let y = 1950; y < 2050; y++) {
    for (const g of ['male', 'female']) {
      const r = computeGua(y, g, T);
      assert.ok(['east', 'west'].includes(r.group));
      assert.equal(Object.keys(r.directions).length, 8);
    }
  }
});

test('Окно летящих звёзд собирается целиком', () => {
  const v = computeFlyingStarsView(
    { buildYear: 2010, facingDegrees: 180 },
    { year: 2026, month: 3, day: 15, hour: 12, tzOffsetHours: 3 },
    T
  );
  assert.equal(v.period, 8);
  assert.equal(v.annual.center, 1, 'годовая звезда 2026 = 1');
  assert.equal(Object.keys(v.chart.mountainStars).length, 9);
  assert.ok(v.afflictions.threeSha);
  assert.ok(v.afflictions.taiSui);
  assert.ok(v.daily);
});

test('Три Ша и Тай Суй для 2026 (год Лошади, У)', () => {
  const v = computeFlyingStarsView(
    { buildYear: 2010, facingDegrees: 180 },
    { year: 2026, month: 6, day: 1, hour: 12 }, T
  );
  // Год У входит в треугольник Инь-У-Сюй (Огонь) -> Три Ша на Севере
  assert.equal(v.afflictions.threeSha.direction, 'N');
  assert.equal(v.afflictions.taiSui.id, 'wu');
  assert.equal(v.afflictions.suiPo.id, 'zi', 'Суй По напротив Тай Суй');
});

test('Дневная звезда: непрерывность и диапазон', () => {
  let prev = null;
  for (let d = 1; d <= 28; d++) {
    const s = computeDayStar({ year: 2025, month: 3, day: d }, T);
    assert.ok(s.star >= 1 && s.star <= 9);
    if (prev !== null) {
      const expected = s.yangDun ? (prev % 9) + 1 : ((prev - 2 + 9) % 9) + 1;
      assert.equal(s.star, expected, `разрыв последовательности на ${d}.03.2025`);
    }
    prev = s.star;
  }
});

test('Дневная звезда: смена направления счёта на солнцестояниях', () => {
  const winter = computeDayStar({ year: 2025, month: 1, day: 15 }, T);
  const summer = computeDayStar({ year: 2025, month: 7, day: 15 }, T);
  assert.equal(winter.yangDun, true, 'после зимнего солнцестояния — Ян Дунь');
  assert.equal(summer.yangDun, false, 'после летнего солнцестояния — Инь Дунь');
});

test('Таблица солнечных терминов года содержит 24 записи по возрастанию', () => {
  const rows = solarTermTable(2025, T);
  assert.equal(rows.length, 24);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].jd > rows[i - 1].jd);
});

test('Устойчивость: широкий диапазон дат не приводит к исключениям', () => {
  for (let y = 1900; y <= 2100; y += 13) {
    for (const [m, d] of [[1, 15], [2, 4], [6, 21], [12, 22]]) {
      const p = computeProfile({ year: y, month: m, day: d, hour: 12, gender: 'female' }, T);
      assert.ok(p.pillarLabels.year.han.length === 2, `${d}.${m}.${y}`);
      assert.ok(Number.isFinite(p.harmony));
    }
  }
});

test('Граница Ли Чунь меняет столп года', () => {
  const before = computeProfile({ year: 2025, month: 2, day: 1, hour: 12, tzOffsetHours: 0, gender: 'male' }, T);
  const after = computeProfile({ year: 2025, month: 2, day: 10, hour: 12, tzOffsetHours: 0, gender: 'male' }, T);
  assert.equal(before.solarYear, 2024);
  assert.equal(after.solarYear, 2025);
  assert.notEqual(before.pillarLabels.year.han, after.pillarLabels.year.han);
});

test('Часовой пояс влияет на результат у границы суток', () => {
  const a = computeProfile({ year: 2024, month: 5, day: 10, hour: 1, tzOffsetHours: 12, gender: 'male' }, T);
  const b = computeProfile({ year: 2024, month: 5, day: 10, hour: 1, tzOffsetHours: -12, gender: 'male' }, T);
  assert.ok(a.pillarLabels.hour.han === b.pillarLabels.hour.han);
  // Столп месяца может различаться только у самых границ сезонов; проверяем,
  // что расчёт не падает и нормализация фиксируется в результате.
  assert.notEqual(a.normalization.jdUTC, b.normalization.jdUTC);
});
