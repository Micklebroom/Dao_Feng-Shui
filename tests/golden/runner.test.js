/**
 * runner.test.js — ИСПОЛНИТЕЛЬ GOLDEN-СЛУЧАЕВ (устраняет RT-01, CRITICAL).
 *
 * До этого файла tests/golden_cases.json проверялся только на структуру:
 * 74 эталона, из них 47 внешних (Meeus, USNO, Wikibooks), НИ ОДИН не
 * подставлялся в движок. Проект ссылался на них как на доказательство
 * корректности, фактически не сверяя ни одного числа.
 *
 * Здесь каждый случай ИСПОЛНЯЕТСЯ. Случай без исполнителя — это ПРОВАЛ
 * («не покрыт»), а не молчаливый пропуск: иначе дыра в покрытии снова
 * останется незамеченной.
 *
 * Допуски взяты из самого файла эталонов (tolerances): A2 0.001°,
 * A3 ±20 мин, A6 ±5 с.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTables } from '../../src/data/node-loader.js';
import * as E from '../../src/engine/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GOLD = JSON.parse(fs.readFileSync(path.join(root, 'tests/golden_cases.json'), 'utf8'));
const T = loadTables();

const byId = (id) => GOLD.cases.find((c) => c.id === id);
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const utcMs = (u) => Date.UTC(u.year, u.month - 1, u.day, u.hour, u.minute, Math.round(u.second || 0));
const termMs = (y, lon) => utcMs(E.utcFromJulianDay(E.solarTermInstantUTC(y, lon)));

/** Реестр исполнителей: id случая -> функция проверки. */
const RUN = {};
const def = (id, fn) => { RUN[id] = fn; };

/* ---------------- A1: юлианский день ---------------- */
for (const id of ['GT-A1-01', 'GT-A1-02', 'GT-A1-03']) {
  def(id, (c) => {
    const i = c.input;
    const got = E.julianDayFromUTC(i.year, i.month, i.day, i.hour, i.minute, i.second);
    assert.ok(near(got, c.expected_output.jd, 0.005), `JD ${got} != ${c.expected_output.jd}`);
  });
}
def('GT-A1-04', (c) => {
  for (const [y, m, d] of c.input.roundTripDates) {
    const jd = E.julianDayFromUTC(y, m, d, c.input.hour, 0, 0);
    const back = E.utcFromJulianDay(jd);
    assert.equal(back.year, y); assert.equal(back.month, m); assert.equal(back.day, d);
  }
});

/* ---------------- A2: долгота Солнца ---------------- */
def('GT-A2-01', (c) => {
  const got = E.apparentSolarLongitude(c.input.jdTT);
  assert.ok(near(got, c.expected_output.apparentLongitudeDeg, 0.01), `λ=${got}`);
});
def('GT-A2-02', (c) => {
  const [y, m, d] = c.input.startDate;
  let wraps = 0, prev = null;
  for (let k = 0; k < c.input.days; k++) {
    const lon = E.apparentSolarLongitude(E.julianDayFromUTC(y, m, d, 12, 0, 0) + k);
    assert.ok(lon >= 0 && lon < 360, `λ вне [0,360): ${lon}`);
    if (prev !== null && lon < prev) wraps++;
    prev = lon;
  }
  assert.equal(wraps, c.expected_output.wrapArounds);
});

/* ---------------- A3: моменты сезонных терминов ---------------- */
for (const id of ['GT-A3-01', 'GT-A3-02', 'GT-A3-03', 'GT-A3-04']) {
  def(id, (c) => {
    const got = termMs(c.input.year, c.input.longitude);
    const exp = new Date(c.expected_output.utc.replace('Z', ':00Z')).getTime();
    const diffMin = Math.abs(got - exp) / 60000;
    assert.ok(diffMin <= 20, `расхождение ${diffMin.toFixed(1)} мин > 20`);
  });
}
def('GT-A3-05', (c) => {
  for (let y = c.input.yearsFrom; y <= c.input.yearsTo; y += c.input.step) {
    const u = E.utcFromJulianDay(E.solarTermInstantUTC(y, c.input.longitude));
    assert.equal(u.month, c.expected_output.monthAlways, `год ${y}: месяц ${u.month}`);
    assert.ok(u.day >= c.expected_output.dayInRange[0] && u.day <= c.expected_output.dayInRange[1],
      `год ${y}: день ${u.day}`);
  }
});

