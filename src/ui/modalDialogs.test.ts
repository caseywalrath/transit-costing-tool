/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

// Review package U04 (I-036, finding 5-010): every modal dialog is built by `ModalDialog`, which owns focus, Tab, and Escape. A dialog
// that builds its own backdrop or declares `aria-modal` itself would lose those rules.
const uiSources = import.meta.glob<string>('./**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });

describe('modal dialogs', () => {
  it('are built only by ModalDialog', () => {
    const files = Object.keys(uiSources);
    expect(files).toContain('./ModalDialog.tsx');
    const own = files.filter((path) => !path.endsWith('.test.ts') && path !== './ModalDialog.tsx' && /modal-backdrop|aria-modal/.test(uiSources[path]));
    expect(own).toEqual([]);
  });

  it('are used by the modules that open dialogs', () => {
    const using = Object.keys(uiSources).filter((path) => !path.endsWith('.test.ts') && path !== './ModalDialog.tsx' && /<ModalDialog[\s>]/.test(uiSources[path])).sort();
    expect(using).toEqual(['./blocking/AutoBlockingDialog.tsx', './blocking/BlockingDayCopyDialog.tsx', './blocking/BlockingWorkspace.tsx', './costing/CostSummaryView.tsx', './costing/CostingWorkspace.tsx', './route/PlannedFrequencyDialogs.tsx', './route/RouteWorkspace.tsx', './shared/dialogs.tsx', './trips/RuntimeEditor.tsx', './trips/dialogs.tsx']);
    const count = (path: string) => (uiSources[path]!.match(/<ModalDialog[\s>]/g) ?? []).length;
    expect(using.reduce((total, path) => total + count(path), 0)).toBe(33); // The first-time edit added its block review (Change start time). PF5 added the three Planned frequencies dialogs (copy from a day, copy from a scenario, clear). AB4 (Decision 0055) added the Build blocks automatically dialog. UR-6c added the single-trip Change pattern review; S1 added the segment copy and fill dialog; BC4 added the Copy blocks dialog; Decision 0054 added the cost summary and its partial-estimate confirmation.
  });

  it('every ModalDialog is named, by a heading id or a label', () => {
    for (const [path, source] of Object.entries(uiSources)) {
      if (path.endsWith('.test.ts') || path === './ModalDialog.tsx') continue;
      for (const match of source.matchAll(/<ModalDialog\s([^>]*?)\sonClose=/g)) expect(match[1], `${path}: ${match[1]}`).toMatch(/\b(?:labelledBy|label)=/);
    }
  });
});
