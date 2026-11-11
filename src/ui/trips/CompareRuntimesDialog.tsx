import { useMemo, useState } from 'react';
import { type RouteDefinitionApplication } from '../../application/routeDefinitionService';
import { patternShortName } from '../../application/shortNames';
import { formatRuntimeDuration } from '../../domain/runtime';
import { compareRouteRuntimes, type ComparisonCell } from '../../domain/runtimeComparison';
import { formatServiceTime } from '../../domain/time';
import type { Node, RouteDirection, RoutePattern, RuntimeAssignment, RuntimeProfile } from '../../domain/types';
import { userFacingError } from '../errorMessages';
import { ModalDialog } from '../ModalDialog';

const clock = (value: number) => formatServiceTime(value, value % 60 !== 0);
const runtime = (seconds: number) => formatRuntimeDuration(seconds) || ':00';

/**
 * Decision 0075 (R11): the runtimes of a direction's patterns for one day, stacked by pattern with columns aligned by segment, or aligned
 * by time. A cell that differs from another pattern at an overlapping time is highlighted; choosing it offers its value for the other
 * patterns' bands, written through the segment-copy preview, save, and undo.
 */
export function CompareRuntimesDialog({ service, direction, serviceDayId, dayName, patterns, profiles, assignments, nodes, onChanged, onClose }: { service: Pick<RouteDefinitionApplication, 'previewSegmentValueCopy' | 'applySegmentRuntimePlan'>; direction: RouteDirection; serviceDayId: string; dayName: string; patterns: RoutePattern[]; profiles: RuntimeProfile[]; assignments: RuntimeAssignment[]; nodes: Node[]; onChanged: () => void; onClose: () => void }) {
  const [view, setView] = useState<'stacked' | 'time'>('stacked');
  const [chosen, setChosen] = useState<ComparisonCell>();
  const [targets, setTargets] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const nodeName = (id: string) => nodeById.get(id)?.shortName || nodeById.get(id)?.name || '?';
  const patternById = useMemo(() => new Map(patterns.map((pattern) => [pattern.id, pattern])), [patterns]);
  const chip = (patternId: string) => patternShortName(patternById.get(patternId), direction.name, nodeById);
  const bandById = useMemo(() => new Map(profiles.flatMap((profile) => profile.bands.map((band) => [band.id, band] as const))), [profiles]);
  const comparison = useMemo(() => compareRouteRuntimes({ directionId: direction.id, serviceDayId, patterns, profiles, assignments, directionColumnOrder: [...direction.columns].sort((left, right) => left.sequence - right.sequence).map((column) => column.nodeId) }), [direction, serviceDayId, patterns, profiles, assignments]);
  const differences = comparison.stacked.reduce((total, group) => total + group.bands.reduce((sum, band) => sum + band.cells.filter((cell) => cell?.discrepancy).length, 0), 0);
  const headers = comparison.segments.map((segment) => `${nodeName(segment.fromNodeId)}→${nodeName(segment.toNodeId)}`);
  const targetKey = (value: { profileId: string; bandId: string }) => `${value.profileId}:${value.bandId}`;
  const options = chosen ? [...new Map(chosen.otherValues.filter((value) => value.seconds !== chosen.seconds).map((value) => [targetKey(value), value])).values()] : [];

  function choose(cell: ComparisonCell) {
    setChosen(cell); setError('');
    setTargets([...new Set(cell.otherValues.filter((value) => value.seconds !== cell.seconds).map(targetKey))]);
  }
  async function apply() {
    if (!chosen) return;
    setBusy(true); setError('');
    try {
      const preview = await service.previewSegmentValueCopy({ sourceProfileId: chosen.profileId, sourceBandId: chosen.bandId, segmentKey: chosen.segmentKey, targets: targets.map((key) => { const [profileId, bandId] = key.split(':'); return { profileId, bandId }; }) });
      if (preview.changes.length) await service.applySegmentRuntimePlan(preview);
      setChosen(undefined); onChanged();
    } catch (issue) { setError(userFacingError(issue, 'The runtimes could not be saved.')); }
    finally { setBusy(false); }
  }

  return <ModalDialog labelledBy="compare-runtimes-title" className="confirm-dialog compare-runtimes-dialog" onClose={onClose} busy={busy}>
    <h2 id="compare-runtimes-title">Compare runtimes · {direction.name} · {dayName}</h2>
    <div className="compare-runtimes-toolbar">
      <span className="segmented" role="group" aria-label="View">
        <button type="button" aria-pressed={view === 'stacked'} onClick={() => setView('stacked')}>Stacked</button>
        <button type="button" aria-pressed={view === 'time'} onClick={() => { setView('time'); setChosen(undefined); }}>By time</button>
      </span>
      <span role="status">{differences === 1 ? '1 difference' : `${differences} differences`}</span>
    </div>
    <div className="compare-runtimes-table"><table>
      <thead><tr><th scope="col">{view === 'stacked' ? 'Period' : 'Time'}</th>{headers.map((header, index) => <th key={comparison.segments[index].key} scope="col">{header}</th>)}</tr></thead>
      {view === 'stacked' ? comparison.stacked.map((group) => <tbody key={group.profileId}>
        <tr className="compare-runtimes-pattern"><th scope="rowgroup" colSpan={headers.length + 1}>{patternById.get(group.patternId)?.name}</th></tr>
        {group.bands.map((band) => <tr key={band.bandId}>
          <th scope="row">{bandById.get(band.bandId)?.label} {clock(band.startTime)}–{clock(band.endTime)}</th>
          {band.cells.map((cell, index) => <td key={comparison.segments[index].key} className={cell?.discrepancy ? 'compare-runtimes-diff' : undefined}>{!cell ? <span className="compare-runtimes-none">·</span> : cell.discrepancy ? <button type="button" aria-pressed={chosen?.bandId === cell.bandId && chosen.segmentKey === cell.segmentKey} aria-label={`${runtime(cell.seconds)}, ${headers[index]}, ${chip(group.patternId)} ${bandById.get(band.bandId)?.label ?? ''}: use for other patterns`} onClick={() => choose(cell)}>{runtime(cell.seconds)}</button> : runtime(cell.seconds)}</td>)}
        </tr>)}
      </tbody>) : <tbody>{comparison.intervals.map((interval) => <tr key={interval.startTime}>
        <th scope="row">{clock(interval.startTime)}–{clock(interval.endTime)}</th>
        {comparison.segments.map((segment) => { const values = interval.cells[segment.key] ?? []; const distinct = new Set(values.filter((value) => value.seconds > 0).map((value) => value.seconds)); return <td key={segment.key} className={distinct.size > 1 ? 'compare-runtimes-diff' : undefined}>{distinct.size > 1 ? values.map((value) => `${chip(value.patternId)} ${runtime(value.seconds)}`).join(' · ') : values.length ? runtime(values[0].seconds) : <span className="compare-runtimes-none">·</span>}</td>; })}
      </tr>)}</tbody>}
    </table></div>
    {chosen && <div className="compare-runtimes-use" role="group" aria-labelledby="compare-runtimes-use-title">
      <h3 id="compare-runtimes-use-title">Use {runtime(chosen.seconds)} for</h3>
      {options.map((value) => { const key = targetKey(value); const band = bandById.get(value.bandId); return <label key={key}><input type="checkbox" checked={targets.includes(key)} disabled={busy} onChange={(event) => setTargets((current) => event.target.checked ? [...current, key] : current.filter((item) => item !== key))} /> {chip(value.patternId)} · {band?.label} {band ? `${clock(band.startTime)}–${clock(band.endTime)}` : ''} ({runtime(value.seconds)})</label>; })}
      <div className="dialog-actions"><button type="button" onClick={() => setChosen(undefined)} disabled={busy}>Cancel</button><button type="button" className="primary" onClick={() => void apply()} disabled={busy || !targets.length}>{busy ? 'Saving…' : `Apply to ${targets.length}`}</button></div>
    </div>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button type="button" onClick={onClose} disabled={busy}>Close</button></div>
  </ModalDialog>;
}
