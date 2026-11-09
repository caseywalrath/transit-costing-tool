import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CostBasis, CostBasisOption, CostingCommands, CostingQueries, CostingResult } from '../../application/ports';
import { ModalDialog } from '../ModalDialog';
import type { CostingAssumptionsInput } from '../../domain/costing';
import { DEFAULT_COSTING_ESCALATION } from '../../domain/costing';
import { formatHours, formatMoney, MISSING } from '../format';
import type { CostingAssumptions, CostingEstimateFactors, Scenario, ServiceDayDefinition, TripProfile, ValidationFinding } from '../../domain/types';
import { sortServiceDays } from '../../domain/serviceDays';
import { readRateHistory, readStoredRecord, rememberRate, storedText, writeRateHistory } from '../preferences';
import { RateCombobox } from './RateCombobox';
import { EstimateFactorsGrid } from './EstimateFactorsGrid';
import { createCsvArchive } from '../../application/csvDownload';
import { ContextField } from '../shared/ContextField';
import { InlineNote, SupportPanel, WorkSurface } from '../shared/surfaces';
import { SaveBar } from '../shared/bars';
import { countAssumptionChanges, countEstimateFactorChanges } from '../../application/draftChangeCounts';
import { MenuButton, type MenuGroup } from '../MenuButton';
import { buildCostSummary, costSummaryPartialReasons, type CostSummary } from '../../domain/costSummary';
import { CostSummaryView } from './CostSummaryView';
import { estimateFactorsForTripProfile, type EstimateFactorOwner, type EstimatedCostingCalculationResult, type ImpliedRouteService } from '../../domain/estimatedCosting';

