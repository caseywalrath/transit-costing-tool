import { Fragment, useEffect, useRef, useState } from 'react';
import { ModalDialog } from '../ModalDialog';
import { MenuButton } from '../MenuButton';
import { formatMiles } from '../format';
import { MAX_ANNUAL_SERVICE_DAYS } from '../../domain/costing';
import { countNodeChanges, countPatternChanges } from '../../application/draftChangeCounts';
import { serviceDayFindingMessage, type NodeChangePreview, type PatternChangePreview as SafePatternChangePreview, type RouteDefinitionApplication, type RouteEditCommitResult, type RouteEditMode } from '../../application/routeDefinitionService';
import { metadata, newId } from '../../domain/ids';
import { patternTotalMiles, sortServiceDays } from '../../application/tripsWorkspaceView';
import { type Node, type Route, type RouteDefinitionAggregate, type RouteDirection, type RoutePattern, type ServiceDayDefinition, type ValidationFinding } from '../../domain/types';
import { type RouteNavigationGuard } from '../shared/types';
import { messages } from '../shared/messages';
import { DiscardRouteDraftDialog, RouteNavigationDraftDialog } from '../shared/dialogs';
import { TrashIcon } from '../shared/icons';
import { Field, NumericCommit, ServiceDayNameInput } from '../shared/fields';
import { SupportPanel, WorkSurface } from '../shared/surfaces';
import { SaveBar } from '../shared/bars';
import { NodesGrid, usePatternPointsGrid } from './RouteGrids';
import { generatedPatternShortName, patternNameWithoutDirection, patternShortName } from '../../application/shortNames';

const plural = (count: number, singular: string) => `${count} ${singular}${count === 1 ? '' : 's'}`;

/** What a saved Pattern says, without the save time that every commit refreshes. */
export function patternSignature(pattern: RoutePattern | undefined) { return JSON.stringify(pattern, (key, value) => key === 'updatedAt' ? undefined : value); }

