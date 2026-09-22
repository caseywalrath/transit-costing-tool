import { useEffect, useId, useRef, useState } from 'react';

export type MenuItem = { id: string; label: string; onSelect: () => void; disabled?: boolean; title?: string; checked?: boolean; destructive?: boolean; restoreFocus?: boolean };
export type MenuGroup = { label?: string; items: MenuItem[] };

/** Compact, keyboard-operable action menu used by workspace headers. */
export function MenuButton({ label, menuLabel, groups, disabled = false, fieldLabel, triggerRef: externalTriggerRef, selectionStyle = 'check', triggerClassName, triggerAriaLabel }: { label: string; menuLabel: string; groups: MenuGroup[]; disabled?: boolean; fieldLabel?: string; triggerRef?: { current: HTMLButtonElement | null }; selectionStyle?: 'check' | 'highlight'; triggerClassName?: string; triggerAriaLabel?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const items = groups.flatMap((group) => group.items);
  const focusItem = (index: number) => window.setTimeout(() => {
    const focusable = [...rootRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? []];
    focusable[Math.max(0, Math.min(index, focusable.length - 1))]?.focus();
  });
  const dismiss = (returnFocus = true) => { setOpen(false); if (returnFocus) window.setTimeout(() => triggerRef.current?.focus()); };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as globalThis.Node)) dismiss(false); };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return <div className={fieldLabel ? 'menu-button menu-field' : 'menu-button'} ref={rootRef}>
    {fieldLabel && <span className="menu-field-label">{fieldLabel}</span>}
    <button ref={(node) => { triggerRef.current = node; if (externalTriggerRef) externalTriggerRef.current = node; }} type="button" className={['menu-trigger', triggerClassName].filter(Boolean).join(' ')} aria-label={triggerAriaLabel} aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} disabled={disabled} onClick={() => setOpen((current) => !current)} onKeyDown={(event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); focusItem(event.key === 'ArrowDown' ? 0 : items.length - 1); }
      if (event.key === 'Escape' && open) { event.preventDefault(); dismiss(); }
    }}>{label}<span aria-hidden="true"> ▾</span></button>
    {open && <div id={menuId} className="action-menu" role="menu" aria-label={menuLabel} onKeyDown={(event) => {
      const menuItems = [...rootRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? []];
      const current = menuItems.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
      if (event.key === 'Home') { event.preventDefault(); menuItems[0]?.focus(); }
      if (event.key === 'End') { event.preventDefault(); menuItems.at(-1)?.focus(); }
      if (event.key === 'ArrowDown') { event.preventDefault(); menuItems[(current + 1 + menuItems.length) % menuItems.length]?.focus(); }
      if (event.key === 'ArrowUp') { event.preventDefault(); menuItems[(current - 1 + menuItems.length) % menuItems.length]?.focus(); }
    }}>{groups.map((group, groupIndex) => <div className="action-menu-group" key={`${group.label ?? 'commands'}-${groupIndex}`}>
      {groupIndex > 0 && <div className="action-menu-separator" role="separator" />}
      {group.label && <div className="action-menu-label" role="presentation">{group.label}</div>}
      {group.items.map((item) => <button key={item.id} type="button" role={item.checked !== undefined ? 'menuitemradio' : 'menuitem'} aria-checked={item.checked} className={[item.destructive && 'subtle-danger', item.checked && selectionStyle === 'highlight' && 'menu-item-selected'].filter(Boolean).join(' ') || undefined} disabled={item.disabled} title={item.title} onClick={() => { if (item.disabled) return; dismiss(false); item.onSelect(); if (item.restoreFocus !== false) window.setTimeout(() => triggerRef.current?.focus()); }}>{item.checked && selectionStyle === 'check' && <span className="menu-check" aria-hidden="true">✓</span>}{item.label}</button>)}
    </div>)}</div>}
  </div>;
}
