import { describe, expect, it } from 'vitest';
import { greatCircleMiles } from './geo';

describe('greatCircleMiles (Decision 0085 item 8, section 4.5)', () => {
  it('gives 0.71 miles between the section 4.5 example points', () => {
    const distance = greatCircleMiles({ latitude: 39.912274, longitude: -104.99353 }, { latitude: 39.914169, longitude: -105.006705 });
    expect(distance).toBeCloseTo(0.71, 2);
  });

  it('gives 0 from a point to itself', () => {
    expect(greatCircleMiles({ latitude: 39.912274, longitude: -104.99353 }, { latitude: 39.912274, longitude: -104.99353 })).toBe(0);
  });
});
