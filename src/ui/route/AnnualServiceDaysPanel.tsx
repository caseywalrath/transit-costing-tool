import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { MAX_ANNUAL_SERVICE_DAYS } from '../../domain/costing';
import { defaultServiceDayAbbreviation } from '../../domain/serviceDays';
import { sortServiceDays } from '../../application/tripsWorkspaceView';
import type { Route, RouteOwnAnnualServiceDays, ServiceDayDefinition } from '../../domain/types';
import { ModalDialog } from '../ModalDialog';
import { NumericCommit, ServiceDayAbbreviationInput, ServiceDayNameInput } from '../shared/fields';
import { SupportPanel } from '../shared/surfaces';
import { ownCountsOf, ownCountsTotal, withOwnCount } from './ownCounts';

type ServiceDayField = 'name' | 'abbreviation' | 'annualServiceDays';

/**
 * One cell of the "This route" column. A blank cell shows the Scenario's count faintly and means "use the Scenario's" (Decision 0077's
 * inherited style); a whole number of 0 or more is the Route's own count. It commits on blur and Enter; Escape restores the saved value.
 */
function OwnCountInput({ label, saved, inherited, onCommit }: { label: string; saved: number | undefined; inherited: number; onCommit: (value: number | undefined) => Promise<string | undefined> }) {
  const [draft, setDraft] = useState(saved === undefined ? '' : String(saved));
  const [error, setError] = useState('');
  const cancelled = useRef(false);
  const errorId = useId();
  useEffect(() => { setDraft(saved === undefined ? '' : String(saved)); }, [saved]);
  async function commit() {
    if (cancelled.current) { cancelled.current = false; return; }
    const text = draft.trim();
    const value = text === '' ? undefined : Number(text);
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) { setError('Enter a whole number of 0 or more, or leave it blank.'); return; }
    if (value === saved) { setError(''); return; }
    const refusal = await onCommit(value);
    setError(refusal ?? '');
    if (refusal) setDraft(saved === undefined ? '' : String(saved));
  }
  return <>
    <input className="own-count-input" type="number" min="0" step="1" aria-label={label} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}
      placeholder={String(inherited)} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => void commit()}
      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { cancelled.current = true; setDraft(saved === undefined ? '' : String(saved)); setError(''); event.currentTarget.blur(); } }} />
    {error && <small id={errorId} className="field-error" role="alert">{error}</small>}
  </>;
}

/** Decision 0089 item 43: a custom Service day has a name and an abbreviation and starts at 0 annual service days. */
function AddServiceDayDialog({ onAdd, onClose }: { onAdd: (name: string, abbreviation: string) => Promise<string | undefined>; onClose: () => void }) {
  const [name, setName] = useState('');
  const [abbreviation, setAbbreviation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const errorId = useId();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) { setError('Enter a service day name.'); return; }
    setBusy(true);
    const refusal = await onAdd(name, abbreviation);
    setBusy(false);
    if (refusal) setError(refusal); else onClose();
  }
  return <ModalDialog as="form" labelledBy="add-service-day-title" className="confirm-dialog" busy={busy} onSubmit={(event) => void submit(event)} onClose={onClose}>
    <h2 id="add-service-day-title">Add service day</h2>
    <label className="dialog-field"><span>Name</span><input autoFocus value={name} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} onChange={(event) => { setName(event.target.value); setError(''); }} /></label>
    <label className="dialog-field"><span>Abbreviation (optional, 1 to 3 letters or digits)</span><input maxLength={3} value={abbreviation} onChange={(event) => { setAbbreviation(event.target.value); setError(''); }} /></label>
    <p className="service-days-hint">The new day starts at 0 annual service days. Set its count in the table.</p>
    {error && <p id={errorId} className="field-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit" disabled={busy}>Add service day</button></div>
  </ModalDialog>;
}

/**
 * The Route tab's Annual service days panel: the Scenario's counts, and, when the Route uses its own counts, a second column for this
 * Route (Decision 0089 items 41 and 43; plan U1 and U3). Every save goes through the callbacks, which return the reason a value was refused.
 */
