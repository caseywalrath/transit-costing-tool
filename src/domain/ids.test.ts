// P16 (I-068, finding 2-014): domain identifiers come from one generator that a test can replace.
import { describe, expect, it } from 'vitest';
import { newId, setIdGenerator } from './ids';

describe('newId', () => {
  it('returns unique identifiers by default', () => {
    expect(newId()).not.toBe(newId());
  });

  it('uses an injected generator until it is restored', () => {
    let counter = 0;
    const restore = setIdGenerator(() => `fixed-${++counter}`);
    expect([newId(), newId()]).toEqual(['fixed-1', 'fixed-2']);
    restore();
    expect(newId()).not.toMatch(/^fixed-/);
  });

  it('restores the previous generator, so injections nest', () => {
    const restoreOuter = setIdGenerator(() => 'outer');
    const restoreInner = setIdGenerator(() => 'inner');
    expect(newId()).toBe('inner');
    restoreInner();
    expect(newId()).toBe('outer');
    restoreOuter();
    expect(newId()).not.toBe('outer');
  });
});