/* ---------------- A6: ΔT ---------------- */
def('GT-A6-01', (c) => {
  for (const [yStr, exp] of Object.entries(c.expected_output)) {
    const got = E.deltaTSeconds(Number(yStr), 6);
    assert.ok(near(got, exp, 5), `ΔT(${yStr}) = ${got.toFixed(2)}, ожидалось ${exp} ±5`);
  }
});

/* ---------------- B1: столп года ---------------- */
for (const id of ['GT-B1-01', 'GT-B1-02', 'GT-B1-03']) {
  def(id, (c) => {
    const got = E.yearIndexFromSolarYear(c.input.solarYear, T.anchors);
    assert.equal(got, c.expected_output.sexagenary);
    if (c.expected_output.stem !== undefined) {
      const sp = E.splitSexagenary(got);
      assert.equal(sp.stem, c.expected_output.stem);
      assert.equal(sp.branch, c.expected_output.branch);
    }
    if (c.expected_output.han) {
      const sp = E.splitSexagenary(got);
      const han = T.stems.items[sp.stem].han + T.branches.items[sp.branch].han;
      assert.equal(han, c.expected_output.han);
    }
  });
}
def('GT-B1-04', (c) => {
  const vals = c.input.years.map((y) => E.yearIndexFromSolarYear(y, T.anchors));
  assert.ok(vals.every((v) => v === c.expected_output.sexagenary), JSON.stringify(vals));
});

/* ---------------- B2: столп месяца (五虎遁) ---------------- */
def('GT-B2-01', (c) => {
  const got = c.input.yearStems.map((ys) => E.monthStemIndex(ys, c.input.monthOrdinal));
  assert.deepEqual(got, c.expected_output.monthStems);
});
def('GT-B2-02', (c) => {
  const got = c.input.monthOrdinals.map((o) => E.monthBranchIndex(o));
  assert.deepEqual(got, c.expected_output.monthBranches);
});
def('GT-B2-03', (c) => {
  const pairs = c.input.monthOrdinals.map((o) =>
    E.monthStemIndex(c.input.yearStem, o) + ':' + E.monthBranchIndex(o));
  assert.equal(new Set(pairs).size, c.expected_output.count);
});

/* ---------------- B3: столп дня ---------------- */
for (const id of ['GT-B3-01', 'GT-B3-02']) {
  def(id, (c) => {
    const i = c.input;
    const got = E.dayIndexForDate(i.localYear, i.localMonth, i.localDay, i.localHour,
      { earlyZiNewDay: T.ziRule.earlyZiNewDay });
    assert.equal(got, c.expected_output.sexagenary);
    const sp = E.splitSexagenary(got);
    const han = T.stems.items[sp.stem].han + T.branches.items[sp.branch].han;
    assert.equal(han, c.expected_output.han);
  });
}
def('GT-B3-04', (c) => {
  // Единая шкала времени (TZ-2..TZ-4): поправка истинного солнечного времени
  // сдвигает instantJD, а значит ОБЯЗАНА влиять и на столп дня.
  // До исправления фазы 11 день/час брались из сырых локальных чисел,
  // поэтому поправка меняла только год и месяц — это и был дефект A-08.
  const civil = c.input.civil;
  const base = { ...civil, tzOffsetHours: c.input.tzOffsetHours };
  const a = E.computeFourPillars({ ...base, ...c.input.variantA }, T.anchors, T.ziRule);
  const b = E.computeFourPillars({ ...base, ...c.input.variantB }, T.anchors, T.ziRule);
  const differ = a.pillars.day.stem !== b.pillars.day.stem
    || a.pillars.day.branch !== b.pillars.day.branch;
  assert.equal(differ, c.expected_output.dayPillarsMustDiffer,
    `день без поправки ${a.pillars.day.stem}/${a.pillars.day.branch}, с поправкой ${b.pillars.day.stem}/${b.pillars.day.branch}`);
});

