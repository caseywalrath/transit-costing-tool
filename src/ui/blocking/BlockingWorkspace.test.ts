import { describe, expect, it } from 'vitest';
import { blockingError } from './BlockingWorkspace';
import { formatDuration } from '../format';

describe('Blocking durations', () => {
  it('keeps overlapping connection gaps visible without treating them as service times', () => {
    expect(formatDuration(-600)).toBe('−:10');
    expect(formatDuration(600)).toBe(':10');
    expect(formatDuration(undefined)).toBe('—');
  });
});

// Review package U02 (I-072, finding 4-017): the screen used to insert a space before every capital letter of a typed message.
describe('blockingError', () => {
  const fallback = 'Unable to update Blocks.';

  it('shows a typed Blocking message as written', () => {
    expect(blockingError(new Error('Another Block on this service day already uses that label.'), fallback)).toBe('Another Block on this service day already uses that label.');
    expect(blockingError(new Error('No consecutive Trips use the selected From and To Nodes.'), fallback)).toBe('No consecutive Trips use the selected From and To Nodes.');
    expect(blockingError(new Error('Select a preceding Trip for the deadhead.'), fallback)).toBe('Select a preceding Trip for the deadhead.');
  });

  it('keeps the commas of a typed message', () => {
    expect(blockingError(new Error('Trip times are incomplete, so this connection cannot be evaluated.'), fallback)).toBe('Trip times are incomplete, so this connection cannot be evaluated.');
  });

  it('looks up a list of message keys, once each, and uses the fallback for a key that has no sentence', () => {
    expect(blockingError(new Error('block.multiplePullIn, block.multiplePullIn'), fallback)).toBe('A block can have only one pull-in.');
    expect(blockingError(new Error('block.deadheadRequired, block.multiplePullIn'), fallback)).toBe('A deadhead is required between these trips. A block can have only one pull-in.');
    expect(blockingError(new Error('block.notAKnownKey'), fallback)).toBe(fallback);
  });

  it('does not show technical text', () => {
    expect(blockingError(new Error('Table blocks not part of transaction.'), fallback)).toBe(fallback);
    expect(blockingError('boom', fallback)).toBe(fallback);
  });
});
