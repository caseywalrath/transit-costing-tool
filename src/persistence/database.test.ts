import { describe, expect, it } from 'vitest';
import { TransitDatabase } from './database';

describe('application database schema', () => {
  it('includes scenario assumptions and local regeneration undo', () => {
    const db = new TransitDatabase('transit-costing-schema-contract');
    expect(db.verno).toBe(6);
    expect(db.tables.map((table) => table.name)).toContain('costingAssumptions');
    expect(db.tables.map((table) => table.name)).toContain('tripRegenerationUndo');
    expect(db.tables.map((table) => table.name)).toContain('costPlans');
    db.close();
  });
});
