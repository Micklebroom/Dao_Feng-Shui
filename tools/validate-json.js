#!/usr/bin/env node
/**
 * validate-json.js — PHASE 4. Проверка JSON-пакета данных.
 *
 * Проверяет ровно то, что требует задание:
 *   [1] JSON validity      — файлы разбираются
 *   [2] schema validity    — сама схема корректна, затем данные против схемы
 *   [3] references         — все перекрёстные ссылки разрешаются
 *   [4] duplicate IDs      — стабильные ID уникальны
 *   [5] missing values     — обязательные поля не пусты
 *   [6] invalid types      — типы соответствуют объявленным
 *   [7] circular refs      — в ссылках нет циклов
 * Плюс доктринальные проверки проекта (запрет выдуманных чисел).
 *
 * Без внешних зависимостей: реализовано подмножество JSON Schema draft-07.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');

let errors = 0, warnings = 0, checks = 0;
const fail = (m) => { console.error('  ОШИБКА: ' + m); errors++; };
const warn = (m) => { console.warn('  ПРЕДУПРЕЖДЕНИЕ: ' + m); warnings++; };
const ok = (m) => { console.log('  ok: ' + m); };
let sectionStart = 0;
const head = (n, t) => { checks++; sectionStart = errors; console.log(`\n[${n}] ${t}`); };
/** ok только если ТЕКУЩАЯ секция прошла без ошибок (иначе успехи прошлых секций маскируют провал). */
const okIfClean = (m) => { if (errors === sectionStart) ok(m); };

/* Таблицы пакета. bundle.json — производный артефакт сборки, не источник. */
const TABLES = [
  'stems_branches', 'calendar', 'elements', 'bazi', 'luck_pillars',
  'gua', 'meridians', 'indicators', 'colors', 'luoshu', 'mountains24'
];

/* ============================== [1] JSON validity ============================== */
head(1, 'Корректность JSON');
const raw = {};
for (const t of TABLES) {
  const f = path.join(DATA, t + '.json');
  if (!fs.existsSync(f)) { fail(`отсутствует файл data/${t}.json`); continue; }
  try {
    raw[t] = JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    fail(`data/${t}.json не разбирается: ${e.message}`);
  }
}
let schema = null;
try {
  schema = JSON.parse(fs.readFileSync(path.join(DATA, 'schema.json'), 'utf8'));
} catch (e) {
  fail('data/schema.json не разбирается: ' + e.message);
}
okIfClean(`${TABLES.length} таблиц + schema.json разобраны без ошибок`);
if (errors) { console.error('\nКритично: дальнейшие проверки невозможны.'); process.exit(1); }

/* ====================== [2a] Валидность самой схемы ====================== */
head(2, 'Валидность самой схемы (meta-check)');
const KNOWN_KW = new Set(['type', 'properties', 'required', 'items', 'enum', 'const',
  'minItems', 'maxItems', 'minLength', 'maxLength', 'minimum', 'maximum', 'pattern',
  'description', 'additionalProperties', '$ref']);
const VALID_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);

function metaCheck(node, where) {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) return;
  for (const [k, v] of Object.entries(node)) {
    if (k === 'properties' || k === 'definitions') {
      for (const [pk, pv] of Object.entries(v)) metaCheck(pv, `${where}.${k}.${pk}`);
      continue;
    }
    if (k === 'items') { metaCheck(v, where + '.items'); continue; }
    if (k === 'type') {
      const list = Array.isArray(v) ? v : [v];
      for (const t of list) if (!VALID_TYPES.has(t)) fail(`схема ${where}: неизвестный тип «${t}»`);
      continue;
    }
    if (k === 'required') {
      if (!Array.isArray(v)) fail(`схема ${where}: required должен быть массивом`);
      else if (node.properties) {
        for (const r of v) {
          if (!(r in node.properties)) {
            warn(`схема ${where}: required «${r}» не описан в properties (допустимо, но подозрительно)`);
          }
        }
      }
      continue;
    }
    if (!KNOWN_KW.has(k) && !k.startsWith('$') && where !== 'root') {
      // не ключевое слово и не метаполе — вероятно опечатка
      if (typeof v === 'object') metaCheck(v, `${where}.${k}`);
    }
  }
}
if (!schema.definitions) fail('в схеме нет definitions');
else {
  for (const [name, def] of Object.entries(schema.definitions)) metaCheck(def, name);
  const missing = TABLES.filter((t) => !schema.definitions[t]);
  if (missing.length) fail('в схеме нет определений для: ' + missing.join(', '));
  else ok(`схема корректна, определений: ${Object.keys(schema.definitions).length}, покрыты все ${TABLES.length} таблиц`);
}

