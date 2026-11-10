import { Fragment, type KeyboardEvent, useRef } from 'react';

/** What an item's `onSelect` can read about the click that chose it (Ctrl or ⌘ held, for example). Choosing by keyboard reports the held keys too. */
export type MenuSelectEvent = { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean };
export type MenuItem = {
  id: string; label: string; onSelect: (event: MenuSelectEvent) => void; disabled?: boolean; title?: string; checked?: boolean;
  /** With `checked`: `checkbox` for a toggle that is independent of the other items; the default `radio` marks one choice of a group. */ kind?: 'radio' | 'checkbox';
  destructive?: boolean; restoreFocus?: boolean; wrapLabel?: boolean;
  /** Plain text shown under the item and read as its description (for example the time of the last backup). An array shows one line each. */ note?: string | string[];
  /** Actions on the object this item names, shown in a context menu on right-click, the context-menu key, Shift+F10, or a touch long-press (Decision 0064). */ contextGroups?: () => MenuGroup[];
  /** The context menu's heading and accessible name prefix. Defaults to `label`. */ contextHeading?: string;
};
export type MenuGroup = { label?: string; items: MenuItem[] };
export type ContextRequest = { item: MenuItem; element: HTMLButtonElement; point?: { x: number; y: number } };

const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 10;

/** True for the keys that open a context menu from the keyboard: the ContextMenu key and Shift+F10. */
export function isContextMenuKey(event: KeyboardEvent): boolean { return event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'); }

/** Arrow, Home, and End movement between the enabled items of a menu (WAI-ARIA menu pattern). Returns true when it handled the key. */
export function moveMenuFocus(event: KeyboardEvent, container: HTMLElement | null): boolean {
  const items = [...container?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? []];
  const current = items.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (current + 1 + items.length) % items.length : event.key === 'ArrowUp' ? (current - 1 + items.length) % items.length : undefined;
  if (next === undefined) return false;
  event.preventDefault();
  items[next]?.focus();
  return true;
}

/** The groups, separators, labels, items and notes of a menu, shared by `MenuButton` and `ContextMenu`. */
export function MenuGroups({ groups, menuId, selectionStyle, onChoose, onItemContext }: { groups: MenuGroup[]; menuId: string; selectionStyle: 'check' | 'highlight'; onChoose: (item: MenuItem, event: MenuSelectEvent) => void; onItemContext?: (request: ContextRequest) => void }) {
  const press = useRef<{ timer: number; x: number; y: number } | undefined>(undefined);
  // A long-press that opened the context menu ends with a click on the same item; that click must not also choose it.
  const suppressClick = useRef(false);
  const cancelPress = () => { if (press.current) window.clearTimeout(press.current.timer); press.current = undefined; };
  return <>{groups.map((group, groupIndex) => <div className="action-menu-group" key={`${group.label ?? 'commands'}-${groupIndex}`}>
    {groupIndex > 0 && <div className="action-menu-separator" role="separator" />}
    {group.label && <div className="action-menu-label" role="presentation">{group.label}</div>}
    {group.items.map((item) => {
      const notes = ([] as string[]).concat(item.note ?? []).filter(Boolean);
      const noteId = (index: number) => `${menuId}-${item.id}-note${index ? `-${index}` : ''}`;
      const context = item.contextGroups && onItemContext ? (element: HTMLButtonElement, point?: { x: number; y: number }) => onItemContext({ item, element, point }) : undefined;
      return <Fragment key={item.id}><button type="button" role={item.checked === undefined ? 'menuitem' : item.kind === 'checkbox' ? 'menuitemcheckbox' : 'menuitemradio'} aria-checked={item.checked} aria-describedby={notes.length ? notes.map((_, index) => noteId(index)).join(' ') : undefined} aria-haspopup={context ? 'menu' : undefined} className={[item.destructive && 'subtle-danger', item.checked && selectionStyle === 'highlight' && 'menu-item-selected'].filter(Boolean).join(' ') || undefined} disabled={item.disabled} title={item.title}
        onClick={(event) => { if (suppressClick.current) { suppressClick.current = false; return; } if (item.disabled) return; onChoose(item, { ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey }); }}
        onContextMenu={context && ((event) => { event.preventDefault(); cancelPress(); context(event.currentTarget, { x: event.clientX, y: event.clientY }); })}
        onKeyDown={context && ((event) => { if (!isContextMenuKey(event)) return; event.preventDefault(); event.stopPropagation(); context(event.currentTarget); })}
        onPointerDown={context && ((event) => { if (event.pointerType !== 'touch') return; cancelPress(); const element = event.currentTarget; const { clientX: x, clientY: y } = event; press.current = { x, y, timer: window.setTimeout(() => { press.current = undefined; suppressClick.current = true; context(element, { x, y }); }, LONG_PRESS_MS) }; })}
        onPointerMove={context && ((event) => { if (press.current && Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > LONG_PRESS_SLOP_PX) cancelPress(); })}
        onPointerUp={context && cancelPress} onPointerCancel={context && cancelPress}
      >{item.checked && selectionStyle === 'check' && <span className="menu-check" aria-hidden="true">✓</span>}<span className={item.wrapLabel ? 'menu-item-label menu-item-label--wrap' : 'menu-item-label'}>{item.label}</span></button>{notes.map((note, index) => <div className="action-menu-note" role="presentation" id={noteId(index)} key={index}>{note}</div>)}</Fragment>;
    })}
  </div>)}</>;
}
