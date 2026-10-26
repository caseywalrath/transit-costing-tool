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

  it('are used by the three workspaces that open dialogs', () => {
    const using = Object.keys(uiSources).filter((path) => !path.endsWith('.test.ts') && path !== './ModalDialog.tsx' && /<ModalDialog[\s>]/.test(uiSources[path])).sort();
    expect(using).toEqual(['./App.tsx', './BlockingWorkspace.tsx', './CostingWorkspace.tsx']);
    const count = (path: string) => (uiSources[path]!.match(/<ModalDialog[\s>]/g) ?? []).length;
    expect(count('./App.tsx') + count('./BlockingWorkspace.tsx') + count('./CostingWorkspace.tsx')).toBe(23);
  });

  it('every ModalDialog is named, by a heading id or a label', () => {
    for (const [path, source] of Object.entries(uiSources)) {
      if (path.endsWith('.test.ts') || path === './ModalDialog.tsx') continue;
      for (const match of source.matchAll(/<ModalDialog\s([^>]*?)\sonClose=/g)) expect(match[1], `${path}: ${match[1]}`).toMatch(/\b(?:labelledBy|label)=/);
    }
  });
});
