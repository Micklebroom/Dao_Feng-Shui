#!/usr/bin/env node
/**
 * validate-spec.js — Проверка спецификации PHASE 3.
 * Проверяет: валидность JSON, внутренние ссылки, согласованность схем,
 * отсутствие фиктивных формул для NOT_VERIFIED, покрытие golden-тестами.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let errors = 0, warnings = 0, checks = 0;
const fail = (m) => { console.error('  ОШИБКА: ' + m); errors++; };
const warn = (m) => { console.warn('  ПРЕДУПРЕЖДЕНИЕ: ' + m); warnings++; };
const ok = (m) => { console.log('  ok: ' + m); checks++; };

const SPEC = path.join(root, 'algorithms/calculation_spec.json');
const GOLD = path.join(root, 'tests/golden_cases.json');

console.log('\n[1] Валидность JSON');
let spec, gold;
try { spec = JSON.parse(fs.readFileSync(SPEC, 'utf8')); ok('calculation_spec.json — валидный JSON'); }
catch (e) { fail('calculation_spec.json: ' + e.message); process.exit(1); }
try { gold = JSON.parse(fs.readFileSync(GOLD, 'utf8')); ok('golden_cases.json — валидный JSON'); }
catch (e) { fail('golden_cases.json: ' + e.message); process.exit(1); }

const VALID_STATUS = ['VERIFIED', 'PARTIALLY VERIFIED', 'INFERRED', 'NOT_VERIFIED', 'UNRESOLVED'];

console.log('\n[2] Схема алгоритмов: обязательные поля');
const REQUIRED = ['id', 'name', 'ru', 'system', 'status', 'input', 'output',
  'dependencies', 'validationMethod', 'source'];
const algIds = new Set();
for (const a of spec.algorithms) {
  for (const f of REQUIRED) {
    if (a[f] === undefined) fail(`алгоритм ${a.id || '?'}: нет обязательного поля «${f}»`);
  }
  if (algIds.has(a.id)) fail(`дублирующийся id алгоритма: ${a.id}`);
  algIds.add(a.id);
  if (!VALID_STATUS.includes(a.status)) fail(`${a.id}: недопустимый status «${a.status}»`);
  if (!Array.isArray(a.source) || a.source.length === 0) fail(`${a.id}: пустой source`);
}
if (!errors) ok(`${spec.algorithms.length} алгоритмов, все обязательные поля на месте`);

console.log('\n[3] Запрет составных статусов (AUDIT A-05)');
for (const a of spec.algorithms) {
  if (typeof a.status === 'string' && /\//.test(a.status)) {
    fail(`${a.id}: составной статус в одном поле «${a.status}» — запрещено, используйте раздельные поля *Status`);
  }
}
ok('составных статусов в поле status нет');

console.log('\n[4] Внутренние ссылки: dependencies');
for (const a of spec.algorithms) {
  for (const d of a.dependencies) {
    if (d === 'TZ' || d === 'E1') continue; // TZ — глобальные правила, E1 — placeholder PH-E1
    if (!algIds.has(d)) fail(`${a.id}: зависимость «${d}» не найдена среди алгоритмов`);
  }
}
ok('все зависимости алгоритмов разрешаются');

console.log('\n[5] Внутренние ссылки: dependencyGraph согласован с algorithms');
const graphKeys = Object.keys(spec.dependencyGraph);
for (const k of graphKeys) {
  if (!algIds.has(k)) fail(`dependencyGraph: узел «${k}» отсутствует в algorithms`);
}
for (const a of spec.algorithms) {
  if (!graphKeys.includes(a.id)) fail(`алгоритм ${a.id} отсутствует в dependencyGraph`);
  else {
    const inGraph = [...spec.dependencyGraph[a.id]].sort().join(',');
    const inAlg = [...a.dependencies].sort().join(',');
    if (inGraph !== inAlg) fail(`${a.id}: dependencies (${inAlg}) != dependencyGraph (${inGraph})`);
  }
}
ok('dependencyGraph полностью согласован с полями dependencies');

console.log('\n[6] Ацикличность графа зависимостей');
const visiting = new Set(), done = new Set();
let cyclic = false;
const dfs = (n, stack = []) => {
  if (done.has(n)) return;
  if (visiting.has(n)) { fail(`цикл в зависимостях: ${[...stack, n].join(' -> ')}`); cyclic = true; return; }
  visiting.add(n);
  for (const d of (spec.dependencyGraph[n] || [])) {
    if (spec.dependencyGraph[d]) dfs(d, [...stack, n]);
  }
  visiting.delete(n); done.add(n);
};
for (const k of graphKeys) dfs(k);
if (!cyclic) ok('граф зависимостей ацикличен (топологически разрешим)');

console.log('\n[7] Placeholders: NOT_VERIFIED без фиктивных формул');
const phIds = new Set();
for (const p of spec.placeholders) {
  if (phIds.has(p.id)) fail(`дублирующийся id placeholder: ${p.id}`);
  phIds.add(p.id);
  if (!p.status) { fail(`${p.id}: нет status`); continue; }
  if (!['NOT_VERIFIED', 'PARTIALLY VERIFIED'].includes(p.status)) {
    fail(`${p.id}: placeholder обязан иметь status NOT_VERIFIED (получено «${p.status}»)`);
  }
  if (!p.architecturalNote && p.status === 'NOT_VERIFIED') {
    warn(`${p.id}: нет architecturalNote`);
  }
  // Ключевая проверка: у заглушки не должно быть исполнимой формулы
  if (p.formula && !/PLACEHOLDER/i.test(String(p.formula))) {
    fail(`${p.id}: у NOT_VERIFIED заглушки присутствует формула — запрещено`);
  }
}
ok(`${spec.placeholders.length} заглушек, фиктивных формул нет`);

console.log('\n[8] Алгоритмы с NOT_VERIFIED-частями ссылаются на заглушки');
for (const a of spec.algorithms) {
  if (a.formula && /PLACEHOLDER/i.test(a.formula)) {
    const m = a.formula.match(/PH-[A-Z0-9]+/);
    if (!m) fail(`${a.id}: формула помечена PLACEHOLDER, но не указан id заглушки`);
    else if (!phIds.has(m[0])) fail(`${a.id}: ссылка на несуществующую заглушку ${m[0]}`);
  }
}
ok('ссылки на заглушки корректны');

console.log('\n[9] Конфликты: ссылки из алгоритмов разрешаются');
const conflictIds = new Set(spec.conflicts.map((c) => c.id));
for (const a of spec.algorithms) {
  if (a.conflictRef) {
    for (const c of String(a.conflictRef).split(/,\s*/)) {
      if (!conflictIds.has(c)) fail(`${a.id}: conflictRef «${c}» не найден`);
    }
  }
}
for (const c of spec.conflicts) {
  if (!['RESOLVED', 'UNRESOLVED'].includes(c.status)) fail(`конфликт ${c.id}: недопустимый status`);
  if (c.status === 'RESOLVED' && !c.resolution) fail(`конфликт ${c.id}: RESOLVED без поля resolution`);
  if (c.status === 'UNRESOLVED' && !c.handling) fail(`конфликт ${c.id}: UNRESOLVED без поля handling`);
  for (const aff of (c.affects || [])) {
    if (!algIds.has(aff) && !phIds.has(aff)) fail(`конфликт ${c.id}: affects «${aff}» не найден`);
  }
}
ok(`${spec.conflicts.length} конфликтов, все ссылки разрешаются`);

