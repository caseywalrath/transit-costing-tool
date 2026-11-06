import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import { defaultServiceDayAbbreviation, isValidServiceDayAbbreviation, normalizeServiceDayAbbreviation, serviceDayAbbreviation, validateServiceDayAbbreviations } from './serviceDays';
import type { ServiceDayDefinition, ServiceDayKind } from './types';

function day(id: string, kind: ServiceDayKind, name: string, abbreviation?: string): ServiceDayDefinition {
  return { id, scenarioId: 's', kind, name, annualServiceDays: 0, sequence: 0, ...(abbreviation === undefined ? {} : { abbreviation }), ...metadata('2026-01-01T00:00:00.000Z') };
}

describe('service day abbreviations (Decision 0059)', () => {
  it('derives WKD, SAT, SUN, HOL for the standard kinds whatever the name', () => {
    expect(defaultServiceDayAbbreviation(day('a', 'weekday', 'Monday to Friday'))).toBe('WKD');
    expect(defaultServiceDayAbbreviation(day('b', 'saturday', 'Saturday'))).toBe('SAT');
    expect(defaultServiceDayAbbreviation(day('c', 'sunday', 'Sunday'))).toBe('SUN');
    expect(defaultServiceDayAbbreviation(day('d', 'holiday', 'Holiday'))).toBe('HOL');
  });

  it('derives a custom day from the first three letters or digits of its name, in capitals', () => {
    expect(defaultServiceDayAbbreviation(day('a', 'custom', 'Summer'))).toBe('SUM');
    expect(defaultServiceDayAbbreviation(day('b', 'custom', 'Late-night 2'))).toBe('LAT');
    expect(defaultServiceDayAbbreviation(day('c', 'custom', '  - 7 day'))).toBe('7DA');
    expect(defaultServiceDayAbbreviation(day('d', 'custom', 'Ab'))).toBe('AB');
    expect(defaultServiceDayAbbreviation(day('e', 'custom', 'x'))).toBe('X');
  });

  it('falls back to DAY when a custom name has no letters or digits', () => {
    expect(defaultServiceDayAbbreviation(day('a', 'custom', '---'))).toBe('DAY');
    expect(defaultServiceDayAbbreviation(day('b', 'custom', 'Été'))).toBe('T');
  });

  it('serviceDayAbbreviation prefers the stored value and follows a renamed day otherwise', () => {
    expect(serviceDayAbbreviation(day('a', 'custom', 'Summer', 'SM'))).toBe('SM');
    expect(serviceDayAbbreviation(day('a', 'custom', 'Summer'))).toBe('SUM');
    expect(serviceDayAbbreviation(day('a', 'custom', 'Winter'))).toBe('WIN');
  });

  it('normalizes by trimming and capitalizing, and treats blank as "use the default"', () => {
    expect(normalizeServiceDayAbbreviation(' wk ')).toBe('WK');
    expect(normalizeServiceDayAbbreviation('')).toBeUndefined();
    expect(normalizeServiceDayAbbreviation('   ')).toBeUndefined();
    expect(normalizeServiceDayAbbreviation('a1b2')).toBe('A1B2');
  });

  it('accepts 1 to 3 capital letters or digits only', () => {
    for (const value of ['A', 'AB', 'A1', '123', 'WKD']) expect(isValidServiceDayAbbreviation(value)).toBe(true);
    for (const value of ['', 'ABCD', 'a', 'A B', 'A-B', 'É']) expect(isValidServiceDayAbbreviation(value)).toBe(false);
  });

  it('reports no findings for the standard days', () => {
    expect(validateServiceDayAbbreviations([day('a', 'weekday', 'Weekday'), day('b', 'saturday', 'Saturday'), day('c', 'sunday', 'Sunday'), day('d', 'holiday', 'Holiday')])).toEqual([]);
  });

  it('flags a stored value that is not 1 to 3 capital letters or digits', () => {
    const findings = validateServiceDayAbbreviations([day('a', 'weekday', 'Weekday', 'ABCD'), day('b', 'saturday', 'Saturday', 'a b')]);
    expect(findings.map((finding) => [finding.ruleId, finding.entityId, finding.field])).toEqual([['serviceDay.abbreviationInvalid', 'a', 'abbreviation'], ['serviceDay.abbreviationInvalid', 'b', 'abbreviation']]);
  });

  it('flags both days when two share a stored abbreviation', () => {
    const findings = validateServiceDayAbbreviations([day('a', 'weekday', 'Weekday', 'X'), day('b', 'saturday', 'Saturday', 'X')]);
    expect(findings.map((finding) => [finding.ruleId, finding.entityId])).toEqual([['serviceDay.abbreviationDuplicate', 'a'], ['serviceDay.abbreviationDuplicate', 'b']]);
    expect(findings[0].parameters).toEqual({ abbreviation: 'X' });
  });

  it('flags a stored value that clashes with another day\'s derived default', () => {
    const findings = validateServiceDayAbbreviations([day('a', 'weekday', 'Weekday'), day('b', 'custom', 'Late', 'WKD')]);
    expect(findings.map((finding) => finding.entityId)).toEqual(['a', 'b']);
  });

  it('flags two custom days whose derived defaults match', () => {
    const findings = validateServiceDayAbbreviations([day('a', 'custom', 'Summer A'), day('b', 'custom', 'Summer B')]);
    expect(findings.map((finding) => finding.ruleId)).toEqual(['serviceDay.abbreviationDuplicate', 'serviceDay.abbreviationDuplicate']);
  });
});
