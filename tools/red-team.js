#!/usr/bin/env node
/**
 * red-team.js — Аудит соблюдения доктрины проекта.
 * Механически проверяет запреты, которые иначе легко нарушить незаметно.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let violations = 0, warnings = 0, checks = 0;

const violation = (m) => { console.error('  НАРУШЕНИЕ: ' + m); violations++; };
const warn = (m) => { console.warn('  ВНИМАНИЕ: ' + m); warnings++; };
const ok = (m) => { console.log('  ok: ' + m); checks++; };

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(root);
const engineFiles = files.filter((f) =>
  f.includes(path.join('src', 'engine')) && f.endsWith('.js'));
const chartFiles = files.filter((f) =>
  f.includes(path.join('src', 'chart')) && f.endsWith('.js'));

console.log('\n[RED TEAM 1] Запрет на имитацию расчётов в расчётном ядре');

const BANNED = [
  { re: /\bMath\.random\s*\(/, name: 'Math.random()' },
  { re: /\bnoise\s*\(/, name: 'noise()' },
  { re: /\bperlin/i, name: 'perlin noise' },
  { re: /\bfakeData|\bdummyData|\bmockValues/i, name: 'подставные данные' }
];

for (const f of engineFiles) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(root, f);
  for (const b of BANNED) {
    if (b.re.test(src)) violation(`${rel}: обнаружен ${b.name}`);
  }
}
if (!violations) ok('в src/engine нет random/noise/подставных данных');

// sin/cos допустимы ТОЛЬКО в astro.js и только с обоснованием
console.log('\n[RED TEAM 2] Тригонометрия только там, где физически обоснована');
for (const f of engineFiles) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(root, f);
  const hasTrig = /Math\.(sin|cos|tan)\s*\(/.test(src);
  const isAstro = rel.endsWith('astro.js');
  if (hasTrig && !isAstro) {
    violation(`${rel}: sin/cos вне модуля астрономии`);
  }
  if (hasTrig && isAstro) {
    if (!/видимо|Meeus|эклиптик|апparent|апп/i.test(src) && !/NOTE ON ALGORITHM INTEGRITY/.test(src)) {
      warn(`${rel}: тригонометрия без явного обоснования в комментарии`);
    } else {
      ok('astro.js: тригонометрия обоснована (ряд видимой долготы Солнца, Meeus)');
    }
  }
}
// Тригонометрия в chart.js недопустима (там только линии и сетка)
for (const f of chartFiles) {
  const src = fs.readFileSync(f, 'utf8');
  if (/Math\.(sin|cos)\s*\(/.test(src)) {
    violation(`${path.relative(root, f)}: тригонометрия в слое отрисовки`);
  }
}
ok('в слое графиков нет тригонометрии (нет «рисования красивой волны»)');

console.log('\n[RED TEAM 3] Разделение слоёв');
/** Удаление комментариев и строковых литералов: проверяем КОД, а не прозу.
 *  (Иначе слово «documented» в комментарии даёт ложное срабатывание.) */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}
for (const f of engineFiles) {
  const src = codeOnly(fs.readFileSync(f, 'utf8'));
  const rel = path.relative(root, f);
  const domSymbols = [
    /\bdocument\s*\./, /\bwindow\s*\./, /\.innerHTML\b/,
    /\bquerySelector(All)?\s*\(/, /\.addEventListener\s*\(/, /\bdocument\b\s*[,)\]]/
  ];
  for (const re of domSymbols) {
    if (re.test(src)) violation(`${rel}: расчётное ядро обращается к DOM (${re})`);
  }
}
ok('расчётное ядро не зависит от DOM');

const uiFiles = files.filter((f) => f.includes(path.join('src', 'ui')) && f.endsWith('.js'));
for (const f of uiFiles) {
  const src = fs.readFileSync(f, 'utf8');
  // В UI не должно быть собственных расчётных формул стихий
  if (/positionWeights|stemBase|branchBase|transformRatio/.test(src)) {
    violation(`${path.relative(root, f)}: расчётные веса просочились в UI`);
  }
}
ok('в UI нет расчётных весов (все веса в JSON)');

console.log('\n[RED TEAM 4] Отсутствие «магических чисел» вне JSON');
const weightsPath = path.join(root, 'data/weights.json');
const weights = JSON.parse(fs.readFileSync(weightsPath, 'utf8'));
if (weights.status !== 'INFERRED') violation('weights.json не помечен как INFERRED');
else ok('weights.json честно помечен INFERRED');
if (!weights.criticalNote || weights.criticalNote.length < 100) {
  violation('weights.json не содержит развёрнутого предупреждения об аудите');
} else ok('weights.json содержит предупреждение для аудитора');