type Props = {
  /** The element in the header's scope bar that receives the scope selectors (UR-5). */
  scopeSlot: HTMLElement | null;
  costingService: CostingCommands & CostingQueries;
  scenario: Scenario;
  /** Shown above the title of the Operating Cost Estimate (Decision 0054). */
  projectName: string;
  serviceDays: ServiceDayDefinition[];
  tripProfiles: TripProfile[];
  onError: (error: unknown, fallback?: string) => void;
  onRegisterNavigationGuard: (guard: ((action: () => void) => void) | undefined) => void;
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
    case 'costing.futureYearCountInvalid': return 'Enter the costing horizon as a whole number of years from 0 to 10.';
    case 'costing.projectionYearOutOfRange': return 'The last projected year must not be later than 9999. Lower the first year of service or the costing horizon.';
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
/** The group heading says Blocked or Estimated, so an option shows its name alone. */
const optionLabel = (option: CostBasisOption) => option.name;
/** The options of one kind, alphabetical by name (digits compare as numbers, case ignored). */
export function sortCostBasisOptions(options: readonly CostBasisOption[], kind: CostBasisOption['kind']): CostBasisOption[] {
  return options.filter((option) => option.kind === kind).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}
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

export function CostingWorkspace({ scopeSlot, costingService, scenario, projectName, serviceDays, tripProfiles, onError, onRegisterNavigationGuard }: Props) {
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
  const [rateHistory, setRateHistory] = useState(() => readRateHistory());
  /** `factorsOnly`: the dialog guards a change of cost basis, which leaves unsaved assumptions in place. */
  const [navigationDialog, setNavigationDialog] = useState<{ action: () => void; factorsOnly?: boolean }>();
  const [summary, setSummary] = useState<CostSummary>();
  const [partialSummary, setPartialSummary] = useState<{ summary: CostSummary; reasons: string[] }>();
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
  // Decision 0062: the factors panel edits the factors of the selected cost basis's Trip Profile.
  const factorProfileId = selectedOption?.tripProfileId;
  const factorOwner = factorProfileId ? estimateFactorsForTripProfile(persisted, factorProfileId).owner : 'none';
  const persistedRef = useRef<CostingAssumptions | undefined>(undefined);
  persistedRef.current = persisted;
  const factorProfileRef = useRef(factorProfileId);
  factorProfileRef.current = factorProfileId;
  useEffect(() => {
    if (busy) return;
    const own = factorProfileId ? estimateFactorsForTripProfile(persistedRef.current, factorProfileId).factors : undefined;
    setSavedFactors(own);
    setFactors(own);
  }, [busy, factorProfileId]);
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
        persistedRef.current = stored;
        setLoadedAssumptions(next);
        setAssumptions(next);
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
    // Unsaved factors belong to one Trip Profile; a basis of another Trip Profile asks to save or discard them first (Decision 0062).
    const next = basisOptions.find((option) => optionValue(option) === value);
    if (hasUnsavedFactors && next && next.tripProfileId !== factorProfileId) {
      setNavigationDialog({ action: () => applyBasis(value), factorsOnly: true });
      return;
    }
    applyBasis(value);
  }

  function applyBasis(value: string) {
    setBasisValue(value);
    rememberBasis(scenario.id, value);
    window.setTimeout(() => estimateHeading.current?.focus(), 0);
  }

  async function save(): Promise<boolean> {
    if (validation.some((finding) => finding.severity === 'error')) return false;
    setSaving(true);
    try {
      const saved = await costingService.saveAssumptions(scenario.id, assumptions);
      if (saved.enteredRate !== undefined) {
        const next = rememberRate(rateHistory, { rate: saved.enteredRate, rateYear: saved.rateYear, sourceType: saved.sourceType });
        setRateHistory(next);
        writeRateHistory(next);
      }
      setPersisted(saved);
      setLoadedAssumptions(toInput(saved));
      return true;
    } catch (error) { onError(error, 'Unable to save Costing assumptions.'); return false; }
    finally { setSaving(false); }
  }

  /**
   * Saves the typed factors of the selected basis's Trip Profile only (Decision 0062). A Scenario without an assumptions record gets one from
   * the loaded defaults, never from unsaved edits.
   */
  async function saveFactors(): Promise<boolean> {
    if (factorCellInvalid || !factorProfileId) return false;
    setSaving(true);
    try {
      const saved = await costingService.saveEstimateFactors(scenario.id, factorProfileId, factors, persisted ? toInput(persisted) : loadedAssumptions ?? initialAssumptions());
      setPersisted(saved);
      persistedRef.current = saved;
      if (!persisted) setLoadedAssumptions(toInput(saved));
      // The planner may have chosen another Trip Profile's basis while the save ran; its grid is then left as it is.
      if (factorProfileRef.current === factorProfileId) {
        const own = estimateFactorsForTripProfile(saved, factorProfileId).factors;
        setSavedFactors(own);
        setFactors(own);
      }
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
    if (!navigationDialog.factorsOnly && hasUnsavedAssumptions && !(await save())) return;
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

  /** Opens the Operating Cost Estimate for the selected cost basis and the draft assumptions. A partial estimate asks first (Decision 0054). */
  function openSummary() {
    if (!result) return;
    const today = new Date();
    const preparedOn = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const built = buildCostSummary(result, { projectName, scenarioName: scenario.name, preparedOn });
    if (!built) return;
    const reasons = costSummaryPartialReasons(result);
    if (reasons.length) setPartialSummary({ summary: built, reasons }); else setSummary(built);
  }

  if (busy) return <section className="costing-workspace"><div className="prerequisite">Loading Costing…</div></section>;

  const summaryAvailable = !!result && (result.state === 'complete' || result.state === 'partial') && result.yearRows.length > 0;
  const costingActionsMenu: MenuGroup[] = [{ items: [
    { id: 'summary', label: 'View cost summary…', restoreFocus: false, disabled: !summaryAvailable || calculating, title: summaryAvailable ? undefined : 'Enter a rate and correct any input problems to view the cost summary.', onSelect: openSummary },
    { id: 'csv', label: 'Export costing CSV', disabled: saving || !result, onSelect: () => { void exportCsv(); } },
  ] }];

  const annualDays = costingService.summarizeServiceDays(serviceDays);
  const blockedOptions = sortCostBasisOptions(basisOptions, 'blocked');
  const estimatedOptions = sortCostBasisOptions(basisOptions, 'estimated');
  const assumptionChanges = persisted ? countAssumptionChanges(toInput(persisted), assumptions) : 0;
  const badge = !result ? undefined
    : result.state === 'complete' ? undefined
      : <span className={`costing-state ${result.state}`}>{result.state === 'partial' ? 'Partial estimate' : result.state === 'invalid' ? 'Invalid inputs' : 'No estimate yet'}</span>;
  const appliedRate = selectedYearResult ? `Applied rate ${rate(selectedYearResult.appliedRateUsdPerRevenueHour)} per revenue hour` : undefined;
  const subtitle = !result && calculating ? undefined
    : appliedRate ?? 'Enter a rate to calculate costs.';

  return <div className="costing-workspace">
    <h1 className="visually-hidden">Cost estimate</h1>
    {scopeSlot && createPortal(<>
      <ContextField label="Cost basis" maxWidth={280}><select aria-label="Cost basis" value={basisValue} onChange={(event) => chooseBasis(event.target.value)}>
        {blockedOptions.length > 0 && <optgroup label="Blocked hours">{blockedOptions.map((option) => <option key={optionValue(option)} value={optionValue(option)}>{optionLabel(option)}</option>)}</optgroup>}
        {estimatedOptions.length > 0 && <optgroup label="Estimated from running time">{estimatedOptions.map((option) => <option key={optionValue(option)} value={optionValue(option)}>{optionLabel(option)}</option>)}</optgroup>}
      </select></ContextField>
      <ContextField label="Trip profile"><span className="context-field__value">{tripProfileName ?? 'Unavailable'}</span></ContextField>
      <ContextField label="View year"><select aria-label="View year" value={selectedYear} onChange={(event) => setViewYear(Number(event.target.value))}>{years.map((year) => <option key={year}>{year}</option>)}</select></ContextField>
      <span className="scope-bar__spacer" /><MenuButton label="Actions" triggerAriaLabel="Costing actions" menuLabel="Costing actions" groups={costingActionsMenu} />
    </>, scopeSlot)}
    <div className="costing-top-grid">
      <WorkSurface title="Costing assumptions" ariaLabel="Costing assumptions" footer={dirty && <SaveBar message={persisted ? `${plural(assumptionChanges, 'unsaved change')} · the estimate below already includes ${assumptionChanges === 1 ? 'it' : 'them'}` : 'Not saved yet · the estimate below already uses these values'} saveLabel={saving ? 'Saving…' : 'Save assumptions'} busy={saving} saveDisabled={validation.length > 0} onSave={() => void save()} onDiscard={discardAssumptions} />}>
        <div className="costing-assumptions-grid">
          <RateCombobox label="Operating cost per revenue hour (USD)" ariaLabel="Operating cost per revenue hour in USD" invalidProps={invalidProps('enteredRate')} value={assumptions.enteredRate} onValueChange={(rate) => update('enteredRate', rate)} history={rateHistory}
            onPick={(entry) => setAssumptions((current) => ({ ...current, enteredRate: entry.rate, rateYear: entry.rateYear, sourceType: entry.sourceType }))} />
          <label>Rate year<input {...invalidProps('rateYear')} type="number" min="1" max="9999" value={assumptions.rateYear} onChange={(event) => update('rateYear', Number(event.target.value))} /></label>
          <label>Source<select value={assumptions.sourceType} onChange={(event) => update('sourceType', event.target.value as 'user' | 'ntd')}><option value="user">User entered</option><option value="ntd">NTD</option></select></label>
          <label>First year of service<input {...invalidProps('baseServiceYear')} type="number" min="1" max="9999" value={assumptions.baseServiceYear} onChange={(event) => { const value = Number(event.target.value); update('baseServiceYear', value); setViewYear(value); }} /></label>
          <label>Costing horizon (years)<input {...invalidProps('futureYearCount')} type="number" min="0" max="10" step="1" value={assumptions.futureYearCount} onChange={(event) => { const value = Number(event.target.value); update('futureYearCount', costingService.normalizeFutureYearCount(value)); }} /></label>
          <label>Inflation rate (%)<input {...invalidProps('annualEscalation')} type="number" min="-99.99" step="0.1" value={assumptions.annualEscalation * 100} onChange={(event) => update('annualEscalation', Number(event.target.value) / 100)} /></label>
        </div>
        <p className="costing-days">Annual service days: {serviceDays.map((day) => <span key={day.id}><strong>{day.name}</strong> {day.annualServiceDays}</span>)}<span className={annualDays.exceedsMaximum ? 'invalid' : ''}><strong>Total</strong> {annualDays.total} of {annualDays.maximum}</span></p>
        {validation.length > 0 && <div className="costing-alert error" id="costing-assumptions-alert" role="alert">Review the rate, years, horizon, and escalation. The rate year cannot be later than the base service year.</div>}
      </WorkSurface>
      <WorkSurface title="Estimate factors" ariaLabel="Estimate factors" subtitle={factorSubtitle(tripProfileName, factorOwner)} footer={hasUnsavedFactors && <SaveBar message={`${plural(factorChangeCount, 'unsaved change')} · the estimate below already includes ${factorChangeCount === 1 ? 'it' : 'them'}`} saveLabel={saving ? 'Saving…' : 'Save factors'} busy={saving} saveDisabled={factorCellInvalid} onSave={() => void saveFactors()} onDiscard={() => setFactors(savedFactors)} />}>
        <EstimateFactorsGrid days={days} factors={factors} savedFactors={savedFactors} disabled={saving || !factorProfileId} onChange={setFactors} onInvalidChange={setFactorCellInvalid} />
        {factorOwner === 'scenario' && <InlineNote>These are the scenario&rsquo;s shared factors. Saving stores factors for this trip profile only.</InlineNote>}
      </WorkSurface>
    </div>

    <WorkSurface title={`Cost breakdown · ${selectedYear}`} titleRef={estimateHeading} ariaLabel="Cost breakdown" badge={badge} subtitle={subtitle}>
      {result?.state === 'noEstimate' && <InlineNote kind="warn" live>{noEstimateText(result, tripProfileName)}</InlineNote>}
      {result?.state === 'invalid' && <div className="costing-alert error" role="alert"><p>The estimate cannot be calculated until the listed input or source-data problems are corrected.</p><ul>{result.findings.filter((finding) => finding.severity === 'error').map((finding, index) => <li key={`${finding.messageKey}-${finding.entityId}-${index}`}>{costingFindingMessage(finding, (id) => serviceDays.find((day) => day.id === id)?.name)}</li>)}</ul></div>}
      {result && result.dailyRows.length > 0 && <CostBreakdownTable result={result} selectedYear={selectedYear} totalDays={annualDays.total} />}
      {!result && calculating && <p className="table-empty" role="status">Calculating estimate…</p>}
      {!result && !calculating && !validation.length && <p className="table-empty">Select a cost basis to calculate an estimate.</p>}
    </WorkSurface>

    <div className="costing-lower-grid">
      <SupportPanel title="Yearly outlook" ariaLabel="Yearly outlook">
        {result?.yearRows.length ? <div className="table-scroll data-grid costing-outlook-table"><table><thead><tr><th scope="col">Year</th><th scope="col">Applied $ per revenue hour</th><th scope="col">Annual cost</th></tr></thead><tbody>{result.yearRows.map((row) => <tr key={row.serviceYear} className={row.serviceYear === selectedYear ? 'selected-costing-year' : ''}><th scope="row"><button className="link-button" onClick={() => setViewYear(row.serviceYear)}>{row.serviceYear}</button></th><td>{rate(row.appliedRateUsdPerRevenueHour)}</td><td>{money(row.annualCostUsd)}</td></tr>)}</tbody></table></div> : <InlineNote>Appears after you enter an operating cost rate.</InlineNote>}
      </SupportPanel>
      {result?.basis === 'estimated' && <SupportPanel title="Implied service" ariaLabel="Implied service" aside="What the layover % implies">
        <ImpliedServiceTable result={result} />
      </SupportPanel>}
    </div>
    {partialSummary && <ModalDialog role="alertdialog" labelledBy="cost-summary-partial-title" className="confirm-dialog" onClose={() => setPartialSummary(undefined)}><h2 id="cost-summary-partial-title">This estimate is partial</h2><p>The cost summary will not show that some service is left out:</p><ul>{partialSummary.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><div className="dialog-actions"><button autoFocus onClick={() => setPartialSummary(undefined)}>Cancel</button><button className="primary" onClick={() => { setSummary(partialSummary.summary); setPartialSummary(undefined); }}>Open summary</button></div></ModalDialog>}
    {summary && <CostSummaryView summary={summary} onClose={() => setSummary(undefined)} />}
    {navigationDialog && <CostingNavigationDraftDialog factorsOnly={navigationDialog.factorsOnly} saving={saving} saveDisabled={(!navigationDialog.factorsOnly && validation.some((finding) => finding.severity === 'error')) || factorCellInvalid} onCancel={() => setNavigationDialog(undefined)} onDiscard={() => { const action = navigationDialog.action; if (!navigationDialog.factorsOnly) setAssumptions(loadedAssumptions ?? assumptions); setFactors(savedFactors); setNavigationDialog(undefined); action(); }} onSave={() => void saveAndNavigate()} />}
  </div>;
}

function noEstimateText(result: CostingResult, tripProfileName: string | undefined): string {
  if (result.noEstimateReason === 'rateMissing') return 'Enter an operating cost rate to calculate costs. Service quantities remain available below.';
  if (result.basis === 'blocked') return 'No eligible blocks are available. Correct blocking issues before using a cost estimate.';
  if (result.noEstimateReason === 'noTrips') return `Trip profile ${tripProfileName ?? ''} has no trips with run times.`;
  const missing = result.dailyRows.filter((row) => row.runningHoursPerDay > 0 && row.factors.layoverFraction === undefined).map((row) => row.serviceDayName);
  return `Enter a layover % for ${listText(missing)} or for All days to estimate revenue hours. Running hours are shown below.`;
}

/** One row of the Cost breakdown. A value the cost basis does not have is undefined and shows as a dash. */
type BreakdownRow = {
  key: string; name: string; days: number; trips?: number; blocks?: number;
  running?: number; revenue?: number; platform?: number; dailyCost?: number;
  annualRevenue?: number; annualPlatform?: number; annualCost?: number;
};

/** The rows of either cost basis in one shape, so the blocked and estimated tables have the same eleven columns. */
function breakdownRows(result: CostingResult, selectedYear: number): { rows: BreakdownRow[]; total: BreakdownRow } {
  const year = result.yearRows.find((row) => row.serviceYear === selectedYear);
  const sum = (values: Array<number | undefined>) => values.every((value) => value !== undefined) ? values.reduce<number>((total, value) => total + value!, 0) : undefined;
  const rows: BreakdownRow[] = result.basis === 'estimated'
    ? result.dailyRows.map((row) => { const cost = row.yearCosts.find((item) => item.serviceYear === selectedYear); return {
      key: row.serviceDayId, name: row.serviceDayName, days: row.annualServiceDays, trips: row.tripCount, running: row.runningHoursPerDay,
      revenue: row.revenueHoursPerDay, platform: row.platformHoursPerDay, dailyCost: cost?.costPerDayUsd,
      annualRevenue: row.annualRevenueHours, annualPlatform: row.annualPlatformHours, annualCost: cost?.annualCostUsd,
    }; })
    : result.dailyRows.map((row) => { const cost = row.yearCosts.find((item) => item.serviceYear === selectedYear); return {
      key: row.serviceDayId, name: row.serviceDayName, days: row.annualServiceDays, blocks: row.eligibleBlockCount,
      revenue: row.revenueHoursPerDay, platform: row.platformHoursPerDay, dailyCost: cost?.costPerDayUsd,
      annualRevenue: row.annualRevenueHours, annualPlatform: row.annualPlatformHours, annualCost: cost?.annualCostUsd,
    }; });
  const total: BreakdownRow = {
    key: 'total', name: 'Total', days: rows.reduce((total, row) => total + row.days, 0),
    ...(result.basis === 'estimated' ? { trips: result.tripCount } : { blocks: result.eligibleBlockCount }),
    annualRevenue: year ? year.annualRevenueHours : sum(rows.map((row) => row.annualRevenue)),
    annualPlatform: year ? year.annualPlatformHours : sum(rows.map((row) => row.annualPlatform)),
    annualCost: year?.annualCostUsd,
  };
  return { rows, total };
}

const BREAKDOWN_COLUMNS = ['Service day', 'Days', 'Trips', 'Blocks', 'Daily running (h)', 'Daily revenue (h)', 'Daily platform (h)', 'Daily cost', 'Annual revenue (h)', 'Annual platform (h)', 'Annual cost'];

function CostBreakdownTable({ result, selectedYear, totalDays }: { result: CostingResult; selectedYear: number; totalDays: number }) {
  const { rows, total } = breakdownRows(result, selectedYear);
  const count = (value: number | undefined) => value === undefined ? MISSING : String(value);
  const daily = (value: number | undefined) => value === undefined ? MISSING : dailyHours(value);
  const annual = (value: number | undefined) => value === undefined ? MISSING : annualHours(value);
  const cash = (value: number | undefined) => value === undefined ? MISSING : money(value);
  return <div className="table-scroll data-grid costing-results-table"><table>
    <colgroup><col className="costing-col-day" /><col className="costing-col-count" /><col className="costing-col-count" /><col className="costing-col-count" />{Array.from({ length: 3 }, (_, index) => <col key={index} className="costing-col-hours" />)}<col className="costing-col-money" /><col className="costing-col-hours" /><col className="costing-col-hours" /><col className="costing-col-total" /></colgroup>
    <thead><tr>{BREAKDOWN_COLUMNS.map((name) => <th key={name} scope="col">{name}</th>)}</tr></thead>
    <tbody>{rows.map((row) => <tr key={row.key}><th scope="row">{row.name}</th><td>{row.days}</td><td>{count(row.trips)}</td><td>{count(row.blocks)}</td><td>{daily(row.running)}</td><td>{daily(row.revenue)}</td><td>{daily(row.platform)}</td><td>{cash(row.dailyCost)}</td><td>{annual(row.annualRevenue)}</td><td>{annual(row.annualPlatform)}</td><td>{cash(row.annualCost)}</td></tr>)}</tbody>
    <tfoot><tr><th scope="row">Total</th><td>{totalDays}</td><td>{count(total.trips)}</td><td>{count(total.blocks)}</td><td></td><td></td><td></td><td></td><td>{annual(total.annualRevenue)}</td><td>{annual(total.annualPlatform)}</td><td>{cash(total.annualCost)}</td></tr></tfoot>
  </table></div>;
}

/** The Estimate factors subtitle: whose factors the grid holds (Decision 0062). */
function factorSubtitle(tripProfileName: string | undefined, owner: EstimateFactorOwner): string {
  const name = tripProfileName ? `Trip profile ${tripProfileName}` : 'No trip profile';
  return owner === 'scenario' ? `${name} · shared scenario factors` : `${name} · blank days use All days`;
}

const minutes = (seconds: number | undefined) => seconds === undefined ? MISSING : (seconds / 60).toFixed(1);

/**
 * Decision 0062: for each service day and Route, the running time of one cycle through every direction, that cycle with the layover %
 * applied, the observed headway of each direction, and the vehicles that cycle needs at that headway.
 */
function ImpliedServiceTable({ result }: { result: EstimatedCostingCalculationResult }) {
  const rows = result.dailyRows.flatMap((day) => (day.impliedService ?? []).map((route) => ({ day, route })));
  if (!rows.length) return <InlineNote>Appears when the trip profile has trips with run times.</InlineNote>;
  const showRoute = new Set(rows.map(({ route }) => route.routeId)).size > 1;
  const headways = (route: ImpliedRouteService) => {
    const values = [...new Set(route.directions.map((direction) => minutes(direction.headwaySeconds)))];
    return values.join(' / ');
  };
  return <>
    <div className="table-scroll data-grid costing-outlook-table costing-implied-table"><table>
      <thead><tr><th scope="col">Service day</th>{showRoute && <th scope="col">Route</th>}<th scope="col">Cycle running (min)</th><th scope="col">Cycle with layover (min)</th><th scope="col">Headway (min)</th><th scope="col">Implied vehicles</th></tr></thead>
      <tbody>{rows.map(({ day, route }) => <tr key={`${day.serviceDayId}-${route.routeId}`}>
        <th scope="row">{day.serviceDayName}</th>{showRoute && <td>{route.routeName ?? MISSING}</td>}
        <td>{minutes(route.roundTripRunSeconds)}</td><td>{minutes(route.roundTripWithLayoverSeconds)}</td><td>{headways(route)}</td>
        <td>{route.impliedVehicles === undefined ? MISSING : route.impliedVehicles.toFixed(2)}</td>
      </tr>)}</tbody>
    </table></div>
    <InlineNote>The cycle adds the mean run time of each direction. With layover = cycle ÷ (1 − layover %). Headway is the median gap between departures in each direction. Implied vehicles are not rounded; compare them with the cycle and fleet you planned.</InlineNote>
  </>;
}

function CostingNavigationDraftDialog({ factorsOnly, saving, saveDisabled, onCancel, onDiscard, onSave }: { factorsOnly?: boolean; saving: boolean; saveDisabled: boolean; onCancel: () => void; onDiscard: () => void; onSave: () => void }) {
  return <ModalDialog role="alertdialog" labelledBy="costing-navigation-draft-title" className="confirm-dialog" onClose={onCancel} busy={saving}><h2 id="costing-navigation-draft-title">{factorsOnly ? 'Save estimate factors before changing the cost basis?' : 'Save costing changes before leaving?'}</h2><p>{factorsOnly ? 'The estimate factors of this trip profile have unsaved changes. The other cost basis uses another trip profile’s factors.' : 'Costing assumptions or estimate factors have unsaved changes.'}</p><div className="dialog-actions"><button autoFocus disabled={saving} onClick={onCancel}>Cancel</button><button className="danger" disabled={saving} onClick={onDiscard}>Discard</button><button className="primary" disabled={saving || saveDisabled} onClick={onSave}>{saving ? 'Saving…' : 'Save'}</button></div></ModalDialog>;
}
