import type { DurationSeconds } from './types';

/** Error raised when a runtime segment duration is not in the accepted forms. */
export class RuntimeDurationError extends Error {
  constructor(message = 'Invalid runtime duration') {
    super(message);
    this.name = 'RuntimeDurationError';
  }
}

/**
 * Parse a runtime segment duration.
 *
 * Values without a colon are decimal minutes. Standard colon notation uses
 * minutes and seconds (`7:30`), while the display notation emitted by
 * formatRuntimeDuration uses a leading colon (`:07` or `:07:30`). Blank input
 * intentionally returns undefined so the UI can distinguish an empty cell
 * from an explicit zero.
 */
export function parseRuntimeDuration(value: string): DurationSeconds | undefined {
  const text = value.trim();
  if (!text) return undefined;
  if (text.includes(':')) {
    const parts = text.split(':');
    if (parts.length === 2 && parts[0] === '') {
      if (!/^\d+$/.test(parts[1])) throw new RuntimeDurationError(`Invalid runtime duration: ${value}`);
      return Number(parts[1]) * 60;
    }
    if (parts.length === 3 && parts[0] === '' && /^\d+$/.test(parts[1]) && /^\d{2}$/.test(parts[2])) {
      const minutes = Number(parts[1]);
      const seconds = Number(parts[2]);
      if (seconds > 59) throw new RuntimeDurationError(`Invalid runtime duration: ${value}`);
      return minutes * 60 + seconds;
    }
    if (parts.length !== 2 || !/^\d+$/.test(parts[0]) || !/^\d{2}$/.test(parts[1])) {
      throw new RuntimeDurationError(`Invalid runtime duration: ${value}`);
    }
    const minutes = Number(parts[0]);
    const seconds = Number(parts[1]);
    if (seconds > 59) throw new RuntimeDurationError(`Invalid runtime duration: ${value}`);
    return minutes * 60 + seconds;
  }
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new RuntimeDurationError(`Invalid runtime duration: ${value}`);
  const minutes = Number(text);
  if (!Number.isFinite(minutes) || minutes < 0) throw new RuntimeDurationError(`Invalid runtime duration: ${value}`);
  return Math.round(minutes * 60);
}

/** Format integer seconds as :MM or :MM:SS; minutes are not capped at 59. */
export function formatRuntimeDuration(value: DurationSeconds | undefined): string {
  if (value === undefined || value === null) return '';
  if (!Number.isInteger(value) || value < 0) throw new RuntimeDurationError('Runtime duration must be a non-negative integer');
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `:${String(minutes).padStart(2, '0')}${seconds === 0 ? '' : `:${String(seconds).padStart(2, '0')}`}`;
}

// Short aliases keep the utility convenient for domain and application callers.
export const parseDuration = parseRuntimeDuration;
export const formatDuration = formatRuntimeDuration;
export const parseRuntimeDurationSeconds = parseRuntimeDuration;
export const formatRuntimeDurationSeconds = formatRuntimeDuration;