def('GT-B3-03', (c) => {
  // Случай ЯВНО задаёт школу раннего Цзы (lateZiNewDay:true в исходной
  // терминологии = смена дня в 23:00). Проверяем именно её, независимо
  // от режима по умолчанию из данных.
  const i = c.input;
  const a = E.dayIndexForDate(i.localYear, i.localMonth, i.localDay, i.hours[0], { earlyZiNewDay: true });
  const b = E.dayIndexForDate(i.localYear, i.localMonth, i.localDay, i.hours[1], { earlyZiNewDay: true });
  assert.equal((b - a + 60) % 60, 1, `${a} -> ${b}`);
});

/* ---------------- B4: столп часа (五鼠遁) ---------------- */
def('GT-B4-01', (c) => {
  assert.deepEqual(c.input.hours.map((h) => E.hourBranchIndex(h)), c.expected_output.hourBranches);
});
def('GT-B4-02', (c) => {
  assert.deepEqual(c.input.dayStems.map((ds) => E.hourStemIndex(ds, c.input.hourBranch)),
    c.expected_output.hourStems);
});
def('GT-B4-03', (c) => {
  const set = new Set();
  for (let hb = 0; hb < 12; hb++) set.add(E.hourStemIndex(c.input.dayStem, hb) + ':' + hb);
  assert.equal(set.size, c.expected_output.distinctCount);
});

/* ---------------- B7: столпы удачи ---------------- */
def('GT-B7-01', (c) => {
  const r = E.computeLuckPillars(
    { year: 1984, month: 6, day: 5, hour: 12, minute: 0, gender: c.input.gender, tzOffsetHours: 0 },
    { rules: T.luckRules, anchors: T.anchors, zi: T.ziRule });
  assert.equal(r.forward, c.expected_output.forward);
});
def('GT-B7-02', (c) => {
  // Ян-год 1984 (甲子), инь-год 1985 (乙丑).
  const got = c.input.combinations.map((k) => E.computeLuckPillars(
    { year: k.yearStemYang ? 1984 : 1985, month: 6, day: 5, hour: 12, minute: 0,
      gender: k.gender, tzOffsetHours: 0 },
    { rules: T.luckRules, anchors: T.anchors, zi: T.ziRule }).forward);
  assert.deepEqual(got, c.expected_output.forward);
});
def('GT-B7-03', (c) => {
  for (const [y, m, d] of [[1967, 6, 5], [2000, 1, 1], [2024, 2, 4], [1990, 11, 30]]) {
    for (const g of ['male', 'female']) {
      const r = E.computeLuckPillars({ year: y, month: m, day: d, hour: 12, minute: 0, gender: g, tzOffsetHours: 0 },
        { rules: T.luckRules, anchors: T.anchors, zi: T.ziRule });
      assert.ok(r.startAge >= c.expected_output.startAgeRange[0]
        && r.startAge <= c.expected_output.startAgeRange[1], `startAge=${r.startAge}`);
    }
  }
});
def('GT-B7-04', (c) => {
  const b = c.input.birth;
  const f = E.computeLuckPillars({ ...b, minute: 0, gender: 'male' },
    { rules: T.luckRules, anchors: T.anchors, zi: T.ziRule });
  const r = E.computeLuckPillars({ ...b, minute: 0, gender: 'female' },
    { rules: T.luckRules, anchors: T.anchors, zi: T.ziRule });
  const sum = f.deltaDays + r.deltaDays;
  assert.ok(sum >= c.expected_output.sumDeltaDaysRange[0] && sum <= c.expected_output.sumDeltaDaysRange[1],
    `сумма ${sum.toFixed(3)}`);
});

/* ---------------- B8: скрытые стволы ---------------- */
def('GT-B8-01', (c) => {
  for (const b of T.branches.items) {
    assert.equal(b.hidden.reduce((a, h) => a + h.share, 0), c.expected_output.everyBranchSumsTo, b.id);
  }
});
def('GT-B8-02', (c) => {
  for (const [bid, stems] of Object.entries(c.expected_output.hidden)) {
    const b = T.branches.items.find((x) => x.id === bid);
    assert.deepEqual(b.hidden.map((h) => h.stem), stems);
  }
});

