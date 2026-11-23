// Step 4 of the GTFS import dialog: timepoints, patterns, blocks, where the trips go (level C) and planned frequencies (Decision 0089
// items 26, 32, 33 and 35; sub-plan I9 item 1). The step holds no rules; it draws the choices and reports changes.

import type { ReactNode } from 'react';
import { InlineNote } from '../shared/surfaces';
import type { TimepointMode } from '../../domain/gtfs/routeFromFeed';
import { type FeedFacts, type ImportLevel, MINUTES_MESSAGE, type OptionChoices, wholeMinutes } from './gtfsImportReviewModel';

export interface OptionsStepView {
  level: ImportLevel;
  facts: FeedFacts;
  choices: OptionChoices;
  /** Level C: the Trip profiles of the Scenario, and the Blocking scenarios of the chosen one. */
  tripProfiles: Array<{ id: string; name: string }>;
  blockingScenarios: Array<{ id: string; name: string }>;
  /** True when the blocks will be imported, so their minutes are required. */
  blocksOn: boolean;
}

export interface OptionsStepHandlers {
  onChange: (change: Partial<OptionChoices>) => void;
}

function Panel({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return <section className="gtfs-panel" aria-label={title}>
    <div className="gtfs-panel-head"><span>{title}</span>{note}</div>
    <div className="gtfs-option-body">{children}</div>
  </section>;
}

export function OptionsStep({ view, handlers }: { view: OptionsStepView; handlers: OptionsStepHandlers }) {
  const { choices, facts } = view;
  const pullOutBad = view.blocksOn && wholeMinutes(choices.pullOutMinutes) === undefined;
  const pullInBad = view.blocksOn && wholeMinutes(choices.pullInMinutes) === undefined;
  const modes: Array<{ value: TimepointMode; label: string; disabled?: boolean }> = [
    { value: 'feed', label: `Use the feed's timepoints${facts.marksTimepoints ? ' (this feed marks them)' : ''}`, disabled: !facts.marksTimepoints },
    { value: 'suggested', label: 'Suggest timepoints, about one per 10 minutes' },
  ];
  return <section aria-labelledby="gtfs-step-options" className="gtfs-step">
    <h3 id="gtfs-step-options" className="visually-hidden">Options</h3>
    <Panel title="Timepoints">
      <fieldset className="gtfs-radio-group">
        <legend className="visually-hidden">Where the timepoints come from</legend>
        {modes.map((mode) => <label key={mode.value} className="gtfs-radio">
          <input type="radio" name="gtfs-timepoint-mode" value={mode.value} checked={choices.timepointMode === mode.value} disabled={mode.disabled} onChange={() => handlers.onChange({ timepointMode: mode.value })} />
          <span>{mode.label}</span>
        </label>)}
      </fieldset>
      {!facts.marksTimepoints && <p className="gtfs-note">This feed marks no timepoints.</p>}
      <p className="gtfs-note">At most 30 per pattern. You can change them per pattern on the next step.</p>
    </Panel>

    <Panel title="Patterns">
      <p className="gtfs-note">One pattern per sequence of timepoints in each direction.</p>
      <p className="gtfs-note">Trips that differ only in stops between timepoints share a pattern; the report lists them.</p>
    </Panel>

    {facts.blockCount > 0 && <Panel title="Blocks">
      <label className="gtfs-switch"><input type="checkbox" checked={choices.importBlocks} onChange={(event) => handlers.onChange({ importBlocks: event.currentTarget.checked })} /> Import the feed's blocks ({facts.blockCount.toLocaleString('en-US')} in the selected routes)</label>
      {choices.importBlocks && <div className="gtfs-minutes">
        <label className="gtfs-field">Pull-out minutes<input inputMode="numeric" className="gtfs-number" value={choices.pullOutMinutes} aria-invalid={pullOutBad || undefined} onChange={(event) => handlers.onChange({ pullOutMinutes: event.currentTarget.value })} /></label>
        <label className="gtfs-field">Pull-in minutes<input inputMode="numeric" className="gtfs-number" value={choices.pullInMinutes} aria-invalid={pullInBad || undefined} onChange={(event) => handlers.onChange({ pullInMinutes: event.currentTarget.value })} /></label>
        <span className="gtfs-note">Required; 0 is allowed.</span>
      </div>}
      {(pullOutBad || pullInBad) && <p className="gtfs-refusal" role="alert">{MINUTES_MESSAGE}</p>}
      <p className="gtfs-note">A block is imported only when all its trips are being imported. Others are listed, and their trips are left for Auto-blocking.</p>
    </Panel>}

    {view.level === 'C' && <Panel title="Where the trips go" note={<span className="gtfs-chip">level C</span>}>
      <div className="gtfs-toolbar">
        <label className="gtfs-field">Trip profile<select value={choices.tripProfileId} onChange={(event) => handlers.onChange({ tripProfileId: event.currentTarget.value })}>
          {view.tripProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
        </select></label>
        <label className="gtfs-field">Blocking scenario<select value={choices.blockingScenarioId} disabled={facts.blockCount === 0} onChange={(event) => handlers.onChange({ blockingScenarioId: event.currentTarget.value })}>
          {view.blockingScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
          <option value="">Don't import blocks</option>
        </select></label>
      </div>
      <p className="gtfs-note">Other Trip profiles get no trips for these routes.</p>
    </Panel>}

    <Panel title="Planned frequencies">
      <label className="gtfs-switch"><input type="checkbox" disabled checked={false} readOnly /> Also create planned frequencies from frequencies.txt</label>
      <p className="gtfs-note">{facts.hasFrequencies ? 'Not available yet.' : 'Off: this feed has no frequencies.txt.'}</p>
    </Panel>
    {view.level === 'C' && view.tripProfiles.length === 0 && <InlineNote kind="warn">This Scenario has no Trip profile to receive the trips.</InlineNote>}
  </section>;
}
