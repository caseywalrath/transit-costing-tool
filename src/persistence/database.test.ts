import { describe, expect, it } from 'vitest';
import { TransitDatabase } from './database';

describe('costing database schema', () => {
  it('adds the lazy Scenario assumptions store at database version 5 and retains the inert draft store', () => {
    const db = new TransitDatabase('transit-costing-schema-contract');
    expect(db.verno).toBe(5);
    expect(db.tables.map((table) => table.name)).toContain('costingAssumptions');
    expect(db.tables.map((table) => table.name)).toContain('costPlans');
    db.close();
  });
});