/* ---------------- C1..C6, C11: взаимодействия ---------------- */
def('GT-C-01', (c) => {
  const cl = T.interactions.clashes.items;
  assert.equal(cl.length, c.expected_output.count);
  for (const x of cl) {
    const [a, b] = x.branches.map((id) => T.branches.items.findIndex((y) => y.id === id));
    assert.equal(Math.abs(a - b), c.expected_output.everyPairIndexDelta, x.id);
  }
});
def('GT-C-02', (c) => {
  const counts = {};
  for (const g of T.interactions.threeHarmonies.items) for (const b of g.branches) counts[b] = (counts[b] || 0) + 1;
  assert.equal(T.interactions.threeHarmonies.items.length, c.expected_output.groups);
  for (const b of T.branches.items) {
    assert.equal(counts[b.id], c.expected_output.membershipCountPerBranch, b.id);
  }
});
def('GT-C-03', (c) => {
  const got = T.interactions.stemCombinations.items.map((x) => [x.stems[0], x.stems[1], x.produces]);
  assert.deepEqual(got, c.expected_output.pairs);
});
def('GT-C-04', (c) => {
  const found = E.findInteractions(c.input.pillars, T);
  assert.equal(found.clashes.length, c.expected_output.clashCount);
  assert.deepEqual(found.clashes.map((x) => x.id), c.expected_output.clashes);
});
def('GT-C-05', (c) => {
  const yb = T.branches.items[c.input.yearBranch].id;
  const r = E.yearAfflictions(yb, T);
  assert.equal(r.threeSha.direction, c.expected_output.threeShaDirection);
  assert.equal(r.taiSui.id, c.expected_output.taiSui);
  assert.equal(r.suiPo.id, c.expected_output.suiPo);
});
def('GT-C-06', (c) => {
  for (const b of T.branches.items) {
    const r = E.yearAfflictions(b.id, T);
    const i1 = T.mountains24.items.findIndex((m) => m.id === r.taiSui.id);
    const i2 = T.mountains24.items.findIndex((m) => m.id === r.suiPo.id);
    assert.equal(Math.abs(i1 - i2), c.expected_output.mountainIndexDelta, b.id);
  }
});

/* ---------------- D1: фазы Ци (конфликт K1) ---------------- */
def('GT-D1-01', (c) => {
  const q = T.bazi.qiPhases;
  assert.equal(q.phases.length, c.expected_output.phaseCount);
  assert.equal(q.status !== 'VERIFIED', true, 'фазы Ци не могут быть VERIFIED при конфликте K1');
  assert.equal(T.bazi.qiPhases.conflictRef, 'K1');
  // Коэффициенты обязаны отсутствовать: школы расходятся (5 из 12 знаков).
  assert.equal(q.coefficients, null);
});

/* ---------------- E2: сезонные фазы стихий ---------------- */
def('GT-E2-01', (c) => {
  const el = T.elements;
  const season = el.seasonByMonthBranch.map[c.input.monthBranch];
  assert.equal(season, c.input.seasonElement);
  const gen = (x) => el.items.find((e) => e.id === x).generates;
  const ctl = (x) => el.items.find((e) => e.id === x).controls;
  const cls = {};
  cls[season] = 'wang';
  cls[gen(season)] = 'xiang';
  cls[el.items.find((e) => gen(e.id) === season).id] = 'xiu';
  cls[el.items.find((e) => ctl(e.id) === season).id] = 'qiu';
  cls[ctl(season)] = 'si';
  for (const [elem, expect] of Object.entries(c.expected_output)) {
    assert.equal(cls[elem], expect, `${elem}: ${cls[elem]} != ${expect}`);
  }
});
def('GT-E2-02', (c) => {
  const el = T.elements;
  const gen = (x) => el.items.find((e) => e.id === x).generates;
  const ctl = (x) => el.items.find((e) => e.id === x).controls;
  for (const season of c.input.allSeasonElements) {
    const cls = {};
    cls[season] = 'wang';
    cls[gen(season)] = 'xiang';
    cls[el.items.find((e) => gen(e.id) === season).id] = 'xiu';
    cls[el.items.find((e) => ctl(e.id) === season).id] = 'qiu';
    cls[ctl(season)] = 'si';
    assert.equal(new Set(Object.values(cls)).size, 5, `сезон ${season}`);
    assert.equal(Object.keys(cls).length, 5, `сезон ${season}`);
  }
});

