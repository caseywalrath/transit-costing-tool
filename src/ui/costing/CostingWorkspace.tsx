import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CostingCommands, CostingQueries } from '../../application/ports';
import { ModalDialog } from '../ModalDialog';
import type { CostingAssumptionsInput, CostingBlockExclusionReason, CostingCalculationResult } from '../../domain/costing';
import { DEFAULT_COSTING_ESCALATION } from '../../domain/costing';
import { formatHours, formatMoney } from '../format';
import type { BlockingScenario, CostingAssumptions, Scenario, ServiceDayDefinition, TripProfile, ValidationFinding } from '../../domain/types';
import { createCsvArchive } from '../../application/csvDownload';
import { ContextField } from '../shared/ContextField';
import { InlineNote, SupportPanel, WorkSurface } from '../shared/surfaces';
import { SaveBar } from '../shared/bars';
import { countAssumptionChanges } from '../../application/draftChangeCounts';

type Props = {
  /** The element in the header's scope bar that receives the scope selectors (UR-5). */
  scopeSlot: HTMLElement | null;
  costingService: CostingCommands & CostingQueries;
  scenario: Scenario;
  serviceDays: ServiceDayDefinition[];
  tripProfiles: TripProfile[];
  onError: (error: unknown, fallback?: string) => void;
  onRegisterNavigationGuard: (guard: ((action: () => void) => void) | undefined) => void;
};

const reasonLabels: Record<CostingBlockExclusionReason, string> = {
  'block.noRevenueTrips': 'No revenue trips',
  'block.summaryMissing': 'Block summary unavailable',
  'block.summaryAmbiguous': 'Multiple block summaries',
  'block.sourceMismatch': 'Source data mismatch',
  'block.invalid': 'Invalid block',
  'block.connectionIncomplete': 'Incomplete connection',
  'block.connectionConflict': 'Connection conflict',
  'block.connectionSummaryMissing': 'Connection summary unavailable',
  'block.platformBoundariesMissing': 'Pull-out or pull-in missing',
  'block.platformBoundariesInvalid': 'Invalid platform boundaries',
  'block.revenueHoursInvalid': 'Invalid Revenue Hours',
  'block.platformHoursInvalid': 'Invalid Platform Hours',
};

const BLOCKING_REVIEW = 'Open Blocking and review the Blocking Scenario.';

/**
 * The text for one finding of an invalid Costing estimate (review issue I-031). `serviceDayName` names the service day that a finding
 * identifies by id, when the screen knows it. Every message ends with what the planner can do next.
 */
export function costingFindingMessage(finding: ValidationFinding, serviceDayName?: (id: string) => string | undefined): string {
  const day = (id: string | undefined) => (id ? serviceDayName?.(id) : undefined) ?? 'a service day';
  switch (finding.messageKey) {
    case 'costing.annualServiceDaysExceed365': return 'Annual service days total more than 365. Correct the counts in the Service days table on the Route screen.';
    case 'costing.annualServiceDaysInvalid': return `${day(finding.entityId)} has an annual count that is not a whole number of 0 or more. Correct it in the Service days table on the Route screen.`;
    case 'costing.duplicateServiceDay': case 'costing.serviceDayScenarioMismatch': return 'The service days of this Scenario are inconsistent. Reload the page. If this stays, export a backup and import it again.';
    case 'costing.blockingScenarioMismatch': return 'The selected Blocking Scenario belongs to another Scenario. Select a Blocking Scenario of this Scenario.';
    case 'costing.tripProfileMismatch': return `The Blocking Scenario and its Trip Profile do not match. ${BLOCKING_REVIEW}`;
    case 'costing.duplicateTrip': return `A Trip is stored twice in the Blocking Scenario's source. ${BLOCKING_REVIEW}`;
    case 'costing.duplicateBlock': return `A Block is stored twice in the Blocking Scenario. ${BLOCKING_REVIEW}`;
    case 'costing.tripSourceMismatch': return `A Trip does not belong to ${day(String(finding.parameters?.serviceDayId ?? ''))}, which its Block names. ${BLOCKING_REVIEW}`;
    case 'costing.blockSourceMismatch': return `A Block of ${day(String(finding.parameters?.serviceDayId ?? ''))} does not match the Blocking Scenario's source. ${BLOCKING_REVIEW}`;
    case 'costing.adjustedRateInvalid': return 'The Inflation Rate gives a cost per Revenue Hour that cannot be used. Change the Inflation Rate.';
    case 'costing.calculationOverflow': return 'The estimate is too large to calculate. Check the rate and the number of years.';
    case 'costing.rateInvalid': return 'Enter an operating cost per Revenue Hour of 0 or more.';
    case 'costing.rateYearInvalid': return 'Enter a rate year from 1 to 9999.';
    case 'costing.baseServiceYearInvalid': return 'Enter a First Year of Service from 1 to 9999.';
    case 'costing.rateYearAfterBaseServiceYear': return 'The rate year cannot be later than the base service year.';
    case 'costing.futureYearCountInvalid': return 'Enter Future Years as a whole number from 0 to 10.';
    case 'costing.projectionYearOutOfRange': return 'The last projected year must not be later than 9999. Lower the First Year of Service or Future Years.';
    case 'costing.annualEscalationInvalid': return 'Enter an Inflation Rate above −100%.';
    default: return 'Review this item and correct it before trying again.';
  }
}

