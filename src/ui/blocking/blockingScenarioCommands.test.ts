import { describe, expect, it } from 'vitest';
import { blockingScenarioDeleteText, blockingScenarioDialogTitle, blockingScenarioSubmitLabel } from './blockingScenarioCommands';

describe('Blocking scenario dialogs', () => {
  it('names each dialog and its submit button by mode', () => {
    expect(blockingScenarioDialogTitle('create')).toBe('New blocking scenario');
    expect(blockingScenarioDialogTitle('duplicate')).toBe('Duplicate blocking scenario');
    expect(blockingScenarioDialogTitle('rename')).toBe('Rename blocking scenario');
    expect(blockingScenarioSubmitLabel('create')).toBe('Create');
    expect(blockingScenarioSubmitLabel('duplicate')).toBe('Duplicate');
    expect(blockingScenarioSubmitLabel('rename')).toBe('Rename');
  });

  it('states the Blocks and activities that a scenario deletion removes', () => {
    expect(blockingScenarioDeleteText('Default', { blockCount: 1, activityCount: 1 })).toBe('Delete “Default” with 1 block and 1 activity across every service day? This cannot be undone.');
    expect(blockingScenarioDeleteText('Peak', { blockCount: 3, activityCount: 0 })).toBe('Delete “Peak” with 3 blocks and 0 activities across every service day? This cannot be undone.');
  });
});
