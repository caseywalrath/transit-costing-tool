import type { MenuItem } from '../menuItems';

/**
 * One command of a selection bar, drawn from the same `MenuItem` as the matching context-menu item (Decision 0066 rule 5), so the label,
 * disabled state and reason cannot differ between the two.
 */
export function CommandButton({ item, className }: { item: MenuItem; className?: string }) {
  return <button type="button" className={className ?? (item.destructive ? 'subtle-danger' : undefined)} disabled={item.disabled} title={item.title}
    onClick={(event) => item.onSelect({ ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey })}>{item.label}</button>;
}
