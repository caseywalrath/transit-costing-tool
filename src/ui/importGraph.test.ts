/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

// Architecture rule (AGENTS.md, review finding 4-013, decision 12): the interface layer reaches storage and serializers only through
// `src/application`. No module in `src/ui` imports from `src/persistence`.
const persistenceImport = /(?:from\s+|import\s*\(\s*|import\s+)['"][^'"]*\/persistence(?:\/[^'"]*)?['"]/;
const uiSources = import.meta.glob<string>('./**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });

describe('src/ui import graph', () => {
  it('has no module that imports from src/persistence (static, re-export, or dynamic)', () => {
    const files = Object.keys(uiSources);
    expect(files).toContain('./App.tsx');
    const offenders = files.filter((path) => !path.endsWith('importGraph.test.ts') && persistenceImport.test(uiSources[path]));
    expect(offenders).toEqual([]);
  });

  it('detects the import forms it is meant to forbid', () => {
    expect(persistenceImport.test(`import { toCsv } from '../persistence/csv';`)).toBe(true);
    expect(persistenceImport.test(`export { createCsvArchive } from '../persistence/csv';`)).toBe(true);
    expect(persistenceImport.test(`const m = await import('../persistence/csv');`)).toBe(true);
    expect(persistenceImport.test(`import '../persistence/csv';`)).toBe(true);
    expect(persistenceImport.test(`import { x } from '../application/csvDownload';`)).toBe(false);
  });
});
