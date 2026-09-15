import type { ServiceDayDefinition, ServiceDayKind } from './types';
import { metadata, newId } from './ids';
export const STANDARD_SERVICE_DAYS: Array<[ServiceDayKind, string]> = [['weekday', 'Weekday'], ['saturday', 'Saturday'], ['sunday', 'Sunday'], ['holiday', 'Holiday']];
export const SERVICE_DAY_ORDER: readonly ServiceDayKind[] = ['weekday', 'saturday', 'sunday', 'holiday'];
const SERVICE_DAY_ORDER_INDEX: Record<ServiceDayKind, number> = { weekday: 0, saturday: 1, sunday: 2, holiday: 3, custom: 4 };
export function serviceDayKindOrder(kind: ServiceDayKind): number { return SERVICE_DAY_ORDER_INDEX[kind]; }
/** Return service days in the canonical Weekday, Saturday, Sunday, Holiday order. */
export function sortServiceDays(days: ServiceDayDefinition[]): ServiceDayDefinition[] {
  return days
    .map((day, index) => ({ day, index }))
    .sort((left, right) => serviceDayKindOrder(left.day.kind) - serviceDayKindOrder(right.day.kind) || left.day.sequence - right.day.sequence || left.day.id.localeCompare(right.day.id) || left.index - right.index)
    .map(({ day }) => ({ ...day }));
}
export const orderServiceDays = sortServiceDays;
export const sortServiceDayDefinitions = sortServiceDays;
export function createStandardServiceDays(scenarioId: string, annual: Partial<Record<ServiceDayKind, number>> = { weekday: 260, saturday: 52, sunday: 52, holiday: 0 }, now = new Date().toISOString()): ServiceDayDefinition[] { return STANDARD_SERVICE_DAYS.map(([kind, name], sequence) => ({ id: newId(), scenarioId, kind, name, annualServiceDays: annual[kind] ?? 0, sequence, ...metadata(now) })); }
