#!/usr/bin/env node
/**
 * console-check.js — ПРОВЕРКА КОНСОЛИ (шаг 3 фазы 6).
 *
 * Запускает приложение на DOM-заглушке, ПЕРЕХВАТЫВАЯ console.error,
 * console.warn и необработанные исключения. Любое сообщение в error —
 * провал: в рабочей сборке консоль обязана быть чистой.
 *
 * ОГРАНИЧЕНИЕ: настоящего браузера в среде нет. Заглушка проверяет
 * выполнение кода и разметку, но НЕ рендеринг, шрифты и реальные события.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Перехват до загрузки приложения. */
const captured = { error: [], warn: [], log: [] };
const realError = console.error.bind(console);
const realWarn = console.warn.bind(console);
console.error = (...a) => captured.error.push(a.map(String).join(' '));
console.warn = (...a) => captured.warn.push(a.map(String).join(' '));

const uncaught = [];
process.on('uncaughtException', (e) => uncaught.push('uncaughtException: ' + e.message));
process.on('unhandledRejection', (e) => uncaught.push('unhandledRejection: ' + String(e)));

/* Поднимаем ту же DOM-заглушку, что и browser-test. */
const shimSrc = fs.readFileSync(path.join(root, 'tools/browser-test.js'), 'utf8');
const shimEnd = shimSrc.indexOf("/* ---------------- Запуск приложения");
const shimCode = shimEnd > 0 ? shimSrc.slice(0, shimEnd) : null;
if (!shimCode) {
  realError('Не удалось выделить DOM-заглушку из browser-test.js');
  process.exit(1);
}

const tmp = path.join(root, 'tools', '.console-shim.mjs');
fs.writeFileSync(tmp, shimCode.replace(/^#!.*\n/, '') + '\nexport const ready = true;\n');

let exitCode = 0;
try {
  await import(pathToFileURL(tmp).href);       // ставит globalThis.document и т. п.
  await import(pathToFileURL(path.join(root, 'src/ui/app.js')).href);  // boot() сам сработает

  console.error = realError;
  console.warn = realWarn;

  console.log('\n[КОНСОЛЬ] Результат запуска приложения');
  console.log('  console.error : ' + captured.error.length);
  console.log('  console.warn  : ' + captured.warn.length);
  console.log('  исключения    : ' + uncaught.length);

  for (const m of captured.error) console.log('    [error] ' + m);
  for (const m of captured.warn) console.log('    [warn]  ' + m);
  for (const m of uncaught) console.log('    [throw] ' + m);

  const bad = captured.error.length + uncaught.length;
  if (bad > 0) {
    console.log('\nИТОГО КОНСОЛЬ: ЧИСТОЙ НЕ ЯВЛЯЕТСЯ — ' + bad + ' сообщений об ошибках');
    exitCode = 1;
  } else {
    console.log('\nИТОГО КОНСОЛЬ: чистая (0 ошибок, ' + captured.warn.length + ' предупреждений)');
  }
} catch (e) {
  console.error = realError;
  realError('\nСБОЙ ЗАПУСКА: ' + e.message);
  realError(e.stack);
  exitCode = 1;
} finally {
  fs.rmSync(tmp, { force: true });
}

process.exit(exitCode);