const plural = (count: number, singular: string) => `${count} ${singular}${count === 1 ? '' : 's'}`;

function initialAssumptions(baseYear = new Date().getFullYear()): CostingAssumptionsInput {
  return { rateYear: baseYear, sourceType: 'user', baseServiceYear: baseYear, futureYearCount: 10, annualEscalation: DEFAULT_COSTING_ESCALATION };
}

function toInput(record: CostingAssumptions): CostingAssumptionsInput {
  return {
    ...(record.enteredRate === undefined ? {} : { enteredRate: record.enteredRate }),
    rateYear: record.rateYear,
    sourceType: record.sourceType,
    ...(record.sourceNote === undefined ? {} : { sourceNote: record.sourceNote }),
    baseServiceYear: record.baseServiceYear,
    futureYearCount: record.futureYearCount,
    annualEscalation: record.annualEscalation,
  };
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const dailyHours = (value: number) => formatHours(value, 'daily');
const annualHours = (value: number) => formatHours(value, 'annual');
const rate = (value: number) => formatMoney(value, { cents: true });
const money = (value: number) => formatMoney(value);

export function CostingWorkspace({ scopeSlot, costingService, scenario, serviceDays, tripProfiles, onError, onRegisterNavigationGuard }: Props) {
  const [blockingScenarios, setBlockingScenarios] = useState<BlockingScenario[]>([]);
  const [blockingScenarioId, setBlockingScenarioId] = useState('');
  const [assumptions, setAssumptions] = useState<CostingAssumptionsInput>(() => initialAssumptions());
  const [loadedAssumptions, setLoadedAssumptions] = useState<CostingAssumptionsInput>();
  const [persisted, setPersisted] = useState<CostingAssumptions>();
  const [result, setResult] = useState<CostingCalculationResult>();
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [busy, setBusy] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [navigationDialog, setNavigationDialog] = useState<{ action: () => void }>();
  const estimateHeading = useRef<HTMLHeadingElement>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const validation = useMemo(() => costingService.validateAssumptions(assumptions), [assumptions, costingService]);
  // An input that a finding names is invalid and points at the alert (finding 5-023).
  const invalidField = (field: string) => validation.some((finding) => finding.field === field);
  const invalidProps = (field: string) => invalidField(field) ? { 'aria-invalid': true as const, 'aria-describedby': 'costing-assumptions-alert' } : {};
  const dirty = persisted ? JSON.stringify(toInput(persisted)) !== JSON.stringify(assumptions) : true;
  const hasUnsavedAssumptions = loadedAssumptions !== undefined && JSON.stringify(loadedAssumptions) !== JSON.stringify(assumptions);
  const hasUnsavedAssumptionsRef = useRef(false);
  hasUnsavedAssumptionsRef.current = hasUnsavedAssumptions;
  const tripProfile = tripProfiles.find((profile) => profile.id === blockingScenarios.find((item) => item.id === blockingScenarioId)?.tripProfileId);
  const years = costingService.listServiceYears(assumptions);
  const selectedYear = years.includes(viewYear) ? viewYear : years[0];
  const selectedYearResult = result?.yearRows.find((row) => row.serviceYear === selectedYear);

  useEffect(() => {
    let current = true;
    setBusy(true);
    Promise.all([costingService.listBlockingScenarios(scenario.id), costingService.loadAssumptions(scenario.id)])
      .then(([nextScenarios, stored]) => {
        if (!current) return;
        setBlockingScenarios(nextScenarios);
        setBlockingScenarioId((selected) => nextScenarios.some((item) => item.id === selected) ? selected : nextScenarios[0]?.id ?? '');
        const next = stored ? toInput(stored) : initialAssumptions();
        setPersisted(stored);
        setLoadedAssumptions(next);
        setAssumptions(next);
        setViewYear(next.baseServiceYear);
      })
      .catch((error) => onErrorRef.current(error, 'Unable to load Costing.'))
      .finally(() => current && setBusy(false));
    return () => { current = false; };
  }, [costingService, scenario.id]);

  useEffect(() => {
    if (!blockingScenarioId || validation.some((finding) => finding.severity === 'error')) { setResult(undefined); setCalculating(false); return; }
    let current = true;
    setCalculating(true);
    void costingService.calculateEstimate({ scenarioId: scenario.id, blockingScenarioId, assumptions })
      .then((next) => { if (current) setResult(next); })
      .catch((error) => onErrorRef.current(error, 'Unable to calculate the cost estimate.'))
      .finally(() => { if (current) setCalculating(false); });
    return () => { current = false; };
  }, [assumptions, blockingScenarioId, costingService, scenario.id, validation]);

  useEffect(() => {
    const guard = (action: () => void) => {
      if (!hasUnsavedAssumptionsRef.current) { action(); return; }
      setNavigationDialog({ action });
    };
    onRegisterNavigationGuard(guard);
    return () => onRegisterNavigationGuard(undefined);
  }, [onRegisterNavigationGuard]);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedAssumptions) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [hasUnsavedAssumptions]);

  function update<K extends keyof CostingAssumptionsInput>(key: K, value: CostingAssumptionsInput[K]) {
    setAssumptions((current) => ({ ...current, [key]: value }));
  }

  async function save(): Promise<boolean> {
    if (validation.some((finding) => finding.severity === 'error')) return false;
    setSaving(true);
    try {
      const saved = await costingService.saveAssumptions(scenario.id, assumptions);
      setPersisted(saved);
      setLoadedAssumptions(toInput(saved));
      return true;
    } catch (error) { onError(error, 'Unable to save Costing assumptions.'); return false; }
    finally { setSaving(false); }
  }

  /** Puts the last saved values back in the form. Nothing is written. A scenario with no saved assumptions returns to the loaded defaults. */
  function discardAssumptions() {
    const restored = persisted ? toInput(persisted) : loadedAssumptions ?? assumptions;
    setAssumptions(restored);
    setViewYear(restored.baseServiceYear);
  }

  async function saveAndNavigate() {
    if (!navigationDialog) return;
    const action = navigationDialog.action;
    if (await save()) { setNavigationDialog(undefined); action(); }
  }

  async function exportCsv() {
    if (!blockingScenarioId || !result) return;
    setSaving(true);
    try {
      const files = await costingService.exportEstimateCsv({ scenarioId: scenario.id, blockingScenarioId, assumptions });
      if (!files) throw new Error('The selected Blocking Scenario is unavailable.');
      const safe = (blockingScenarios.find((item) => item.id === blockingScenarioId)?.name ?? 'costing').replaceAll(/[^a-z0-9]+/gi, '-').replaceAll(/^-|-$/g, '') || 'costing';
      downloadBlob(`${safe}-costing.zip`, createCsvArchive(files.map((file) => ({ filename: `${safe}-${file.suffix}.csv`, contents: file.contents }))));
    } catch (error) { onError(error, 'Unable to export Costing CSV files.'); }
    finally { setSaving(false); }
  }

  if (busy) return <section className="costing-workspace"><div className="prerequisite">Loading Costing…</div></section>;
  if (!blockingScenarios.length) return <section className="costing-workspace"><div className="prerequisite"><h1>Costing</h1><p>Create a Blocking Scenario before estimating annual service cost.</p></div></section>;

  const annualDays = costingService.summarizeServiceDays(serviceDays);

  return <div className="costing-workspace">
    <h1 className="visually-hidden">Cost estimate</h1>
    {scopeSlot && createPortal(<><ContextField label="Blocking scenario" maxWidth={210}><select aria-label="Blocking scenario" value={blockingScenarioId} onChange={(event) => { setBlockingScenarioId(event.target.value); window.setTimeout(() => estimateHeading.current?.focus(), 0); }}>{blockingScenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></ContextField><ContextField label="Trip profile"><span className="context-field__value">{tripProfile?.name ?? 'Unavailable'}</span></ContextField><ContextField label="View year"><select aria-label="View year" value={selectedYear} onChange={(event) => setViewYear(Number(event.target.value))}>{years.map((year) => <option key={year}>{year}</option>)}</select></ContextField><span className="scope-bar__spacer" /><button type="button" disabled={saving || !result} onClick={() => { void exportCsv(); }}>Export costing CSV</button></>, scopeSlot)}
    <WorkSurface title="Costing assumptions" ariaLabel="Costing assumptions" subtitle={`Shared by every blocking scenario in ${scenario.name}`} footer={dirty && <SaveBar message={persisted ? `${plural(countAssumptionChanges(toInput(persisted), assumptions), 'unsaved change')} · the estimate below already includes ${countAssumptionChanges(toInput(persisted), assumptions) === 1 ? 'it' : 'them'}` : 'Not saved yet · the estimate below already uses these values'} saveLabel={saving ? 'Saving…' : 'Save assumptions'} busy={saving} saveDisabled={validation.length > 0} onSave={() => void save()} onDiscard={discardAssumptions} />}>
      <div className="costing-assumptions-grid">
        <label>Operating cost per revenue hour (USD)<input aria-label="Operating cost per revenue hour in USD"{...invalidProps('enteredRate')} type="number" min="0" step="0.01" placeholder="Enter rate" value={assumptions.enteredRate ?? ''} onChange={(event) => update('enteredRate', event.target.value === '' ? undefined : Number(event.target.value))} /></label>
        <label>Rate year<input {...invalidProps('rateYear')} type="number" min="1" max="9999" value={assumptions.rateYear} onChange={(event) => update('rateYear', Number(event.target.value))} /></label>
        <label>Source<select value={assumptions.sourceType} onChange={(event) => update('sourceType', event.target.value as 'user' | 'ntd')}><option value="user">User entered</option><option value="ntd">NTD</option></select></label>
        <label>First year of service<input {...invalidProps('baseServiceYear')} type="number" min="1" max="9999" value={assumptions.baseServiceYear} onChange={(event) => { const value = Number(event.target.value); update('baseServiceYear', value); setViewYear(value); }} /></label>
        <label>Future years<input {...invalidProps('futureYearCount')} type="number" min="0" max="10" step="1" value={assumptions.futureYearCount} onChange={(event) => { const value = Number(event.target.value); update('futureYearCount', costingService.normalizeFutureYearCount(value)); }} /></label>
        <label>Inflation rate (%)<input {...invalidProps('annualEscalation')} type="number" min="-99.99" step="0.1" value={assumptions.annualEscalation * 100} onChange={(event) => update('annualEscalation', Number(event.target.value) / 100)} /></label>
      </div>
      <p className="costing-days">Annual service days: {serviceDays.map((day) => <span key={day.id}><strong>{day.name}</strong> {day.annualServiceDays}</span>)}<span className={annualDays.exceedsMaximum ? 'invalid' : ''}><strong>Total</strong> {annualDays.total} of {annualDays.maximum}</span> · edit on the Route tab</p>
      {validation.length > 0 && <div className="costing-alert error" id="costing-assumptions-alert" role="alert">Review the rate, years, horizon, and escalation. The rate year cannot be later than the base service year.</div>}
    </WorkSurface>

    <WorkSurface title={`Cost breakdown · ${selectedYear}`} titleRef={estimateHeading} ariaLabel="Cost breakdown" badge={result && result.state !== 'complete' ? <span className={`costing-state ${result.state}`}>{result.state === 'partial' ? 'Partial estimate' : result.state === 'invalid' ? 'Invalid inputs' : 'No estimate yet'}</span> : undefined} subtitle={!result && calculating ? undefined : selectedYearResult ? `Applied rate ${rate(selectedYearResult.appliedRateUsdPerRevenueHour)} per revenue hour` : 'Enter a rate to calculate costs.'}>
      {result?.state === 'noEstimate' && <InlineNote kind="warn" live>{result.noEstimateReason === 'rateMissing' ? 'Enter an operating cost rate to calculate costs. Service quantities remain available below.' : 'No eligible blocks are available. Correct blocking issues before using a cost estimate.'}</InlineNote>}
      {result?.state === 'invalid' && <div className="costing-alert error" role="alert"><p>The estimate cannot be calculated until the listed input or source-data problems are corrected.</p><ul>{result.findings.map((finding, index) => <li key={`${finding.messageKey}-${finding.entityId}-${index}`}>{costingFindingMessage(finding, (id) => serviceDays.find((day) => day.id === id)?.name)}</li>)}</ul></div>}
      {result && result.dailyRows.length > 0 && <div className="table-scroll data-grid costing-results-table"><table><thead><tr><th scope="col">Service day</th><th scope="col">Days</th><th scope="col">Blocks</th><th scope="col">Daily revenue (h)</th><th scope="col">Daily platform (h)</th><th scope="col">Daily cost</th><th scope="col">Annual revenue (h)</th><th scope="col">Annual platform (h)</th><th scope="col">Annual cost</th></tr></thead><tbody>{result.dailyRows.map((row) => { const cost = row.yearCosts.find((item) => item.serviceYear === selectedYear); return <tr key={row.serviceDayId}><th scope="row">{row.serviceDayName}</th><td>{row.annualServiceDays}</td><td>{row.eligibleBlockCount}</td><td>{dailyHours(row.revenueHoursPerDay)}</td><td>{dailyHours(row.platformHoursPerDay)}</td><td>{cost ? money(cost.costPerDayUsd) : '—'}</td><td>{annualHours(row.annualRevenueHours)}</td><td>{annualHours(row.annualPlatformHours)}</td><td>{cost ? money(cost.annualCostUsd) : '—'}</td></tr>; })}</tbody><tfoot><tr><th scope="row">Total</th><td>{annualDays.total}</td><td>{result.eligibleBlockCount}</td><td></td><td></td><td></td><td>{selectedYearResult ? annualHours(selectedYearResult.annualRevenueHours) : annualHours(result.dailyRows.reduce((sum, row) => sum + row.annualRevenueHours, 0))}</td><td>{selectedYearResult ? annualHours(selectedYearResult.annualPlatformHours) : annualHours(result.dailyRows.reduce((sum, row) => sum + row.annualPlatformHours, 0))}</td><td>{selectedYearResult ? money(selectedYearResult.annualCostUsd) : '—'}</td></tr></tfoot></table></div>}
      {result && result.dailyRows.length > 0 && <InlineNote>Totals are computed before rounding, so a total can differ by 1 from the sum of the rounded rows.</InlineNote>}
      {!result && calculating && <p className="table-empty" role="status">Calculating estimate…</p>}
      {!result && !calculating && !validation.length && <p className="table-empty">Select a valid Blocking Scenario to calculate an estimate.</p>}
    </WorkSurface>

    <div className="costing-lower-grid">
      <SupportPanel title="Exclusions" ariaLabel="Exclusions" aside={<span className="support-panel__aside">{result ? `${plural(result.excludedBlockCount, 'excluded block')} · ${plural(result.unassignedTripCount, 'unassigned trip')}` : 'Unavailable'}</span>}>
        {result?.exclusions.some((day) => day.excludedBlockCount || day.unassignedTripCount) ? <div className="table-scroll data-grid costing-exclusions-table"><table><thead><tr><th scope="col">Service day</th><th scope="col">Block</th><th scope="col">Reason</th><th scope="col">Unassigned Trips</th></tr></thead><tbody>{result.exclusions.flatMap((day) => day.blocks.length ? day.blocks.map((block, index) => <tr key={`${day.serviceDayId}-${block.blockId}`}><th scope="row">{index === 0 ? day.serviceDayName : ''}</th><td>{block.blockLabel}</td><td>{block.reasonCodes.map((reason) => reasonLabels[reason]).join('; ')}</td><td>{index === 0 ? day.unassignedTripCount : ''}</td></tr>) : day.unassignedTripCount ? [<tr key={day.serviceDayId}><th scope="row">{day.serviceDayName}</th><td>—</td><td>Unassigned Trips</td><td>{day.unassignedTripCount}</td></tr>] : [])}</tbody></table></div> : <InlineNote kind="ok">No excluded blocks or unassigned trips.</InlineNote>}
      </SupportPanel>
      <SupportPanel title="Yearly outlook" ariaLabel="Yearly outlook">
        {result?.yearRows.length ? <div className="table-scroll data-grid costing-outlook-table"><table><thead><tr><th scope="col">Year</th><th scope="col">Applied $ per revenue hour</th><th scope="col">Annual cost</th></tr></thead><tbody>{result.yearRows.map((row) => <tr key={row.serviceYear} className={row.serviceYear === selectedYear ? 'selected-costing-year' : ''}><th scope="row"><button className="link-button" onClick={() => setViewYear(row.serviceYear)}>{row.serviceYear}</button></th><td>{rate(row.appliedRateUsdPerRevenueHour)}</td><td>{money(row.annualCostUsd)}</td></tr>)}</tbody></table></div> : <InlineNote>Appears after you enter an operating cost rate.</InlineNote>}
      </SupportPanel>
    </div>
    {navigationDialog && <CostingNavigationDraftDialog saving={saving} saveDisabled={validation.some((finding) => finding.severity === 'error')} onCancel={() => setNavigationDialog(undefined)} onDiscard={() => { const action = navigationDialog.action; setAssumptions(loadedAssumptions ?? assumptions); setNavigationDialog(undefined); action(); }} onSave={() => void saveAndNavigate()} />}
  </div>;
}

function CostingNavigationDraftDialog({ saving, saveDisabled, onCancel, onDiscard, onSave }: { saving: boolean; saveDisabled: boolean; onCancel: () => void; onDiscard: () => void; onSave: () => void }) {
  return <ModalDialog role="alertdialog" labelledBy="costing-navigation-draft-title" className="confirm-dialog" onClose={onCancel} busy={saving}><h2 id="costing-navigation-draft-title">Save Costing Assumptions before leaving?</h2><p>Costing Assumptions have unsaved changes.</p><div className="dialog-actions"><button autoFocus disabled={saving} onClick={onCancel}>Cancel</button><button className="danger" disabled={saving} onClick={onDiscard}>Discard</button><button className="primary" disabled={saving || saveDisabled} onClick={onSave}>{saving ? 'Saving…' : 'Save'}</button></div></ModalDialog>;
}
