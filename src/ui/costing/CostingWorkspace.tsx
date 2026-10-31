import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CostBasis, CostBasisOption, CostingCommands, CostingQueries, CostingResult } from '../../application/ports';
import { ModalDialog } from '../ModalDialog';
import type { CostingAssumptionsInput, CostingBlockExclusionReason, CostingCalculationResult } from '../../domain/costing';
import { DEFAULT_COSTING_ESCALATION } from '../../domain/costing';
import { formatHours, formatMoney, formatPercent, MISSING } from '../format';
import type { CostingAssumptions, CostingEstimateFactors, Scenario, ServiceDayDefinition, TripProfile, ValidationFinding } from '../../domain/types';
import type { EstimatedCostingCalculationResult, EstimatedCostingDailyResult } from '../../domain/estimatedCosting';
import { sortServiceDays } from '../../domain/serviceDays';
import { readStoredRecord, storedText } from '../preferences';
import { EstimateFactorsGrid } from './EstimateFactorsGrid';
import { createCsvArchive } from '../../application/csvDownload';
import { ContextField } from '../shared/ContextField';
import { InlineNote, SupportPanel, WorkSurface } from '../shared/surfaces';
import { SaveBar } from '../shared/bars';
import { countAssumptionChanges, countEstimateFactorChanges } from '../../application/draftChangeCounts';

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
  'block.revenueHoursInvalid': 'Invalid revenue hours',
  'block.platformHoursInvalid': 'Invalid platform hours',
};

const BLOCKING_REVIEW = 'Open Blocking and review the blocking scenario.';

/**
 * The text for one finding of an invalid Costing estimate (review issue I-031). `serviceDayName` names the service day that a finding
 * identifies by id, when the screen knows it. Every message ends with what the planner can do next.
 */