/* ---------------- F1, F6: меридианы ---------------- */
def('GT-F1-01', (c) => {
  const m = T.meridians.items;
  assert.equal(m.length, c.expected_output.count);
  assert.equal(m.filter((x) => x.polarity === 'yin').length, c.expected_output.yinCount);
  assert.equal(m.filter((x) => x.polarity === 'yang').length, c.expected_output.yangCount);
  for (const e of ['wood', 'fire', 'earth', 'metal', 'water']) {
    assert.equal(m.filter((x) => x.element === e).length, c.expected_output.perElement, e);
  }
  for (const ex of c.expected_output.excluded) {
    assert.ok(!m.some((x) => x.id === ex), `${ex} не должен быть меридианом`);
  }
});
def('GT-F6-01', (c) => {
  const g = Object.fromEntries(T.meridians.tripleBurner.groups.map((x) => [x.id, x.members]));
  for (const key of ['upper', 'middle', 'lower']) {
    assert.deepEqual([...g[key]].sort(), [...c.expected_output[key]].sort(), key);
  }
  const all = [...g.upper, ...g.middle, ...g.lower];
  assert.equal(all.length, c.expected_output.unionSize);
  assert.equal(new Set(all).size, c.expected_output.unionSize);
});

/* ---------------- F2: агрегация «Хронические / Острые» ---------------- */
const aggregate = (samples, mode) => {
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  if (mode === 'chronic') return mean;
  let best = samples[0], bd = Math.abs(samples[0] - mean);
  for (const x of samples) { const dv = Math.abs(x - mean); if (dv > bd) { best = x; bd = dv; } }
  return best;
};
def('GT-F2-01', (c) => assert.equal(aggregate(c.input.samples, c.input.mode), c.expected_output.value));
def('GT-F2-02', (c) => {
  assert.equal(aggregate(c.input.samples, c.input.mode), c.expected_output.value);
  const mean = c.input.samples.reduce((a, b) => a + b, 0) / c.input.samples.length;
  assert.equal(mean, c.expected_output.mean);
});
def('GT-F2-03', (c) => {
  const got = c.input.cases.map((k) => aggregate(k.samples, k.mode));
  assert.deepEqual(got, c.expected_output.values);
});

/* ---------------- H1: полёт звёзд ---------------- */
for (const id of ['GT-H1-01', 'GT-H1-02']) {
  def(id, (c) => {
    const got = E.flyStars(c.input.startNumber, c.input.forward, T.luoshu);
    for (const [dir, n] of Object.entries(c.expected_output)) assert.equal(got[dir], n, dir);
  });
}
def('GT-H1-03', (c) => {
  const got = E.flyStars(c.input.startNumber, c.input.forward, T.luoshu);
  for (const [dir, n] of Object.entries(c.expected_output)) {
    if (dir === 'allRowsColsDiagonalsSumTo') continue;
    assert.equal(got[dir], n, dir);
  }
  const at = (r, cc) => {
    const p = T.luoshu.palaces.find((x) => x.row === r && x.col === cc);
    return got[p.direction];
  };
  for (let r = 0; r < 3; r++) assert.equal(at(r, 0) + at(r, 1) + at(r, 2), 15, `строка ${r}`);
  for (let cc = 0; cc < 3; cc++) assert.equal(at(0, cc) + at(1, cc) + at(2, cc), 15, `столбец ${cc}`);
});

