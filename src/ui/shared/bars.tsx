import type { ReactNode } from 'react';

/** Shown only while `changeCount > 0` or `visible`. Sticky to the bottom of its WorkSurface. The caller decides when to render it. */
export function SaveBar({ message, saveLabel, busy = false, saveDisabled = false, saveTitle, onSave, onDiscard }: { message: string; saveLabel: string; busy?: boolean; saveDisabled?: boolean; saveTitle?: string; onSave: () => void; onDiscard: () => void }) {
  return <div className="save-bar" role="region" aria-label="Unsaved changes">
    <span className="save-bar__message" role="status">{message}</span>
    <button type="button" disabled={busy} onClick={onDiscard}>Discard</button>
    <button type="button" className="primary" disabled={busy || saveDisabled} title={saveTitle} onClick={onSave}>{saveLabel}</button>
  </div>;
}

/** Shown while one or more rows are selected. `role="toolbar"`, labelled "<noun> actions". */
export function SelectionBar({ count, noun, onClear, children }: { count: number; noun: string; onClear: () => void; children: ReactNode }) {
  return <div className="selection-bar" role="toolbar" aria-label={`${noun} actions`}>
    <b className="selection-bar__count">{count} selected</b>
    {children}
    <button type="button" className="ghost" onClick={onClear}>Clear</button>
  </div>;
}