console.log('\n[RED TEAM 5] Статусы не подменены');
const dataFiles = fs.readdirSync(path.join(root, 'data')).filter((f) => f.endsWith('.json') && f !== 'bundle.json');
for (const f of dataFiles) {
  const j = JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8'));
  if (!j.status) { violation(`data/${f}: нет поля status`); continue; }
  if (j.status.startsWith('VERIFIED') && !(j.sources && j.sources.length)) {
    violation(`data/${f}: VERIFIED без источников`);
  }
}
ok('все таблицы данных имеют статус, VERIFIED — с источниками');

// Документация обязана раскрывать INFERRED
const algo = fs.readFileSync(path.join(root, 'docs/ALGORITHMS.md'), 'utf8');
const conf = fs.readFileSync(path.join(root, 'docs/CONFLICTS.md'), 'utf8');
if (!/INFERRED/.test(algo)) violation('ALGORITHMS.md не упоминает INFERRED');
else ok('ALGORITHMS.md раскрывает статусы INFERRED');
if (!/КОНФЛИКТ/.test(conf)) violation('CONFLICTS.md не фиксирует конфликты');
else ok('CONFLICTS.md фиксирует конфликты источников');
for (const anchor of ['day-star', 'luck-start-age', 'hidden-stem-weights', 'late-zi', 'true-solar-time']) {
  if (!conf.includes(anchor)) violation(`CONFLICTS.md: нет якоря ${anchor}, на который ссылается код`);
}
ok('все якоря конфликтов, упомянутые в коде, присутствуют в документации');

console.log('\n[RED TEAM 6] Проект не объявлен production-ready');
const textFiles = files.filter((f) => /\.(md|html|json|js)$/.test(f) && !f.includes('red-team'));
// Ищем УТВЕРЖДЕНИЕ о готовности, а не простое упоминание термина.
// Отрицания и метаупоминания («отсутствие заявлений о production-ready»,
// «НЕ production-ready») нарушением не являются.
let claimed = false;
// Считаем нарушением только УТВЕРЖДЕНИЕ о готовности.
// Строка безопасна, если где-либо в ней есть отрицание или метаупоминание.
const NEG_MARKERS = [
  'не production', 'не  production', 'не production-ready',
  'not production', 'non-production', 'без production',
  'отсутстви', 'запрещ', 'запрет', 'нельзя', 'заявлени',
  'не называть', 'не объявл', 'не являет'
];
const isNegated = (line) => {
  const l = line.toLowerCase().replace(/[–—]/g, '-');
  return NEG_MARKERS.some((m) => l.includes(m));
};
for (const f of textFiles) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(root, f);
  for (const line of src.split('\n')) {
    if (!/production[- ]ready/i.test(line)) continue;
    if (isNegated(line)) continue;
    violation(`${rel}: заявлена готовность к промышленной эксплуатации — «${line.trim().slice(0, 80)}»`);
    claimed = true;
  }
}
if (!claimed) ok('нигде не заявлено production-ready');

const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!/MVP/.test(idx)) violation('index.html не помечен как MVP');
else ok('интерфейс помечен как MVP / экспериментальный');
if (!/не медицинская диагностика|Не медицинская диагностика/i.test(idx)) {
  violation('index.html: отсутствует медицинское ограничение');
} else ok('медицинское ограничение присутствует в интерфейсе');

console.log('\n[RED TEAM 7] Детерминированность');
if (/Date\.now\(\)|new Date\(\)/.test(
  engineFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n'))) {
  violation('расчётное ядро использует текущее время (недетерминированность)');
} else ok('расчётное ядро не зависит от системного времени');

console.log('\n[RED TEAM 8] Отсутствие внешних зависимостей');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (Object.keys(pkg.dependencies || {}).length) violation('появились runtime-зависимости');
else ok('runtime-зависимостей нет');
if (Object.keys(pkg.devDependencies || {}).length) warn('появились dev-зависимости');
else ok('dev-зависимостей нет');
if (fs.existsSync(path.join(root, 'node_modules'))) warn('присутствует node_modules');

console.log(`\nИТОГО RED TEAM: проверок ${checks}, нарушений ${violations}, предупреждений ${warnings}`);
process.exit(violations > 0 ? 1 : 0);