/* ---------------- H2: геомантическая карта ---------------- */
for (const id of ['GT-H2-01', 'GT-H2-02', 'GT-H2-03']) {
  def(id, (c) => {
    const mt = T.mountains24.items.find((m) => m.code === c.input.sittingMountain);
    const facing = (mt.start + 7.5 + 180) % 360;
    const chart = E.computeGeomanticChart({ period: c.input.period, facingDegrees: facing }, T);
    // Кодировка эталона Wikibooks: «гора|основа|вода» в порядке gridOrder.
    const got = c.expected_output.gridOrder.map((dir) =>
      `${chart.mountainStars[dir]}${chart.earthBase[dir]}${chart.waterStars[dir]}`);
    assert.deepEqual(got, c.expected_output.grid);
  });
}
def('GT-H2-04', (c) => {
  let checked = 0;
  for (const p of c.input.allPeriods) {
    for (const mt of T.mountains24.items) {
      const facing = (mt.start + 7.5 + 180) % 360;
      const chart = E.computeGeomanticChart({ period: p, facingDegrees: facing }, T);
      for (const layer of ['earthBase', 'mountainStars', 'waterStars']) {
        assert.equal(new Set(Object.values(chart[layer])).size, 9,
          `период ${p}, гора ${mt.code}, слой ${layer}`);
      }
      assert.equal(((chart.facing.index - chart.sitting.index) % 24 + 24) % 24, 12,
        `период ${p}, гора ${mt.code}: сидение и фасад обязаны быть противоположны`);
      checked++;
    }
  }
  assert.equal(checked, c.expected_output.casesChecked);
});

/* ---------------- H3: полярность звезды 5 ---------------- */
def('GT-H3-01', (c) => {
  const chart = E.computeGeomanticChart({ period: c.input.period, facingDegrees: c.input.facingDegrees }, T);
  assert.equal(chart.flight.waterCenter, c.expected_output.waterCenter);
  assert.equal(chart.flight.mountainCenter, c.expected_output.mountainCenter);
  assert.equal(chart.flight.waterForward, c.expected_output.waterForward);
});
def('GT-H3-02', (c) => {
  assert.throws(() => E.flightDirectionFor(c.input.starNumber, c.input.triad, T, c.input.periodNumber),
    /период/i, 'звезда 5 без номера периода обязана бросать ошибку, а не возвращать значение по умолчанию');
});

/* ---------------- H4: годовая звезда ---------------- */
def('GT-H4-01', (c) => assert.equal(E.annualStar(c.input.solarYear, T.anchors), c.expected_output.annualStar));
def('GT-H4-02', (c) => {
  const star = E.annualStar(c.input.solarYear, T.anchors);
  const grid = E.flyStars(star, true, T.luoshu);
  for (const [dir, n] of Object.entries(c.expected_output)) assert.equal(grid[dir], n, dir);
});
def('GT-H4-03', (c) => {
  assert.deepEqual(c.input.years.map((y) => E.annualStar(y, T.anchors)), c.expected_output.annualStars);
});
def('GT-H4-04', (c) => {
  // Сверка непрерывного счёта с каноническим правилом трёх юаней.
  const wrap9 = (n) => ((n - 1) % 9 + 9) % 9 + 1;
  let mismatches = 0;
  for (let y = c.input.yearsFrom; y <= c.input.yearsTo; y++) {
    const cycleStart = 1864 + Math.floor((y - 1864) / 180) * 180;
    const yuan = Math.floor((y - cycleStart) / 60);
    const posInYuan = (y - cycleStart) % 60;
    const canonical = wrap9([1, 4, 7][yuan] - posInYuan);
    if (E.annualStar(y, T.anchors) !== canonical) mismatches++;
  }
  assert.equal(mismatches, c.expected_output.mismatches);
});

/* ---------------- H5: месячная звезда ---------------- */
def('GT-H5-01', (c) => {
  for (const [group, branches] of Object.entries(c.input.yearBranchGroups)) {
    for (const yb of branches) {
      assert.equal(E.monthlyStar(yb, c.input.monthOrdinal), c.expected_output[group], `${group}/${yb}`);
    }
  }
});
def('GT-H5-02', (c) => {
  assert.deepEqual(c.input.monthOrdinals.map((o) => E.monthlyStar(c.input.yearBranch, o)),
    c.expected_output.stars);
});
def('GT-H5-03', (c) => {
  let prev = null;
  for (let o = 0; o < 12; o++) {
    const s = E.monthlyStar(c.input.yearBranch, o);
    if (prev !== null) assert.equal(s, ((prev - 1 - 1 + 9) % 9) + 1, `месяц ${o}`);
    prev = s;
  }
});

