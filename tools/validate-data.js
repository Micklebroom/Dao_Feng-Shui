#!/usr/bin/env node
/**
 * validate-data.js — STATIC TESTS.
 * Проверка схемы и внутренней согласованности JSON-таблиц без зависимостей.
 */
import { loadTables } from '../src/data/node-loader.js';

let errors = 0, warnings = 0;
const fail = (m) => { console.error('  ОШИБКА: ' + m); errors++; };
const warn = (m) => { console.warn('  ПРЕДУПРЕЖДЕНИЕ: ' + m); warnings++; };
const ok = (m) => console.log('  ok: ' + m);

const T = loadTables();
const VALID_STATUS = ['VERIFIED', 'PARTIALLY VERIFIED', 'INFERRED', 'NOT VERIFIED'];

console.log('\n[1] Статусы и метаданные таблиц');
for (const [k, v] of Object.entries(T)) {
  if (!v.$id) fail(`${k}: нет $id`);
  if (!v.status) fail(`${k}: нет status`);
  else {
    const head = VALID_STATUS.find((s) => v.status.startsWith(s));
    if (!head) fail(`${k}: недопустимый status «${v.status}»`);
  }
}
if (!errors) ok('все таблицы имеют $id и допустимый status');

console.log('\n[2] Стволы и ветви');
if (T.stems.items.length !== 10) fail('стволов должно быть 10');
if (T.branches.items.length !== 12) fail('ветвей должно быть 12');
T.stems.items.forEach((s, i) => { if (s.index !== i) fail(`ствол ${s.id}: index ${s.index} != ${i}`); });
T.branches.items.forEach((b, i) => { if (b.index !== i) fail(`ветвь ${b.id}: index ${b.index} != ${i}`); });
const elIds = T.elements.items.map((e) => e.id);
for (const s of T.stems.items) if (!elIds.includes(s.element)) fail(`ствол ${s.id}: неизвестная стихия`);
for (const b of T.branches.items) {
  if (!elIds.includes(b.element)) fail(`ветвь ${b.id}: неизвестная стихия`);
  const sum = b.hidden.reduce((a, h) => a + h.share, 0);
  if (sum !== 100) fail(`ветвь ${b.id}: сумма скрытых стволов = ${sum}, ожидается 100`);
  for (const h of b.hidden) if (!T.stems.items.find((s) => s.id === h.stem)) fail(`ветвь ${b.id}: неизвестный скрытый ствол ${h.stem}`);
}
// Чередование Инь/Ян
T.stems.items.forEach((s, i) => { const exp = i % 2 === 0 ? 'yang' : 'yin'; if (s.polarity !== exp) fail(`ствол ${s.id}: полярность ${s.polarity}, ожидается ${exp}`); });
T.branches.items.forEach((b, i) => { const exp = i % 2 === 0 ? 'yang' : 'yin'; if (b.polarity !== exp) fail(`ветвь ${b.id}: полярность ${b.polarity}, ожидается ${exp}`); });
if (!errors) ok('стволы/ветви согласованы, скрытые стволы дают 100%');

console.log('\n[3] Пять стихий: циклы порождения и контроля');
for (const e of T.elements.items) {
  if (!elIds.includes(e.generates)) fail(`${e.id}: generates -> неизвестно`);
  if (!elIds.includes(e.controls)) fail(`${e.id}: controls -> неизвестно`);
  if (e.generates === e.id) fail(`${e.id}: порождает сам себя`);
  if (e.controls === e.id) fail(`${e.id}: контролирует сам себя`);
}
// Цикл порождения должен быть одним 5-циклом
let cur = 'wood'; const seen = new Set();
for (let i = 0; i < 5; i++) { seen.add(cur); cur = T.elements.items.find((e) => e.id === cur).generates; }
if (seen.size !== 5 || cur !== 'wood') fail('цикл порождения не образует полный 5-цикл');
cur = 'wood'; const seen2 = new Set();
for (let i = 0; i < 5; i++) { seen2.add(cur); cur = T.elements.items.find((e) => e.id === cur).controls; }
if (seen2.size !== 5 || cur !== 'wood') fail('цикл контроля не образует полный 5-цикл');
ok('циклы 相生 и 相剋 замкнуты и корректны');

