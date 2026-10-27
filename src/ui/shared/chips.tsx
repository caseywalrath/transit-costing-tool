import type { MouseEvent } from 'react';

/** Compact label for a table cell, such as a pattern. A button only when `onClick` is given. */
export function Chip({ text, title, onClick, ariaLabel }: { text: string; title?: string; onClick?: (event: MouseEvent) => void; ariaLabel?: string }) {
  if (onClick) return <button type="button" className="chip chip--button" title={title ?? text} aria-label={ariaLabel} onClick={onClick}>{text}</button>;
  return <span className="chip" title={title ?? text} aria-label={ariaLabel}>{text}</span>;
}

/** Block label with a coloured dot on a neutral background. `colorToken` is a CSS custom property name such as `--color-block-0-text`. */
export function BlockPill({ label, colorToken }: { label: string; colorToken: string }) {
  return <span className="block-pill"><span className="block-pill__dot" aria-hidden="true" style={{ backgroundColor: `var(${colorToken})` }} />{label}</span>;
}