console.log('\n[10] Golden-тесты: схема');
const REQ_CASE = ['id', 'algorithm', 'name', 'input', 'expected_output', 'source', 'status'];
const caseIds = new Set();
const VALID_CASE_STATUS = Object.keys(gold.statusLegend);
for (const c of gold.cases) {
  for (const f of REQ_CASE) if (c[f] === undefined) fail(`тест ${c.id || '?'}: нет поля «${f}»`);
  if (caseIds.has(c.id)) fail(`дублирующийся id теста: ${c.id}`);
  caseIds.add(c.id);
  if (!VALID_CASE_STATUS.includes(c.status)) fail(`${c.id}: недопустимый status «${c.status}»`);
  if (!algIds.has(c.algorithm)) fail(`${c.id}: ссылка на несуществующий алгоритм «${c.algorithm}»`);
}
ok(`${gold.cases.length} golden-тестов, схема корректна`);

console.log('\n[11] Двусторонняя связь algorithms <-> goldenTests');
for (const a of spec.algorithms) {
  const declared = a.goldenTests || [];
  for (const t of declared) {
    if (!caseIds.has(t)) fail(`${a.id}: объявлен golden-тест «${t}», которого нет в golden_cases.json`);
  }
  const actual = gold.cases.filter((c) => c.algorithm === a.id).map((c) => c.id);
  for (const t of actual) {
    if (!declared.includes(t)) fail(`тест ${t} ссылается на ${a.id}, но не объявлен в его goldenTests`);
  }
}
ok('связь алгоритм <-> golden-тест двусторонне согласована');

