import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

/** One choice of a segmented control. `text` is shown; `title` (when given) is the tooltip and the accessible name. */
export type SegmentOption = { value: string; text: string; title?: string };

/** The scope bar's narrow layout (responsive.css), below which a segmented control falls back to a native select (Decision 0059, rule 6). */
const NARROW_QUERY = '(max-width: 680px)';

function useNarrowLayout() {
  const query = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(NARROW_QUERY) : undefined;
  const [narrow, setNarrow] = useState(() => query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return narrow;
}

/**
 * A one-click scope selector with radio-group semantics and no visible label (Decision 0059). Arrow keys move and select, wrapping at the
 * ends; Home and End go to the first and last segment. `onChange` may be refused by the caller (an unsaved-draft prompt); the checked
 * segment always follows `value`. Below the narrow layout, or when `fallback` is set, the native select is shown instead.
 */
export function SegmentedControl({ label, options, value, onChange, fallback = false, className, disabled = false, title }: { disabled?: boolean; title?: string; label: string; options: SegmentOption[]; value: string; onChange: (value: string) => void; fallback?: boolean; className?: string }) {
  const narrow = useNarrowLayout();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  if (fallback || narrow) {
    return <select className="segmented-fallback" aria-label={label} disabled={disabled} title={title} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.title ?? option.text}</option>)}</select>;
  }
  const checkedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = options.length - 1;
    const target = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index === 0 ? last : index - 1)
        : event.key === 'Home' ? 0 : event.key === 'End' ? last : undefined;
    if (target === undefined) return;
    event.preventDefault();
    buttons.current[target]?.focus();
    if (options[target].value !== value) onChange(options[target].value);
  }
  return <div role="radiogroup" aria-label={label} aria-disabled={disabled || undefined} title={title} className={['segmented', className].filter(Boolean).join(' ')}>
    {options.map((option, index) => {
      const checked = option.value === value;
      return <button key={option.value} ref={(element) => { buttons.current[index] = element; }} type="button" role="radio" disabled={disabled} aria-checked={checked} tabIndex={index === checkedIndex ? 0 : -1} title={option.title} aria-label={option.title} data-value={option.value} className="segmented__segment" onClick={() => { if (!checked) onChange(option.value); }} onKeyDown={(event) => move(event, index)}>{option.text}</button>;
    })}
  </div>;
}