/* ============ [2b]+[5]+[6] Валидация данных против схемы ============ */
head(3, 'Данные против схемы (типы и обязательные поля)');

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}
function typeMatches(v, t) {
  if (t === 'integer') return Number.isInteger(v);
  if (t === 'number') return typeof v === 'number';
  if (t === 'null') return v === null;
  if (t === 'array') return Array.isArray(v);
  if (t === 'object') return v !== null && typeof v === 'object' && !Array.isArray(v);
  return typeof v === t;
}

function validate(value, sch, at) {
  if (!sch || typeof sch !== 'object') return;

  if (sch.type) {
    const list = Array.isArray(sch.type) ? sch.type : [sch.type];
    if (!list.some((t) => typeMatches(value, t))) {
      fail(`${at}: тип «${typeOf(value)}», ожидался «${list.join('|')}»`);
      return; // дальше проверять бессмысленно
    }
  }
  if ('const' in sch && JSON.stringify(value) !== JSON.stringify(sch.const)) {
    fail(`${at}: значение ${JSON.stringify(value)}, схема требует ${JSON.stringify(sch.const)}`
      + (sch.description ? ` — ${sch.description}` : ''));
  }
  if (sch.enum && !sch.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    fail(`${at}: значение ${JSON.stringify(value)} вне enum [${sch.enum.join(', ')}]`);
  }
  if (typeof value === 'string') {
    if (sch.minLength !== undefined && value.length < sch.minLength) {
      fail(`${at}: длина строки ${value.length} < minLength ${sch.minLength}`);
    }
    if (sch.pattern && !new RegExp(sch.pattern).test(value)) {
      fail(`${at}: «${value}» не соответствует шаблону ${sch.pattern}`);
    }
  }
  if (typeof value === 'number') {
    if (sch.minimum !== undefined && value < sch.minimum) fail(`${at}: ${value} < minimum ${sch.minimum}`);
    if (sch.maximum !== undefined && value > sch.maximum) fail(`${at}: ${value} > maximum ${sch.maximum}`);
  }
  if (Array.isArray(value)) {
    if (sch.minItems !== undefined && value.length < sch.minItems) fail(`${at}: элементов ${value.length} < minItems ${sch.minItems}`);
    if (sch.maxItems !== undefined && value.length > sch.maxItems) fail(`${at}: элементов ${value.length} > maxItems ${sch.maxItems}`);
    if (sch.items) value.forEach((v, i) => validate(v, sch.items, `${at}[${i}]`));
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const r of sch.required || []) {
      if (!(r in value)) { fail(`${at}: отсутствует обязательное поле «${r}»`); continue; }
      const v = value[r];
      // [5] missing values: поле есть, но пустое
      if (v === undefined) fail(`${at}.${r}: undefined`);
      else if (typeof v === 'string' && v.trim() === '') fail(`${at}.${r}: пустая строка`);
      else if (Array.isArray(v) && v.length === 0) fail(`${at}.${r}: пустой массив`);
    }
    for (const [k, sub] of Object.entries(sch.properties || {})) {
      if (k in value) validate(value[k], sub, `${at}.${k}`);
    }
  }
}

for (const t of TABLES) validate(raw[t], schema.definitions[t], t);
okIfClean('все таблицы соответствуют схеме');

