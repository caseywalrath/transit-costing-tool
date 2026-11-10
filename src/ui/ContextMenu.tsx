import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MenuGroups, moveMenuFocus, type MenuGroup, type MenuItem, type MenuSelectEvent } from './menuItems';

const EDGE_PX = 8;

/**
 * A context menu (Decision 0064 item 7): the object's name as a heading, then its action groups. It is placed by window position at
 * `point`, kept inside the window, and rendered into `document.body` marked `data-menu-layer`, so an open parent menu can tell its
 * clicks apart. It takes focus on open. Escape and Tab close it with focus back on the element that opened it; a click outside, a
 * scroll, or a resize closes it without moving focus. Every key is stopped here, so a parent menu does not also act on it.
 */
export function ContextMenu({ heading, groups, point, onChoose, onClose }: { heading: string; groups: MenuGroup[]; point: { x: number; y: number }; onChoose: (item: MenuItem, event: MenuSelectEvent) => void; onClose: (returnFocus: boolean) => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [position, setPosition] = useState(point);

  useLayoutEffect(() => {
    const rect = menuRef.current?.getBoundingClientRect();
    if (rect) setPosition({ x: Math.max(EDGE_PX, Math.min(point.x, window.innerWidth - rect.width - EDGE_PX)), y: Math.max(EDGE_PX, Math.min(point.y, window.innerHeight - rect.height - EDGE_PX)) });
    menuRef.current?.querySelector<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')?.focus();
  }, [point.x, point.y]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as globalThis.Node)) onClose(false); };
    const onMove = (event: Event) => { if (!menuRef.current?.contains(event.target as globalThis.Node)) onClose(false); };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => { document.removeEventListener('pointerdown', onPointerDown, true); window.removeEventListener('scroll', onMove, true); window.removeEventListener('resize', onMove); };
  }, [onClose]);

  return createPortal(<div ref={menuRef} id={menuId} data-menu-layer="" className="action-menu action-menu--context" role="menu" aria-label={`${heading} actions`} style={{ left: position.x, top: position.y }}
    onContextMenu={(event) => event.preventDefault()}
    onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); onClose(true); return; }
      moveMenuFocus(event, menuRef.current);
    }}>
    <div className="action-menu-label action-menu-heading" role="presentation">{heading}</div>
    <MenuGroups groups={groups} menuId={menuId} selectionStyle="check" onChoose={onChoose} />
  </div>, document.body);
}