export function RouteWorkspace({ service, aggregate, serviceDays, findings, selectedPatternId, segmentMiles, onRoute, onServiceDay, onCommitted, onDeletePattern, onSelectPattern, onRegisterNavigationGuard, onError }: { service: RouteDefinitionApplication; aggregate: RouteDefinitionAggregate; serviceDays: ServiceDayDefinition[]; findings: ValidationFinding[]; selectedPatternId: string; segmentMiles: (pattern: RoutePattern, index: number) => number; onRoute: (patch: Partial<Route>) => Promise<void>; onServiceDay: (id: string, patch: Partial<ServiceDayDefinition>) => Promise<ValidationFinding[]>; onCommitted: (result: RouteEditCommitResult) => void; onDeletePattern: () => void; onSelectPattern: (id: string) => void; onRegisterNavigationGuard: (guard: RouteNavigationGuard | undefined) => void; onError: (error: unknown) => void }) {
  const fieldError = (id: string, field?: string) => messages(findings, id, field);
  const [nodeDraft, setNodeDraft] = useState<Node[]>(aggregate.nodes);
  const [nodeSaving, setNodeSaving] = useState(false);
  const [patternSaving, setPatternSaving] = useState(false);
  const [pendingNodeDeletes, setPendingNodeDeletes] = useState<Set<string>>(new Set());
  const [nodeFindings, setNodeFindings] = useState<ValidationFinding[]>([]);
  const [patternDraft, setPatternDraft] = useState<RoutePattern | undefined>(() => aggregate.patterns.find((pattern) => pattern.id === selectedPatternId) ?? aggregate.patterns[0]);
  const [patternFindings, setPatternFindings] = useState<ValidationFinding[]>([]);
  const [conflict, setConflict] = useState<string>();
  const [impactDialog, setImpactDialog] = useState<{ preview: NodeChangePreview | SafePatternChangePreview; mode: RouteEditMode; afterCommit?: () => void }>();
  const [discardDialog, setDiscardDialog] = useState<{ title: string; action: () => void }>();
  const [navigationDialog, setNavigationDialog] = useState<{ action: () => void }>();
  const newNodeButton = useRef<HTMLButtonElement>(null);

  // A save returns new arrays for both Nodes and Patterns. A draft is replaced only when its own saved records changed, so saving Nodes
  // keeps an unsaved Pattern draft and saving a Pattern keeps unsaved Node edits (finding 5-006).
  const syncedNodes = useRef(JSON.stringify(aggregate.nodes));
  const syncedPattern = useRef(patternSignature(aggregate.patterns.find((pattern) => pattern.id === selectedPatternId) ?? aggregate.patterns[0]));
  useEffect(() => {
    const signature = JSON.stringify(aggregate.nodes);
    if (signature === syncedNodes.current) return;
    syncedNodes.current = signature;
    setNodeDraft(aggregate.nodes); setPendingNodeDeletes(new Set()); setNodeFindings([]);
  }, [aggregate.nodes]);
  useEffect(() => {
    const saved = aggregate.patterns.find((pattern) => pattern.id === selectedPatternId) ?? aggregate.patterns[0];
    // A new or duplicated Pattern is local draft state until Save Pattern
    // succeeds. Preserve it while the parent selection updates and while the
    // draft is being edited; it is not part of aggregate.patterns yet.
    if (patternDraft && !aggregate.patterns.some((pattern) => pattern.id === patternDraft.id)) return;
    const signature = patternSignature(saved);
    if (patternDraft && saved && saved.id === patternDraft.id && signature === syncedPattern.current) {
      // A Node save rewrites every Pattern's save time without changing it. Take the new time, so the draft does not read as edited.
      if (patternDraft.updatedAt !== saved.updatedAt) setPatternDraft((current) => current && current.id === saved.id ? { ...current, updatedAt: saved.updatedAt } : current);
      return;
    }
    syncedPattern.current = signature;
    setPatternDraft(saved ? { ...saved, points: saved.points.map((point) => ({ ...point })) } : undefined);
    setPatternFindings([]); setConflict(undefined);
  }, [aggregate.patterns, selectedPatternId, patternDraft?.id]);

  const savedPattern = patternDraft ? aggregate.patterns.find((pattern) => pattern.id === patternDraft.id) : undefined;
  const isNewPattern = Boolean(patternDraft && !savedPattern);
  const nodeDirty = JSON.stringify(nodeDraft) !== JSON.stringify(aggregate.nodes) || pendingNodeDeletes.size > 0;
  const patternDirty = Boolean(patternDraft && patternSignature(patternDraft) !== patternSignature(savedPattern));
  const patternErrors = patternDraft ? messages(patternFindings, patternDraft.id) : [];
  const displayPatterns = patternDraft
    ? (isNewPattern ? [...aggregate.patterns, patternDraft] : aggregate.patterns.map((pattern) => pattern.id === patternDraft.id ? patternDraft : pattern))
    : aggregate.patterns;
  const nodeById = new Map(aggregate.nodes.map((node) => [node.id, node]));
  const patternDirectionName = (pattern: RoutePattern) => aggregate.directions?.find((direction) => direction.id === pattern.directionId)?.name?.trim() || 'Outbound';
  const sortedDisplayPatterns = [...displayPatterns].sort((left, right) => {
    const leftDirection = patternDirectionName(left).toLocaleLowerCase();
    const rightDirection = patternDirectionName(right).toLocaleLowerCase();
    const leftDirectionRank = leftDirection === 'inbound' ? 0 : leftDirection === 'outbound' ? 1 : 2;
    const rightDirectionRank = rightDirection === 'inbound' ? 0 : rightDirection === 'outbound' ? 1 : 2;
    return leftDirectionRank - rightDirectionRank
      || (left.name || 'Untitled pattern').localeCompare(right.name || 'Untitled pattern', undefined, { numeric: true, sensitivity: 'base' })
      || left.id.localeCompare(right.id);
  });

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (!nodeDirty && !patternDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [nodeDirty, patternDirty]);

  useEffect(() => {
    onRegisterNavigationGuard((action) => {
      if (!nodeDirty && !patternDirty) { action(); return; }
      setNavigationDialog({ action });
    });
    return () => onRegisterNavigationGuard(undefined);
  }, [nodeDirty, onRegisterNavigationGuard, patternDirty]);

  function cloneSavedPattern(id: string) {
    const saved = aggregate.patterns.find((pattern) => pattern.id === id);
    setPatternDraft(saved ? { ...saved, points: saved.points.map((point) => ({ ...point })) } : undefined);
    setPatternFindings([]); setConflict(undefined); onSelectPattern(id);
  }
  function requestPattern(id: string) {
    if (id === patternDraft?.id) return;
    if (!patternDirty) { cloneSavedPattern(id); return; }
    setDiscardDialog({ title: 'Discard unsaved pattern changes?', action: () => cloneSavedPattern(id) });
  }
  function newPattern() {
    const action = () => { const draft = service.createPatternDraft(aggregate); setPatternDraft(draft); setPatternFindings([]); setConflict(undefined); onSelectPattern(draft.id); };
    if (patternDirty) setDiscardDialog({ title: 'Discard unsaved pattern changes?', action }); else action();
  }
  function duplicatePattern(reverse = false) {
    if (!patternDraft) return;
    const action = () => {
      try { const draft = reverse ? service.reversePatternDraft(aggregate, patternDraft.id) : service.duplicatePatternDraft(aggregate, patternDraft.id); setPatternDraft(draft); setPatternFindings([]); setConflict(undefined); onSelectPattern(draft.id); }
      catch (error) { onError(error); }
    };
    if (patternDirty) setDiscardDialog({ title: 'Discard unsaved pattern changes?', action }); else action();
  }
  function updateDraft(patch: Partial<RoutePattern>) { setPatternDraft((current) => current ? { ...current, ...patch, points: patch.points ? patch.points.map((point, sequence) => ({ ...point, sequence })) : current.points } : current); setPatternFindings([]); setConflict(undefined); }
  function addPoint() {
    if (!patternDraft) return;
    const first = aggregate.nodes[0];
    if (!first) { setPatternFindings([{ ruleId: 'pattern.nodeRequired', severity: 'error', entityType: 'pattern', entityId: patternDraft.id, messageKey: 'pattern.missingNode' }]); return; }
    updateDraft({ points: [...patternDraft.points, { id: newId(), nodeId: first.id, sequence: patternDraft.points.length, cumulativeMiles: patternDraft.points.at(-1)?.cumulativeMiles ?? 0 }] });
  }
  function updatePoint(index: number, patch: Partial<RoutePattern['points'][number]>) { if (!patternDraft) return; updateDraft({ points: patternDraft.points.map((point, pointIndex) => pointIndex === index ? { ...point, ...patch } : point) }); }
  function movePoint(index: number, direction: -1 | 1) { if (!patternDraft) return; const target = index + direction; if (target < 0 || target >= patternDraft.points.length) return; const points = [...patternDraft.points]; [points[index], points[target]] = [points[target], points[index]]; updateDraft({ points }); }
  function removePoint(index: number) { if (patternDraft) updateDraft({ points: patternDraft.points.filter((_, pointIndex) => pointIndex !== index) }); }
  async function reviewPatternSave(afterCommit?: () => void) {
    if (!patternDraft) return;
    setPatternSaving(true);
    try {
      const preview = await service.previewPatternChange(aggregate.route.id, savedPattern?.id, patternDraft);
      setPatternFindings(preview.findings);
      setConflict(preview.conflict?.message);
      if (preview.classification === 'invalid' || preview.conflict || preview.findings.some((finding) => finding.severity === 'error')) return;
      if (preview.requiresReset) { setImpactDialog({ preview, mode: 'reset', afterCommit }); return; }
      if (preview.classification === 'deterministic') { setImpactDialog({ preview, mode: 'rebalance', afterCommit }); return; }
      await commitPattern(preview, 'rebalance', afterCommit);
    } catch (error) { onError(error); }
    finally { setPatternSaving(false); }
  }
  async function commitPattern(preview: SafePatternChangePreview, mode: RouteEditMode, afterCommit?: () => void) {
    setPatternSaving(true);
    try { const result = await service.commitPatternChange(preview.previewToken, mode); onCommitted(result); setPatternFindings([]); setConflict(undefined); setImpactDialog(undefined); afterCommit?.(); }
    catch (error) { onError(error); }
    finally { setPatternSaving(false); }
  }
  async function reviewNodeSave(afterCommit?: () => void) {
    setNodeSaving(true);
    try {
      const preview = await service.previewNodeChanges(aggregate.route.id, nodeDraft.filter((node) => !pendingNodeDeletes.has(node.id)));
      setNodeFindings(preview.findings); setConflict(preview.conflict?.message);
      if (preview.classification === 'invalid' || preview.conflict || preview.findings.some((finding) => finding.severity === 'error')) return;
      if (preview.deletedNodeIds.length) { setImpactDialog({ preview, mode: 'rebalance', afterCommit }); return; }
      await commitNodes(preview, afterCommit);
    } catch (error) { onError(error); }
    finally { setNodeSaving(false); }
  }
  async function commitNodes(preview: NodeChangePreview, afterCommit?: () => void) {
    setNodeSaving(true);
    try { const result = await service.commitNodeChanges(preview.previewToken, 'rebalance'); onCommitted(result); setNodeFindings([]); setConflict(undefined); setImpactDialog(undefined); afterCommit?.(); }
    catch (error) { onError(error); }
    finally { setNodeSaving(false); }
  }
  function discardPattern() {
    if (isNewPattern) { setPatternDraft(aggregate.patterns.find((pattern) => pattern.id === selectedPatternId) ?? aggregate.patterns[0]); onSelectPattern(aggregate.patterns[0]?.id ?? ''); }
    else if (savedPattern) cloneSavedPattern(savedPattern.id);
  }
  function discardAllDrafts() {
    setNodeDraft(aggregate.nodes); setPendingNodeDeletes(new Set()); setNodeFindings([]);
    discardPattern();
  }
  function saveDraftsThenNavigate(action: () => void) {
    if (patternDirty) {
      void reviewPatternSave(() => {
        if (nodeDirty) void reviewNodeSave(action);
        else action();
      });
      return;
    }
    if (nodeDirty) { void reviewNodeSave(action); return; }
    action();
  }
  /** Saves a Service day edit and returns the text of the finding that names `field`, if the edit was refused. */
  async function serviceDayRefusal(id: string, patch: Partial<ServiceDayDefinition>, field: 'name' | 'annualServiceDays'): Promise<string | undefined> {
    const refused = (await onServiceDay(id, patch)).filter((finding) => finding.field === field).map(serviceDayFindingMessage);
    return refused.length ? refused.join(' ') : undefined;
  }
  function discardNodes() { setNodeDraft(aggregate.nodes); setPendingNodeDeletes(new Set()); setNodeFindings([]); window.setTimeout(() => newNodeButton.current?.focus()); }
  function addNode() { setNodeDraft((current) => [...current, { id: newId(), scenarioId: aggregate.route.scenarioId, routeId: aggregate.route.id, name: '', kind: 'timepoint', ...metadata() }]); }

  const serviceDayTotal = serviceDays.reduce((sum, day) => sum + day.annualServiceDays, 0);

  return <div className="route-workspace"><h1 className="visually-hidden">Route definition</h1>
    <div className="route-top-grid">
      <SupportPanel title="Route details"><div className="field-grid route-details-fields"><Field label="Route name" required errors={fieldError(aggregate.route.id, 'name')}><input defaultValue={aggregate.route.name} onBlur={(event) => void onRoute({ name: event.target.value })} /></Field><Field label="Short name"><input defaultValue={aggregate.route.shortName ?? ''} onBlur={(event) => void onRoute({ shortName: event.target.value || undefined })} /></Field><Field label="Description"><input defaultValue={aggregate.route.description ?? ''} placeholder="Optional" onBlur={(event) => void onRoute({ description: event.target.value || undefined })} /></Field></div></SupportPanel>
      <SupportPanel title="Annual service days"><div className="table-scroll service-days-table"><table><thead><tr><th scope="col">Service day</th><th scope="col">Annual service days</th></tr></thead><tbody>{sortServiceDays(serviceDays).map((day) => <tr key={day.id}><td><ServiceDayNameInput name={day.name} onCommit={(value) => serviceDayRefusal(day.id, { name: value }, 'name')} /></td><td><NumericCommit label={`${day.name} annual service days`} value={day.annualServiceDays} integer onCommit={(value) => serviceDayRefusal(day.id, { annualServiceDays: value }, 'annualServiceDays')} /></td></tr>)}</tbody></table></div><p className={serviceDayTotal > MAX_ANNUAL_SERVICE_DAYS ? 'service-days-total value-invalid' : 'service-days-total'}>Total <b>{serviceDayTotal}</b> of {MAX_ANNUAL_SERVICE_DAYS}</p></SupportPanel>
    </div>
    <div className="route-bottom-grid"><WorkSurface title="Nodes" count={nodeDraft.length} className="route-nodes" footer={nodeDirty && <SaveBar message={`${plural(Math.max(1, countNodeChanges(aggregate.nodes, nodeDraft, pendingNodeDeletes)), 'unsaved change')} in Nodes`} saveLabel="Save nodes" busy={nodeSaving} onSave={() => void reviewNodeSave()} onDiscard={discardNodes} />}><NodesGrid nodes={nodeDraft} savedNodes={aggregate.nodes} pendingDeletes={pendingNodeDeletes} saving={nodeSaving} errorsFor={(id) => messages(nodeFindings, id)} newNodeButton={newNodeButton} onAdd={addNode} onChange={(id, patch) => { setNodeDraft((current) => current.map((candidate) => candidate.id === id ? { ...candidate, ...patch } : candidate)); if ('name' in patch) setNodeFindings([]); }} onSetPendingDelete={(id, pending) => setPendingNodeDeletes((current) => { const next = new Set(current); if (pending) next.add(id); else next.delete(id); return next; })} /></WorkSurface>
      <WorkSurface title="Patterns" count={displayPatterns.length} className="route-patterns"><div className="pattern-layout"><aside className="pattern-list" aria-label="Patterns">{sortedDisplayPatterns.length ? sortedDisplayPatterns.map((pattern, index) => { const direction = patternDirectionName(pattern); const miles = patternTotalMiles(pattern); return <Fragment key={pattern.id}>{(index === 0 || patternDirectionName(sortedDisplayPatterns[index - 1]) !== direction) && <div className="pattern-list__group">{direction}</div>}<button className={patternDraft?.id === pattern.id ? 'selected' : ''} title={pattern.name || 'Untitled pattern'} onClick={() => requestPattern(pattern.id)}><strong>{patternNameWithoutDirection(pattern.name, direction) || 'Untitled pattern'} {isNewPattern && pattern.id === patternDraft?.id ? <em>Unsaved</em> : null}</strong><span className="pattern-list__meta"><span className="chip">{patternShortName(pattern, direction, nodeById)}</span>{plural(pattern.points.length, 'point')}{miles === undefined ? '' : ` · ${formatMiles(miles)} mi`}</span></button></Fragment>; }) : <p>Patterns define full, short, and loop trips.</p>}<button className="pattern-list-add" onClick={newPattern} disabled={nodeSaving || patternSaving}><span aria-hidden="true">+ </span>Add pattern</button></aside>{patternDraft && <PatternEditor pattern={patternDraft} savedPattern={savedPattern} directionName={patternDirectionName(patternDraft)} directions={aggregate.directions ?? []} nodes={aggregate.nodes} segmentMiles={segmentMiles} errors={patternErrors} conflict={conflict} isNew={isNewPattern} dirty={patternDirty} saving={patternSaving} canDuplicate={!isNewPattern} onPattern={updateDraft} onAddPoint={addPoint} onUpdatePoint={updatePoint} onMovePoint={movePoint} onRemovePoint={removePoint} onReverse={() => duplicatePattern(true)} onDuplicate={() => duplicatePattern(false)} onDelete={() => isNewPattern ? discardPattern() : onDeletePattern()} onSave={() => void reviewPatternSave()} onDiscard={discardPattern} />}</div></WorkSurface></div>
    {impactDialog && <RouteEditImpactDialog preview={impactDialog.preview} mode={impactDialog.mode} onClose={() => setImpactDialog(undefined)} onCommit={() => impactDialog.preview.kind === 'nodes' ? void commitNodes(impactDialog.preview, impactDialog.afterCommit) : void commitPattern(impactDialog.preview, impactDialog.mode, impactDialog.afterCommit)} />}
    {discardDialog && <DiscardRouteDraftDialog title={discardDialog.title} onDiscard={() => { discardDialog.action(); setDiscardDialog(undefined); }} onClose={() => setDiscardDialog(undefined)} />}
    {navigationDialog && <RouteNavigationDraftDialog onCancel={() => setNavigationDialog(undefined)} onDiscard={() => { const action = navigationDialog.action; discardAllDrafts(); setNavigationDialog(undefined); action(); }} onSave={() => { const action = navigationDialog.action; setNavigationDialog(undefined); saveDraftsThenNavigate(action); }} />}
  </div>;
}