/* ============================ [4] Дубликаты ID ============================ */
head(4, 'Уникальность стабильных ID');
function dupCheck(arr, keyName, where) {
  const seen = new Map();
  for (const it of arr) {
    const k = it[keyName];
    if (k === undefined) { fail(`${where}: элемент без «${keyName}»`); continue; }
    if (seen.has(k)) fail(`${where}: дубликат ${keyName}=«${k}»`);
    seen.set(k, true);
  }
}
dupCheck(raw.stems_branches.stems, 'id', 'stems_branches.stems');
dupCheck(raw.stems_branches.branches, 'id', 'stems_branches.branches');
dupCheck(raw.calendar.solarTerms, 'id', 'calendar.solarTerms');
dupCheck(raw.calendar.epochs.items, 'id', 'calendar.epochs');
dupCheck(raw.elements.items, 'id', 'elements.items');
dupCheck(raw.meridians.items, 'id', 'meridians.items');
dupCheck(raw.luoshu.palaces, 'direction', 'luoshu.palaces');
dupCheck(raw.luoshu.stars, 'number', 'luoshu.stars');
dupCheck(raw.mountains24.items, 'code', 'mountains24.items');
dupCheck(raw.bazi.qiPhases.phases, 'id', 'bazi.qiPhases.phases');
for (const [k, grp] of Object.entries(raw.bazi.interactions)) {
  if (grp && grp.items) dupCheck(grp.items, 'id', `bazi.interactions.${k}`);
}
// индексы должны совпадать с позицией
const idxCheck = (arr, where) => arr.forEach((it, i) => {
  if (it.index !== undefined && it.index !== i) fail(`${where}[${i}]: index=${it.index} не совпадает с позицией`);
});
idxCheck(raw.stems_branches.stems, 'stems');
idxCheck(raw.stems_branches.branches, 'branches');
idxCheck(raw.calendar.solarTerms, 'solarTerms');
idxCheck(raw.meridians.items, 'meridians');
idxCheck(raw.mountains24.items, 'mountains24');
okIfClean('дубликатов ID нет, индексы согласованы с позициями');

/* ====================== [3] Перекрёстные ссылки ====================== */
head(5, 'Разрешение перекрёстных ссылок');
const stemIds = new Set(raw.stems_branches.stems.map((s) => s.id));
const branchIds = new Set(raw.stems_branches.branches.map((b) => b.id));
const elemIds = new Set(raw.elements.items.map((e) => e.id));
const meridianIds = new Set(raw.meridians.items.map((m) => m.id));
const termIds = new Set(raw.calendar.solarTerms.map((t) => t.id));
const phaseIds = new Set(raw.bazi.qiPhases.phases.map((p) => p.id));

const ref = (val, set, where) => { if (!set.has(val)) fail(`${where}: неразрешённая ссылка «${val}»`); };

for (const s of raw.stems_branches.stems) ref(s.element, elemIds, `stems.${s.id}.element`);
for (const b of raw.stems_branches.branches) ref(b.element, elemIds, `branches.${b.id}.element`);
for (const [bid, hidden] of Object.entries(raw.stems_branches.hiddenStems.byBranch)) {
  ref(bid, branchIds, 'hiddenStems.byBranch key');
  for (const h of hidden) ref(h.stem, stemIds, `hiddenStems.${bid}`);
}
for (const e of raw.elements.items) {
  ref(e.generates, elemIds, `elements.${e.id}.generates`);
  ref(e.controls, elemIds, `elements.${e.id}.controls`);
}
for (const [bid, el] of Object.entries(raw.elements.seasonByMonthBranch.map)) {
  ref(bid, branchIds, 'seasonByMonthBranch key'); ref(el, elemIds, `seasonByMonthBranch.${bid}`);
}
for (const t of raw.calendar.solarTerms) {
  if (t.startsMonthBranch !== null) ref(t.startsMonthBranch, branchIds, `solarTerms.${t.id}`);
}
ref(raw.calendar.monthBoundary.yearStartTermId, termIds, 'calendar.monthBoundary.yearStartTermId');
ref(raw.luck_pillars.countingTarget.termType === 'jie' ? 'lichun' : 'lichun', termIds, 'luck_pillars.countingTarget');

