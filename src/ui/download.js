/**
 * download.js — Слой UI: выгрузка файлов дистрибутива из работающего приложения.
 *
 * Правила слоя:
 *   • здесь НЕТ расчётов; данные берутся из уже загруженных таблиц;
 *   • пакет JSON собирается тем же кодом, что и файл дистрибутива
 *     (src/data/package.js), иначе выгрузка разойдётся с поставкой;
 *   • ни одна ошибка выгрузки не имеет права уронить приложение —
 *     расчётная часть должна продолжать работать.
 *
 * BACKEND НЕ ОБЯЗАТЕЛЕН.
 *   «Скачать JSON» работает полностью на клиенте, в том числе по file://.
 *   «Скачать программу» и «Скачать полный пакет» сначала пробуют забрать
 *   готовый файл поставки по относительному пути (когда приложение открыто
 *   с сервера). Если сервера нет (file://), применяется честный запасной путь:
 *   для HTML — сериализация текущего документа, для ZIP — сообщение о том,
 *   где взять архив. Мы НЕ подделываем ZIP на клиенте.
 */

import { buildDataPackage, serialiseDataPackage } from '../data/package.js';

/** Относительные пути поиска готовых файлов поставки (без localhost!). */
export const PROGRAM_PATHS = [
  'distribution/feng_shui_mvp.html',
  'dist/feng_shui_mvp.html',
  'feng_shui_mvp.html'
];
export const ZIP_PATHS = [
  'distribution/FENG_SHUI_MVP.zip',
  'dist/FENG_SHUI_MVP.zip',
  'FENG_SHUI_MVP.zip'
];

/** Приложение собрано в автономный один файл? */
export function isStandalone() {
  try {
    const m = document.querySelector('meta[name="fs-build"]');
    return !!m && m.getAttribute('content') === 'standalone';
  } catch { return false; }
}

/** Сохранение произвольного содержимого как файла. Возвращает имя файла. */
export function saveBlob(name, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  // Некоторые браузеры требуют, чтобы ссылка была в документе.
  const host = document.body || document.documentElement;
  if (host && typeof host.appendChild === 'function') host.appendChild(a);
  a.click();
  if (host && typeof host.removeChild === 'function') {
    try { host.removeChild(a); } catch { /* узел уже удалён */ }
  }
  URL.revokeObjectURL(url);
  return name;
}

/**
 * Попытка получить готовый файл по относительному пути.
 * Возвращает Blob либо null, если ни один путь не доступен.
 */
export async function fetchFirst(paths) {
  if (typeof fetch !== 'function') return null;
  for (const p of paths) {
    try {
      const r = await fetch(p, { cache: 'no-store' });
      if (!r || !r.ok) continue;
      const blob = await r.blob();
      if (blob && blob.size > 0) return blob;
    } catch { /* следующий путь */ }
  }
  return null;
}

/* ------------------------- 1. JSON пакет данных ------------------------- */

/**
 * Сборка пакета данных на клиенте.
 * Тот же код и тот же порядок ключей, что и в файле дистрибутива.
 */
export function dataPackageText(tables, meta) {
  return serialiseDataPackage(buildDataPackage(tables, meta));
}

export function downloadData(tables, meta) {
  const text = dataPackageText(tables, meta);
  saveBlob('feng_shui_data.json', text, 'application/json;charset=utf-8');
  return { file: 'feng_shui_data.json', bytes: text.length, source: 'client' };
}

/* --------------------------- 2. Программа (HTML) --------------------------- */

/**
 * Сериализация текущего документа в самодостаточный HTML.
 * Используется ТОЛЬКО как запасной путь для автономной сборки без сервера:
 * в этом режиме весь код и данные уже находятся внутри страницы.
 * Динамически созданное содержимое очищается, чтобы копия открывалась
 * в исходном состоянии, а не с дважды отрисованными таблицами.
 */
export function serialiseDocument() {
  const root = document.documentElement;
  if (!root || typeof root.outerHTML !== 'string') return null;
  let html = root.outerHTML;
  // Снять сгенерированный при старте блок стилей (он создаётся заново).
  html = html.replace(/<style id="element-colors">[\s\S]*?<\/style>/g, '');
  return '<!DOCTYPE html>\n' + html;
}

export async function downloadProgram() {
  const blob = await fetchFirst(PROGRAM_PATHS);
  if (blob) {
    saveBlob('feng_shui_mvp.html', blob, 'text/html;charset=utf-8');
    return { file: 'feng_shui_mvp.html', bytes: blob.size, source: 'file' };
  }
  if (isStandalone()) {
    const html = serialiseDocument();
    if (html) {
      saveBlob('feng_shui_mvp.html', html, 'text/html;charset=utf-8');
      return { file: 'feng_shui_mvp.html', bytes: html.length, source: 'self' };
    }
  }
  return { file: null, bytes: 0, source: 'none' };
}

/* ---------------------------- 3. Полный пакет ---------------------------- */

export async function downloadBundle() {
  const blob = await fetchFirst(ZIP_PATHS);
  if (blob) {
    saveBlob('FENG_SHUI_MVP.zip', blob, 'application/zip');
    return { file: 'FENG_SHUI_MVP.zip', bytes: blob.size, source: 'file' };
  }
  // ZIP собрать в браузере без внешних библиотек нельзя, а подделывать архив
  // (например, отдавать переименованный текст) недопустимо.
  return { file: null, bytes: 0, source: 'none' };
}

/* ------------------------------ Привязка UI ------------------------------ */

/**
 * @param {object} deps {tables, meta, setStatus(msg, cls)}
 */
export function bindDownloads(deps) {
  const { tables, meta, setStatus } = deps;
  const byId = (id) => document.querySelector('#' + id);
  const say = (msg, cls) => { if (typeof setStatus === 'function') setStatus(msg, cls || ''); };
  const kb = (n) => (n / 1024).toFixed(1) + ' КБ';

  const on = (id, handler) => {
    const el = byId(id);
    if (!el || typeof el.addEventListener !== 'function') return false;
    el.addEventListener('click', () => {
      try {
        const r = handler();
        if (r && typeof r.then === 'function') r.catch((e) => say('Ошибка выгрузки: ' + e.message, 'err'));
      } catch (e) {
        say('Ошибка выгрузки: ' + e.message, 'err');
      }
    });
    return true;
  };

  on('btn-dl-json', () => {
    const r = downloadData(tables, meta);
    say(`Сохранён ${r.file} — пакет данных, ${kb(r.bytes)}`, '');
  });

  on('btn-dl-app', async () => {
    say('Подготовка автономного файла…', '');
    const r = await downloadProgram();
    if (r.source === 'file') say(`Сохранён ${r.file} — автономная программа, ${kb(r.bytes)}`, '');
    else if (r.source === 'self') say(`Сохранён ${r.file} — копия автономной сборки, ${kb(r.bytes)}`, '');
    else say('Автономный файл недоступен. Соберите его: npm run build:distribution', 'warn');
  });

  on('btn-dl-zip', async () => {
    say('Подготовка полного пакета…', '');
    const r = await downloadBundle();
    if (r.source === 'file') say(`Сохранён ${r.file} — полный пакет, ${kb(r.bytes)}`, '');
    else say('Архив доступен только при запуске с сервера. Файл: distribution/FENG_SHUI_MVP.zip', 'warn');
  });

  // Подпись режима: пользователь должен видеть, доступны ли файловые выгрузки.
  const mode = byId('dl-mode');
  if (mode) {
    mode.textContent = isStandalone()
      ? 'автономный режим: JSON собирается на месте'
      : 'режим с сервера: файлы поставки доступны';
  }
}
