// Spreadsheet grids of the Route tab (UR-7b): the Nodes table (Name, Short, Notes) and the Pattern points' Cumulative mi.
// Type and the points' Node stay native selects; they are grid cells that hand focus to their select, so Tab reaches them.
import { useEffect, useRef, type RefObject } from 'react';
import { useGridNavigation } from '../shared/useGridNavigation';
import { TrashIcon } from '../shared/icons';
import { abbreviatePlaceName } from '../../application/shortNames';
import { type Node, type NodeKind, type RoutePattern } from '../../domain/types';

const NODE_KINDS: NodeKind[] = ['timepoint', 'terminal', 'garage', 'other'];
const NODE_KIND_LABELS: Record<NodeKind, string> = { timepoint: 'Timepoint', terminal: 'Terminal', garage: 'Garage', other: 'Other' };
const NODE_COLUMNS = ['Node name', 'Node short name', 'Node type', 'Node notes'] as const;
/** The short name the Blocking tables use when none is entered, shown as a placeholder only when it differs from the name. */
const generatedNodeShortName = (node: Node) => { const generated = abbreviatePlaceName(node.name); return generated !== node.name.trim() ? generated : ''; };

export function NodesGrid({ nodes, savedNodes, pendingDeletes, saving, errorsFor, newNodeButton, onChange, onSetPendingDelete, onAdd }: {
  nodes: Node[]; savedNodes: Node[]; pendingDeletes: Set<string>; saving: boolean; errorsFor: (id: string) => string[];
  newNodeButton: RefObject<HTMLButtonElement | null>; onChange: (id: string, patch: Partial<Node>) => void; onSetPendingDelete: (id: string, pending: boolean) => void; onAdd: () => void;
}) {
  const text = (node: Node, c: number) => c === 0 ? node.name : c === 1 ? node.shortName ?? '' : c === 3 ? node.notes ?? '' : node.kind;
  const grid = useGridNavigation({
    rowCount: nodes.length, colCount: NODE_COLUMNS.length,
    isEditable: (r, c) => c !== 2 && !saving && !pendingDeletes.has(nodes[r].id), cellText: (r, c) => text(nodes[r], c),
    onCommit: (r, c, value) => { onChange(nodes[r].id, c === 0 ? { name: value } : c === 1 ? { shortName: value || undefined } : { notes: value || undefined }); return undefined; },
  });
  const focusNew = useRef(false);
  useEffect(() => { if (!focusNew.current) return; focusNew.current = false; grid.moveTo({ r: nodes.length - 1, c: 0 }); }, [nodes.length]);
  const savedById = new Map(savedNodes.map((node) => [node.id, node]));
  return <><div className="table-scroll"><table className="grid-table" role="grid" aria-label="Nodes">
    <thead><tr><th scope="col">Name</th><th scope="col">Short</th><th scope="col">Type</th><th scope="col">Notes</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
    <tbody>{nodes.map((node, r) => {
      const pending = pendingDeletes.has(node.id);
      const saved = savedById.get(node.id);
      const errors = errorsFor(node.id);
      return <tr key={node.id} {...grid.rowProps(r)} className={`${pending ? 'pending-delete' : ''} ${!saved ? 'draft-row' : ''}`}>
        {NODE_COLUMNS.map((label, c) => {
          const edited = saved ? text(saved, c) !== text(node, c) : c === 0 || Boolean(text(node, c));
          const editing = grid.editing?.r === r && grid.editing.c === c;
          return <td key={label} {...grid.cellProps(r, c)} className={edited ? 'grid-cell grid-cell--edited' : 'grid-cell'} data-cell={label}>
            {c === 2 ? <select data-grid-control tabIndex={-1} aria-label={label} value={node.kind} disabled={pending || saving} onChange={(event) => onChange(node.id, { kind: event.target.value as NodeKind })}>{NODE_KINDS.map((kind) => <option key={kind} value={kind}>{NODE_KIND_LABELS[kind]}</option>)}</select>
              : editing ? <input {...grid.inputProps} className="grid-cell__input" aria-label={label} />
                : <span className={!text(node, c) ? 'grid-cell__placeholder' : undefined}>{text(node, c) || (c === 0 ? 'Enter node name' : c === 1 ? generatedNodeShortName(node) : '')}</span>}
            {c === 0 && errors.map((error) => <small className="field-error" key={error}>{error}</small>)}
          </td>;
        })}
        <td>{pending ? <button disabled={saving} onClick={() => onSetPendingDelete(node.id, false)}>Undo</button> : <button className="icon-button icon-button--danger" disabled={saving} onClick={() => onSetPendingDelete(node.id, true)} aria-label={`Remove ${node.name || 'node'}`} title={`Remove ${node.name || 'node'}`}><TrashIcon /></button>} {pending && <span className="row-status">Will be deleted</span>}</td>
      </tr>;
    })}{nodes.length === 0 && <tr><td colSpan={5} className="table-empty">Add scheduling timepoints and terminals. Nodes can be reused in any pattern.</td></tr>}<tr className="table-add-row"><td colSpan={5}><button type="button" ref={newNodeButton} className="ghost" onClick={() => { focusNew.current = true; onAdd(); }} disabled={saving}><span aria-hidden="true">+ </span>New node</button></td></tr></tbody>
  </table></div><p className="grid-message" role="status" aria-live="polite">{grid.message}</p></>;
}

/** The grid of a Pattern's points: column 0 is the Node select (a control cell) and column 1 is Cumulative mi. */
export function usePatternPointsGrid(pattern: RoutePattern, onUpdatePoint: (index: number, patch: Partial<RoutePattern['points'][number]>) => void) {
  return useGridNavigation({
    rowCount: pattern.points.length, colCount: 2,
    isEditable: (_r, c) => c === 1, cellText: (r) => String(pattern.points[r].cumulativeMiles),
    onCommit: (r, _c, value) => {
      if (!value.trim()) return 'A value is required. Zero is valid.';
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) return 'Enter a non-negative number.';
      onUpdatePoint(r, { cumulativeMiles: parsed });
      return undefined;
    },
  });
}