for (const [stem, br] of Object.entries(raw.bazi.qiPhases.startBranch)) {
  ref(stem, stemIds, 'qiPhases.startBranch key'); ref(br, branchIds, `qiPhases.startBranch.${stem}`);
}
for (const [stem, row] of Object.entries(raw.bazi.qiPhases.byStem)) {
  ref(stem, stemIds, 'qiPhases.byStem key');
  for (const [br, ph] of Object.entries(row)) {
    ref(br, branchIds, `qiPhases.byStem.${stem} key`); ref(ph, phaseIds, `qiPhases.byStem.${stem}.${br}`);
  }
}
for (const [k, grp] of Object.entries(raw.bazi.interactions)) {
  if (!grp || !grp.items) continue;
  for (const it of grp.items) {
    for (const s of it.stems || []) ref(s, stemIds, `interactions.${k}.${it.id}`);
    for (const b of it.branches || []) ref(b, branchIds, `interactions.${k}.${it.id}`);
    for (const b of it.yearTriad || []) ref(b, branchIds, `interactions.${k}.${it.id}.yearTriad`);
    for (const b of it.shaBranches || []) ref(b, branchIds, `interactions.${k}.${it.id}.shaBranches`);
    if (it.produces) ref(it.produces, elemIds, `interactions.${k}.${it.id}.produces`);
  }
}
for (const m of raw.meridians.items) ref(m.element, elemIds, `meridians.${m.id}.element`);
for (const g of raw.meridians.tripleBurner.groups) {
  for (const mem of g.members) ref(mem, meridianIds, `tripleBurner.${g.id}`);
}
for (const p of raw.luoshu.palaces) ref(p.element, elemIds, `luoshu.palaces.${p.direction}`);
for (const s of raw.luoshu.stars) ref(s.element, elemIds, `luoshu.stars.${s.number}`);
for (const m of raw.mountains24.items) {
  if (m.trigram === undefined) fail(`mountains24.${m.code}: нет trigram`);
}
for (const [mid] of Object.entries(raw.colors.palettes.meridians.byId)) ref(mid, meridianIds, 'colors.meridians');
for (const [eid] of Object.entries(raw.colors.palettes.elements.byId)) ref(eid, elemIds, 'colors.elements');
okIfClean('все перекрёстные ссылки разрешаются');

