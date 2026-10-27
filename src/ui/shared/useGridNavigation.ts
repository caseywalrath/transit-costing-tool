import { type ChangeEvent, type FocusEvent, type KeyboardEvent, useLayoutEffect, useRef, useState } from 'react';

export type GridCell = { r: number; c: number };
type Editing = GridCell & { text: string; initial: string; selectAll: boolean };

/**
 * A spreadsheet-style keyboard grid (UR-7). One cell is in the tab order (roving tabindex). At rest the arrow keys, Home, End, Tab, and
 * Shift+Tab move; Enter or F2 edits with the text selected; a printable key edits starting with that character; Backspace or Delete edits
 * empty. While editing, Enter and Shift+Enter commit and move down or up, Tab and Shift+Tab commit and move right or left, Escape cancels,
 * and blur commits or, when the entry is refused, cancels. `onCommit` returns the reason an entry is refused, which `message` carries.
 * The hook does not parse values: the caller's `onCommit` uses the domain parsers.
 */
export function useGridNavigation({ rowCount, colCount, isEditable, cellText, onCommit }: { rowCount: number; colCount: number; isEditable: (r: number, c: number) => boolean; cellText: (r: number, c: number) => string; onCommit: (r: number, c: number, text: string) => string | undefined }) {
  const [active, setActive] = useState<GridCell>({ r: 0, c: 0 });
  const [editing, setEditingState] = useState<Editing>();
  const [message, setMessage] = useState('');
  const editingRef = useRef<Editing | undefined>(undefined);
  const cells = useRef(new Map<string, HTMLElement>());
  const input = useRef<HTMLInputElement | null>(null);
  const pendingFocus = useRef<'cell' | 'input' | undefined>(undefined);
  const clamp = (cell: GridCell): GridCell => ({ r: Math.max(0, Math.min(rowCount - 1, cell.r)), c: Math.max(0, Math.min(colCount - 1, cell.c)) });
  const activeCell = clamp(active);
  const setEditing = (next: Editing | undefined) => { editingRef.current = next; setEditingState(next); };

  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = undefined;
    if (target === 'input' && input.current) {
      input.current.focus();
      const length = input.current.value.length;
      if (editingRef.current?.selectAll) input.current.select(); else input.current.setSelectionRange(length, length);
    } else cells.current.get(`${activeCell.r}:${activeCell.c}`)?.focus();
  });

  function moveTo(cell: GridCell, focus = true) { setActive(clamp(cell)); if (focus) pendingFocus.current = 'cell'; }
  function startEdit(text?: string, { r, c } = activeCell) {
    if (!isEditable(r, c)) return;
    setActive({ r, c });
    const initial = cellText(r, c);
    setMessage('');
    setEditing({ r, c, initial, text: text ?? initial, selectAll: text === undefined });
    pendingFocus.current = 'input';
  }
  /** Returns false and keeps editing when the entry is refused. */
  function commit(): boolean {
    const current = editingRef.current;
    if (!current) return true;
    const error = current.text === current.initial ? undefined : onCommit(current.r, current.c, current.text);
    if (error) { setMessage(error); return false; }
    setMessage('');
    setEditing(undefined);
    return true;
  }
  function cancel() { if (!editingRef.current) return; setMessage(''); setEditing(undefined); pendingFocus.current = 'cell'; }

  function onCellKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (editingRef.current) return;
    const { r, c } = activeCell;
    const moves: Record<string, GridCell> = { ArrowUp: { r: r - 1, c }, ArrowDown: { r: r + 1, c }, ArrowLeft: { r, c: c - 1 }, ArrowRight: { r, c: c + 1 }, Home: { r, c: 0 }, End: { r, c: colCount - 1 } };
    if (moves[event.key]) { event.preventDefault(); moveTo(moves[event.key]); return; }
    if (event.key === 'Tab') {
      // At the row's ends Tab leaves the grid through the browser's own focus order.
      const next = c + (event.shiftKey ? -1 : 1);
      if (next >= 0 && next < colCount) { event.preventDefault(); moveTo({ r, c: next }); }
      return;
    }
    if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); startEdit(); return; }
    if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); startEdit(''); return; }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); startEdit(event.key); }
  }

  function cellProps(r: number, c: number) {
    const isActive = activeCell.r === r && activeCell.c === c;
    const isEditing = editing?.r === r && editing.c === c;
    return {
      role: 'gridcell' as const,
      tabIndex: isActive && !isEditing ? 0 : -1,
      'data-active': isActive || undefined,
      'data-invalid': (isEditing && Boolean(message)) || undefined,
      ref: (element: HTMLElement | null) => { if (element) cells.current.set(`${r}:${c}`, element); else cells.current.delete(`${r}:${c}`); },
      onKeyDown: onCellKeyDown,
      onFocus: (event: FocusEvent<HTMLElement>) => { if (event.target === event.currentTarget && !isActive) setActive({ r, c }); },
      onClick: () => { if (!isEditing) moveTo({ r, c }); },
      onDoubleClick: () => { if (!isEditing) startEdit(undefined, { r, c }); },
    };
  }

  const inputProps = {
    ref: input,
    value: editing?.text ?? '',
    'aria-invalid': Boolean(message) || undefined,
    onChange: (event: ChangeEvent<HTMLInputElement>) => { const current = editingRef.current; if (!current) return; setMessage(''); setEditing({ ...current, text: event.target.value, selectAll: false }); },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      const current = editingRef.current;
      if (!current) return;
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); cancel(); return; }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        if (!commit()) return;
        const step = event.shiftKey ? -1 : 1;
        moveTo(event.key === 'Enter' ? { r: current.r + step, c: current.c } : { r: current.r, c: current.c + step });
      }
    },
    onBlur: () => { if (!editingRef.current) return; if (!commit()) { setMessage(''); setEditing(undefined); } },
  };

  return { activeCell, editing: editing ? { r: editing.r, c: editing.c } : undefined, cellProps, inputProps, message, moveTo };
}
