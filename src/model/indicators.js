/**
 * indicators.js — СЛОЙ 3 (Result Model). Показатели, запрошенные в ТЗ.
 *
 * ГЛАВНОЕ ПРАВИЛО ЭТОГО ФАЙЛА:
 * если формула не опубликована референсом — возвращается значение null
 * со статусом NOT_VERIFIED. Ни один показатель не заполняется правдоподобным
 * числом ради красивого графика.
 *
 * Основания по каждому пункту — docs/GRAPH_CATALOG.md и docs/RESEARCH_AUDIT.md.
 */
import { verified, inferred, notVerified, STATUS } from '../core/provenance.js';

/**
 * Каталог показателей, запрошенных в ТЗ фазы 6.
 * Каждый — с честным статусом и ссылкой на источник или заглушку.
 */
export const INDICATOR_CATALOG = [
  {
    id: 'meridians', ru: '10 меридианов', kind: 'series', seriesCount: 10,
    status: STATUS.INFERRED, algorithmRef: 'F1', placeholderRef: 'PH-F1',
    note: 'Состав 10 меридианов подтверждён (аудит A-02). Формула перевода силы стихии в силу меридиана НЕ опубликована — используется наша гипотеза (деление стихии поровну между цзан и фу).'
  },
  {
    id: 'yinYang', ru: 'Сумма Инь / Ян', kind: 'series', seriesCount: 2,
    status: STATUS.INFERRED, algorithmRef: 'F1', placeholderRef: 'PH-F4',
    note: 'Суммирование по полярности выполняется поверх INFERRED-значений меридианов, поэтому итог не может быть точнее исходных данных.'
  },
  {
    id: 'organs', ru: 'Органы', kind: 'alias', aliasOf: 'meridians',
    status: STATUS.INFERRED, algorithmRef: 'F1',
    note: 'В референсе «Органы» — это те же 10 меридианов, отдельного алгоритма нет (GRAPH_CATALOG).'
  },
  {
    id: 'organSystems', ru: 'Системы органов', kind: 'series', seriesCount: 3,
    status: STATUS.NOT_VERIFIED, algorithmRef: 'F6', placeholderRef: 'PH-F6',
    note: 'Состав Трёх обогревателей подтверждён (верхний/средний/нижний), но СПОСОБ АГРЕГАЦИИ (сумма или среднее) не опубликован — открытый вопрос U-24. Значения не рассчитываются.'
  },
  {
    id: 'emotions', ru: 'Эмоции', kind: 'series', seriesCount: 5,
    status: STATUS.NOT_VERIFIED, placeholderRef: 'PH-E1',
    note: 'Соответствие «эмоция ↔ стихия» (страх/печаль/тревога/радость/гнев) классическое и подтверждено, но ВКЛАД эмоции в числовой показатель референсом не опубликован.'
  },
  {
    id: 'activity', ru: 'Деятельность', kind: 'series', seriesCount: 5,
    status: STATUS.NOT_VERIFIED, placeholderRef: 'PH-G1',
    note: 'Автор указывает базу: «по 5-элементной системе на основе 10 меридианов». Сама таблица «стихия → тип деятельности» не опубликована.'
  },
  {
    id: 'luckIndicator', ru: 'Индикатор Удачи', kind: 'panel',
    status: STATUS.NOT_VERIFIED, placeholderRef: 'PH-G2',
    note: 'Компоновка панели подтверждена (слева конфликты, справа гармонии; нижний ряд — земные столпы). Числовая формула не опубликована.'
  },
  {
    id: 'relations', ru: 'Отношения', kind: 'series',
    status: STATUS.NOT_VERIFIED, placeholderRef: 'PH-G3',
    note: 'Совместимость, звезда Романтики и графики брака описаны словесно; алгоритм «интегрируются различные аспекты» не раскрыт.'
  },
  {
    id: 'desires', ru: 'Желания', kind: 'series',
    status: STATUS.NOT_VERIFIED, placeholderRef: 'PH-DESIRES',
    note: 'Отдельный график в открытых материалах референса НЕ НАЙДЕН. Реализация «по смыслу названия» была бы выдумыванием алгоритма.'
  },
  {
    id: 'will', ru: 'Воля', kind: 'series',
    status: STATUS.NOT_VERIFIED, placeholderRef: 'PH-DESIRES',
    note: 'Отдельный график в открытых материалах референса НЕ НАЙДЕН.'
  },
  {
    id: 'spirit', ru: 'Дух', kind: 'series',
    status: STATUS.NOT_VERIFIED, placeholderRef: 'PH-DESIRES',
    note: 'Встречается только косвенно (五神, «в сердце хранится дух-шэнь»); как отдельный график не подтверждён.'
  },
  {
    id: 'harmony', ru: 'Индекс гармоничности', kind: 'series', seriesCount: 1,
    status: STATUS.INFERRED, placeholderRef: 'PH-F3',
    note: 'Формула референса не опубликована (аудит A-09). Известны лишь опубликованные значения (Пельш: 2006 = 85, 2007 = 8). Показывается НАША гипотеза.'
  },
  {
    id: 'health', ru: 'Итоговый индекс здоровья', kind: 'series',
    status: STATUS.NOT_VERIFIED, placeholderRef: 'PH-F5',
    note: 'Верхний уровень иерархии индексов. Формула не раскрыта, гипотезы нет — не рассчитывается.'
  },
  {
    id: 'elements', ru: 'Пять стихий', kind: 'series', seriesCount: 5,
    status: STATUS.INFERRED, algorithmRef: 'E2', placeholderRef: 'PH-E1',
    note: 'Структура конвейера подтверждена, числовые коэффициенты — наша гипотеза (indicators.json).'
  }
];