export function AnnualServiceDaysPanel({ route, serviceDays, onEditServiceDay, onSaveOwnCounts, onAddServiceDay }: {
  route: Route;
  serviceDays: ServiceDayDefinition[];
  onEditServiceDay: (id: string, patch: Partial<ServiceDayDefinition>, field: ServiceDayField) => Promise<string | undefined>;
  onSaveOwnCounts: (own: RouteOwnAnnualServiceDays) => Promise<string | undefined>;
  onAddServiceDay: (name: string, abbreviation: string) => Promise<string | undefined>;
}) {
  const own = ownCountsOf(route);
  const [addOpen, setAddOpen] = useState(false);
  const [switchError, setSwitchError] = useState('');
  const addButton = useRef<HTMLButtonElement>(null);
  const scenarioTotal = serviceDays.reduce((sum, day) => sum + day.annualServiceDays, 0);
  const routeTotal = ownCountsTotal(serviceDays, own);
  async function toggle(enabled: boolean) { setSwitchError((await onSaveOwnCounts({ ...own, enabled })) ?? ''); }
  function closeAdd() { setAddOpen(false); window.setTimeout(() => addButton.current?.focus()); }
  return <SupportPanel title="Annual service days">
    <label className="own-counts-switch"><input type="checkbox" role="switch" checked={own.enabled} onChange={(event) => void toggle(event.target.checked)} /> This route uses its own counts</label>
    {switchError && <small className="field-error" role="alert">{switchError}</small>}
    <div className="table-scroll service-days-table">
      <table className={own.enabled ? 'service-days-table--own' : undefined}>
        <thead><tr><th scope="col">Service day</th><th scope="col" title="Abbreviation"><span aria-hidden="true">Abbr.</span><span className="visually-hidden">Abbreviation</span></th><th scope="col">{own.enabled ? 'Scenario' : 'Annual service days'}</th>{own.enabled && <th scope="col">This route</th>}</tr></thead>
        <tbody>{sortServiceDays(serviceDays).map((day) => <tr key={day.id}>
          <td><ServiceDayNameInput name={day.name} onCommit={(value) => onEditServiceDay(day.id, { name: value }, 'name')} /></td>
          <td><ServiceDayAbbreviationInput dayName={day.name} saved={day.abbreviation} placeholder={defaultServiceDayAbbreviation(day)} onCommit={(value) => onEditServiceDay(day.id, { abbreviation: value }, 'abbreviation')} /></td>
          <td><NumericCommit label={`${day.name} annual service days`} value={day.annualServiceDays} integer blankAsZero onCommit={(value) => onEditServiceDay(day.id, { annualServiceDays: value }, 'annualServiceDays')} /></td>
          {own.enabled && <td><OwnCountInput label={`${day.name} annual service days for this route`} saved={own.countsByServiceDayId[day.id]} inherited={day.annualServiceDays} onCommit={(value) => onSaveOwnCounts(withOwnCount(own, day.id, value))} /></td>}
        </tr>)}</tbody>
      </table>
    </div>
    <p className={scenarioTotal > MAX_ANNUAL_SERVICE_DAYS ? 'service-days-total value-invalid' : 'service-days-total'}>Total <b>{scenarioTotal}</b> of {MAX_ANNUAL_SERVICE_DAYS}</p>
    {own.enabled && <p className={routeTotal > MAX_ANNUAL_SERVICE_DAYS ? 'service-days-total value-invalid' : 'service-days-total'}>This route <b>{routeTotal}</b> of {MAX_ANNUAL_SERVICE_DAYS}</p>}
    <button type="button" ref={addButton} className="ghost service-days-add" onClick={() => setAddOpen(true)}><span aria-hidden="true">+ </span>Add service day…</button>
    {addOpen && <AddServiceDayDialog onAdd={onAddServiceDay} onClose={closeAdd} />}
  </SupportPanel>;
}
