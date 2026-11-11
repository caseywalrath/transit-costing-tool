// Decision 0073: the Trips table marks the Trips a planner's last change wrote. The marks live in the screen's state, not in the data.

export interface ChangedTripMarks { ids: ReadonlySet<string>; tick: number }

export const NO_MARKS: ChangedTripMarks = { ids: new Set(), tick: 0 };

/** Replaces the marks with `ids`. Each call advances `tick`, so a repeated mark replays the flash (the class alternates). */
export function markTrips(previous: ChangedTripMarks, ids: Iterable<string>): ChangedTripMarks {
  return { ids: new Set(ids), tick: previous.tick + 1 };
}

/** 'flash' when 1 to 5 marks, 'steady' when 6 or more. */
export function markStrength(marks: ChangedTripMarks): 'none' | 'flash' | 'steady' {
  if (marks.ids.size === 0) return 'none';
  return marks.ids.size >= 6 ? 'steady' : 'flash';
}

/** The row class for a marked Trip: `row-moved` with a flash for 1 to 5 marks, `row-moved` alone for 6 or more, undefined when not marked. */
export function markedRowClass(marks: ChangedTripMarks, tripId: string): string | undefined {
  if (!marks.ids.has(tripId)) return undefined;
  if (markStrength(marks) === 'steady') return 'row-moved';
  return `row-moved row-moved--${marks.tick % 2}`;
}