export const catalogById = (id) => INDICATOR_CATALOG.find((c) => c.id === id) || null;

/** Показатели, для которых расчёт возможен (есть хотя бы гипотеза). */
export const computableIds = () =>
  INDICATOR_CATALOG.filter((c) => c.status !== STATUS.NOT_VERIFIED && c.kind !== 'alias').map((c) => c.id);

/** Показатели, которые обязаны отображаться как «Алгоритм не подтверждён». */
export const unverifiedIds = () =>
  INDICATOR_CATALOG.filter((c) => c.status === STATUS.NOT_VERIFIED).map((c) => c.id);

/**
 * Три обогревателя. Способ агрегации НЕ опубликован (U-24),
 * поэтому возвращается пустой результат, а не сумма или среднее.
 */
export function tripleBurner(meridianValues, tables) {
  const cfg = tables.meridians.tripleBurner;
  if (cfg.aggregation === null) {
    return {
      groups: cfg.groups.map((g) => ({
        id: g.id, ru: g.ru, members: g.members,
        value: notVerified({ placeholderRef: 'PH-F6', note: 'Способ агрегации не опубликован (U-24)' })
      })),
      available: false,
      reason: 'Состав групп подтверждён, но способ агрегации (сумма или среднее) референсом не опубликован.'
    };
  }
  // Ветка на будущее: если способ агрегации станет известен из данных.
  const fn = cfg.aggregation === 'mean'
    ? (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
    : (xs) => xs.reduce((a, b) => a + b, 0);
  return {
    groups: cfg.groups.map((g) => ({
      id: g.id, ru: g.ru, members: g.members,
      value: inferred(fn(g.members.map((m) => meridianValues.find((x) => x.id === m).value)),
        { note: 'Агрегация задана данными: ' + cfg.aggregation })
    })),
    available: true, reason: null
  };
}

/** Итоговый индекс здоровья: формулы нет — всегда null. */
export function healthIndex() {
  return notVerified({
    placeholderRef: 'PH-F5',
    note: 'Формула итогового индекса здоровья не опубликована автором референса.'
  });
}

/** Режимы агрегации F2 — единственная ЯВНО опубликованная формула графиков. */
export function aggregate(samples, mode, tables) {
  const modes = tables.indicators.aggregationModes;
  if (!samples.length) return verified(null, 'F2');
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  if (mode === 'chronic') return verified(mean, 'F2', modes.modes[0].definition);
  // Острые: максимальное отклонение от среднего (возвращается сам элемент ряда).
  let best = samples[0], bestDev = Math.abs(samples[0] - mean);
  for (const x of samples) {
    const d = Math.abs(x - mean);
    if (d > bestDev) { best = x; bestDev = d; }
  }
  return verified(best, 'F2', modes.modes[1].definition);
}
