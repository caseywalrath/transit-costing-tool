import type { ReactNode } from 'react';

/** Inline-labelled control for the header's scope row. Wraps a native <select> or a read-only value. Without a label (Decision 0059, the
 * Day and Direction selectors) it only provides the field's spacing and select styling; the control carries its own `aria-label`. */
export function ContextField({ label, children, maxWidth }: { label?: string; children: ReactNode; maxWidth?: number }) {
  const style = maxWidth === undefined ? undefined : { maxWidth };
  if (label === undefined) return <div className="context-field" style={style}>{children}</div>;
  return <label className="context-field" style={style}><span className="context-field__label">{label}</span>{children}</label>;
}
