import { describe, expect, it } from 'vitest';
import { singleFlight } from './singleFlight';

/** A run that can be finished by hand, and that records how many runs overlap. */
function manualRuns() {
  const state = { started: 0, active: 0, maxActive: 0, finish: [] as Array<(value: number) => void> };
  const run = () => new Promise<number>((resolve) => {
    state.started += 1; state.active += 1; state.maxActive = Math.max(state.maxActive, state.active);
    state.finish.push((value) => { state.active -= 1; resolve(value); });
  });
  return { state, run };
}

describe('singleFlight', () => {
  it('runs once for one call and returns the result', async () => {
    const { state, run } = manualRuns();
    const load = singleFlight(run);
    const result = load();
    state.finish.shift()!(7);
    expect(await result).toBe(7);
    expect(state.started).toBe(1);
  });

  it('never overlaps itself: calls made while it runs wait for one more run, and every caller gets the last result', async () => {
    const { state, run } = manualRuns();
    const load = singleFlight(run);
    const first = load(); const second = load(); const third = load();
    expect(state.started).toBe(1);
    state.finish.shift()!(1);
    await Promise.resolve(); await Promise.resolve();
    expect(state.started).toBe(2);
    state.finish.shift()!(2);
    expect(await Promise.all([first, second, third])).toEqual([2, 2, 2]);
    expect(state.started).toBe(2);
    expect(state.maxActive).toBe(1);
  });

  it('starts a fresh run for a call made after it ended, and recovers after a failure', async () => {
    let calls = 0;
    const load = singleFlight(async () => { calls += 1; if (calls === 1) throw new Error('first run fails'); return calls; });
    await expect(load()).rejects.toThrow('first run fails');
    expect(await load()).toBe(2);
  });

  it('runs again with whatever the caller changed during the first run (the second run reads the newest inputs)', async () => {
    let input = 'old';
    const seen: string[] = [];
    const { state, run } = manualRuns();
    const load = singleFlight(() => { seen.push(input); return run(); });
    const pending = load();
    input = 'new';
    void load();
    state.finish.shift()!(1);
    await Promise.resolve(); await Promise.resolve();
    state.finish.shift()!(2);
    await pending;
    expect(seen).toEqual(['old', 'new']);
  });
});
