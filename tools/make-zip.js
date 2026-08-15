#!/usr/bin/env node
/** make-zip.js — ZIP-дистрибутив (использует системный zip). */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });

const name = 'dao-feng-shui-mvp';
const stage = path.join(dist, name);
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

const copy = (rel) => {
  const src = path.join(root, rel);
  if (!fs.existsSync(src)) return;
  const dst = path.join(stage, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
};

['index.html', 'README.md', 'LICENSE', 'package.json',
 'src', 'data', 'tests', 'tools', 'docs'].forEach(copy);

fs.mkdirSync(path.join(stage, 'dist'), { recursive: true });
fs.copyFileSync(path.join(dist, 'feng_shui_mvp.html'),
  path.join(stage, 'dist', 'feng_shui_mvp.html'));

fs.writeFileSync(path.join(stage, 'START.txt'),
`ФЭН-ШУЙ: РАСЧЁТНЫЙ ДВИЖОК ЦИКЛОВ
Статус: MVP / экспериментальное приложение. НЕ production-ready.

БЫСТРЫЙ ЗАПУСК БЕЗ УСТАНОВКИ
  Откройте в браузере: dist/feng_shui_mvp.html
  (один файл, без сервера и без интернета)

ПОЛНАЯ ВЕРСИЯ
  npm run serve   ->  http://localhost:8080
  (требуется Node.js версии 20 или новее; внешних зависимостей нет)

ПРОВЕРКА КАЧЕСТВА
  node tools/qa-report.js

ДОКУМЕНТАЦИЯ
  README.md            общее описание и статусы
  docs/ALGORITHMS.md   алгоритмы, источники, статусы
  docs/CONFLICTS.md    конфликты источников и нерешённые вопросы
  docs/TESTING.md      уровни тестирования и история дефектов

ВАЖНО
  Показатели меридианов и органов - традиционные метафизические
  расчётные величины. Это НЕ медицинская диагностика.

  Весовая модель силы стихий и меридианов имеет статус INFERRED:
  формула референсной программы не опубликована и не восстановлена.
  См. data/weights.json и docs/CONFLICTS.md.
`, 'utf8');

const zipPath = path.join(dist, name + '.zip');
fs.rmSync(zipPath, { force: true });
execFileSync('zip', ['-r', '-q', '-X', zipPath, name], { cwd: dist });
fs.rmSync(stage, { recursive: true, force: true });

const kb = (fs.statSync(zipPath).size / 1024).toFixed(1);
const list = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf8' });
const count = (list.match(/\n/g) || []).length - 5;
console.log(`OK: dist/${name}.zip (${kb} КБ, файлов: ${count})`);
