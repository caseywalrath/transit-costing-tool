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

// Review package P15 (finding 4-014): the interface calls application functions for every calculation. `App.tsx` imports from `src/domain`
// only error classes, text helpers (parse and format), and identifier helpers. Types are not counted.
const DOMAIN_VALUE_IMPORTS_ALLOWED_IN_APP = new Set(['AnchorBandChoiceError', 'TripGenerationError', 'TripShiftValidationError', 'formatRuntimeDuration', 'parseRuntimeDuration', 'formatServiceTime', 'parseServiceTime', 'metadata', 'newId']);

/** The names a source file imports as values (not types) from `src/domain`. */
export function domainValueImports(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(/import\s*(type\s+)?\{([^}]*)\}\s*from\s*['"]\.\.\/domain\/[^'"]+['"]/g)) {
    if (match[1]) continue;
    for (const part of match[2].split(',')) {
      const name = part.trim();
      if (name && !name.startsWith('type ')) names.push(name.split(/\s+as\s+/)[0].trim());
    }
  }
  return names;
}

describe('App.tsx and the domain', () => {
  it('imports no calculation from src/domain, only error classes, text helpers, and identifier helpers', () => {
    expect(domainValueImports(uiSources['./App.tsx']).filter((name) => !DOMAIN_VALUE_IMPORTS_ALLOWED_IN_APP.has(name))).toEqual([]);
  });

  it('detects value imports and ignores type imports', () => {
    const source = `import { metadata, type Trip, newId as makeId } from '../domain/ids';\nimport type { Block } from '../domain/types';\nimport { selectRuntimeBand } from '../domain/runtime';`;
    expect(domainValueImports(source)).toEqual(['metadata', 'newId', 'selectRuntimeBand']);
  });
});
