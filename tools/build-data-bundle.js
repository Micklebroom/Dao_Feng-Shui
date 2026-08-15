#!/usr/bin/env node
/** Собирает data/*.json в один ES-модуль для браузера и в единый JSON-пакет. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_FILES, keyFor } from '../src/data/loader.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const outDir = path.join(root, 'src', 'data');

const map = {};
for (const name of DATA_FILES) {
  map[keyFor(name)] = JSON.parse(fs.readFileSync(path.join(dataDir, name + '.json'), 'utf8'));
}

const pkg = {
  $package: 'dao-feng-shui-data',
  version: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version,
  generated: 'deterministic build; see tools/build-data-bundle.js',
  tables: map
};

fs.writeFileSync(path.join(dataDir, 'bundle.json'), JSON.stringify(pkg, null, 2), 'utf8');
fs.writeFileSync(
  path.join(outDir, 'data-bundle.js'),
  '/* СГЕНЕРИРОВАНО tools/build-data-bundle.js — не редактировать вручную. */\n' +
  'export const TABLES = ' + JSON.stringify(map) + ';\nexport default TABLES;\n',
  'utf8'
);

console.log('OK: data/bundle.json и src/data/data-bundle.js собраны (' + DATA_FILES.length + ' таблиц)');
