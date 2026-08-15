/** Загрузчик таблиц для Node (тесты, сборка). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_FILES, assembleTables } from './loader.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(here, '../../data');

export function loadTables(dir = DATA_DIR) {
  const map = {};
  for (const name of DATA_FILES) {
    map[name] = JSON.parse(fs.readFileSync(path.join(dir, name + '.json'), 'utf8'));
  }
  return assembleTables(map);
}
