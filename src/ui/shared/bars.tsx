import type { ReactNode } from 'react';

/** Shown only while `changeCount > 0` or `visible`. Sticky to the bottom of its WorkSurface. The caller decides when to render it. */
export function SaveBar({ message, saveLabel, busy = false, saveDisabled = false, saveTitle, onSave, onDiscard }: { message: string; saveLabel: string; busy?: boolean; saveDisabled?: boolean; saveTitle?: string; onSave: () => void; onDiscard: () => void }) {
  return <div className="save-bar" role="region" aria-label="Unsaved changes">
    <span className="save-bar__message" role="status">{message}</span>
    <button type="button" disabled={busy} onClick={onDiscard}>Discard</button>
    <button type="button" className="primary" disabled={busy || saveDisabled} title={saveTitle} onClick={onSave}>{saveLabel}</button>
  </div>;
}

/** Shown while one or more rows are selected. `role="toolbar"`, labelled `ariaLabel` or "<noun> actions". The count reads "2 trips selected". */
export function SelectionBar({ count, noun, ariaLabel, onClear, children }: { count: number; noun: string; ariaLabel?: string; onClear: () => void; children: ReactNode }) {
  return <div className="selection-bar" role="toolbar" aria-label={ariaLabel ?? `${noun} actions`}>
    <b className="selection-bar__count">{count} {noun}{count === 1 ? '' : 's'} selected</b>
    {children}
    <button type="button" className="ghost" onClick={onClear}>Clear</button>
  </div>;
}
