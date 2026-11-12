import { useState, type ReactNode } from 'react';
import type { BlockingCommands, BlockingQueries } from '../../application/ports';
import type { BlockingScenarioDeletionImpact } from '../../domain/blocking';
import type { BlockingScenario } from '../../domain/types';
import type { MenuItem } from '../menuItems';
import { Confirm, NameDialog, plural } from './blockingDialogs';

// Decision 0076 item 10: the Blocking and Trips tabs build their Blocking Scenario menu items and dialogs here, so the two cannot drift.

export type BlockingScenarioDialogMode = 'create' | 'duplicate' | 'rename';
type BlockingApplication = BlockingCommands & BlockingQueries;

export function blockingScenarioDialogTitle(mode: BlockingScenarioDialogMode) { return mode === 'create' ? 'New blocking scenario' : mode === 'duplicate' ? 'Duplicate blocking scenario' : 'Rename blocking scenario'; }
export function blockingScenarioSubmitLabel(mode: BlockingScenarioDialogMode) { return mode === 'duplicate' ? 'Duplicate' : mode === 'rename' ? 'Rename' : 'Create'; }
/** The text of the delete confirmation: the Blocks and activities that the deletion removes. */
export function blockingScenarioDeleteText(name: string, impact: Pick<BlockingScenarioDeletionImpact, 'blockCount' | 'activityCount'>) { return `Delete “${name}” with ${plural(impact.blockCount, 'block')} and ${plural(impact.activityCount, 'activity', 'activities')} across every service day? This cannot be undone.`; }

export type BlockingScenarioCommandsOptions = {
  blockingService: BlockingApplication;
  scenarioId: string;
  /** Undefined disables New. */
  tripProfileId: string | undefined;
  selected: BlockingScenario | undefined;
  /** The source signature of the selected Blocking Scenario; a stale one is refused by the service. */
  sourceSignature: () => string;
  /** The caller's own condition that disables every item, beyond `busy`. */
  disabled: boolean;
  /** The caller's busy flag. Scenario writes set it, so the caller's other controls follow the write. */
  busy: boolean;
  setBusy: (busy: boolean) => void;
  /** Runs when New is chosen, before its dialog opens. */
  onBeforeCreate?: () => void;
  /** The caller selects and remembers the new scenario (the hook imports no workspace, so Trips can use it without an import cycle). */
  onCreated: (created: BlockingScenario) => void;
  onDeleted: () => void;
  /** Reloads after any scenario write. */
  onChanged: () => Promise<void>;
  onError: (error: unknown, fallback: string) => void;
};

export type BlockingScenarioCommands = {
  items: { create: MenuItem; duplicate: MenuItem; rename: MenuItem; remove: MenuItem };
  /** The Name dialog and the delete confirmation. Render once, where the caller holds them. */
  dialogs: ReactNode;
};

export function useBlockingScenarioCommands({ blockingService, scenarioId, tripProfileId, selected, sourceSignature, disabled, busy, setBusy, onBeforeCreate, onCreated, onDeleted, onChanged, onError }: BlockingScenarioCommandsOptions): BlockingScenarioCommands {
  const [dialog, setDialog] = useState<{ mode: BlockingScenarioDialogMode; value: string }>();
  const [pendingDelete, setPendingDelete] = useState<{ scenario: BlockingScenario; impact: BlockingScenarioDeletionImpact }>();
  const blocked = disabled || busy;

  async function save(name: string) {
    if (!tripProfileId) return;
    setBusy(true);
    try {
      if (dialog?.mode === 'rename' && selected) await blockingService.renameBlockingScenario(selected.id, name, sourceSignature());
      else if (dialog?.mode === 'duplicate' && selected) await blockingService.duplicateBlockingScenario(selected.id, name, sourceSignature());
      else {
        const created = await blockingService.createBlockingScenario({ scenarioId, tripProfileId, name });
        onCreated(created);
      }
      setDialog(undefined);
      await onChanged();
    } catch (error) { onError(error, 'Unable to save the blocking scenario.'); }
    finally { setBusy(false); }
  }

  async function requestDelete() {
    if (!selected) return;
    try { setPendingDelete({ scenario: selected, impact: await blockingService.previewDeleteBlockingScenario(selected.id) }); }
    catch (error) { onError(error, 'Unable to review the blocking scenario deletion.'); }
  }

  function confirmDelete(scenario: BlockingScenario, impact: BlockingScenarioDeletionImpact) {
    setBusy(true);
    void blockingService.deleteBlockingScenario(scenario.id, impact.sourceSignature)
      .then(async () => { onDeleted(); setPendingDelete(undefined); await onChanged(); })
      .catch((error) => { setPendingDelete(undefined); onError(error, 'Unable to delete the blocking scenario.'); })
      .finally(() => setBusy(false));
  }

  const items: BlockingScenarioCommands['items'] = {
    create: { id: 'new', label: 'New blocking scenario…', restoreFocus: false, disabled: blocked || !tripProfileId, onSelect: () => { onBeforeCreate?.(); setDialog({ mode: 'create', value: '' }); } },
    duplicate: { id: 'duplicate', label: 'Duplicate blocking scenario…', restoreFocus: false, disabled: !selected || blocked, onSelect: () => { if (selected) setDialog({ mode: 'duplicate', value: selected.name + ' Copy' }); } },
    rename: { id: 'rename', label: 'Rename blocking scenario…', restoreFocus: false, disabled: !selected || blocked, onSelect: () => { if (selected) setDialog({ mode: 'rename', value: selected.name }); } },
    remove: { id: 'delete', label: 'Delete blocking scenario…', destructive: true, restoreFocus: false, disabled: !selected || blocked, onSelect: () => void requestDelete() },
  };

  const dialogs = <>
    {dialog && <NameDialog title={blockingScenarioDialogTitle(dialog.mode)} initialValue={dialog.value} submitLabel={blockingScenarioSubmitLabel(dialog.mode)} busy={busy} onSubmit={save} onClose={() => setDialog(undefined)} />}
    {pendingDelete && <Confirm title="Delete blocking scenario?" text={blockingScenarioDeleteText(pendingDelete.scenario.name, pendingDelete.impact)} label="Delete blocking scenario" busy={busy} onConfirm={() => confirmDelete(pendingDelete.scenario, pendingDelete.impact)} onClose={() => setPendingDelete(undefined)} />}
  </>;

  return { items, dialogs };
}
