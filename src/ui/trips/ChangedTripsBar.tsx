import { useEffect, useState } from 'react';
import type { ChangedTripMarks } from './changedTrips';

/** The marked rows of the Trips table, in page order. The duplicate heading row is a separate table and holds no trip rows. */
function markedRows(): HTMLTableRowElement[] {
  return [...document.querySelectorAll<HTMLTableRowElement>('.schedule-table tbody tr.row-moved[data-trip-id]')];
}

/** Scrolls a marked row to the middle of the window and focuses its checkbox. */
export function revealRow(row: HTMLTableRowElement) {
  row.scrollIntoView({ block: 'center' });
  row.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus({ preventScroll: true });
}

/** After a change, brings the first marked row into view when none is visible (Decision 0073 item 2). */
export function revealFirstMarkedRow() {
  const rows = markedRows();
  if (!rows.length) return;
  const visible = rows.some((row) => { const box = row.getBoundingClientRect(); return box.bottom > 0 && box.top < window.innerHeight; });
  if (!visible) rows[0].scrollIntoView({ block: 'center' });
}

/**
 * Decision 0073 item 3 (R7): shown in place of the selection bar after a change to six or more trips. Counts the marked rows above and
 * below the window, and the marked trips that are not in this view; steps through the rows; selects them; clears the marks.
 */
export function ChangedTripsBar({ marks, visibleTripIds, onSelect, onClear }: { marks: ChangedTripMarks; visibleTripIds: ReadonlySet<string>; onSelect: (tripIds: string[]) => void; onClear: () => void }) {
  const [position, setPosition] = useState({ above: 0, below: 0 });
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      let above = 0; let below = 0;
      for (const row of markedRows()) { const box = row.getBoundingClientRect(); if (box.bottom <= 0) above += 1; else if (box.top >= window.innerHeight) below += 1; }
      setPosition((current) => current.above === above && current.below === below ? current : { above, below });
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => { window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); if (frame) window.cancelAnimationFrame(frame); };
  }, [marks, visibleTripIds]);
  const elsewhere = [...marks.ids].filter((id) => !visibleTripIds.has(id)).length;
  const step = (direction: 1 | -1) => {
    const middle = window.innerHeight / 2;
    const rows = markedRows();
    const target = direction === 1 ? rows.find((row) => row.getBoundingClientRect().top > middle + 1) : [...rows].reverse().find((row) => row.getBoundingClientRect().bottom < middle - 1);
    if (target) revealRow(target);
  };
  return <div className="selection-bar changed-trips-bar" role="toolbar" aria-label="Changed trips">
    <span role="status"><strong>{marks.ids.size} changed</strong>{position.above > 0 && ` · ${position.above} above`}{position.below > 0 && ` · ${position.below} below`}{elsewhere > 0 && ` · ${elsewhere} in another view`}</span>
    <button type="button" onClick={() => step(-1)} aria-label="Previous changed trip" title="Previous changed trip">↑</button>
    <button type="button" onClick={() => step(1)} aria-label="Next changed trip" title="Next changed trip">↓</button>
    <button type="button" onClick={() => onSelect([...marks.ids].filter((id) => visibleTripIds.has(id)))}>Select</button>
    <button type="button" onClick={onClear}>Clear</button>
  </div>;
}