console.log('\n[12] Покрытие: у каждого VERIFIED алгоритма есть golden-тесты');
for (const a of spec.algorithms) {
  const isVerified = a.status === 'VERIFIED';
  const n = (a.goldenTests || []).length;
  if (isVerified && n === 0) fail(`${a.id} (VERIFIED): нет ни одного golden-теста`);
  if (a.status === 'PARTIALLY VERIFIED' && n === 0 && a.implementationStatus !== 'NOT_IMPLEMENTED_IN_MVP') {
    warn(`${a.id} (PARTIALLY VERIFIED): нет golden-тестов`);
  }
}
ok('все VERIFIED алгоритмы покрыты golden-тестами');

console.log('\n[13] NOT_VERIFIED не имеет golden-тестов (сравнивать не с чем)');
const notVerifiedRefs = new Set(gold.coverage.notVerifiedExcludedFromGolden);
for (const c of gold.cases) {
  if (notVerifiedRefs.has(c.algorithm)) fail(`${c.id}: golden-тест для NOT_VERIFIED «${c.algorithm}»`);
}
for (const ct of gold.contractTests.cases) {
  if (!phIds.has(ct.placeholder)) fail(`${ct.id}: ссылка на несуществующую заглушку «${ct.placeholder}»`);
}
ok('NOT_VERIFIED проверяется только контрактами, не значениями');

console.log('\n[14] Счётчики покрытия совпадают с фактом');
const byStatus = {};
for (const c of gold.cases) byStatus[c.status] = (byStatus[c.status] || 0) + 1;
if (gold.coverage.totalCases !== gold.cases.length) {
  fail(`coverage.totalCases=${gold.coverage.totalCases}, фактически ${gold.cases.length}`);
}
for (const [k, v] of Object.entries(gold.coverage.byStatus)) {
  if ((byStatus[k] || 0) !== v) fail(`coverage.byStatus.${k}=${v}, фактически ${byStatus[k] || 0}`);
}
const covered = new Set(gold.cases.map((c) => c.algorithm));
for (const a of gold.coverage.verifiedAlgorithmsWithGoldenTests) {
  if (!covered.has(a)) fail(`coverage: заявлен ${a}, но тестов для него нет`);
}
ok('счётчики покрытия соответствуют фактическому содержимому');

console.log('\n[15] Согласованность с data/*.json (таблицы существуют)');
const dataDir = path.join(root, 'data');
const existing = new Set(fs.readdirSync(dataDir).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')));
const referenced = new Set();
for (const a of spec.algorithms) for (const t of (a.lookupTables || [])) referenced.add(t);
for (const t of referenced) {
  if (!existing.has(t)) {
    if (t === 'qi-phases') warn(`таблица «${t}» упомянута в спецификации, но ещё не создана (D1, планируется)`);
    else fail(`таблица «${t}» упомянута в спецификации, но отсутствует в data/`);
  }
}
ok(`ссылки на таблицы данных проверены (${referenced.size} уникальных)`);

console.log('\n[16] Согласованность с документами исследования');
const algStatusDoc = fs.readFileSync(path.join(root, 'docs/ALGORITHM_STATUS.md'), 'utf8');
const auditDoc = fs.readFileSync(path.join(root, 'docs/RESEARCH_AUDIT.md'), 'utf8');
for (const a of spec.algorithms) {
  if (a.auditRef) {
    for (const r of String(a.auditRef).split(/,\s*/)) {
      if (!auditDoc.includes(r)) fail(`${a.id}: auditRef «${r}» не найден в RESEARCH_AUDIT.md`);
    }
  }
}
if (!/10 меридианов|10 меридиан/i.test(algStatusDoc)) warn('ALGORITHM_STATUS.md не упоминает 10 меридианов');
ok('ссылки на пункты аудита разрешаются');

console.log('\n[17] Инварианты доктрины проекта');
const specText = JSON.stringify(spec);
if (/Math\.random|random\(\)/.test(specText)) fail('в спецификации упоминается random()');
if (!spec.projectStatus || !/MVP/.test(spec.projectStatus)) fail('projectStatus не помечен как MVP');
if (/production[- ]ready/i.test(specText) && !/НЕ production-ready/i.test(specText)) {
  fail('спецификация заявляет production-ready');
}
const suJok = /Су Джок|Su Jok/i.test(specText);
if (suJok && !/rejectedSources[\s\S]*Су Джок|Су Джок[\s\S]{0,400}AUDIT A-01/.test(specText)) {
  warn('Су Джок упоминается — убедитесь, что только как отозванный источник');
}
ok('доктринальные инварианты соблюдены');

console.log(`\nИТОГО SPEC: проверок ${checks}, ошибок ${errors}, предупреждений ${warnings}`);
process.exit(errors > 0 ? 1 : 0);