export function costingFindingMessage(finding: ValidationFinding, serviceDayName?: (id: string) => string | undefined): string {
  const day = (id: string | undefined) => (id ? serviceDayName?.(id) : undefined) ?? 'a service day';
  switch (finding.messageKey) {
    case 'costing.annualServiceDaysExceed365': return 'Annual service days total more than 365. Correct the counts in the Service days table on the Route screen.';
    case 'costing.annualServiceDaysInvalid': return `${day(finding.entityId)} has an annual count that is not a whole number of 0 or more. Correct it in the Service days table on the Route screen.`;
    case 'costing.duplicateServiceDay': case 'costing.serviceDayScenarioMismatch': return 'The service days of this scenario are inconsistent. Reload the page. If this stays, export a backup and import it again.';
    case 'costing.blockingScenarioMismatch': return 'The selected blocking scenario belongs to another scenario. Select a blocking scenario of this scenario.';
    case 'costing.tripProfileMismatch': return `The blocking scenario and its trip profile do not match. ${BLOCKING_REVIEW}`;
    case 'costing.duplicateTrip': return `A trip is stored twice in the blocking scenario's source. ${BLOCKING_REVIEW}`;
    case 'costing.duplicateBlock': return `A block is stored twice in the blocking scenario. ${BLOCKING_REVIEW}`;
    case 'costing.tripSourceMismatch': return `A trip does not belong to ${day(String(finding.parameters?.serviceDayId ?? ''))}, which its block names. ${BLOCKING_REVIEW}`;
    case 'costing.blockSourceMismatch': return `A block of ${day(String(finding.parameters?.serviceDayId ?? ''))} does not match the blocking scenario's source. ${BLOCKING_REVIEW}`;
    case 'costing.adjustedRateInvalid': return 'The inflation rate gives a cost per revenue hour that cannot be used. Change the inflation rate.';
    case 'costing.calculationOverflow': return 'The estimate is too large to calculate. Check the rate and the number of years.';
    case 'costing.rateInvalid': return 'Enter an operating cost per revenue hour of 0 or more.';
    case 'costing.rateYearInvalid': return 'Enter a rate year from 1 to 9999.';
    case 'costing.baseServiceYearInvalid': return 'Enter a first year of service from 1 to 9999.';
    case 'costing.rateYearAfterBaseServiceYear': return 'The rate year cannot be later than the base service year.';
    case 'costing.futureYearCountInvalid': return 'Enter future years as a whole number from 0 to 10.';
    case 'costing.projectionYearOutOfRange': return 'The last projected year must not be later than 9999. Lower the first year of service or future years.';
    case 'costing.annualEscalationInvalid': return 'Enter an inflation rate above −100%.';
    case 'costing.estimateFactorInvalid': case 'costing.estimateFactorDuplicateDay': return 'Enter each estimate factor as a percentage from 0 up to 100, once per service day.';
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

const COST_BASIS_PREFERENCE_KEY = 'transit-costing-tool.costing-basis.v1';
const optionValue = (option: CostBasisOption) => `${option.kind}:${option.id}`;
const optionLabel = (option: CostBasisOption) => `${option.kind === 'blocked' ? 'Blocked' : 'Estimated'} · ${option.name}`;
const toBasis = (option: CostBasisOption): CostBasis => option.kind === 'blocked' ? { kind: 'blocked', blockingScenarioId: option.id } : { kind: 'estimated', tripProfileId: option.id };
/** The cost basis remembered for a Scenario on this device (Decision 0051 item 7). Never in a backup. */
function rememberedBasis(scenarioId: string): string | undefined { return storedText(readStoredRecord(COST_BASIS_PREFERENCE_KEY)[scenarioId]); }
function rememberBasis(scenarioId: string, value: string) {
  try { localStorage.setItem(COST_BASIS_PREFERENCE_KEY, JSON.stringify({ ...readStoredRecord(COST_BASIS_PREFERENCE_KEY), [scenarioId]: value })); } catch { /* UI preference only. */ }
}
/** "Weekday", "Weekday and Holiday", "Weekday, Saturday, and Holiday". */
function listText(names: string[]): string {
  return names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}
const percentOf = (fraction: number | undefined) => formatPercent(fraction === undefined ? undefined : fraction * 100);

export function CostingWorkspace({ scopeSlot, costingService, scenario, serviceDays, tripProfiles, onError, onRegisterNavigationGuard }: Props) {
  const [basisOptions, setBasisOptions] = useState<CostBasisOption[]>([]);
  const [basisValue, setBasisValue] = useState('');
  const [assumptions, setAssumptions] = useState<CostingAssumptionsInput>(() => initialAssumptions());
  const [loadedAssumptions, setLoadedAssumptions] = useState<CostingAssumptionsInput>();
  const [persisted, setPersisted] = useState<CostingAssumptions>();
  const [savedFactors, setSavedFactors] = useState<CostingEstimateFactors>();
  const [factors, setFactors] = useState<CostingEstimateFactors>();
  const [factorCellInvalid, setFactorCellInvalid] = useState(false);
  const [result, setResult] = useState<CostingResult>();
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [busy, setBusy] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [navigationDialog, setNavigationDialog] = useState<{ action: () => void }>();
  const estimateHeading = useRef<HTMLHeadingElement>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const days = useMemo(() => sortServiceDays(serviceDays), [serviceDays]);
  const validation = useMemo(() => costingService.validateAssumptions(assumptions), [assumptions, costingService]);
  // An input that a finding names is invalid and points at the alert (finding 5-023).
  const invalidField = (field: string) => validation.some((finding) => finding.field === field);
  const invalidProps = (field: string) => invalidField(field) ? { 'aria-invalid': true as const, 'aria-describedby': 'costing-assumptions-alert' } : {};
  const dirty = persisted ? JSON.stringify(toInput(persisted)) !== JSON.stringify(assumptions) : true;
  const hasUnsavedAssumptions = loadedAssumptions !== undefined && JSON.stringify(loadedAssumptions) !== JSON.stringify(assumptions);
  const factorChangeCount = countEstimateFactorChanges(savedFactors, factors);
  const hasUnsavedFactors = factorChangeCount > 0;
  const hasUnsaved = hasUnsavedAssumptions || hasUnsavedFactors;
  const hasUnsavedRef = useRef(false);
  hasUnsavedRef.current = hasUnsaved;
  const selectedOption = basisOptions.find((option) => optionValue(option) === basisValue);
  const basis = selectedOption ? toBasis(selectedOption) : undefined;
  const tripProfileName = selectedOption?.tripProfileName || tripProfiles.find((profile) => profile.id === selectedOption?.tripProfileId)?.name;
  const years = costingService.listServiceYears(assumptions);
  const selectedYear = years.includes(viewYear) ? viewYear : years[0];
  const selectedYearResult = result?.yearRows.find((row) => row.serviceYear === selectedYear);
  // The estimate always uses the draft assumptions and the draft factors.
  const calculationInput = useMemo<CostingAssumptionsInput>(() => ({ ...assumptions, ...(factors ? { estimateFactors: factors } : {}) }), [assumptions, factors]);

  useEffect(() => {
    let current = true;
    setBusy(true);
    Promise.all([costingService.listCostBases(scenario.id), costingService.loadAssumptions(scenario.id)])
      .then(([options, stored]) => {
        if (!current) return;
        setBasisOptions(options);
        const values = options.map(optionValue);
        const remembered = rememberedBasis(scenario.id);
        setBasisValue((selected) => values.includes(selected) ? selected
          : remembered && values.includes(remembered) ? remembered
            : optionValue(options.find((option) => option.kind === 'blocked') ?? options[0] ?? { kind: 'estimated', id: '', name: '', tripProfileId: '', tripProfileName: '' }));
        const next = stored ? toInput(stored) : initialAssumptions();
        setPersisted(stored);
        setLoadedAssumptions(next);
        setAssumptions(next);
        setSavedFactors(stored?.estimateFactors);
        setFactors(stored?.estimateFactors);
        setViewYear(next.baseServiceYear);
      })
      .catch((error) => onErrorRef.current(error, 'Unable to load Costing.'))
      .finally(() => current && setBusy(false));
    return () => { current = false; };
  }, [costingService, scenario.id]);

  useEffect(() => {
    if (!basis || validation.some((finding) => finding.severity === 'error')) { setResult(undefined); setCalculating(false); return; }
    let current = true;
    setCalculating(true);
    void costingService.calculateEstimate({ scenarioId: scenario.id, basis, assumptions: calculationInput })
      .then((next) => { if (current) setResult(next); })
      .catch((error) => onErrorRef.current(error, 'Unable to calculate the cost estimate.'))
      .finally(() => { if (current) setCalculating(false); });
    return () => { current = false; };
    // `basis` is rebuilt every render from `basisValue`, which is the dependency that matters.
  }, [calculationInput, basisValue, basisOptions, costingService, scenario.id, validation]);

  useEffect(() => {
    const guard = (action: () => void) => {
      if (!hasUnsavedRef.current) { action(); return; }
      setNavigationDialog({ action });
    };
    onRegisterNavigationGuard(guard);
    return () => onRegisterNavigationGuard(undefined);
  }, [onRegisterNavigationGuard]);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (!hasUnsaved) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [hasUnsaved]);

  function update<K extends keyof CostingAssumptionsInput>(key: K, value: CostingAssumptionsInput[K]) {
    setAssumptions((current) => ({ ...current, [key]: value }));
  }

  function chooseBasis(value: string) {
    setBasisValue(value);
    rememberBasis(scenario.id, value);
    window.setTimeout(() => estimateHeading.current?.focus(), 0);
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

  /** Saves the typed factors only. A Scenario without an assumptions record gets one from the loaded defaults, never from unsaved edits. */
  async function saveFactors(): Promise<boolean> {
    if (factorCellInvalid) return false;
    setSaving(true);
    try {
      const saved = await costingService.saveEstimateFactors(scenario.id, factors, persisted ? toInput(persisted) : loadedAssumptions ?? initialAssumptions());
      setPersisted(saved);
      if (!persisted) setLoadedAssumptions(toInput(saved));
      setSavedFactors(saved.estimateFactors);
      setFactors(saved.estimateFactors);
      return true;
    } catch (error) { onError(error, 'Unable to save the estimate factors.'); return false; }
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
    if (hasUnsavedAssumptions && !(await save())) return;
    if (hasUnsavedFactors && !(await saveFactors())) return;
    setNavigationDialog(undefined);
    action();
  }

  async function exportCsv() {
    if (!basis || !result) return;
    setSaving(true);
    try {
      const files = await costingService.exportEstimateCsv({ scenarioId: scenario.id, basis, assumptions: calculationInput });
      if (!files) throw new Error('The selected cost basis is unavailable.');
      const safe = (selectedOption?.name ?? 'costing').replaceAll(/[^a-z0-9]+/gi, '-').replaceAll(/^-|-$/g, '') || 'costing';
      downloadBlob(`${safe}-costing.zip`, createCsvArchive(files.map((file) => ({ filename: `${safe}-${file.suffix}.csv`, contents: file.contents }))));
    } catch (error) { onError(error, 'Unable to export Costing CSV files.'); }
    finally { setSaving(false); }
  }

  if (busy) return <section className="costing-workspace"><div className="prerequisite">Loading Costing…</div></section>;

  const annualDays = costingService.summarizeServiceDays(serviceDays);
  const blockedOptions = basisOptions.filter((option) => option.kind === 'blocked');
  const estimatedOptions = basisOptions.filter((option) => option.kind === 'estimated');
  const assumptionChanges = persisted ? countAssumptionChanges(toInput(persisted), assumptions) : 0;
  const badge = !result ? undefined
    : result.state === 'complete' ? (result.basis === 'estimated' ? <span className="costing-state estimated">Estimated</span> : undefined)
      : <span className={`costing-state ${result.state}`}>{result.state === 'partial' ? 'Partial estimate' : result.state === 'invalid' ? 'Invalid inputs' : 'No estimate yet'}</span>;
  const appliedRate = selectedYearResult ? `Applied rate ${rate(selectedYearResult.appliedRateUsdPerRevenueHour)} per revenue hour` : undefined;
  const subtitle = !result && calculating ? undefined
    : appliedRate ? (result?.basis === 'estimated' ? `${appliedRate} · revenue and platform hours estimated from running time` : appliedRate)
      : 'Enter a rate to calculate costs.';

  return <div className="costing-workspace">
    <h1 className="visually-hidden">Cost estimate</h1>
    {scopeSlot && createPortal(<>
      <ContextField label="Cost basis" maxWidth={280}><select aria-label="Cost basis" value={basisValue} onChange={(event) => chooseBasis(event.target.value)}>
        {blockedOptions.length > 0 && <optgroup label="Blocked hours">{blockedOptions.map((option) => <option key={optionValue(option)} value={optionValue(option)}>{optionLabel(option)}</option>)}</optgroup>}
        {estimatedOptions.length > 0 && <optgroup label="Estimated from running time">{estimatedOptions.map((option) => <option key={optionValue(option)} value={optionValue(option)}>{optionLabel(option)}</option>)}</optgroup>}
      </select></ContextField>
      <ContextField label="Trip profile"><span className="context-field__value">{tripProfileName ?? 'Unavailable'}</span></ContextField>
      <ContextField label="View year"><select aria-label="View year" value={selectedYear} onChange={(event) => setViewYear(Number(event.target.value))}>{years.map((year) => <option key={year}>{year}</option>)}</select></ContextField>
      <span className="scope-bar__spacer" /><button type="button" disabled={saving || !result} onClick={() => { void exportCsv(); }}>Export costing CSV</button>
    </>, scopeSlot)}
    <div className="costing-top-grid">
      <WorkSurface title="Costing assumptions" ariaLabel="Costing assumptions" subtitle={`Shared by every cost basis in ${scenario.name}`} footer={dirty && <SaveBar message={persisted ? `${plural(assumptionChanges, 'unsaved change')} · the estimate below already includes ${assumptionChanges === 1 ? 'it' : 'them'}` : 'Not saved yet · the estimate below already uses these values'} saveLabel={saving ? 'Saving…' : 'Save assumptions'} busy={saving} saveDisabled={validation.length > 0} onSave={() => void save()} onDiscard={discardAssumptions} />}>
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
      <WorkSurface title="Estimate factors" ariaLabel="Estimate factors" subtitle="Blank days use All days" footer={hasUnsavedFactors && <SaveBar message={`${plural(factorChangeCount, 'unsaved change')} · the estimate below already includes ${factorChangeCount === 1 ? 'it' : 'them'}`} saveLabel={saving ? 'Saving…' : 'Save factors'} busy={saving} saveDisabled={factorCellInvalid} onSave={() => void saveFactors()} onDiscard={() => setFactors(savedFactors)} />}>
        <EstimateFactorsGrid days={days} factors={factors} savedFactors={savedFactors} disabled={saving} onChange={setFactors} onInvalidChange={setFactorCellInvalid} />
      </WorkSurface>
    </div>

    <WorkSurface title={`Cost breakdown · ${selectedYear}`} titleRef={estimateHeading} ariaLabel="Cost breakdown" badge={badge} subtitle={subtitle}>
      {result?.state === 'noEstimate' && <InlineNote kind="warn" live>{noEstimateText(result, tripProfileName)}</InlineNote>}
      {result?.state === 'invalid' && <div className="costing-alert error" role="alert"><p>The estimate cannot be calculated until the listed input or source-data problems are corrected.</p><ul>{result.findings.filter((finding) => finding.severity === 'error').map((finding, index) => <li key={`${finding.messageKey}-${finding.entityId}-${index}`}>{costingFindingMessage(finding, (id) => serviceDays.find((day) => day.id === id)?.name)}</li>)}</ul></div>}
      {result && result.dailyRows.length > 0 && (result.basis === 'estimated'
        ? <EstimatedResultsTable result={result} selectedYear={selectedYear} totalDays={annualDays.total} />
        : <BlockedResultsTable result={result} selectedYear={selectedYear} totalDays={annualDays.total} />)}
      {result && result.dailyRows.length > 0 && <InlineNote>Totals are computed before rounding, so a total can differ by 1 from the sum of the rounded rows.</InlineNote>}
      {!result && calculating && <p className="table-empty" role="status">Calculating estimate…</p>}
      {!result && !calculating && !validation.length && <p className="table-empty">Select a cost basis to calculate an estimate.</p>}
    </WorkSurface>

    <div className="costing-lower-grid">
      {result?.basis === 'estimated'
        ? <EstimateBasisPanel result={result} tripProfileName={tripProfileName ?? 'Unavailable'} allDays={factors?.allDays} />
        : <SupportPanel title="Exclusions" ariaLabel="Exclusions" aside={<span className="support-panel__aside">{result ? `${plural(result.excludedBlockCount, 'excluded block')} · ${plural(result.unassignedTripCount, 'unassigned trip')}` : 'Unavailable'}</span>}>
          {result?.exclusions.some((day) => day.excludedBlockCount || day.unassignedTripCount) ? <div className="table-scroll data-grid costing-exclusions-table"><table><thead><tr><th scope="col">Service day</th><th scope="col">Block</th><th scope="col">Reason</th><th scope="col">Unassigned trips</th></tr></thead><tbody>{result.exclusions.flatMap((day) => day.blocks.length ? day.blocks.map((block, index) => <tr key={`${day.serviceDayId}-${block.blockId}`}><th scope="row">{index === 0 ? day.serviceDayName : ''}</th><td>{block.blockLabel}</td><td>{block.reasonCodes.map((reason) => reasonLabels[reason]).join('; ')}</td><td>{index === 0 ? day.unassignedTripCount : ''}</td></tr>) : day.unassignedTripCount ? [<tr key={day.serviceDayId}><th scope="row">{day.serviceDayName}</th><td>—</td><td>Unassigned trips</td><td>{day.unassignedTripCount}</td></tr>] : [])}</tbody></table></div> : <InlineNote kind="ok">No excluded blocks or unassigned trips.</InlineNote>}
        </SupportPanel>}
      <SupportPanel title="Yearly outlook" ariaLabel="Yearly outlook">
        {result?.yearRows.length ? <div className="table-scroll data-grid costing-outlook-table"><table><thead><tr><th scope="col">Year</th><th scope="col">Applied $ per revenue hour</th><th scope="col">Annual cost</th></tr></thead><tbody>{result.yearRows.map((row) => <tr key={row.serviceYear} className={row.serviceYear === selectedYear ? 'selected-costing-year' : ''}><th scope="row"><button className="link-button" onClick={() => setViewYear(row.serviceYear)}>{row.serviceYear}</button></th><td>{rate(row.appliedRateUsdPerRevenueHour)}</td><td>{money(row.annualCostUsd)}</td></tr>)}</tbody></table></div> : <InlineNote>Appears after you enter an operating cost rate.</InlineNote>}
      </SupportPanel>
    </div>
    {navigationDialog && <CostingNavigationDraftDialog saving={saving} saveDisabled={validation.some((finding) => finding.severity === 'error') || factorCellInvalid} onCancel={() => setNavigationDialog(undefined)} onDiscard={() => { const action = navigationDialog.action; setAssumptions(loadedAssumptions ?? assumptions); setFactors(savedFactors); setNavigationDialog(undefined); action(); }} onSave={() => void saveAndNavigate()} />}
  </div>;
}

function noEstimateText(result: CostingResult, tripProfileName: string | undefined): string {
  if (result.noEstimateReason === 'rateMissing') return 'Enter an operating cost rate to calculate costs. Service quantities remain available below.';
  if (result.basis === 'blocked') return 'No eligible blocks are available. Correct blocking issues before using a cost estimate.';
  if (result.noEstimateReason === 'noTrips') return `Trip profile ${tripProfileName ?? ''} has no trips with run times.`;
  const missing = result.dailyRows.filter((row) => row.runningHoursPerDay > 0 && row.factors.layoverFraction === undefined).map((row) => row.serviceDayName);
  return `Enter a layover % for ${listText(missing)} or for All days to estimate revenue hours. Running hours are shown below.`;
}

function BlockedResultsTable({ result, selectedYear, totalDays }: { result: CostingCalculationResult; selectedYear: number; totalDays: number }) {
  const year = result.yearRows.find((row) => row.serviceYear === selectedYear);
  return <div className="table-scroll data-grid costing-results-table"><table><thead><tr><th scope="col">Service day</th><th scope="col">Days</th><th scope="col">Blocks</th><th scope="col">Daily revenue (h)</th><th scope="col">Daily platform (h)</th><th scope="col">Daily cost</th><th scope="col">Annual revenue (h)</th><th scope="col">Annual platform (h)</th><th scope="col">Annual cost</th></tr></thead><tbody>{result.dailyRows.map((row) => { const cost = row.yearCosts.find((item) => item.serviceYear === selectedYear); return <tr key={row.serviceDayId}><th scope="row">{row.serviceDayName}</th><td>{row.annualServiceDays}</td><td>{row.eligibleBlockCount}</td><td>{dailyHours(row.revenueHoursPerDay)}</td><td>{dailyHours(row.platformHoursPerDay)}</td><td>{cost ? money(cost.costPerDayUsd) : '—'}</td><td>{annualHours(row.annualRevenueHours)}</td><td>{annualHours(row.annualPlatformHours)}</td><td>{cost ? money(cost.annualCostUsd) : '—'}</td></tr>; })}</tbody><tfoot><tr><th scope="row">Total</th><td>{totalDays}</td><td>{result.eligibleBlockCount}</td><td></td><td></td><td></td><td>{year ? annualHours(year.annualRevenueHours) : annualHours(result.dailyRows.reduce((sum, row) => sum + row.annualRevenueHours, 0))}</td><td>{year ? annualHours(year.annualPlatformHours) : annualHours(result.dailyRows.reduce((sum, row) => sum + row.annualPlatformHours, 0))}</td><td>{year ? money(year.annualCostUsd) : '—'}</td></tr></tfoot></table></div>;
}

/** The caption under a day name when a factor came from All days. */
function fallbackCaption(row: EstimatedCostingDailyResult): string | undefined {
  if (row.runningHoursPerDay <= 0) return undefined;
  const layover = row.factors.layoverSource === 'allDays';
  const deadhead = row.factors.deadheadSource === 'allDays';
  return layover && deadhead ? 'All days factors' : layover ? 'All days layover %' : deadhead ? 'All days deadhead %' : undefined;
}

function EstimatedResultsTable({ result, selectedYear, totalDays }: { result: EstimatedCostingCalculationResult; selectedYear: number; totalDays: number }) {
  const year = result.yearRows.find((row) => row.serviceYear === selectedYear);
  const daily = (value: number | undefined) => value === undefined ? MISSING : dailyHours(value);
  const annual = (value: number | undefined) => value === undefined ? MISSING : annualHours(value);
  const sum = (values: Array<number | undefined>) => values.every((value) => value !== undefined) ? values.reduce<number>((total, value) => total + value!, 0) : undefined;
  const totalRevenue = year ? year.annualRevenueHours : sum(result.dailyRows.map((row) => row.annualRevenueHours));
  const totalPlatform = year ? year.annualPlatformHours : sum(result.dailyRows.map((row) => row.annualPlatformHours));
  return <div className="table-scroll data-grid costing-results-table"><table>
    <thead><tr><th scope="col">Service day</th><th scope="col">Days</th><th scope="col">Trips</th><th scope="col">Daily running (h)</th><th scope="col">Daily revenue (h)<span className="costing-est-mark">estimated</span></th><th scope="col">Daily platform (h)<span className="costing-est-mark">estimated</span></th><th scope="col">Daily cost</th><th scope="col">Annual revenue (h)</th><th scope="col">Annual platform (h)</th><th scope="col">Annual cost</th></tr></thead>
    <tbody>{result.dailyRows.map((row) => {
      const cost = row.yearCosts.find((item) => item.serviceYear === selectedYear);
      const caption = fallbackCaption(row);
      return <tr key={row.serviceDayId}><th scope="row">{row.serviceDayName}{caption && <span className="costing-row-note">{caption}</span>}</th><td>{row.annualServiceDays}</td><td>{row.tripCount}</td><td>{dailyHours(row.runningHoursPerDay)}</td><td>{daily(row.revenueHoursPerDay)}</td><td>{daily(row.platformHoursPerDay)}</td><td>{cost ? money(cost.costPerDayUsd) : MISSING}</td><td>{annual(row.annualRevenueHours)}</td><td>{annual(row.annualPlatformHours)}</td><td>{cost ? money(cost.annualCostUsd) : MISSING}</td></tr>;
    })}</tbody>
    <tfoot><tr><th scope="row">Total</th><td>{totalDays}</td><td>{result.tripCount}</td><td></td><td></td><td></td><td></td><td>{annual(totalRevenue)}</td><td>{annual(totalPlatform)}</td><td>{year ? money(year.annualCostUsd) : MISSING}</td></tr></tfoot>
  </table></div>;
}

function EstimateBasisPanel({ result, tripProfileName, allDays }: { result: EstimatedCostingCalculationResult; tripProfileName: string; allDays?: CostingEstimateFactors['allDays'] }) {
  const active = result.dailyRows.filter((row) => row.runningHoursPerDay > 0);
  const fallbackDays = active.filter((row) => row.factors.layoverSource === 'allDays' || row.factors.deadheadSource === 'allDays').map((row) => row.serviceDayName);
  const noDeadhead = active.filter((row) => row.factors.deadheadFraction === undefined).map((row) => row.serviceDayName);
  return <SupportPanel title="Estimate basis" ariaLabel="Estimate basis" aside={<span className="support-panel__aside">{`Trip profile ${tripProfileName} · ${plural(result.tripCount, 'trip')} · no blocks used`}</span>}>
    <div className="costing-basis-notes">
      <InlineNote>{`Running hours add each trip's first-to-last time in trip profile ${tripProfileName}.`}</InlineNote>
      <InlineNote>Revenue hours = running ÷ (1 − layover %). Platform hours = revenue ÷ (1 − deadhead %).</InlineNote>
      {fallbackDays.length > 0 && <InlineNote kind="warn">{`${listText(fallbackDays)} ${fallbackDays.length === 1 ? 'uses' : 'use'} All days: ${percentOf(allDays?.layoverFraction)} layover, ${percentOf(allDays?.deadheadFraction)} deadhead.`}</InlineNote>}
      {result.tripsWithoutRunTimeCount > 0 && <InlineNote kind="warn">{`${plural(result.tripsWithoutRunTimeCount, 'trip')} ${result.tripsWithoutRunTimeCount === 1 ? 'has' : 'have'} no run time and ${result.tripsWithoutRunTimeCount === 1 ? 'is' : 'are'} not counted.`}</InlineNote>}
      {noDeadhead.length > 0 && <InlineNote kind="warn">{`No deadhead % for ${listText(noDeadhead)}: platform hours are not estimated.`}</InlineNote>}
    </div>
  </SupportPanel>;
}

function CostingNavigationDraftDialog({ saving, saveDisabled, onCancel, onDiscard, onSave }: { saving: boolean; saveDisabled: boolean; onCancel: () => void; onDiscard: () => void; onSave: () => void }) {
  return <ModalDialog role="alertdialog" labelledBy="costing-navigation-draft-title" className="confirm-dialog" onClose={onCancel} busy={saving}><h2 id="costing-navigation-draft-title">Save costing changes before leaving?</h2><p>Costing assumptions or estimate factors have unsaved changes.</p><div className="dialog-actions"><button autoFocus disabled={saving} onClick={onCancel}>Cancel</button><button className="danger" disabled={saving} onClick={onDiscard}>Discard</button><button className="primary" disabled={saving || saveDisabled} onClick={onSave}>{saving ? 'Saving…' : 'Save'}</button></div></ModalDialog>;
}
