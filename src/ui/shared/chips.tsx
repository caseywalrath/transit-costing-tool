import type { MouseEvent } from 'react';

/** Compact label for a table cell, such as a pattern. A button only when `onClick` is given. */
export function Chip({ text, title, onClick, ariaLabel }: { text: string; title?: string; onClick?: (event: MouseEvent) => void; ariaLabel?: string }) {
  if (onClick) return <button type="button" className="chip chip--button" title={title ?? text} aria-label={ariaLabel} onClick={onClick}>{text}</button>;
  return <span className="chip" title={title ?? text} aria-label={ariaLabel}>{text}</span>;
}

/** The dot colour of a Block: one of six, chosen by hashing its label so a Block keeps its colour. Returns a CSS custom property name. */
export function blockColorToken(label: string) { let hash = 0; for (const character of label) hash = (hash * 31 + character.charCodeAt(0)) >>> 0; return `--color-block-${hash % 6}-text`; }

/** The dot and the label inside a Block pill. A button that looks like a pill (the Trips Block menu) wraps this in its own element. */
export function BlockPillContent({ label, colorToken }: { label: string; colorToken: string }) {
  return <><span className="block-pill__dot" aria-hidden="true" style={{ backgroundColor: `var(${colorToken})` }} />{label}</>;
}

/** Block label with a coloured dot on a neutral background. `colorToken` is a CSS custom property name such as `--color-block-0-text`. */
export function BlockPill({ label, colorToken }: { label: string; colorToken: string }) {
  return <span className="block-pill"><BlockPillContent label={label} colorToken={colorToken} /></span>;
}
