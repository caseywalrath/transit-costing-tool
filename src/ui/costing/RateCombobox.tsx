import { useEffect, useId, useRef, useState } from 'react';
import { formatMoney } from '../format';
import type { RateHistoryEntry } from '../preferences';

type Props = {
  /** Visible label text; the input is named by `ariaLabel`. */
  label: string;
  ariaLabel: string;
  value: number | undefined;
  /** Typed rate, or `undefined` when the box is emptied. */
  onValueChange: (rate: number | undefined) => void;
  history: readonly RateHistoryEntry[];
  /** A recent entry was picked: the caller sets Rate, Rate year, and Source together. */
  onPick: (entry: RateHistoryEntry) => void;
  invalidProps?: Record<string, unknown>;
};

/** The number a typed draft stands for; an empty draft or a lone "." is no value. */
const parseDraft = (text: string) => text === '' || text === '.' ? undefined : Number(text);
const sourceName =(entry: RateHistoryEntry) => entry.sourceType === 'ntd' ? 'NTD' : 'User entered';
export const rateEntryLabel = (entry: RateHistoryEntry) => `${formatMoney(entry.rate, { cents: true })} · ${entry.rateYear} · ${sourceName(entry)}`;

/**
 * A text box with a list of recent rates (Decision 0061), the ARIA 1.2 editable combobox with a list popup. Typing never filters or
 * changes the list; the arrow button, ArrowDown, and Alt+ArrowDown open it. A picked entry fills the rate, its year, and its source.
 */
export function RateCombobox({ label, ariaLabel, value, onValueChange, history, onPick, invalidProps }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);

  // A value set from outside (a picked entry, Discard, a reload) replaces the draft; the draft's own parse does not.
  useEffect(() => {
    setDraft((current) => parseDraft(current) === value ? current : value === undefined ? '' : String(value));
  }, [value]);

  const hasHistory = history.length > 0;
  const close = () => { setOpen(false); setActive(-1); };
  const choose = (index: number) => { const entry = history[index]; if (entry) onPick(entry); close(); };

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      if (!hasHistory) return;
      event.preventDefault();
      if (!open) { setOpen(true); setActive(event.altKey ? -1 : 0); return; }
      setActive((index) => Math.min(history.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      if (!open) return;
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter' && open && active >= 0) {
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }

  return <div className="costing-field rate-combobox" ref={root} onBlur={(event) => { if (!root.current?.contains(event.relatedTarget as Node | null)) close(); }}>
    <label htmlFor={`${id}-input`}>{label}</label>
    <div className="rate-combobox__box">
      <input
        id={`${id}-input`}
        aria-label={ariaLabel}
        {...invalidProps}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-autocomplete="none"
        aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="Enter rate"
        value={draft}
        onKeyDown={onKeyDown}
        onChange={(event) => {
          const text = event.target.value;
          if (!/^\d*\.?\d*$/.test(text)) return;
          setDraft(text);
          onValueChange(parseDraft(text));
        }}
      />
      <button type="button" className="rate-combobox__toggle" tabIndex={-1} aria-label="Show recent rates" aria-expanded={open} aria-controls={listId} disabled={!hasHistory} title={hasHistory ? 'Recent rates' : 'Rates you save appear here'}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { if (open) close(); else { setOpen(true); setActive(-1); root.current?.querySelector('input')?.focus(); } }}>▾</button>
      {open && hasHistory && <ul className="rate-combobox__list" id={listId} role="listbox" aria-label="Recent rates">
        {history.map((entry, index) => <li key={`${entry.rate}-${entry.rateYear}-${entry.sourceType}`} id={`${id}-option-${index}`} role="option" aria-selected={index === active} className={index === active ? 'is-active' : undefined}
          onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(index)}>{rateEntryLabel(entry)}</li>)}
      </ul>}
    </div>
  </div>;
}
