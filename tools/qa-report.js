#!/usr/bin/env node
/** qa-report.js — Сводный прогон всех уровней контроля качества (FINAL QA). */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const steps = [
  ['STATIC     (валидация данных)', ['node', ['tools/validate-data.js']]],
  ['UNIT       (модульные тесты)', ['node', ['--test', 'tests/unit/astro.test.js', 'tests/unit/ganzhi.test.js', 'tests/unit/flyingstars.test.js']]],
  ['INTEGRATION(интеграционные)', ['node', ['--test', 'tests/integration/reference-charts.test.js', 'tests/integration/engine.test.js', 'tests/integration/model.test.js', 'tests/integration/bugfix.test.js']]],
  ['ARCHITECTURE(правила слоёв)', ['node', ['--test', 'tests/architecture/data-sensitivity.test.js']]],
  ['GOLDEN     (эталонные случаи)', ['node', ['--test', 'tests/golden/runner.test.js']]],
  ['CONSOLE    (чистота консоли)', ['node', ['tools/console-check.js']]],
  ['JSON       (пакет данных)', ['node', ['tools/validate-json.js']]],
  ['SPEC       (спецификация)', ['node', ['tools/validate-spec.js']]],
  ['BROWSER    (интерфейс)', ['node', ['tools/browser-test.js']]],
  ['STANDALONE (автономный HTML)', ['node', ['tools/standalone-test.js']]],
  ['RED TEAM   (аудит доктрины)', ['node', ['tools/red-team.js']]],
  ['DISTRIBUTION(пакет поставки)', ['node', ['tools/distribution-test.js']]],
  ['HTTP       (выгрузки с сервера)', ['node', ['tools/download-http-test.js']]]
];

const results = [];
for (const [name, [cmd, args]] of steps) {
  let out = '', code = 0;
  try {
    out = execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
    code = e.status ?? 1;
  }
  let stat = '';
  const tap = out.match(/# tests (\d+)[\s\S]*?# pass (\d+)[\s\S]*?# fail (\d+)/);
  const own = out.match(/ИТОГО[^:]*: (?:пройдено|проверок) (\d+),\s*(?:провалено|нарушений) (\d+)/);
  const val = out.match(/ИТОГО: ошибок (\d+), предупреждений (\d+)/);
  if (tap) stat = `тестов ${tap[1]}, провалено ${tap[3]}`;
  else if (own) stat = `проверок ${own[1]}, провалено ${own[2]}`;
  else if (val) stat = `ошибок ${val[1]}, предупреждений ${val[2]}`;
  results.push({ name, code, stat });
  console.log(`${code === 0 ? '  ПРОЙДЕНО ' : '  ПРОВАЛЕНО'}  ${name}  ${stat}`);
  if (code !== 0) console.log(out.split('\n').filter((l) => /ОШИБКА|НАРУШЕНИЕ|not ok/.test(l)).slice(0, 12).join('\n'));
}

const failed = results.filter((r) => r.code !== 0);
console.log('\n' + '='.repeat(64));
console.log('ФИНАЛЬНЫЙ КОНТРОЛЬ КАЧЕСТВА');
console.log('='.repeat(64));
for (const r of results) console.log(`${r.code === 0 ? 'OK  ' : 'FAIL'}  ${r.name.padEnd(30)} ${r.stat}`);
console.log('='.repeat(64));
console.log(failed.length === 0
  ? 'ВСЕ УРОВНИ ПРОЙДЕНЫ. Статус проекта: MVP / экспериментальный (НЕ production-ready).'
  : `ЕСТЬ ПРОВАЛЫ: ${failed.length}. Публикация запрещена до устранения.`);

fs.writeFileSync(path.join(root, 'docs/QA-REPORT.txt'),
  'ОТЧЁТ О КОНТРОЛЕ КАЧЕСТВА\n' +
  '(детерминированный прогон; дату см. в истории git)\n\n' +
  results.map((r) => `${r.code === 0 ? 'OK  ' : 'FAIL'}  ${r.name}  ${r.stat}`).join('\n') +
  `\n\nИтог: ${failed.length === 0 ? 'все уровни пройдены' : failed.length + ' провалов'}\n` +
  'Статус проекта: MVP / экспериментальный. НЕ production-ready.\n', 'utf8');

process.exit(failed.length ? 1 : 0);
