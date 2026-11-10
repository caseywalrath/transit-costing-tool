import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { ContextMenu } from './ContextMenu';
import { MenuGroups, moveMenuFocus, type ContextRequest, type MenuGroup, type MenuItem, type MenuSelectEvent } from './menuItems';
import { rememberDialogInvoker } from './ModalDialog';

export type { MenuGroup, MenuItem, MenuSelectEvent } from './menuItems';

/** Compact, keyboard-operable action menu used by workspace headers. */
export function MenuButton({ label, menuLabel, groups, disabled = false, fieldLabel, triggerRef: externalTriggerRef, selectionStyle = 'check', triggerClassName, triggerAriaLabel, triggerContent, menuAlign = 'end', onTriggerModifierClick, fixedMenu = false, triggerTitle }: { label: string; menuLabel: string; groups: MenuGroup[]; disabled?: boolean; fieldLabel?: string; triggerRef?: { current: HTMLButtonElement | null }; selectionStyle?: 'check' | 'highlight'; triggerClassName?: string; triggerAriaLabel?: string; /** Replaces the label text inside the trigger (the header switchers show a caption and a name). */ triggerContent?: ReactNode; /** Which edge of the trigger the menu lines up with. */ menuAlign?: 'start' | 'end'; /** A click on the trigger with Ctrl or ⌘ held runs this and does not open the menu. */ onTriggerModifierClick?: () => void; /** Places the menu by window position, so a scrolling or clipping ancestor (the pinned table headings) cannot cut it off. The menu closes when the window scrolls or resizes. */ fixedMenu?: boolean; /** The trigger's tooltip (an icon-only trigger shows its accessible label instead). */ triggerTitle?: string }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number }>();
  const placeMenu = () => { const rect = fixedMenu ? triggerRef.current?.getBoundingClientRect() : undefined; if (rect) setAnchor({ top: rect.bottom + 3, left: rect.left }); };
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const items = groups.flatMap((group) => group.items);
  const focusItem = (index: number) => window.setTimeout(() => {
    const focusable = [...rootRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? []];
    focusable[Math.max(0, Math.min(index, focusable.length - 1))]?.focus();
  });
  // Focus goes back to the trigger at once, not in a later timer. A timer could fire after the next control had been focused, pull the focus
  // back to this trigger, and make the next ArrowDown open this menu instead of the one the planner (or a test) meant.
  const dismiss = (returnFocus = true) => { if (returnFocus) triggerRef.current?.focus(); setOpen(false); setContext(undefined); };
  // An item's context menu (Decision 0064): open beside the item, or at the pointer. The parent menu stays open under it.
  const [context, setContext] = useState<ContextRequest & { point: { x: number; y: number } }>();
  const openContext = ({ item, element, point }: ContextRequest) => { const rect = element.getBoundingClientRect(); setContext({ item, element, point: point ?? { x: rect.right, y: rect.top } }); };
  const choose = (item: MenuItem, event: MenuSelectEvent) => {
    // A dialog that the item opens must keep the focus it takes, and return it to this trigger when it closes.
    rememberDialogInvoker(triggerRef.current);
    dismiss(false); item.onSelect(event);
    if (item.restoreFocus !== false) window.setTimeout(() => { const active = document.activeElement; if (!active || active === document.body || rootRef.current?.contains(active)) triggerRef.current?.focus(); });
  };
  const iconOnly = label === 'Actions';
  const accessibleLabel = triggerAriaLabel ?? (iconOnly ? menuLabel : undefined);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => { const target = event.target as globalThis.Node; if (!rootRef.current?.contains(target) && !(target instanceof Element && target.closest('[data-menu-layer]'))) dismiss(false); };
    const onMove = () => dismiss(false);
    document.addEventListener('pointerdown', onPointerDown);
    if (fixedMenu) { window.addEventListener('scroll', onMove, true); window.addEventListener('resize', onMove); }
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      if (fixedMenu) { window.removeEventListener('scroll', onMove, true); window.removeEventListener('resize', onMove); }
    };
  }, [open]);

  return <div className={fieldLabel ? 'menu-button menu-field' : 'menu-button'} ref={rootRef}>
    {fieldLabel && <span className="menu-field-label">{fieldLabel}</span>}
    <button ref={(node) => { triggerRef.current = node; if (externalTriggerRef) externalTriggerRef.current = node; }} type="button" className={['menu-trigger', iconOnly && 'menu-trigger--icon', triggerClassName].filter(Boolean).join(' ')} aria-label={accessibleLabel} title={iconOnly ? accessibleLabel : triggerTitle} aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} disabled={disabled} onClick={(event) => { if (onTriggerModifierClick && (event.ctrlKey || event.metaKey)) { onTriggerModifierClick(); return; } placeMenu(); setOpen((current) => !current); }} onKeyDown={(event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); placeMenu(); setOpen(true); focusItem(event.key === 'ArrowDown' ? 0 : items.length - 1); }
      if (event.key === 'Escape' && open) { event.preventDefault(); dismiss(); }
      if (event.key === 'Tab' && open) setOpen(false);
    }}>{iconOnly ? <EllipsisIcon /> : <>{triggerContent ?? label}<span aria-hidden="true" className="menu-chevron"> ▾</span></>}</button>
    {open && <div id={menuId} className={menuAlign === 'start' ? 'action-menu action-menu--start' : 'action-menu'} role="menu" aria-label={menuLabel} style={fixedMenu && anchor ? { position: 'fixed', top: anchor.top, left: anchor.left, right: 'auto' } : undefined} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
      // Tab leaves the menu: close it and let the browser move on from the trigger (WAI-ARIA menu button pattern).
      if (event.key === 'Tab') { triggerRef.current?.focus(); setOpen(false); }
      moveMenuFocus(event, rootRef.current);
    }}><MenuGroups groups={groups} menuId={menuId} selectionStyle={selectionStyle} onChoose={choose} onItemContext={openContext} /></div>}
    {open && context && <ContextMenu heading={context.item.contextHeading ?? context.item.label} groups={context.item.contextGroups?.() ?? []} point={context.point} onChoose={choose}
      onClose={(returnFocus) => { const element = context.element; setContext(undefined); if (returnFocus) element.focus(); }} />}
  </div>;
}

function EllipsisIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="1.75" /><circle cx="12" cy="12" r="1.75" /><circle cx="19" cy="12" r="1.75" /></svg>;
}
