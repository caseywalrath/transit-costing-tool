// Display formatters for screens (interface revision UR-3, plan Appendix C). CSV and backup files do not use them.
import { roundCostingDisplay } from '../domain/costing';
import { formatServiceTime } from '../domain/time';

/** Shown when a value cannot exist (F7-A). */
export const MISSING = '—';
/** Shown when the input needed for a value is missing (F7-A). Render it with class `value-incomplete`. */
export const INCOMPLETE = 'Incomplete';

const grouped = (fractionDigits: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
const WHOLE = grouped(0);
const TWO_DECIMALS = grouped(2);
const ONE_DECIMAL = grouped(1);
const DOLLARS = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const DOLLARS_AND_CENTS = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** F1-A. A clock time; seconds appear only when non-zero. `round` shows whole minutes. */
export function formatClock(seconds: number, options: { round?: boolean } = {}): string {
  const shown = options.round ? Math.round(seconds / 60) * 60 : seconds;
  return formatServiceTime(shown, shown % 60 !== 0);
}

/** F2-A. A duration: `:MM` under an hour, `h:mm` from an hour, with `:SS` when present. Negative values lead with U+2212. */
export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isInteger(seconds)) return MISSING;
  const sign = seconds < 0 ? '−' : '';
  const magnitude = Math.abs(seconds);
  const hours = Math.floor(magnitude / 3600);
  const minutes = Math.floor(magnitude % 3600 / 60);
  const rest = magnitude % 60;
  const minutePart = String(minutes).padStart(2, '0');
  const secondPart = rest === 0 ? '' : `:${String(rest).padStart(2, '0')}`;
  return `${sign}${hours > 0 ? `${hours}:` : ':'}${minutePart}${secondPart}`;
}

/** F3-A. Hours: two decimals for one day, whole hours for a year. */
export function formatHours(hours: number | undefined, scope: 'daily' | 'annual'): string {
  if (hours === undefined) return INCOMPLETE;
  return scope === 'daily' ? TWO_DECIMALS.format(roundCostingDisplay(hours, 2)) : WHOLE.format(roundCostingDisplay(hours, 0));
}

/** F4-A. Miles with two decimals. */
export function formatMiles(miles: number | undefined): string {
  return miles === undefined ? INCOMPLETE : TWO_DECIMALS.format(roundCostingDisplay(miles, 2));
}

/** F6-A. US dollars: whole dollars in tables, cents for an hourly rate. */
export function formatMoney(usd: number, options: { cents?: boolean } = {}): string {
  return options.cents ? DOLLARS_AND_CENTS.format(roundCostingDisplay(usd, 2)) : DOLLARS.format(roundCostingDisplay(usd, 0));
}

/** F8-A. A percentage with one decimal. */
export function formatPercent(value: number | undefined): string {
  return value === undefined ? MISSING : `${ONE_DECIMAL.format(roundCostingDisplay(value, 1))}%`;
}

/** F5-A. Attach a unit; for summary tiles only (table cells drop the unit and the heading names it). */
export function withUnit(text: string, unit: string): string {
  return text === INCOMPLETE ? text : `${text} ${unit}`;
}
