// Phase 6 review helper (not a test). Builds a schema-6 backup at the OV-CAP-01 capacity targets:
// 1 Scenario, 1 Route, 4 service days, 2 Patterns of 30 points, 500 Trips per day (2,000 total),
// 100 Blocks per day. `tripsPerBlock` controls Block fill (5 => every Trip assigned; 2 or 3 => unassigned
// candidates remain). Never writes files; p6 specs/tests write JSON to a scratch dir.
import { goldenRaw } from './p3-fixture';

export interface CapacityOpts { tripsPerBlock?: number; blocksPerDay?: number; tripsPerDay?: number; points?: number; allOutbound?: boolean; calculationMethod?: 'singleBand' | 'blendSegments' | 'segmentStart' }

export function capacityBackup(o: CapacityOpts = {}): any {
  const tpb = o.tripsPerBlock ?? 5, bpd = o.blocksPerDay ?? 100, tpd = o.tripsPerDay ?? 500, N = o.points ?? 30;
  const g = goldenRaw();
  const ts = g.exportedAt;
  const scenarioId = g.scenarios[0].id, routeId = g.routes[0].id, tripProfileId = g.tripProfiles[0].id, blockingScenarioId = g.blockingScenarios[0].id;
  const out: any = { format: g.format, exportSchemaVersion: 6, exportedAt: ts, project: g.project, scenarios: g.scenarios, serviceDays: g.serviceDays, routes: g.routes, tripProfiles: g.tripProfiles, blockingScenarios: g.blockingScenarios, costingAssumptions: [{ id: 'p6-costing', scenarioId: g.scenarios[0].id, currencyCode: 'USD', enteredRate: 150, rateYear: 2025, sourceType: 'user', baseServiceYear: 2026, futureYearCount: 5, annualEscalation: 0.03, createdAt: ts, updatedAt: ts }] };
  const meta = { createdAt: ts, updatedAt: ts };
  const nodes = Array.from({ length: N }, (_, i) => ({ id: `p6-node-${i}`, scenarioId, routeId, name: `Stop ${i}`, kind: i === 0 || i === N - 1 ? 'terminal' : 'timepoint', ...meta }));
  const mkDir = (name: string, group: 'outbound' | 'inbound', seq: number, order: number[]) => ({ id: `p6-dir-${group}`, scenarioId, routeId, name, group, sequence: seq, columns: order.map((n, s) => ({ id: `p6-col-${group}-${s}`, nodeId: `p6-node-${n}`, sequence: s })), ...meta });
  const fwd = Array.from({ length: N }, (_, i) => i), rev = [...fwd].reverse();
  out.nodes = nodes;
  out.directions = [mkDir('Outbound', 'outbound', 0, fwd), mkDir('Inbound', 'inbound', 1, rev)];
  const mkPat = (group: 'outbound' | 'inbound', order: number[], seq: number) => ({ id: `p6-pat-${group}`, scenarioId, routeId, directionId: `p6-dir-${group}`, name: `${group} ${N} points`, sequence: seq, points: order.map((n, s) => ({ id: `p6-pt-${group}-${s}`, nodeId: `p6-node-${n}`, directionColumnId: `p6-col-${group}-${s}`, sequence: s, cumulativeMiles: s * 0.5 })), ...meta });
  const pats = [mkPat('outbound', fwd, 0), mkPat('inbound', rev, 1)];
  out.patterns = pats;
  const seg = (base: number) => Array.from({ length: N - 1 }, (_, i) => base + (i % 3) * 30);
  const bands = (g0: string) => [[0, 21600, 60], [21600, 36000, 75], [36000, 64800, 70], [64800, 108000, 60]].map(([a, b, r], i) => ({ id: `p6-band-${g0}-${i}`, label: `Band ${i}`, sequence: i, startTime: a, endTime: b, segmentRuntimeSeconds: seg(r) }));
  out.runtimeProfiles = pats.map((p) => ({ id: `p6-rp-${p.id}`, scenarioId, routeId, patternId: p.id, name: 'Capacity runtimes', calculationRevision: 0, ...(o.calculationMethod ? { calculationMethod: o.calculationMethod } : {}), bands: bands(p.id), ...meta }));
  out.runtimeAssignments = g.serviceDays.flatMap((d: any) => pats.map((p) => ({ id: `p6-ra-${d.id}-${p.id}`, scenarioId, patternId: p.id, serviceDayId: d.id, runtimeProfileId: `p6-rp-${p.id}`, ...meta })));
  out.trips = []; out.blocks = [];
  const tripDur = (N - 1) * 70; // approx; actual stop times use per-segment runtimes below
  const stopTimes = (p: any, start: number) => { let t = start; return p.points.map((pt: any, s: number) => { if (s > 0) t += 60 + ((s - 1) % 3) * 30; return { patternPointId: pt.id, sequence: s, time: t }; }); };
  const cycle = 2 * ((N - 1) * 75) + 900; // out + in + layover (approx)
  for (const d of g.serviceDays) {
    const tripsOfDay: any[] = [];
    const blockCount = bpd, perBlockMax = tpb;
    // Assigned trips: bpd blocks * tpb; any remaining trips (tpd - assigned) are unassigned, scattered at the day's tail.
    const assigned = Math.min(tpd, bpd * tpb);
    let n = 0;
    const mkTrip = (pat0: any, start: number) => { const pat = o.allOutbound ? pats[0] : pat0; const id = `p6-trip-${d.id.slice(0, 4)}-${n++}`; const t = { id, scenarioId, routeId, serviceDayId: d.id, patternId: pat.id, tripProfileId, stopTimes: stopTimes(pat, start), provenance: { kind: 'manual', creationMethod: 'manual', manuallyChangedFields: [] }, ...meta }; out.trips.push(t); tripsOfDay.push(t); return t; };
    const blocksTrips: any[][] = [];
    for (let b = 0; b < blockCount; b++) {
      const bt: any[] = []; const startBase = 14400 + b * 301;
      for (let j = 0; j < tpb; j++) {
        if (n >= assigned) break;
        const outFirst = b % 2 === 0; const useOut = (j % 2 === 0) === outFirst;
        bt.push(mkTrip(useOut ? pats[0] : pats[1], startBase + j * 2400));
      }
      blocksTrips.push(bt);
    }
    while (n < tpd) { const k = n; mkTrip(pats[k % 2], 14400 + 7 + (k * 97) % 40000 + (k % 5)); }
    blocksTrips.forEach((bt, b) => {
      if (!bt.length) return;
      const acts: any[] = []; let seq = 0;
      const firstPat = pats.find((p) => p.id === bt[0].patternId)!; const lastPat = pats.find((p) => p.id === bt[bt.length - 1].patternId)!;
      acts.push({ id: `p6-po-${d.id.slice(0, 4)}-${b}`, type: 'pullOut', sequence: seq++, minutesBeforeFirstTrip: 30, toNodeId: firstPat.points[0].nodeId });
      for (const t of bt) acts.push({ id: `p6-ra-${t.id}`, type: 'revenueTrip', sequence: seq++, tripId: t.id });
      acts.push({ id: `p6-pi-${d.id.slice(0, 4)}-${b}`, type: 'pullIn', sequence: seq++, minutesAfterLastTrip: 15, fromNodeId: lastPat.points.at(-1).nodeId });
      out.blocks.push({ id: `p6-block-${d.id.slice(0, 4)}-${b}`, scenarioId, blockingScenarioId, serviceDayId: d.id, label: String(b + 1), activities: acts, ...meta });
    });
    void tripDur; void cycle; void perBlockMax;
  }
  return out;
}
