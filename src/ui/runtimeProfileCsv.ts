import { formatServiceTime } from '../domain/time';
import { formatRuntimeDuration } from '../domain/durations';
import type { RuntimeProfile } from '../domain/types';
import { csvEscape, neutralizeFormulaText } from '../application/csvText';

/** Spreadsheet-ready CSV for the currently selected Runtime profile. The file is output only (Decision 0045). */
export function runtimeProfileCsv(profile: RuntimeProfile): string {
  const headers = ['Band', 'From', 'To', 'Calculation Method', ...profile.bands[0]?.segmentRuntimeSeconds.map((_, index) => `Segment ${index + 1}`) ?? []];
  const rows = [headers, ...profile.bands.map((band) => [neutralizeFormulaText(band.label), formatServiceTime(band.startTime, band.startTime % 60 !== 0), formatServiceTime(band.endTime, band.endTime % 60 !== 0), profile.calculationMethod ?? 'singleBand', ...band.segmentRuntimeSeconds.map(formatRuntimeDuration)])];
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n') + '\r\n';
}