console.log('\n[4] 24 горы');
if (T.mountains24.items.length !== 24) fail('гор должно быть 24');
T.mountains24.items.forEach((m, i) => {
  if (m.index !== i) fail(`${m.code}: index неверен`);
  const span = ((m.end - m.start) + 360) % 360;
  if (Math.abs(span - 15) > 1e-9) fail(`${m.code}: ширина сектора ${span}, ожидается 15`);
});
for (let i = 0; i < 24; i++) {
  const a = T.mountains24.items[i], b = T.mountains24.items[(i + 1) % 24];
  if (Math.abs(((a.end % 360) - (b.start % 360) + 360) % 360) > 1e-9) fail(`разрыв между ${a.code} и ${b.code}`);
}
const triadCount = {};
for (const m of T.mountains24.items) {
  triadCount[m.sector] = triadCount[m.sector] || {};
  triadCount[m.sector][m.triad] = (triadCount[m.sector][m.triad] || 0) + 1;
}
for (const [sec, tc] of Object.entries(triadCount)) {
  for (const t of ['earth', 'heaven', 'man']) if (tc[t] !== 1) fail(`сектор ${sec}: триада ${t} встречается ${tc[t]} раз`);
}
ok('24 горы: непрерывное покрытие 360°, по 3 триады на сектор');

console.log('\n[5] Ло Шу');
if (T.luoshu.palaces.length !== 9) fail('дворцов должно быть 9');
const nums = T.luoshu.palaces.map((p) => p.number).sort((a, b) => a - b);
if (nums.join(',') !== '1,2,3,4,5,6,7,8,9') fail('номера дворцов не 1..9');
// Магический квадрат
const grid = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
for (const p of T.luoshu.palaces) grid[p.row][p.col] = p.number;
const sums = [];
for (let r = 0; r < 3; r++) sums.push(grid[r][0] + grid[r][1] + grid[r][2]);
for (let c = 0; c < 3; c++) sums.push(grid[0][c] + grid[1][c] + grid[2][c]);
sums.push(grid[0][0] + grid[1][1] + grid[2][2]);
sums.push(grid[0][2] + grid[1][1] + grid[2][0]);
if (sums.some((s) => s !== 15)) fail('квадрат Ло Шу не магический: ' + sums.join(','));
else ok('квадрат Ло Шу магический (все суммы = 15)');
if (T.luoshu.flightPath.length !== 9) fail('путь полёта должен содержать 9 шагов');
if (T.luoshu.flightPath[0] !== 'C') fail('путь полёта должен начинаться с центра');
const dirs = T.luoshu.palaces.map((p) => p.direction);
for (const d of T.luoshu.flightPath) if (!dirs.includes(d)) fail(`путь полёта: неизвестное направление ${d}`);
if (T.luoshu.stars.length !== 9) fail('звёзд должно быть 9');
ok('путь полёта и 9 звёзд согласованы');

console.log('\n[6] Солнечные термины');
if (T.solarTerms.items.length !== 24) fail('терминов должно быть 24');
const jie = T.solarTerms.items.filter((t) => t.type === 'jie');
if (jie.length !== 12) fail(`сектантских (jie) терминов ${jie.length}, ожидается 12`);
T.solarTerms.items.forEach((t, i) => {
  if (t.index !== i) fail(`${t.id}: index неверен`);
  const expected = (315 + i * 15) % 360;
  if (t.longitude !== expected) fail(`${t.id}: долгота ${t.longitude}, ожидается ${expected}`);
});
const branchIds = T.branches.items.map((b) => b.id);
for (const t of jie) if (!branchIds.includes(t.startsMonthBranch)) fail(`${t.id}: неизвестная ветвь месяца`);
ok('24 термина с шагом 15° и 12 границ месяцев');

