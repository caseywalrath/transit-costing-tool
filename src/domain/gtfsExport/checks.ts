// Decision 0090 items 19 and 20: the refusals about the settings (agency details and the date range), and how an issue reads in the report.
// The stop refusals and warnings come from E1 (`exportStops`), and the trip, direction and block checks from the feed builder. Pure.

import type { GtfsExportSettings } from '../types';
import { gtfsDateFromIso, type CalendarRange } from './calendar';
import type { GtfsExportIssue } from './types';

/** Whether a text is an absolute http or https URL with a host (GTFS agency_url). */
function isHttpUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '';
  } catch {
    return false;
  }
}

/** Decision 0090 item 19. A blank agency name, URL or time zone refuses the export, and so does a website that is not an http or https URL. */
export function agencyRefusals(settings: GtfsExportSettings): GtfsExportIssue[] {
  const refusals: GtfsExportIssue[] = [];
  if (!settings.agencyName?.trim()) refusals.push({ code: 'gtfsExport.agencyNameBlank' });
  if (!settings.agencyUrl?.trim()) refusals.push({ code: 'gtfsExport.agencyUrlBlank' });
  else if (!isHttpUrl(settings.agencyUrl.trim())) refusals.push({ code: 'gtfsExport.agencyUrlInvalid' });
  if (!settings.agencyTimezone?.trim()) refusals.push({ code: 'gtfsExport.agencyTimezoneBlank' });
  return refusals;
}

/**
 * Decision 0090 item 19. The export range, as GTFS dates. A range with no dates refuses the export: a start or an end that is not a real
 * date, or an end before the start. `range` is undefined exactly when a refusal is returned.
 */
export function exportRange(settings: GtfsExportSettings): { range?: CalendarRange; refusals: GtfsExportIssue[] } {
  const start = gtfsDateFromIso(settings.startDate);
  const end = gtfsDateFromIso(settings.endDate);
  if (start === undefined || end === undefined || end < start) return { refusals: [{ code: 'gtfsExport.rangeEmpty' }] };
  return { range: { start, end }, refusals: [] };
}

/**
 * One line of text for an issue, for the report: its Route, pattern, trip, stop, service day, block and distance, those it names. Empty
 * for an issue that names none (the agency and range refusals).
 */
export function describeIssue(issue: GtfsExportIssue): string {
  const parts: string[] = [];
  if (issue.routeName) parts.push(`Route ${issue.routeName}`);
  if (issue.patternName) parts.push(`pattern ${issue.patternName}`);
  if (issue.tripId) parts.push(`trip ${issue.tripId}`);
  if (issue.serviceDayName) parts.push(`service day ${issue.serviceDayName}`);
  if (issue.blockLabel) parts.push(`block ${issue.blockLabel}`);
  if (issue.stopName) parts.push(`stop ${issue.stopName}`);
  if (issue.stopId) parts.push(`stop ID ${issue.stopId}`);
  if (issue.distanceMeters !== undefined) parts.push(`${Math.round(issue.distanceMeters)} m apart`);
  if (issue.behind) parts.push(`${Math.round(issue.behind.meters)} m behind ${issue.behind.stopName} along the segment`);
  if (issue.conflictWith) parts.push(`first at Route ${issue.conflictWith.routeName}${issue.conflictWith.patternName ? `, pattern ${issue.conflictWith.patternName}` : ', route stops'}, stop ${issue.conflictWith.stopName}`);
  return parts.join('; ');
}