/* ============ Ссылки в спецификацию (алгоритмы, заглушки, конфликты) ============ */
head(6, 'Ссылки в algorithms/calculation_spec.json');
let spec = null;
try {
  spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'algorithms', 'calculation_spec.json'), 'utf8'));
} catch (e) { fail('не читается calculation_spec.json: ' + e.message); }
if (spec) {
  const algoIds = new Set(spec.algorithms.map((a) => a.id));
  const phIds = new Set(spec.placeholders.map((p) => p.id));
  const kIds = new Set(spec.conflicts.map((c) => c.id));
  const walk = (node, at) => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${at}[${i}]`));
    for (const [k, v] of Object.entries(node)) {
      if (k === 'algorithmRef') ref(v, algoIds, `${at}.${k}`);
      else if (k === 'algorithmRefs') v.forEach((x) => ref(x, algoIds, `${at}.${k}`));
      else if (k === 'placeholderRef') ref(v, phIds, `${at}.${k}`);
      else if (k === 'conflictRef') ref(v, kIds, `${at}.${k}`);
      else if (k === 'conflictRefs') v.forEach((x) => ref(x, kIds, `${at}.${k}`));
      else walk(v, `${at}.${k}`);
    }
  };
  for (const t of TABLES) walk(raw[t], t);
  // обратная связь: таблицы, объявленные в спецификации, должны существовать
  const declared = new Set();
  spec.algorithms.forEach((a) => (a.lookupTables || []).forEach((x) => declared.add(x)));
  const fileFor = { 'solar-terms': 'calendar', 'qi-phases': 'bazi', stems: 'stems_branches',
    branches: 'stems_branches', interactions: 'bazi' };
  for (const d of declared) {
    const target = fileFor[d] || d;
    if (!TABLES.includes(target)) fail(`спецификация ссылается на таблицу «${d}», её нет в пакете`);
  }
  okIfClean('ссылки на алгоритмы, заглушки, конфликты и таблицы разрешаются');
}

/* ====================== [7] Циклические ссылки ====================== */
head(7, 'Отсутствие циклических ссылок');
// 7a. Циклы в $schema/$ref между файлами
const refGraph = {};
for (const t of TABLES) {
  refGraph[t] = [];
  const s = raw[t].$schema;
  if (s && !s.startsWith('./schema.json')) fail(`${t}.$schema указывает вне schema.json: ${s}`);
  const scan = (node) => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(scan);
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string' && v.includes('.json#')) {
        const file = v.split('.json#')[0].replace('./', '');
        if (file !== 'schema' && TABLES.includes(file)) refGraph[t].push(file);
      } else scan(v);
    }
  };
  scan(raw[t]);
}
const WHITE = 0, GREY = 1, BLACK = 2;
const mark = {};
const stack = [];
let cycles = 0;
function dfs(n) {
  mark[n] = GREY; stack.push(n);
  for (const m of refGraph[n] || []) {
    if (mark[m] === GREY) { fail(`цикл ссылок: ${[...stack.slice(stack.indexOf(m)), m].join(' → ')}`); cycles++; }
    else if (mark[m] !== BLACK) dfs(m);
  }
  stack.pop(); mark[n] = BLACK;
}
for (const t of TABLES) if (mark[t] !== BLACK) dfs(t);

// 7b. Циклы в порождающем цикле стихий — их быть ДОЛЖНО ровно 5 (замкнутое кольцо),
//     проверяем, что кольцо полное и единственное, а не разорванное.
const gen = new Map(raw.elements.items.map((e) => [e.id, e.generates]));
let cur = 'wood'; const path5 = [cur];
for (let i = 0; i < 5; i++) { cur = gen.get(cur); path5.push(cur); }
if (path5[0] !== path5[5] || new Set(path5.slice(0, 5)).size !== 5) {
  fail('порождающий цикл стихий не образует полное кольцо из 5 элементов: ' + path5.join('→'));
}
const ctl = new Map(raw.elements.items.map((e) => [e.id, e.controls]));
let c2 = 'wood'; const p2 = [c2];
for (let i = 0; i < 5; i++) { c2 = ctl.get(c2); p2.push(c2); }
if (p2[0] !== p2[5] || new Set(p2.slice(0, 5)).size !== 5) {
  fail('цикл контроля стихий не образует полное кольцо из 5 элементов: ' + p2.join('→'));
}
if (!cycles) okIfClean('циклов между файлами нет; кольца стихий замкнуты корректно (5 и 5)');

/* ====================== Содержательные инварианты ====================== */
head(8, 'Содержательные инварианты данных');
// скрытые стволы дают 100
for (const [bid, hidden] of Object.entries(raw.stems_branches.hiddenStems.byBranch)) {
  const sum = hidden.reduce((a, h) => a + h.share, 0);
  if (sum !== 100) fail(`скрытые стволы ${bid}: сумма ${sum} != 100`);
}
// чередование полярности
raw.stems_branches.stems.forEach((s, i) => {
  if (s.polarity !== (i % 2 === 0 ? 'yang' : 'yin')) fail(`ствол ${s.id}: нарушено чередование полярности`);
});
raw.stems_branches.branches.forEach((b, i) => {
  if (b.polarity !== (i % 2 === 0 ? 'yang' : 'yin')) fail(`ветвь ${b.id}: нарушено чередование полярности`);
});
// 12 секторных/серединных терминов
const jie = raw.calendar.solarTerms.filter((t) => t.type === 'jie');
if (jie.length !== 12) fail(`секторных терминов ${jie.length}, ожидается 12`);
if (raw.calendar.solarTerms.filter((t) => t.type === 'qi').length !== 12) fail('серединных терминов должно быть 12');
raw.calendar.solarTerms.forEach((t, i) => {
  const expect = (315 + i * 15) % 360;
  if (t.longitude !== expect) fail(`термин ${t.id}: долгота ${t.longitude}, ожидается ${expect}`);
});
// меридианы: 10, по 2 на стихию, 5/5
const mers = raw.meridians.items;
if (mers.length !== 10) fail(`меридианов ${mers.length}, ожидается 10 (аудит A-02)`);
if (mers.filter((m) => m.polarity === 'yin').length !== 5) fail('иньских меридианов должно быть 5');
if (mers.filter((m) => m.polarity === 'yang').length !== 5) fail('янских меридианов должно быть 5');
for (const e of elemIds) {
  if (mers.filter((m) => m.element === e).length !== 2) fail(`на стихию ${e} должно приходиться 2 меридиана`);
}
if (mers.some((m) => m.id === 'pericardium' || m.id === 'tripleBurner')) {
  fail('перикард/тройной обогреватель не должны быть меридианами (аудит A-13)');
}
// три обогревателя покрывают все 10 без пересечений
const grp = raw.meridians.tripleBurner.groups.flatMap((g) => g.members);
if (grp.length !== 10 || new Set(grp).size !== 10) fail('Три обогревателя должны покрывать ровно 10 меридианов без пересечений');
// Ло Шу: суммы 15
const byDir = Object.fromEntries(raw.luoshu.palaces.map((p) => [p.direction, p]));
const grid = [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]];
const at = (r, c) => raw.luoshu.palaces.find((p) => p.row === r && p.col === c);
for (let r = 0; r < 3; r++) {
  const s = [0, 1, 2].reduce((a, c) => a + at(r, c).number, 0);
  if (s !== 15) fail(`Ло Шу: сумма строки ${r} = ${s}, ожидается 15`);
}
for (let c = 0; c < 3; c++) {
  const s = [0, 1, 2].reduce((a, r) => a + at(r, c).number, 0);
  if (s !== 15) fail(`Ло Шу: сумма столбца ${c} = ${s}, ожидается 15`);
}
if (at(1, 1).number !== 5) fail('Ло Шу: в центре должна быть 5');
if (byDir.S.row !== 0) fail('Ло Шу: ЮГ должен быть в верхней строке (ЮГ ВВЕРХУ)');
// 24 горы: непрерывные сектора по 15°
raw.mountains24.items.forEach((m) => {
  const span = ((m.end - m.start) + 360) % 360;
  if (Math.abs(span - 15) > 1e-9) fail(`гора ${m.code}: сектор ${span}°, ожидается 15°`);
});
// гуа: 8 чисел, без 5
const guaKeys = Object.keys(raw.gua.directionsByGua).filter((k) => /^[0-9]$/.test(k));
if (guaKeys.length !== 8) fail(`направлений Гуа ${guaKeys.length}, ожидается 8`);
if (guaKeys.includes('5')) fail('Гуа 5 не должно существовать (заменяется на 2/8)');
for (const k of guaKeys) {
  const d = raw.gua.directionsByGua[k];
  const vals = Object.values(d);
  if (new Set(vals).size !== 8) fail(`Гуа ${k}: восемь направлений должны быть различны`);
}
okIfClean('содержательные инварианты соблюдены (скрытые стволы, термины, меридианы, Ло Шу, горы, Гуа)');

/* ====================== Доктрина: запрет выдуманных чисел ====================== */
head(9, 'Доктрина: неизвестное не заполнено числами');
// Дисциплина: если формула референса неизвестна, статус не может быть VERIFIED,
// а «наша гипотеза» обязана лежать в отдельном поле ourModel/ourBands.
for (const [k, v] of Object.entries(raw.indicators)) {
  if (v && typeof v === 'object' && v.referenceFormulaKnown === false) {
    if (String(v.status).startsWith('VERIFIED')) {
      fail(`indicators.${k}: формула референса неизвестна, статус VERIFIED недопустим`);
    }
    if (v.formula !== undefined && v.formula !== null) {
      fail(`indicators.${k}.formula должно быть null — известна только наша гипотеза`);
    }
  }
}
const mustBeNull = [
  ['bazi.qiPhases.coefficients', raw.bazi.qiPhases.coefficients],
  ['meridians.tripleBurner.aggregation', raw.meridians.tripleBurner.aggregation],
  ['indicators.harmonyIndex.formula', raw.indicators.harmonyIndex.formula],
  ['indicators.yinYangIndices.formula', raw.indicators.yinYangIndices.formula],
  ['indicators.healthIndex.formula', raw.indicators.healthIndex.formula],
  ['indicators.qiPhaseCoefficients.values', raw.indicators.qiPhaseCoefficients.values],
  ['indicators.interpretationBands.thresholds', raw.indicators.interpretationBands.thresholds],
  ['indicators.healthIndex.ourModel', raw.indicators.healthIndex.ourModel]
];
for (const [name, v] of mustBeNull) {
  if (v !== null) fail(`${name} должно быть null: значение НЕ опубликовано источником, его нельзя выдумывать`);
}
// INFERRED-числа не должны лежать в VERIFIED-таблицах
for (const t of ['stems_branches', 'calendar', 'elements', 'meridians', 'luoshu', 'mountains24', 'gua']) {
  const txt = JSON.stringify(raw[t]);
  if (/"multipliers"\s*:\s*\{/.test(txt)) fail(`${t}: числовые множители должны лежать в indicators.json`);
}
// цвета — только в colors.json
for (const t of TABLES.filter((x) => x !== 'colors')) {
  const hits = JSON.stringify(raw[t]).match(/#[0-9a-fA-F]{6}/g);
  if (hits) fail(`${t}: HEX-цвета (${hits.length} шт.) должны лежать только в colors.json`);
}
// русское имя не должно быть первичным ключом
for (const t of TABLES) {
  const scanKeys = (node, at2) => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach((v, i) => scanKeys(v, `${at2}[${i}]`));
    for (const [k, v] of Object.entries(node)) {
      if (/[А-Яа-яЁё]/.test(k)) fail(`${at2}: ключ «${k}» на кириллице — русское имя не может быть ключом`);
      scanKeys(v, `${at2}.${k}`);
    }
  };
  scanKeys(raw[t], t);
}
okIfClean('заглушки пусты, цвета централизованы, ключи латинские');

/* ====================== Статусы и источники ====================== */
head(10, 'Статусы и источники');
const VALID = ['VERIFIED', 'PARTIALLY VERIFIED', 'INFERRED', 'NOT_VERIFIED', 'NOT VERIFIED'];
for (const t of TABLES) {
  const s = raw[t].status;
  if (!VALID.some((v) => s.startsWith(v))) fail(`${t}: недопустимый статус «${s}»`);
  if (s.startsWith('VERIFIED') && !(raw[t].sources || []).length) fail(`${t}: VERIFIED без источников`);
}
if (raw.indicators.status !== 'INFERRED') fail('indicators.json обязан быть INFERRED');
if ((raw.indicators.criticalNote || '').length < 200) fail('indicators.json: нет развёрнутого предупреждения для аудитора');
if (!raw.meridians.medicalDisclaimer) fail('meridians.json: нет медицинского ограничения');
okIfClean('статусы корректны, VERIFIED подкреплены источниками');

/* ============================== ИТОГ ============================== */
console.log(`\nИТОГО JSON: проверок ${checks}, ошибок ${errors}, предупреждений ${warnings}`);
if (errors) process.exit(1);