export function PatternEditor({ pattern, savedPattern, directionName, directions, nodes, segmentMiles, errors, conflict, isNew, dirty, saving, canDuplicate, onPattern, onAddPoint, onUpdatePoint, onMovePoint, onRemovePoint, onReverse, onDuplicate, onDelete, onSave, onDiscard }: { pattern: RoutePattern; savedPattern: RoutePattern | undefined; directionName: string; directions: RouteDirection[]; nodes: Node[]; segmentMiles: (pattern: RoutePattern, index: number) => number; errors: string[]; conflict?: string; isNew: boolean; dirty: boolean; saving: boolean; canDuplicate: boolean; onPattern: (patch: Partial<RoutePattern>) => void; onAddPoint: () => void; onUpdatePoint: (index: number, patch: Partial<RoutePattern['points'][number]>) => void; onMovePoint: (index: number, direction: -1 | 1) => void; onRemovePoint: (index: number) => void; onReverse: () => void; onDuplicate: () => void; onDelete: () => void; onSave: () => void; onDiscard: () => void }) {
  const addPointButton = useRef<HTMLButtonElement>(null);
  const totalMiles = patternTotalMiles(pattern);
  const pointsGrid = usePatternPointsGrid(pattern, onUpdatePoint);
  const savedPoints = new Map((savedPattern?.points ?? []).map((point) => [point.id, point]));
  return <div className="pattern-editor"><div className="pattern-editor__header"><h3>{pattern.name || 'Untitled pattern'}</h3><span className="pattern-editor__meta">{directionName} · {pattern.points.length} points · {totalMiles === undefined ? 'miles incomplete' : `${formatMiles(totalMiles)} mi`}</span><div className="pattern-editor__actions"><button disabled={!canDuplicate} onClick={onReverse}>Reverse</button><MenuButton label="Actions" menuLabel="Pattern actions" groups={[{ items: [{ id: 'duplicate', label: 'Duplicate pattern', disabled: !canDuplicate, onSelect: onDuplicate }, { id: 'delete', label: isNew ? 'Discard new pattern' : 'Delete pattern…', destructive: true, title: isNew ? 'Discard the new pattern' : `Delete ${pattern.name || 'pattern'}`, onSelect: onDelete }] }]} /></div></div><div className="field-grid"><Field label="Direction"><select value={pattern.directionId ?? directions[0]?.id ?? ''} onChange={(event) => onPattern({ directionId: event.target.value })}>{directions.map((direction) => <option key={direction.id} value={direction.id}>{direction.name}</option>)}</select></Field><Field label="Pattern name" required><input value={pattern.name} onChange={(event) => onPattern({ name: event.target.value })} /></Field><Field label="Pattern short name"><input value={pattern.directionLabel ?? ''} placeholder={generatedPatternShortName(pattern, directionName, new Map(nodes.map((node) => [node.id, node])))} title="Shown in the Trips and Blocking tables. Left empty, the name shown is the one generated from the pattern name." onChange={(event) => onPattern({ directionLabel: event.target.value || undefined })} /></Field></div><div className="table-scroll"><table className="grid-table" role="grid" aria-label="Pattern points"><thead><tr><th scope="col">#</th><th scope="col">Node</th><th scope="col">Cumulative mi</th><th scope="col">Segment mi</th><th scope="col">Order</th><th scope="col"><span className="visually-hidden">Remove</span></th></tr></thead><tbody>{pattern.points.map((point, index) => { const segment = segmentMiles(pattern, index); return <tr key={point.id} {...pointsGrid.rowProps(index)}><td>{index + 1}</td><td {...pointsGrid.cellProps(index, 0)} className="grid-cell" data-cell={`Point ${index + 1} node`}><select data-grid-control tabIndex={-1} aria-label={`Point ${index + 1} node`} value={point.nodeId} onChange={(event) => onUpdatePoint(index, { nodeId: event.target.value })}>{nodes.map((node) => <option key={node.id} value={node.id}>{node.shortName ? `${node.shortName} — ${node.name}` : node.name || 'Untitled node'}</option>)}</select></td><td {...pointsGrid.cellProps(index, 1)} className={savedPoints.get(point.id)?.cumulativeMiles === point.cumulativeMiles ? 'grid-cell' : 'grid-cell grid-cell--edited'} data-cell={`Point ${index + 1} cumulative miles`}>{pointsGrid.editing?.r === index && pointsGrid.editing.c === 1 ? <input {...pointsGrid.inputProps} className="grid-cell__input" aria-label={`Point ${index + 1} cumulative miles`} /> : <span>{formatMiles(point.cumulativeMiles)}</span>}</td><td><output>{!Number.isFinite(segment) ? '—' : patternTotalMiles(pattern) === undefined ? 'incomplete' : segment.toFixed(2)}</output></td><td><button className="icon-button" disabled={index === 0} onClick={() => onMovePoint(index, -1)} aria-label="Move point up" title="Move point up">↑</button><button className="icon-button" disabled={index === pattern.points.length - 1} onClick={() => onMovePoint(index, 1)} aria-label="Move point down" title="Move point down">↓</button></td><td><button className="icon-button icon-button--danger" onClick={() => onRemovePoint(index)} aria-label={`Remove point ${index + 1}`} title={`Remove point ${index + 1}`}><TrashIcon /></button></td></tr>; })}{pattern.points.length === 0 && <tr><td colSpan={6} className="table-empty">Add two or more points. A node may appear more than once for loop patterns.</td></tr>}<tr className="table-add-row"><td colSpan={6}><button type="button" ref={addPointButton} className="ghost" onClick={onAddPoint}><span aria-hidden="true">+ </span>Add node to pattern</button></td></tr></tbody></table></div><p className="grid-message" role="status" aria-live="polite">{pointsGrid.message}</p>{conflict && <p className="field-error local-conflict" role="alert">{conflict}</p>}{errors.length > 0 && <div className="runtime-findings" role="alert"><strong>Review this pattern</strong><ul>{[...new Set(errors)].map((error) => <li key={error}>{error}</li>)}</ul></div>}{dirty && <SaveBar message={isNew ? 'New pattern — not saved' : `${plural(Math.max(1, countPatternChanges(savedPattern, pattern)), 'unsaved change')} in this pattern`} saveLabel="Review and save" busy={saving} onSave={onSave} onDiscard={() => { onDiscard(); window.setTimeout(() => addPointButton.current?.focus()); }} />}</div>;
}

