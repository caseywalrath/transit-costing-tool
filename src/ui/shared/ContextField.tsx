import type { ReactNode } from 'react';

/** Inline-labelled control for the header's scope row. Wraps a native <select> or a read-only value. */
export function ContextField({ label, children, maxWidth }: { label: string; children: ReactNode; maxWidth?: number }) {
  return <label className="context-field" style={maxWidth === undefined ? undefined : { maxWidth }}><span className="context-field__label">{label}</span>{children}</label>;
}
