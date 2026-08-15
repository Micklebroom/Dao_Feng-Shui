/**
 * errors.js — Типизированные ошибки (СЛОЙ 0, без домена и без DOM).
 *
 * Ключевое различие (ARCHITECTURE 8.2): NotVerifiedError — НЕ сбой.
 * Это штатный ответ «формула не опубликована». UI обязан отличать его
 * от настоящей поломки, иначе мы либо паникуем на пустом месте,
 * либо прячем реальные дефекты.
 */

export class AppError extends Error {
  constructor(code, message, details = null, userMessage = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
    this.userMessage = userMessage || message;
  }
}

/** Пакет данных повреждён или неполон. */
export class DataError extends AppError {
  constructor(message, details = null) {
    super('DATA', message, details, 'Ошибка данных: ' + message);
    this.name = 'DataError';
  }
}

/** Недопустимый ввод пользователя. */
export class InputError extends AppError {
  constructor(message, details = null) {
    super('INPUT', message, details, message);
    this.name = 'InputError';
  }
}

/** Дата вне поддерживаемого диапазона (конфликт K7). */
export class DateRangeError extends AppError {
  constructor(year, from, to) {
    super('RANGE', `Год ${year} вне диапазона ${from}–${to}`, { year, from, to },
      `Год ${year} вне поддерживаемого диапазона ${from}–${to} (конфликт K7). Введите год в этих пределах.`);
    this.name = 'DateRangeError';
  }
}

/**
 * Запрошен алгоритм, формула которого НЕ опубликована.
 * Это ожидаемое состояние, а не сбой программы.
 */
export class NotVerifiedError extends AppError {
  constructor(what, placeholderRef = null, conflictRef = null) {
    super('NOT_VERIFIED', `Алгоритм не подтверждён: ${what}`,
      { what, placeholderRef, conflictRef }, 'Алгоритм не подтверждён');
    this.name = 'NotVerifiedError';
    this.placeholderRef = placeholderRef;
    this.conflictRef = conflictRef;
  }
}

/** Нарушен внутренний инвариант — дефект программы. */
export class InternalError extends AppError {
  constructor(message, details = null) {
    super('INTERNAL', message, details, 'Внутренняя ошибка расчёта: ' + message);
    this.name = 'InternalError';
  }
}

/** Проверка инварианта: бросает InternalError, если условие ложно. */
export function invariant(cond, message, details = null) {
  if (!cond) throw new InternalError(message, details);
}
