import type { ServiceDayDefinition, ServiceDayKind, ValidationFinding } from './types';
import { metadata, newId } from './ids';
export const STANDARD_SERVICE_DAYS: Array<[ServiceDayKind, string]> = [['weekday', 'Weekday'], ['saturday', 'Saturday'], ['sunday', 'Sunday'], ['holiday', 'Holiday']];
const SERVICE_DAY_ORDER_INDEX: Record<ServiceDayKind, number> = { weekday: 0, saturday: 1, sunday: 2, holiday: 3, custom: 4 };
export function serviceDayKindOrder(kind: ServiceDayKind): number { return SERVICE_DAY_ORDER_INDEX[kind]; }
/** Return service days in the canonical Weekday, Saturday, Sunday, Holiday order. */
export function sortServiceDays(days: ServiceDayDefinition[]): ServiceDayDefinition[] {
  return days
    .map((day, index) => ({ day, index }))
    .sort((left, right) => serviceDayKindOrder(left.day.kind) - serviceDayKindOrder(right.day.kind) || left.day.sequence - right.day.sequence || left.day.id.localeCompare(right.day.id) || left.index - right.index)
    .map(({ day }) => ({ ...day }));
}
const STANDARD_ABBREVIATIONS: Record<Exclude<ServiceDayKind, 'custom'>, string> = { weekday: 'WKD', saturday: 'SAT', sunday: 'SUN', holiday: 'HOL' };
const FALLBACK_ABBREVIATION = 'DAY';
const ABBREVIATION_PATTERN = /^[A-Z0-9]{1,3}$/;
/** The abbreviation used when none is stored: WKD, SAT, SUN, HOL, or the first three letters or digits of a custom name, in capitals (Decision 0059). */
export function defaultServiceDayAbbreviation(day: Pick<ServiceDayDefinition, 'kind' | 'name'>): string {
  if (day.kind !== 'custom') return STANDARD_ABBREVIATIONS[day.kind];
  const letters = (day.name.toUpperCase().match(/[A-Z0-9]/g) ?? []).join('').slice(0, 3);
  return ABBREVIATION_PATTERN.test(letters) ? letters : FALLBACK_ABBREVIATION;
}
/** The label for a service day toggle: the stored abbreviation, or the derived default. */
export function serviceDayAbbreviation(day: Pick<ServiceDayDefinition, 'kind' | 'name' | 'abbreviation'>): string {
  return day.abbreviation?.trim() ? day.abbreviation : defaultServiceDayAbbreviation(day);
}
/** Trims and capitalizes an entered abbreviation. A blank result is `undefined`, meaning "use the default". The result is not validated. */
export function normalizeServiceDayAbbreviation(value: string): string | undefined {
  const normalized = value.trim().toUpperCase();
  return normalized || undefined;
}
/** True for a value that is 1 to 3 capital letters or digits (A-Z, 0-9). */
export function isValidServiceDayAbbreviation(value: string): boolean { return ABBREVIATION_PATTERN.test(value); }
/**
 * Findings for the abbreviations of one Scenario's service days. A stored value must be 1 to 3 letters or digits in capitals.
 * Two service days may not share an effective abbreviation (stored or derived); every day in a clash gets a finding.
 */
export function validateServiceDayAbbreviations(days: ServiceDayDefinition[]): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const finding = (day: ServiceDayDefinition, ruleId: string, parameters?: Record<string, string | number>): ValidationFinding => ({ ruleId, severity: 'error', entityType: 'serviceDay', entityId: day.id, field: 'abbreviation', messageKey: ruleId, ...(parameters ? { parameters } : {}) });
  const byLabel = new Map<string, ServiceDayDefinition[]>();
  for (const day of days) {
    if (day.abbreviation !== undefined && !isValidServiceDayAbbreviation(day.abbreviation)) { findings.push(finding(day, 'serviceDay.abbreviationInvalid')); continue; }
    const label = serviceDayAbbreviation(day);
    byLabel.set(label, [...(byLabel.get(label) ?? []), day]);
  }
  for (const [label, group] of byLabel) if (group.length > 1) for (const day of group) findings.push(finding(day, 'serviceDay.abbreviationDuplicate', { abbreviation: label }));
  return findings;
}
export function createStandardServiceDays(scenarioId: string, annual: Partial<Record<ServiceDayKind, number>> = { weekday: 260, saturday: 52, sunday: 52, holiday: 0 }, now = new Date().toISOString()): ServiceDayDefinition[] { return STANDARD_SERVICE_DAYS.map(([kind, name], sequence) => ({ id: newId(), scenarioId, kind, name, annualServiceDays: annual[kind] ?? 0, sequence, ...metadata(now) })); }
