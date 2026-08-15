import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dayIndexForDate, yearIndexFromSolarYear, monthStemIndex, monthBranchIndex,
  hourBranchIndex, hourStemIndex, splitSexagenary, combineSexagenary, mod,
  jieTermsForYear, solarMonthAt
} from '../../src/engine/ganzhi.js';
import { julianDayFromUTC } from '../../src/engine/astro.js';
import { loadTables } from '../../src/data/node-loader.js';

const T = loadTables();
const name = (idx) => {
  const { stem, branch } = splitSexagenary(idx);
  return T.stems.items[stem].han + T.branches.items[branch].han;
};

test('Столп дня: якорь 27.01.2019 = 甲子 (источник ytliu0)', () => {
  assert.equal(dayIndexForDate(2019, 1, 27, 12), 0);
  assert.equal(name(dayIndexForDate(2019, 1, 27, 12)), '甲子');
});

test('Столп дня: якорь 01.03.2000 = 戊午 (источник Baidu Baike, №55)', () => {
  const idx = dayIndexForDate(2000, 3, 1, 12);
  assert.equal(idx, 54); // 0-based; 1-based = 55
  assert.equal(name(idx), '戊午');
});

test('Столп дня: непрерывность цикла 60', () => {
  let prev = dayIndexForDate(2020, 1, 1, 12);
  for (let d = 2; d <= 60; d++) {
    const cur = dayIndexForDate(2020, 1, d <= 31 ? d : d - 31, 12);
    void cur; void prev; prev = cur;
  }
  // Прямая проверка: через 60 дней индекс совпадает
  assert.equal(dayIndexForDate(2020, 1, 1, 12), dayIndexForDate(2020, 3, 1, 12));
});

// RT-02: название приведено в соответствие с поведением. Перенос дня на 23:00 —
// это школа РАННЕГО Цзы (早子); прежнее имя вводило в заблуждение.
test('Ранний час Цзы (23:00) переносит столп дня на следующий день', () => {
  const a = dayIndexForDate(2024, 5, 10, 22, { earlyZiNewDay: true });
  const b = dayIndexForDate(2024, 5, 10, 23, { earlyZiNewDay: true });
  assert.equal(b, mod(a + 1, 60));
  const c = dayIndexForDate(2024, 5, 10, 23, { earlyZiNewDay: false });
  assert.equal(c, a);
});

test('Столп года: 1984 = 甲子, 2026 = 丙午', () => {
  assert.equal(yearIndexFromSolarYear(1984, T.anchors), 0);
  assert.equal(name(yearIndexFromSolarYear(1984, T.anchors)), '甲子');
  assert.equal(name(yearIndexFromSolarYear(2026, T.anchors)), '丙午');
  assert.equal(name(yearIndexFromSolarYear(2024, T.anchors)), '甲辰');
  assert.equal(name(yearIndexFromSolarYear(2025, T.anchors)), '乙巳');
});

test('Столп месяца: правило «пяти тигров» (五虎遁)', () => {
  // Год Цзя(0) или Цзи(5) -> месяц Инь имеет ствол Бин(2)
  assert.equal(monthStemIndex(0, 0), 2);
  assert.equal(monthStemIndex(5, 0), 2);
  // Год И(1)/Гэн(6) -> У(4)
  assert.equal(monthStemIndex(1, 0), 4);
  assert.equal(monthStemIndex(6, 0), 4);
  // Год Бин(2)/Синь(7) -> Гэн(6)
  assert.equal(monthStemIndex(2, 0), 6);
  assert.equal(monthStemIndex(7, 0), 6);
  // Год Дин(3)/Жэнь(8) -> Жэнь(8)
  assert.equal(monthStemIndex(3, 0), 8);
  assert.equal(monthStemIndex(8, 0), 8);
  // Год У(4)/Гуй(9) -> Цзя(0)
  assert.equal(monthStemIndex(4, 0), 0);
  assert.equal(monthStemIndex(9, 0), 0);
});

test('Столп месяца: ветви идут от Инь', () => {
  assert.equal(monthBranchIndex(0), 2);  // 寅
  assert.equal(monthBranchIndex(10), 0); // 子
  assert.equal(monthBranchIndex(11), 1); // 丑
});

test('Столп часа: ветвь и правило «пяти крыс» (五鼠遁)', () => {
  assert.equal(hourBranchIndex(23), 0);
  assert.equal(hourBranchIndex(0), 0);
  assert.equal(hourBranchIndex(1), 1);
  assert.equal(hourBranchIndex(12), 6);
  // День Цзя(0)/Цзи(5) -> час Цзы имеет ствол Цзя(0)
  assert.equal(hourStemIndex(0, 0), 0);
  assert.equal(hourStemIndex(5, 0), 0);
  // День И(1)/Гэн(6) -> Бин(2)
  assert.equal(hourStemIndex(1, 0), 2);
  assert.equal(hourStemIndex(6, 0), 2);
});

test('Преобразования сексагенарного индекса обратимы', () => {
  for (let i = 0; i < 60; i++) {
    const { stem, branch } = splitSexagenary(i);
    assert.equal(combineSexagenary(stem, branch), i);
  }
});

test('Несовместимые по чётности пары стволов и ветвей не существуют', () => {
  assert.equal(combineSexagenary(0, 1), null);
  assert.equal(combineSexagenary(1, 0), null);
});

test('12 сектантских терминов года упорядочены и уникальны', () => {
  const terms = jieTermsForYear(2025);
  assert.equal(terms.length, 12);
  for (let i = 1; i < terms.length; i++) assert.ok(terms[i].jd > terms[i - 1].jd);
  assert.equal(new Set(terms.map((t) => t.ordinal)).size, 12);
});

test('Определение солнечного месяца на границе Ли Чунь', () => {
  // 2025: Ли Чунь 3 февраля 14:07 UTC
  const before = solarMonthAt(julianDayFromUTC(2025, 2, 3, 10, 0, 0), 2025);
  const after = solarMonthAt(julianDayFromUTC(2025, 2, 3, 18, 0, 0), 2025);
  assert.equal(before.solarYear, 2024, 'до Ли Чунь — предыдущий солнечный год');
  assert.equal(after.solarYear, 2025, 'после Ли Чунь — новый солнечный год');
  assert.equal(after.ordinal, 0, 'после Ли Чунь — месяц Инь');
});

test('Декабрьские и январские месяцы относятся к предыдущему солнечному году', () => {
  const jan = solarMonthAt(julianDayFromUTC(2025, 1, 20, 12, 0, 0), 2025);
  assert.equal(jan.solarYear, 2024);
  assert.equal(jan.branch, 1); // 丑
});
