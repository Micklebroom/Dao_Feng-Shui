#!/usr/bin/env node
/**
 * download-http-test.js — Проверка выгрузок в режиме «с сервера».
 *
 * distribution-test.js проверяет автономный режим (file://), где fetch
 * недоступен. Здесь проверяется ВТОРОЙ путь: приложение открыто с сервера
 * и обязано отдавать готовые файлы поставки по ОТНОСИТЕЛЬНЫМ путям.
 *
 * Поднимается настоящий HTTP-сервер (tools/serve.js) и вызывается реальный
 * fetch — без заглушек. Так проверяется то, что DOM-шим проверить не может:
 * маршрутизация, коды ответов, типы содержимого и целостность байтов.
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROGRAM_PATHS, ZIP_PATHS, fetchFirst } from '../src/ui/download.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8123);
const base = `http://127.0.0.1:${PORT}/`;

let pass = 0, fail = 0;
const check = (n, c, e = '') => {
  if (c) { console.log('  ok: ' + n); pass++; }
  else { console.error('  ОШИБКА: ' + n + (e ? ' — ' + e : '')); fail++; }
};
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const srv = spawn('node', ['tools/serve.js'], {
  cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore'
});
const stop = () => { try { srv.kill('SIGTERM'); } catch { /* уже мёртв */ } };
process.on('exit', stop);

/* Ожидание готовности сервера. */
let up = false;
for (let i = 0; i < 40 && !up; i++) {
  try { const r = await fetch(base); up = r.ok; } catch { await new Promise((r) => setTimeout(r, 100)); }
}
console.log('\n[HTTP] Сервер');
check('сервер отвечает на /', up);
if (!up) { console.log(`\nИТОГО HTTP: пройдено ${pass}, провалено ${fail}`); stop(); process.exit(1); }

/* Приложение должно грузиться со всеми своими модулями. */
console.log('\n[HTTP] Ресурсы приложения (нет битых ссылок)');
const indexHtml = await (await fetch(base)).text();
const refs = [...indexHtml.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((m) => m[1]).filter((u) => !u.startsWith('#') && !u.startsWith('data:') && !/^https?:/.test(u));
check('в index.html есть ссылки на ресурсы', refs.length > 0);
for (const r of refs) {
  const res = await fetch(base + r);
  check(`ресурс ${r} отдаётся (200)`, res.ok, 'код ' + res.status);
}

/* Полный обход графа модулей: ни один import не должен вести в 404. */
const seen = new Set();
const queue = ['src/ui/app.js'];
let modCount = 0, broken = [];
while (queue.length) {
  const cur = queue.shift();
  if (seen.has(cur)) continue;
  seen.add(cur);
  const res = await fetch(base + cur);
  if (!res.ok) { broken.push(cur); continue; }
  modCount++;
  const text = await res.text();
  for (const m of text.matchAll(/from\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    let p = path.posix.normalize(path.posix.join(path.posix.dirname(cur), spec));
    if (!/\.js$/.test(p)) p += '.js';
    queue.push(p);
  }
}
check(`граф модулей загружается целиком (${modCount} модулей)`, broken.length === 0, broken.join(', '));
check('модуль выгрузок входит в граф', seen.has('src/ui/download.js'));
check('сборщик пакета данных входит в граф', seen.has('src/data/package.js'));

/* Реальные выгрузки через настоящий fetch. */
console.log('\n[HTTP] Файлы поставки по относительным путям');
const origFetch = globalThis.fetch;
globalThis.fetch = (p, o) => origFetch(new URL(p, base), o); // как в браузере: относительный путь

const prog = await fetchFirst(PROGRAM_PATHS);
check('«Скачать программу»: файл получен', !!prog && prog.size > 100000);
if (prog) {
  const disk = fs.readFileSync(path.join(root, 'distribution/feng_shui_mvp.html'));
  check('программа скачана без искажений', sha(Buffer.from(await prog.arrayBuffer())) === sha(disk));
}

const zip = await fetchFirst(ZIP_PATHS);
check('«Скачать полный пакет»: архив получен', !!zip && zip.size > 100000);
if (zip) {
  const disk = fs.readFileSync(path.join(root, 'distribution/FENG_SHUI_MVP.zip'));
  const got = Buffer.from(await zip.arrayBuffer());
  check('архив скачан без искажений', sha(got) === sha(disk));
  check('архив начинается с сигнатуры PK', got[0] === 0x50 && got[1] === 0x4b);
}

const dataRes = await origFetch(base + 'distribution/feng_shui_data.json');
check('пакет данных отдаётся с типом JSON',
  (dataRes.headers.get('content-type') || '').includes('application/json'));
const dataText = await dataRes.text();
check('скачанный JSON валиден', (() => { try { JSON.parse(dataText); return true; } catch { return false; } })());
check('скачанный JSON совпадает с файлом поставки',
  dataText === fs.readFileSync(path.join(root, 'distribution/feng_shui_data.json'), 'utf8'));

globalThis.fetch = origFetch;
stop();
console.log(`\nИТОГО HTTP: пройдено ${pass}, провалено ${fail}`);
process.exit(fail > 0 ? 1 : 0);
