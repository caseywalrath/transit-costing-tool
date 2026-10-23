// Review package U05 (I-083, finding 4-026): an older response never replaces a newer one.
import { describe, expect, it } from 'vitest';
import { createLatestRequest } from './latestRequest';

describe('createLatestRequest', () => {
  it('reports only the most recently started request as current', () => {
    const requests = createLatestRequest();
    const first = requests.begin();
    expect(first()).toBe(true);
    const second = requests.begin();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it('keeps the newest result when responses arrive out of order', async () => {
    const requests = createLatestRequest();
    let shown = '';
    const load = async (name: string, delay: number) => { const current = requests.begin(); await new Promise((resolve) => setTimeout(resolve, delay)); if (current()) shown = name; };
    await Promise.all([load('older', 30), load('newer', 5)]);
    expect(shown).toBe('newer');
  });

  it('keeps independent counters for independent kinds of request', () => {
    const blocks = createLatestRequest(); const scenarios = createLatestRequest();
    const block = blocks.begin(); scenarios.begin();
    expect(block()).toBe(true);
  });
});
