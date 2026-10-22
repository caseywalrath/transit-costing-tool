// Phase 6 measurement (6.2): isolated cost, in Node, of the per-render computations inside ScheduleTable (App.tsx:1409-1481)
// on 500 Trips of one direction. Run: P6_SCRATCH=<dir> pnpm exec vitest run --config docs/review/golden/vitest.golden.config.ts p6-scheduletable-funcs
// Measurement only. Medians of 7 runs; container CPU.
import { it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { calculateTimepointHeadways } from '../../../src/domain/trips';
import { blendSegmentTimes, segmentStartTimes, selectRuntimeBand } from '../../../src/domain/runtime';
import { importProjectJson } from '../../../src/persistence/backup';
import { capacityBackup } from './p6-capacity-fixture';

const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const bench = (fn: () => unknown, n = 7) => { const xs: number[] = []; for (let i = 0; i < n; i++) { const t = performance.now(); fn(); xs.push(performance.now() - t); } return +med(xs).toFixed(2); };

it('ScheduleTable per-render computations at 500 Trips (one direction)', () => {
  const snap = importProjectJson(JSON.stringify(capacityBackup({ allOutbound: true })));
  const day = snap.serviceDays[0];
  const trips = snap.trips.filter((t) => t.serviceDayId === day.id);
  const patterns = snap.patterns;
  const pat = patterns[0];
  const profile = snap.runtimeProfiles.find((p) => p.patternId === pat.id)!;
  const out: Record<string, number> = { trips: trips.length };
  // App.tsx:1412 duplicate-departure check (O(n^2))
  out['duplicateKeys O(n^2) filter-in-filter, ms'] = bench(() => new Set(trips.filter((trip, _, all) => all.filter((item) => item.patternId === trip.patternId && item.stopTimes[0]?.time === trip.stopTimes[0]?.time).length > 1).map((trip) => `${trip.patternId}:${trip.stopTimes[0]?.time}`)));
  out['headways (showHeadways=true), ms'] = bench(() => calculateTimepointHeadways(trips, patterns));
  out['selectRuntimeBand x500 (singleBand rows), ms'] = bench(() => { for (const t of trips) selectRuntimeBand(profile, t.stopTimes[0].time); });
  out['blendSegmentTimes x500 (blend rows), ms'] = bench(() => { for (const t of trips) blendSegmentTimes(pat, t.stopTimes[0].time, { ...profile, calculationMethod: 'blendSegments' }); });
  out['segmentStartTimes x500 (segmentStart rows), ms'] = bench(() => { for (const t of trips) segmentStartTimes(pat, t.stopTimes[0].time, { ...profile, calculationMethod: 'segmentStart' }); });
  // selectedIds.includes per row (App.tsx:1481), all 500 selected: O(n^2)
  const selectedIds = trips.map((t) => t.id);
  out['selectedIds.includes x500 rows x3 uses (all selected), ms'] = bench(() => { let c = 0; for (const t of trips) for (let k = 0; k < 3; k++) if (selectedIds.includes(t.id)) c++; return c; });
  // per-cell pattern.points.find + stopTimes.find (30 columns per row)
  const cols = pat.points.map((p) => p.directionColumnId);
  out['per-cell pointFor+stopTimes.find x500x30, ms'] = bench(() => { let c = 0; for (const t of trips) for (const col of cols) { const pt = pat.points.find((p) => p.directionColumnId === col); const tm = pt && t.stopTimes.find((s) => s.patternPointId === pt.id)?.time; const si = pat.points.findIndex((p) => p.id === pt?.id); c += (tm ?? 0) + si; } return c; });
  console.log(JSON.stringify(out, null, 1));
  if (process.env.P6_SCRATCH) writeFileSync(`${process.env.P6_SCRATCH}/scheduletable-funcs.json`, JSON.stringify(out, null, 1));
});
