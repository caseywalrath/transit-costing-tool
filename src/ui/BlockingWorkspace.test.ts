import { describe, expect, it } from 'vitest';
import { formatBlockingDuration } from './BlockingWorkspace';

describe('formatBlockingDuration', () => {
  it('keeps overlapping connection gaps visible without treating them as service times', () => {
    expect(formatBlockingDuration(-600)).toBe('−0:10');
    expect(formatBlockingDuration(600)).toBe('0:10');
    expect(formatBlockingDuration(undefined)).toBe('—');
  });
});
