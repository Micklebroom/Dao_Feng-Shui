#!/usr/bin/env node
/**
 * build-standalone.js — Сборка автономного HTML-файла.
 * Все ES-модули и JSON инлайнятся в один файл, работающий по file:// без сервера.
 * Разрешение импортов — топологическое, без внешних зависимостей.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ENTRY = 'src/ui/app.js';
const seen = new Map();
const order = [];

function resolveImport(spec, fromFile) {
  if (!spec.startsWith('.')) throw new Error('Внешняя зависимость запрещена: ' + spec);
  let p = path.resolve(path.dirname(fromFile), spec);
  if (!fs.existsSync(p)) {
    if (fs.existsSync(p + '.js')) p += '.js';
    else throw new Error('Не найден модуль: ' + spec + ' (из ' + fromFile + ')');
  }
  return p;
}

/** Рекурсивный обход графа модулей (DFS post-order). */
function walk(file) {
  if (seen.has(file)) return;
  seen.set(file, true);
  const src = fs.readFileSync(file, 'utf8');
  const importRe = /^\s*(?:import\s+[\s\S]*?\s+from\s*|export\s+\*\s+from\s*|import\s*)['"]([^'"]+)['"]\s*;?/gm;
  let m;
  const deps = [];
  while ((m = importRe.exec(src))) deps.push(m[1]);
  for (const d of deps) walk(resolveImport(d, file));
  order.push(file);
}

walk(path.join(root, ENTRY));

/**
 * Преобразование ES-модуля в тело функции с явными связями.
 * Каждый модуль становится объектом экспортов в реестре __M.
 */
function transform(file) {
  let src = fs.readFileSync(file, 'utf8');
  const id = path.relative(root, file).replace(/\\/g, '/');
  const localNames = [];

  // import ... from '...'
  src = src.replace(
    /^\s*import\s+([\s\S]*?)\s+from\s*['"]([^'"]+)['"]\s*;?/gm,
    (full, clause, spec) => {
      const dep = path.relative(root, resolveImport(spec, file)).replace(/\\/g, '/');
      clause = clause.trim();
      const parts = [];
      // default import
      const defaultMatch = clause.match(/^([A-Za-z_$][\w$]*)\s*(?:,|$)/);
      if (defaultMatch && !clause.startsWith('{') && !clause.startsWith('*')) {
        parts.push(`const ${defaultMatch[1]} = __M[${JSON.stringify(dep)}].default;`);
      }
      const namespaceMatch = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
      if (namespaceMatch) parts.push(`const ${namespaceMatch[1]} = __M[${JSON.stringify(dep)}];`);
      const namedMatch = clause.match(/\{([\s\S]*)\}/);
      if (namedMatch) {
        const names = namedMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
          .map((s) => {
            const as = s.split(/\s+as\s+/).map((x) => x.trim());
            return as.length === 2 ? `${as[0]}: ${as[1]}` : as[0];
          });
        if (names.length) parts.push(`const { ${names.join(', ')} } = __M[${JSON.stringify(dep)}];`);
      }
      return parts.join('\n');
    }
  );

  // export * from '...'
  src = src.replace(/^\s*export\s+\*\s+from\s*['"]([^'"]+)['"]\s*;?/gm, (full, spec) => {
    const dep = path.relative(root, resolveImport(spec, file)).replace(/\\/g, '/');
    return `Object.assign(__E, __M[${JSON.stringify(dep)}]);`;
  });

  // ВАЖНО: все замены ниже выполняются функциями-заменителями.
  // Строковые шаблоны здесь недопустимы: в исходниках встречаются
  // идентификаторы вида `$$`, а в строке замены `$$` означает литерал `$`,
  // что молча портит код (дефект найден автономным тестом сборки).

  // export { a, b } — собрать в конце
  const reexports = [];
  src = src.replace(/^\s*export\s*\{([^}]*)\}\s*;?/gm, (full, names) => {
    names.split(',').map((s) => s.trim()).filter(Boolean).forEach((n) => {
      const as = n.split(/\s+as\s+/).map((x) => x.trim());
      reexports.push([as[1] || as[0], as[0]]);
    });
    return '';
  });

  // export const/let/function/class
  src = src.replace(/^\s*export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/gm, (f, kw, name) => {
    localNames.push(name); return `${kw} ${name}`;
  });
  src = src.replace(/^\s*export\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)/gm, (f, a, name) => {
    localNames.push(name); return `${a || ''}function ${name}`;
  });
  src = src.replace(/^\s*export\s+class\s+([A-Za-z_$][\w$]*)/gm, (f, name) => {
    localNames.push(name); return `class ${name}`;
  });
  src = src.replace(/^\s*export\s+default\s+/gm, 'const __default = ');
  const hasDefault = /const __default = /.test(src);

  const assigns = localNames.map((n) => `__E[${JSON.stringify(n)}] = ${n};`).join('\n');
  const re = reexports.map(([ext, loc]) => `__E[${JSON.stringify(ext)}] = ${loc};`).join('\n');
  const def = hasDefault ? '__E["default"] = __default;' : '';

  return `__M[${JSON.stringify(id)}] = (function(){
const __E = {};
${src}
${assigns}
${re}
${def}
return __E;
})();`;
}

// data-bundle.js собирается отдельно: он уже сгенерирован сборщиком данных
const modules = order.map(transform).join('\n\n');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/ui/styles.css'), 'utf8');

// ВНИМАНИЕ: строковая замена в String.replace трактует `$$`, `$&`, `$1` как
// спецпоследовательности. В бандле есть идентификатор `$$`, который при
// строковой замене молча превращался в `$` и ломал автономную сборку
// (SyntaxError: Identifier '$' has already been declared).
// Поэтому здесь обязательны функции-заменители.
let out = html
  .replace('<link rel="stylesheet" href="src/ui/styles.css">', () => `<style>\n${css}\n</style>`)
  .replace(
    '<script type="module" src="src/ui/app.js"></script>',
    () => `<script>\n"use strict";\nconst __M = {};\n${modules}\n</script>`
  );

// Пометка автономной сборки
out = out.replace('MVP / экспериментальный</span>', () => 'MVP / экспериментальный · автономная сборка</span>');

// Машиночитаемый признак автономной сборки: по нему UI понимает, что
// готовых файлов поставки рядом нет и выгрузка HTML идёт из самой страницы.
out = out.replace('<meta name="fs-build" content="hosted">', () => '<meta name="fs-build" content="standalone">');
if (!/content="standalone"/.test(out)) {
  throw new Error('Не найден маркер сборки <meta name="fs-build">: автономный режим не будет распознан');
}

const target = path.join(root, 'dist', 'feng_shui_mvp.html');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, out, 'utf8');

const kb = (fs.statSync(target).size / 1024).toFixed(1);
console.log(`OK: dist/feng_shui_mvp.html (${kb} КБ, модулей: ${order.length})`);