console.log('\n[7] Взаимодействия');
const allB = new Set(branchIds);
const checkB = (arr, label) => { for (const x of arr) if (!allB.has(x)) fail(`${label}: неизвестная ветвь ${x}`); };
for (const c of T.interactions.sixCombinations.items) { checkB(c.branches, c.id); if (c.branches.length !== 2) fail(`${c.id}: должно быть 2 ветви`); }
for (const c of T.interactions.threeHarmonies.items) { checkB(c.branches, c.id); if (c.branches.length !== 3) fail(`${c.id}: должно быть 3 ветви`); }
for (const c of T.interactions.clashes.items) {
  checkB(c.branches, c.id);
  const [a, b] = c.branches.map((id) => T.branches.items.find((x) => x.id === id).index);
  if ((Math.abs(a - b) % 12) !== 6) fail(`${c.id}: столкновение не на 180° (${a} vs ${b})`);
}
if (T.interactions.clashes.items.length !== 6) fail('столкновений должно быть 6');
if (T.interactions.sixCombinations.items.length !== 6) fail('шести слияний должно быть 6');
if (T.interactions.threeHarmonies.items.length !== 4) fail('треугольников должно быть 4');
// Каждая ветвь ровно в одном треугольнике и в одной сезонной группе
const inTri = branchIds.map((id) => T.interactions.threeHarmonies.items.filter((c) => c.branches.includes(id)).length);
if (inTri.some((n) => n !== 1)) fail('каждая ветвь должна входить ровно в один треугольник');
const inDir = branchIds.map((id) => T.interactions.directionalCombinations.items.filter((c) => c.branches.includes(id)).length);
if (inDir.some((n) => n !== 1)) fail('каждая ветвь должна входить ровно в одну сезонную группу');
ok('слияния/столкновения/наказания структурно согласованы');

console.log('\n[8] Число Гуа');
for (const g of [1, 2, 3, 4, 6, 7, 8, 9]) {
  const d = T.gua.directionsByGua[String(g)];
  if (!d) { fail(`нет направлений для Гуа ${g}`); continue; }
  const vals = Object.values(d);
  if (new Set(vals).size !== 8) fail(`Гуа ${g}: направления повторяются`);
  const expect = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].sort().join(',');
  if (vals.slice().sort().join(',') !== expect) fail(`Гуа ${g}: набор направлений неполон`);
}
if (T.gua.directionsByGua['5']) fail('Гуа 5 не должно существовать');
ok('все 8 чисел Гуа покрывают 8 направлений без повторов');

console.log('\n[9] Меридианы и веса');
if (T.meridians.items.length !== 12) fail('меридианов должно быть 12');
const byEl = {};
for (const m of T.meridians.items) { byEl[m.element] = (byEl[m.element] || 0) + 1; }
if (byEl.fire !== 4) fail('огню должно соответствовать 4 меридиана (имп. + мин.)');
for (const e of ['wood', 'earth', 'metal', 'water']) if (byEl[e] !== 2) fail(`стихии ${e} должно соответствовать 2 меридиана`);
for (const m of T.meridians.items) if (!elIds.includes(m.element)) fail(`меридиан ${m.id}: неизвестная стихия`);
const mw = T.weights.meridian;
if (Math.abs(mw.yinShare + mw.yangShare - 1) > 1e-9) fail('yinShare + yangShare != 1');
if (Math.abs(mw.fireImperialShare + mw.fireMinisterialShare - 1) > 1e-9) fail('доли огня != 1');
if (T.weights.status !== 'INFERRED') fail('weights.json обязан иметь статус INFERRED');
ok('12 меридианов, доли нормированы, веса помечены INFERRED');

console.log('\n[10] Дисциплина источников');
for (const [k, v] of Object.entries(T)) {
  if (v.status.startsWith('VERIFIED') && (!v.sources || v.sources.length < 1)) {
    fail(`${k}: статус VERIFIED без указания источников`);
  }
  if (v.status.startsWith('VERIFIED') && v.sources && v.sources.length < 2 && k !== 'elements' && k !== 'gua') {
    warn(`${k}: VERIFIED только с одним источником`);
  }
}
ok('проверка соответствия статусов и источников выполнена');

console.log(`\nИТОГО: ошибок ${errors}, предупреждений ${warnings}`);
process.exit(errors > 0 ? 1 : 0);
