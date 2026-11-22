import { describe, expect, it } from 'vitest';
import { assumptionsRecord, EXAMPLE, exampleRecords, memorySources } from './compareTestSupport';
import { applyRateChoice, rateValues, sameRates, sideAssumptions } from './compareAssumptions';
import type { CompareProgress, SideComputeInput } from './compareTypes';
import { CompareService } from './compareService';
import { createCompareEngine, type CompareWorkerLike, type CompareWorkerRequest, type CompareWorkerResponse } from './compareWorkerClient';
import { createSaveStamp } from './saveStamp';
import { computeSide } from './sideCompute';
import { SaveStatusPublisher } from '../saveStatus';

/** A worker that runs the real computation, one request at a time, and posts its messages back as a browser does (after the call returns). */
class FakeWorker implements CompareWorkerLike {
  onmessage: ((event: MessageEvent<CompareWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  received: CompareWorkerRequest[] = [];
  terminated = false;
  /** What to do with the next request: answer it, crash during it, throw from postMessage, or fail the computation. */
  mode: 'answer' | 'crash' | 'throwOnPost' | 'fail' = 'answer';

  postMessage(request: CompareWorkerRequest): void {
    if (this.mode === 'throwOnPost') throw new Error('DataCloneError');
    this.received.push(request);
    queueMicrotask(() => {
      const reply = (message: CompareWorkerResponse) => this.onmessage?.({ data: message } as MessageEvent<CompareWorkerResponse>);
      if (this.mode === 'crash') { this.onerror?.({ message: 'worker crashed' } as ErrorEvent); return; }
      if (this.mode === 'fail') { reply({ id: request.id, type: 'error', message: 'boom' }); return; }
      const result = computeSide(request.input, (progress) => reply({ id: request.id, type: 'progress', progress }));
      reply({ id: request.id, type: 'computed', result });
    });
  }

  terminate(): void { this.terminated = true; }
}

function exampleInput(): SideComputeInput {
  const records = exampleRecords();
  const scenarioId = EXAMPLE.baseline.scenarioId;
  return {
    side: 'baseline',
    basis: { kind: 'estimated', context: {
      scenario: records.scenarios.find((item) => item.id === scenarioId)!,
      serviceDays: records.serviceDays.filter((item) => item.scenarioId === scenarioId),
      tripProfile: records.tripProfiles.find((item) => item.scenarioId === scenarioId)!,
      trips: records.trips.filter((item) => item.scenarioId === scenarioId),
      patterns: records.patterns.filter((item) => item.scenarioId === scenarioId),
      routes: records.routes.filter((item) => item.scenarioId === scenarioId),
    } },
    assumptions: sideAssumptions(records.costingAssumptions.find((item) => item.scenarioId === scenarioId), EXAMPLE.baseline.tripProfileId, true, 2026),
    patterns: records.patterns.filter((item) => item.scenarioId === scenarioId),
    directions: records.directions.filter((item) => item.scenarioId === scenarioId),
  };
}

describe('Comparison worker client', () => {
  it('uses the worker when there is one, passing progress through, and gives the same result as the main thread', async () => {
    const worker = new FakeWorker();
    const engine = createCompareEngine(() => worker);
    const seen: CompareProgress[] = [];
    const input = exampleInput();
    const result = await engine.computeSide(input, (progress) => seen.push(progress));
    expect(worker.received).toHaveLength(1);
    expect(result).toEqual(computeSide(input));
    expect(seen.map((progress) => progress.message)).toEqual(['Costing baseline…', 'Costing baseline…', 'Measuring baseline… 1 of 3 routes', 'Measuring baseline… 2 of 3 routes', 'Measuring baseline… 3 of 3 routes']);
    engine.dispose();
    expect(worker.terminated).toBe(true);
  });

  it('runs on the main thread when the browser has no worker, or the worker cannot be made', async () => {
    const input = exampleInput();
    const seen: CompareProgress[] = [];
    expect(await createCompareEngine(() => undefined).computeSide(input, (progress) => seen.push(progress))).toEqual(computeSide(input));
    expect(seen.length).toBeGreaterThan(0);
    expect(await createCompareEngine(() => { throw new Error('no worker'); }).computeSide(input)).toEqual(computeSide(input));
  });

  it('keeps the request when the worker crashes mid-run: it runs again on the main thread, and so does every later request', async () => {
    const worker = new FakeWorker();
    worker.mode = 'crash';
    const engine = createCompareEngine(() => worker);
    const input = exampleInput();
    const seen: CompareProgress[] = [];
    expect(await engine.computeSide(input, (progress) => seen.push(progress))).toEqual(computeSide(input));
    expect(worker.terminated).toBe(true);
    expect(seen.length).toBeGreaterThan(0);
    const later = await engine.computeSide(input);
    expect(later).toEqual(computeSide(input));
    // The crashed worker is not asked again.
    expect(worker.received).toHaveLength(1);
  });

  it('runs on the main thread when the worker cannot take the message', async () => {
    const worker = new FakeWorker();
    worker.mode = 'throwOnPost';
    const input = exampleInput();
    expect(await createCompareEngine(() => worker).computeSide(input)).toEqual(computeSide(input));
  });

  it('does not run again an error the computation itself raised', async () => {
    const worker = new FakeWorker();
    worker.mode = 'fail';
    await expect(createCompareEngine(() => worker).computeSide(exampleInput())).rejects.toThrow('boom');
    expect(worker.terminated).toBe(false);
  });

  it('serves a whole comparison through the worker', async () => {
    const worker = new FakeWorker();
    const records = exampleRecords();
    const service = new CompareService(memorySources(records), () => '1', () => createCompareEngine(() => worker));
    const outcome = await service.compare({ baseline: EXAMPLE.baseline, proposed: EXAMPLE.proposed, day: 'weekday', rates: 'baseline', counts: 'baseline' });
    expect(outcome.status).toBe('ok');
    expect(worker.received.map((request) => request.input.side)).toEqual(['baseline', 'proposed']);
    service.dispose();
    expect(worker.terminated).toBe(true);
  });
});

describe('Rate choice', () => {
  const base = sideAssumptions(assumptionsRecord('a', 'p1'), 'p1', true, 2026);
  const other = sideAssumptions(assumptionsRecord('b', 'p2', { enteredRate: 140, rateYear: 2025, baseServiceYear: 2028, futureYearCount: 3, annualEscalation: 0.05, sourceType: 'ntd' }), 'p2', true, 2026);

  it('moves the five rate values and leaves the estimate factors and the rate source with their side', () => {
    const { baseline, proposed } = applyRateChoice('baseline', base, other);
    expect(baseline).toEqual(base);
    expect(rateValues(proposed)).toEqual(rateValues(base));
    expect(proposed.estimateFactors).toEqual(other.estimateFactors);
    expect(proposed.sourceType).toBe('ntd');
    expect(sameRates(rateValues(proposed), rateValues(base))).toBe(true);
    expect(applyRateChoice('own', base, other)).toEqual({ baseline: base, proposed: other });
    expect(rateValues(applyRateChoice('proposed', base, other).baseline)).toEqual(rateValues(other));
  });

  it('removes the other side\'s rate when the chosen side has none, and defaults to no rate for a Scenario with no assumptions', () => {
    const none = sideAssumptions(undefined, 'p1', true, 2026);
    expect(none).toMatchObject({ rateYear: 2026, baseServiceYear: 2026, futureYearCount: 10 });
    expect(none.enteredRate).toBeUndefined();
    expect(applyRateChoice('baseline', none, other).proposed.enteredRate).toBeUndefined();
  });

  it('gives a blocked side no estimate factors', () => {
    const blocked = sideAssumptions(assumptionsRecord('a', 'p1'), 'p1', false, 2026);
    expect(blocked.estimateFactors).toBeUndefined();
    expect(blocked.routeEstimateFactors).toBeUndefined();
  });
});

describe('Save stamp', () => {
  it('changes with every save status change, and not when subscribed', async () => {
    const publisher = new SaveStatusPublisher();
    const { stamp, stop } = createSaveStamp(publisher);
    const first = stamp();
    expect(stamp()).toBe(first);
    await publisher.run(async () => undefined);
    const second = stamp();
    expect(second).not.toBe(first);
    stop();
    await publisher.run(async () => undefined);
    expect(stamp()).toBe(second);
  });
});
