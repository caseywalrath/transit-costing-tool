import { useCallback, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { ContextMenu } from './ContextMenu';
import { isContextMenuKey, type MenuGroup, type MenuItem, type MenuSelectEvent } from './menuItems';

/** What a target resolves to when its menu opens: the heading and the groups. `undefined` keeps the browser's menu. */
export type ContextMenuContent = { heading: string; groups: MenuGroup[] };
export type ContextMenuResolve = () => ContextMenuContent | undefined;

const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 10;
const FIELD_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const FOCUSABLE_SELECTOR = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

type OpenMenu = ContextMenuContent & { point: { x: number; y: number }; returnTo: HTMLElement | null };

/** Decision 0066 rule 3: fields, menus and selected text inside the target keep the browser's own menu. */
function keepsBrowserMenu(target: EventTarget | null, container: HTMLElement): boolean {
  if (target instanceof Element && (target.closest(FIELD_SELECTOR) || target.closest('[role="menu"]'))) return true;
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.anchorNode && container.contains(selection.anchorNode));
}

/**
 * A context menu on an element that is not a menu item, usually a table row (Decision 0066). `target(resolve)` returns handlers to spread
 * on the element: right-click, Shift+F10 or the ContextMenu key on a control inside it, or a 500 ms touch press opens the menu that
 * `resolve` returns. `menu` is the open menu, rendered once by the caller. Escape and Tab return focus to the control that opened it.
 */
export function useContextMenu(): { target: (resolve: ContextMenuResolve) => {
  onContextMenu: (event: MouseEvent<HTMLElement>) => void; onKeyDown: (event: KeyboardEvent<HTMLElement>) => void; onClickCapture: (event: MouseEvent<HTMLElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void; onPointerMove: (event: PointerEvent<HTMLElement>) => void; onPointerUp: () => void; onPointerCancel: () => void;
}; menu: ReactNode } {
  const [open, setOpen] = useState<OpenMenu | undefined>(undefined);
  const press = useRef<{ timer: number; x: number; y: number } | undefined>(undefined);
  // A long press that opened the menu ends with a click on the same element; that click must not also act.
  const suppressClick = useRef(false);
  const cancelPress = useCallback(() => { if (press.current) window.clearTimeout(press.current.timer); press.current = undefined; }, []);

  const show = (resolve: ContextMenuResolve, point: { x: number; y: number }, returnTo: HTMLElement | null): boolean => {
    const content = resolve();
    if (!content) return false;
    setOpen({ ...content, point, returnTo });
    return true;
  };

  const target = (resolve: ContextMenuResolve) => ({
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      cancelPress();
      if (event.shiftKey || keepsBrowserMenu(event.target, event.currentTarget)) return;
      const container = event.currentTarget;
      const returnTo = container.contains(document.activeElement) && document.activeElement !== document.body ? document.activeElement as HTMLElement : container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (show(resolve, { x: event.clientX, y: event.clientY }, returnTo)) event.preventDefault();
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (!isContextMenuKey(event) || keepsBrowserMenu(event.target, event.currentTarget)) return;
      const focused = event.target instanceof HTMLElement ? event.target : null;
      const rect = (focused ?? event.currentTarget).getBoundingClientRect();
      if (show(resolve, { x: rect.left, y: rect.bottom }, focused)) { event.preventDefault(); event.stopPropagation(); }
    },
    onClickCapture: (event: MouseEvent<HTMLElement>) => { if (!suppressClick.current) return; suppressClick.current = false; event.preventDefault(); event.stopPropagation(); },
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch') return;
      cancelPress();
      suppressClick.current = false;
      if (keepsBrowserMenu(event.target, event.currentTarget)) return;
      const container = event.currentTarget;
      const { clientX: x, clientY: y } = event;
      press.current = { x, y, timer: window.setTimeout(() => {
        press.current = undefined;
        if (show(resolve, { x, y }, container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR))) suppressClick.current = true;
      }, LONG_PRESS_MS) };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => { if (press.current && Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > LONG_PRESS_SLOP_PX) cancelPress(); },
    onPointerUp: cancelPress,
    onPointerCancel: cancelPress,
  });

  const returnTo = useRef<HTMLElement | null>(null);
  returnTo.current = open?.returnTo ?? null;
  const close = useCallback((returnFocus: boolean) => {
    const element = returnTo.current;
    setOpen(undefined);
    if (returnFocus && element?.isConnected) element.focus();
  }, []);
  const choose = (item: MenuItem, event: MenuSelectEvent) => { setOpen(undefined); item.onSelect(event); };

  const menu = open ? <ContextMenu heading={open.heading} groups={open.groups} point={open.point} onChoose={choose} onClose={close} /> : null;
  return { target, menu };
}
