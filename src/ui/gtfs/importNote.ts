// The one-line import note shown under a Scenario's name in the Scenario menu and in the Cost summary footnote (Decision 0089 item 39).
// Pure: it reads the Scenario's notes and returns text.

import type { Scenario, ScenarioImportNote } from '../../domain/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** "22 Nov 2026", in the viewer's own time zone, as the planner sees the day the import ran. */
function importedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** The sentence for one import note, for example "From RTD feed Sep26-37381 · imported 22 Nov 2026 · 3 routes". */
export function importNoteText(note: ScenarioImportNote): string {
  const feed = note.feedVersion ? `${note.publisher} feed ${note.feedVersion}` : `${note.publisher} feed`;
  return `From ${feed} · imported ${importedDate(note.importedAt)} · ${note.routeCount} ${note.routeCount === 1 ? 'route' : 'routes'}`;
}

/** The sentence for the Scenario's latest import (notes are appended, so the last one), or undefined when it has none. */
export function latestImportNoteText(scenario: Pick<Scenario, 'importNotes'>): string | undefined {
  const notes = scenario.importNotes;
  const latest = notes?.[notes.length - 1];
  return latest ? importNoteText(latest) : undefined;
}