/* ---------------- H6: дневная звезда ---------------- */
def('GT-H6-01', (c) => {
  let prev = null;
  for (let d = c.input.daysFrom; d <= c.input.daysTo; d++) {
    const r = E.computeDayStar({ year: c.input.year, month: c.input.month, day: d, hour: 12 }, T, c.input.method);
    assert.ok(r.star >= 1 && r.star <= 9, `день ${d}: ${r.star}`);
    if (prev !== null) {
      const step = ((r.star - prev) % 9 + 9) % 9;
      assert.equal(step, r.yangDun ? 1 : 8, `день ${d}: шаг ${step}`);
    }
    prev = r.star;
  }
});
def('GT-H6-02', (c) => {
  const got = c.input.dates.map(([y, m, d]) =>
    E.computeDayStar({ year: y, month: m, day: d, hour: 12 }, T, c.input.method).yangDun);
  assert.deepEqual(got, c.expected_output.yangDun);
});

/* ---------------- H7: период Сань Юань ---------------- */
def('GT-H7-01', (c) => {
  assert.deepEqual(c.input.years.map((y) => E.periodForYear(y, T.luoshu)), c.expected_output.periods);
});
def('GT-H7-02', (c) => {
  for (const [a, b] of c.input.yearPairs) {
    assert.equal(E.periodForYear(a, T.luoshu), E.periodForYear(b, T.luoshu), `${a} vs ${b}`);
  }
});

/* ---------------- H12: число Гуа ---------------- */
for (const id of ['GT-H12-01', 'GT-H12-02', 'GT-H12-03']) {
  def(id, (c) => {
    const r = E.computeGua(c.input.solarYear, c.input.gender, T);
    assert.equal(r.gua, c.expected_output.gua);
    if (c.expected_output.group) assert.equal(r.group, c.expected_output.group);
  });
}
def('GT-H12-04', (c) => {
  for (const g of c.input.genders) {
    assert.equal(E.computeGua(c.input.solarYear, g, T).gua, c.expected_output[g], g);
  }
});
def('GT-H12-05', (c) => {
  let checked = 0;
  for (let y = c.input.yearsFrom; y <= c.input.yearsTo; y++) {
    for (const g of ['male', 'female']) {
      const v = E.computeGua(y, g, T).gua;
      assert.notEqual(v, 5, `год ${y} ${g}: Гуа 5 запрещено`);
      assert.ok(c.expected_output.allInSet.includes(v), `год ${y} ${g}: ${v}`);
      checked++;
    }
  }
  assert.equal(checked, c.expected_output.casesChecked);
});

/* ---------------- H16: гора по азимуту ---------------- */
for (const id of ['GT-H16-01', 'GT-H16-02']) {
  def(id, (c) => {
    assert.deepEqual(c.input.degrees.map((d) => E.mountainForDegrees(d, T.mountains24).code),
      c.expected_output.codes);
  });
}
def('GT-H16-03', (c) => {
  assert.equal(T.mountains24.items.length, c.expected_output.count);
  for (let i = 0; i < 24; i++) {
    const a = T.mountains24.items[i];
    const opp = (a.start + 180) % 360;
    const b = E.mountainForDegrees((opp + 7.5) % 360, T.mountains24);
    const delta = Math.abs(T.mountains24.items.indexOf(b) - i);
    assert.equal(Math.min(delta, 24 - delta), c.expected_output.oppositeIndexDelta, a.code);
  }
});

/* =================== ЗАПУСК =================== */

test('GOLDEN: каждый случай имеет исполнитель (иначе покрытие фиктивно)', () => {
  const missing = GOLD.cases.filter((c) => !RUN[c.id]).map((c) => `${c.id} (${c.algorithm})`);
  assert.deepEqual(missing, [], 'случаи без исполнителя: ' + missing.join(', '));
});

for (const c of GOLD.cases) {
  test(`GOLDEN ${c.id} [${c.status}] ${c.algorithm}: ${c.name.slice(0, 70)}`, () => {
    const fn = RUN[c.id];
    if (!fn) assert.fail(`нет исполнителя для ${c.id} — случай не проверяется`);
    fn(c);
  });
}

test('GOLDEN: счётчики покрытия соответствуют реальности', () => {
  assert.equal(GOLD.cases.length, GOLD.coverage.totalCases);
  const st = {};
  for (const c of GOLD.cases) st[c.status] = (st[c.status] || 0) + 1;
  assert.deepEqual(st, GOLD.coverage.byStatus);
});
