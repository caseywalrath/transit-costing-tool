// Review package U02 (I-072, findings 3-015 and 4-017): one filter decides which error text a planner may read.
import { describe, expect, it } from 'vitest';
import { STORAGE_FULL_MESSAGE, StorageFullError } from '../application/saveStatus';
import { userFacingError } from './errorMessages';

const fallback = 'Unable to save.';

describe('userFacingError', () => {
  it('shows a plain application message as written', () => {
    expect(userFacingError(new Error('Another Block on this service day already uses that label.'), fallback)).toBe('Another Block on this service day already uses that label.');
    expect(userFacingError(new StorageFullError(), fallback)).toBe(STORAGE_FULL_MESSAGE);
  });

  it.each([
    'bulkAdd(): 1 of 2 operations failed. Errors: ConstraintError: Key already exists in the object store.',
    'Failed to execute transaction on IDBDatabase',
    'The database connection is closing. Dexie is not open.',
    'Table trips not part of transaction. Add the table to tables array.',
    'QuotaExceededError: The quota has been exceeded.',
    'VersionError: The requested version (60) is less than the existing version (70).',
    'UnknownError: Internal error opening backing store for indexedDB.open.',
    'DataError: Failed to read the key path',
    'TypeError: Cannot read properties of undefined (reading \'id\')',
    'x is not a function',
    'DatabaseClosedError Database has been closed',
    'OpenFailedError: Dexie could not open the store',
    'block.deadheadRequired, block.multiplePullIn',
  ])('replaces the technical text "%s" with the fallback', (text) => {
    expect(userFacingError(new Error(text), fallback)).toBe(fallback);
  });

  it('also reads the error name, because a DOMException carries its technical name there', () => {
    expect(userFacingError(new DOMException('The operation failed.', 'QuotaExceededError'), fallback)).toBe(fallback);
    expect(userFacingError(new DOMException('The operation failed.', 'VersionError'), fallback)).toBe(fallback);
    expect(userFacingError(new DOMException('The operation failed.', 'UnknownError'), fallback)).toBe(fallback);
  });

  it('uses the fallback for a value that is not an Error or has no text', () => {
    expect(userFacingError('boom', fallback)).toBe(fallback);
    expect(userFacingError(undefined, fallback)).toBe(fallback);
    expect(userFacingError(new Error('  '), fallback)).toBe(fallback);
  });
});
