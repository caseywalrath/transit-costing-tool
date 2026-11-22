import { sortServiceDays } from '../serviceDays';
import type { ServiceDayDefinition } from '../types';
import type { FixedServiceDayKind, ServiceDayPair } from './types';

const FIXED_KINDS: FixedServiceDayKind[] = ['weekday', 'saturday', 'sunday', 'holiday'];

/** Decision 0091 item 5. A custom day is matched by its name, ignoring case; surrounding spaces do not count. */
const nameKey = (day: ServiceDayDefinition): string => day.name.trim().toLowerCase();

function pairOf(key: string, baseline?: ServiceDayDefinition, proposed?: ServiceDayDefinition): ServiceDayPair {
  // The name is Proposed's when the day is matched (as for Routes, item 4); a day on one side keeps its own name.
  const name = (proposed ?? baseline)?.name ?? key;
  return { key, name, ...(baseline ? { baseline } : {}), ...(proposed ? { proposed } : {}) };
}

/**
 * Decision 0091 item 5. Pairs the service days of the two sides. The Weekday, Saturday, Sunday and Holiday days are matched by kind, using
 * the first day of each kind in sequence order (a second day of a fixed kind is not compared). Custom days are matched by name, ignoring
 * case. A day that only one side has is returned with the other side missing. Fixed kinds come first in canonical order; then the custom
 * days, Baseline's first in sequence order, then the Proposed-only ones.
 */
export function matchServiceDays(baseline: ServiceDayDefinition[], proposed: ServiceDayDefinition[]): ServiceDayPair[] {
  const baselineDays = sortServiceDays(baseline);
  const proposedDays = sortServiceDays(proposed);
  const pairs: ServiceDayPair[] = [];

  for (const kind of FIXED_KINDS) {
    const baselineDay = baselineDays.find((day) => day.kind === kind);
    const proposedDay = proposedDays.find((day) => day.kind === kind);
    if (baselineDay || proposedDay) pairs.push(pairOf(kind, baselineDay, proposedDay));
  }

  // Two custom days with one name on a side get distinct keys, so a pair key is always unique.
  const keysUsed = new Set<string>();
  const uniqueCustomKey = (name: string): string => {
    let key = `custom:${name}`;
    for (let suffix = 2; keysUsed.has(key); suffix += 1) key = `custom:${name}#${suffix}`;
    keysUsed.add(key);
    return key;
  };

  const baselineCustom = baselineDays.filter((day) => day.kind === 'custom');
  const proposedCustom = proposedDays.filter((day) => day.kind === 'custom');
  const usedProposed = new Set<ServiceDayDefinition>();
  for (const baselineDay of baselineCustom) {
    const partner = proposedCustom.find((candidate) => !usedProposed.has(candidate) && nameKey(candidate) === nameKey(baselineDay));
    if (partner) usedProposed.add(partner);
    pairs.push(pairOf(uniqueCustomKey(nameKey(baselineDay)), baselineDay, partner));
  }
  for (const proposedDay of proposedCustom) {
    if (!usedProposed.has(proposedDay)) pairs.push(pairOf(uniqueCustomKey(nameKey(proposedDay)), undefined, proposedDay));
  }
  return pairs;
}
