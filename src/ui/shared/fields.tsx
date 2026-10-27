import { cloneElement, isValidElement, type ReactElement, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { InlineNote } from './surfaces';

export function DurationField({ label, value, onChange, disabled = false, invalid = false, describedBy }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; invalid?: boolean; describedBy?: string }) { return <label className="dialog-field">{label}<input value={value} inputMode="decimal" disabled={disabled} aria-invalid={invalid} aria-describedby={invalid ? describedBy : undefined} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') event.currentTarget.blur(); }} /></label>; }
export function ClockField({ label, value, onChange, disabled = false, invalid = false, describedBy }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; invalid?: boolean; describedBy?: string }) { return <label className="dialog-field">{label}<input className="time-input" value={value} disabled={disabled} aria-invalid={invalid} aria-describedby={invalid ? describedBy : undefined} onChange={(event) => onChange(event.target.value)} /></label>; }

export function Field({ label, required, errors = [], wide, children }: { label: string; required?: boolean; errors?: string[]; wide?: boolean; children: ReactNode }) {
  const id = useId();
  // A field with an error says so to assistive technology: the control is invalid and described by its messages (finding 5-023).
  const control = errors.length && isValidElement(children) ? cloneElement(children as ReactElement<Record<string, unknown>>, { 'aria-invalid': true, 'aria-describedby': errors.map((_, index) => `${id}-error-${index}`).join(' ') }) : children;
  return <label className={wide ? 'wide' : ''}><span>{label}{required && <b aria-hidden="true"> *</b>}</span>{control}{errors.map((error, index) => <small className="field-error" id={`${id}-error-${index}`} key={error}>{error}</small>)}</label>;
}

/** `onCommit` may return the reason the value was refused; it is shown beside the field and the saved value stays. */
export function NumericCommit({ label, value, integer = false, step = '1', onCommit }: { label: string; value: number; integer?: boolean; step?: string; onCommit: (value: number) => Promise<string | void> | void }) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState('');
  // "✓ Saved" shows for 1.8 s after a commit the service accepted (UR-7b).
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(savedTimer.current), []);
  const cancelled = useRef(false);
  useEffect(() => { setDraft(String(value)); }, [value]);
  function commit() {
    if (cancelled.current) { cancelled.current = false; return; }
    const parsed = Number(draft);
    if (!draft.trim()) { setError('A value is required. Zero is valid.'); return; }
    if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed))) { setError(integer ? 'Enter a non-negative whole number.' : 'Enter a non-negative number.'); return; }
    setError('');
    const outcome = onCommit(parsed);
    if (outcome instanceof Promise) void outcome.then((refusal) => { if (refusal) setError(refusal); else { setSaved(true); window.clearTimeout(savedTimer.current); savedTimer.current = window.setTimeout(() => setSaved(false), 1800); } });
  }
  return <>{saved && <InlineNote kind="ok" live>Saved</InlineNote>}<input aria-label={label} aria-invalid={Boolean(error)} aria-describedby={error ? `${label.replaceAll(/[^a-z0-9]/gi, '-')}-error` : undefined} type="number" min="0" step={step} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { cancelled.current = true; setDraft(String(value)); setError(''); event.currentTarget.blur(); } }} />{error && <small id={`${label.replaceAll(/[^a-z0-9]/gi, '-')}-error`} className="field-error" role="alert">{error} Saved value remains {value}.</small>}</>;
}

/** The name field of a Service day. A refused name shows its reason beside the field and the saved name stays. */
export function ServiceDayNameInput({ name, onCommit }: { name: string; onCommit: (name: string) => Promise<string | undefined> }) {
  const [error, setError] = useState('');
  const errorId = useId();
  return <><input aria-label={`${name} name`} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} defaultValue={name} onBlur={(event) => void onCommit(event.target.value).then((refusal) => setError(refusal ?? ''))} />{error && <small id={errorId} className="field-error" role="alert">{error} Saved name remains {name}.</small>}</>;
}