export function RouteEditImpactDialog({ preview, mode, onClose, onCommit }: { preview: NodeChangePreview | SafePatternChangePreview; mode: RouteEditMode; onClose: () => void; onCommit: () => void }) {
  const impact = preview.impact;
  const title = preview.kind === 'nodes' ? 'Update service for deleted nodes?' : mode === 'reset' ? 'Reset service for this pattern?' : 'Save pattern and rebalance?';
  const affected = [impact.profileIds.length ? `${impact.profileIds.length} runtime profile${impact.profileIds.length === 1 ? '' : 's'}` : '', impact.tripIds.length ? `${impact.tripIds.length} trip${impact.tripIds.length === 1 ? '' : 's'}` : '', impact.blockIds.length ? `${impact.blockIds.length} block${impact.blockIds.length === 1 ? '' : 's'}` : ''].filter(Boolean);
  const destructive = mode === 'reset';
  const detail = destructive
    ? `This will remove ${affected.join(', ') || 'the dependent service'} for this pattern. Other patterns and blocks will remain.`
    : preview.kind === 'nodes'
      ? `This will remove the selected node occurrences and update ${affected.join(', ') || 'the affected schedule'} while preserving retained times.`
      : `This will update ${affected.join(', ') || 'this pattern'} using the revised timepoint structure. Added timepoints begin with zero run time.`;
  const nonRevenue = preview.kind === 'nodes' ? preview.nonRevenueImpact : undefined;
  const nonRevenueDetail = nonRevenue?.removedActivityCount ? `Removes ${nonRevenue.removedActivityCount} pull-out, pull-in, or deadhead ${nonRevenue.removedActivityCount === 1 ? 'activity' : 'activities'} in ${nonRevenue.blockIds.length} block${nonRevenue.blockIds.length === 1 ? '' : 's'}.` : '';
  return <ModalDialog role="alertdialog" labelledBy="route-edit-impact-title" className="confirm-dialog" onClose={onClose}><h2 id="route-edit-impact-title">{title}</h2><p>{detail}</p>{nonRevenueDetail && <p>{nonRevenueDetail}</p>}<div className="dialog-actions"><button onClick={onClose}>Cancel</button><button className={destructive ? 'danger' : 'primary'} onClick={onCommit}>{destructive ? 'Save and reset service' : preview.kind === 'nodes' ? 'Delete nodes and update service' : 'Save and rebalance'}</button></div></ModalDialog>;
}
