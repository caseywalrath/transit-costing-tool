// Review check: every copy path must produce records whose references point at
// the copy, never back at the source records it was copied from.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { importProjectJson, cloneProjectSnapshot } from '../../../src/persistence/backup';
import { duplicateScenario, duplicateRouteRecords, snapshotForScenario } from '../../../src/domain/project';

const backup = () => importProjectJson(readFileSync(fileURLToPath(new URL('../../../output/federal-brt-import/federal-brt-project-backup.json', import.meta.url)), 'utf8'));
// Fields that intentionally record where a copy came from.
const PROVENANCE = new Set(['sourceScenarioId', 'sourceTripProfileId']);

function collectIds(value: unknown, ids = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => collectIds(item, ids));
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) { if (key === 'id' && typeof item === 'string') ids.add(item); collectIds(item, ids); }
  return ids;
}
/** Returns field paths whose *Id value is a source-record ID that does not exist in the copy. */
function sourceReferences(copy: unknown, sourceIds: Set<string>, copyIds: Set<string>, path = '', out: Record<string, number> = {}): Record<string, number> {
  if (Array.isArray(copy)) copy.forEach((item) => sourceReferences(item, sourceIds, copyIds, `${path}[]`, out));
  else if (copy && typeof copy === 'object') for (const [key, item] of Object.entries(copy)) {
    const field = `${path}.${key}`;
    if (key !== 'id' && /Id$/.test(key) && !PROVENANCE.has(key) && typeof item === 'string' && sourceIds.has(item) && !copyIds.has(item)) out[field.replace(/^\./, '')] = (out[field.replace(/^\./, '')] ?? 0) + 1;
    else sourceReferences(item, sourceIds, copyIds, field, out);
  }
  return out;
}

describe('copy paths do not reference their source records', () => {
  it('Scenario duplication', () => {
    const source = snapshotForScenario(backup() as any, backup().scenarios[0].id)!;
    const copy = duplicateScenario(source, 'Copy');
    const leaks = sourceReferences(copy, collectIds(source), collectIds(copy));
    console.log('scenario duplication', JSON.stringify(leaks));
    expect(leaks).toEqual({});
  });
  it('Project import-as-copy', () => {
    const source = backup();
    const copy = cloneProjectSnapshot(source);
    const leaks = sourceReferences(copy, collectIds(source), collectIds(copy));
    console.log('import-as-copy', JSON.stringify(leaks));
    expect(leaks).toEqual({});
  });
  it('Route duplication', () => {
    const records = snapshotForScenario(backup() as any, backup().scenarios[0].id)!;
    const sourceRouteId = records.routes[0].id;
    const { records: next, route } = duplicateRouteRecords(records, sourceRouteId, 'Route copy');
    // Records owned by the source route; the new route's records must not reference them.
    const routeOwned = (r: any) => ({ nodes: r.nodes.filter((x: any) => x.routeId === sourceRouteId), patterns: r.patterns.filter((x: any) => x.routeId === sourceRouteId), directions: (r.directions ?? []).filter((x: any) => x.routeId === sourceRouteId), runtimeProfiles: r.runtimeProfiles.filter((x: any) => x.routeId === sourceRouteId), trips: r.trips.filter((x: any) => x.routeId === sourceRouteId) });
    const newOwned = { nodes: next.nodes.filter((x) => x.routeId === route.id), patterns: next.patterns.filter((x) => x.routeId === route.id), directions: (next.directions ?? []).filter((x) => x.routeId === route.id), runtimeProfiles: next.runtimeProfiles.filter((x) => x.routeId === route.id), runtimeAssignments: next.runtimeAssignments.filter((a) => next.patterns.some((p) => p.id === a.patternId && p.routeId === route.id)), trips: next.trips.filter((x) => x.routeId === route.id) };
    const leaks = sourceReferences(newOwned, collectIds(routeOwned(records)), collectIds(newOwned));
    console.log('route duplication', JSON.stringify(leaks), JSON.stringify(Object.fromEntries(Object.entries(newOwned).map(([k, v]) => [k, v.length]))));
    expect(leaks).toEqual({});
  });
});
