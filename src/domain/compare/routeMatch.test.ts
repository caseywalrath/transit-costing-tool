import { describe, expect, it } from 'vitest';
import { matchRoutes } from './routeMatch';
import { route } from './compareFixture';

const S = 'scn';

describe('matchRoutes (Decision 0091 item 4)', () => {
  it('matches by GTFS route ID first, even when the short names and names differ', () => {
    const baseline = [route(S, 'a', 'Alpha', '1', '7')];
    const proposed = [route(S, 'b', 'Beta', '9', '7'), route(S, 'c', 'Gamma', '1')];
    const match = matchRoutes(baseline, proposed);
    expect(match.pairs).toEqual([{ baseline: baseline[0], proposed: proposed[0] }, { proposed: proposed[1] }]);
    expect(match.ambiguous).toEqual([]);
  });

  it('compares a key after trimming and ignoring case', () => {
    const match = matchRoutes([route(S, 'a', 'Alpha', ' R1 ')], [route(S, 'b', 'Beta', 'r1')]);
    expect(match.pairs).toHaveLength(1);
    expect(match.pairs[0].baseline?.id).toBe('a');
    expect(match.pairs[0].proposed?.id).toBe('b');
  });

  it('a short name that two Routes on Proposed share matches none, and gives one ambiguous warning (the card case)', () => {
    const baseline = [route(S, 'base-s', 'Alpha', 'S')];
    const proposed = [route(S, 'p1', 'Beta', 'S'), route(S, 'p2', 'Gamma', 'S')];
    const match = matchRoutes(baseline, proposed);
    expect(match.pairs.every((pair) => !(pair.baseline && pair.proposed))).toBe(true);
    expect(match.pairs).toHaveLength(3);
    expect(match.ambiguous).toEqual([{ side: 'proposed', key: 'S', routeIds: ['p1', 'p2'] }]);
  });

  it('a repeated short name gives no warning when the name step then matches those Routes', () => {
    const baseline = [route(S, 'a1', 'Alpha', 'S'), route(S, 'a2', 'Beta', 'S')];
    const proposed = [route(S, 'p1', 'alpha', 'S'), route(S, 'p2', 'Beta', 'S')];
    const match = matchRoutes(baseline, proposed);
    expect(match.pairs).toEqual([{ baseline: baseline[0], proposed: proposed[0] }, { baseline: baseline[1], proposed: proposed[1] }]);
    expect(match.ambiguous).toEqual([]);
  });

  it('a key repeated at two steps is reported once', () => {
    // Short name "X" and name "X" are both held twice on the Baseline, and nothing matches at either step.
    const baseline = [route(S, 'a1', 'X', 'X'), route(S, 'a2', 'x', 'x')];
    const proposed = [route(S, 'p', 'X', 'X')];
    const match = matchRoutes(baseline, proposed);
    expect(match.pairs.some((pair) => pair.baseline && pair.proposed)).toBe(false);
    expect(match.ambiguous).toEqual([{ side: 'baseline', key: 'X', routeIds: ['a1', 'a2'] }]);
  });

  it('a key held twice on the Baseline matches none of its holders, and is reported for the Baseline', () => {
    const match = matchRoutes([route(S, 'a', 'Alpha', '4'), route(S, 'b', 'Beta', '4')], [route(S, 'p', 'Gamma', '4')]);
    expect(match.pairs.some((pair) => pair.baseline && pair.proposed)).toBe(false);
    expect(match.ambiguous).toEqual([{ side: 'baseline', key: '4', routeIds: ['a', 'b'] }]);
  });

  it('a Route matched by an earlier key is not compared again by a later key', () => {
    // A matches P by GTFS ID. B's short name is "1" too, but P is already taken, so B stays unmatched.
    const baseline = [route(S, 'a', 'Alpha', '1', '1'), route(S, 'b', 'Beta', '1')];
    const proposed = [route(S, 'p', 'Gamma', '1', '1')];
    const match = matchRoutes(baseline, proposed);
    expect(match.pairs).toEqual([{ baseline: baseline[0], proposed: proposed[0] }, { baseline: baseline[1] }]);
    expect(match.ambiguous).toEqual([]);
  });

  it('a Route with no GTFS route ID is matched by its name when the names agree', () => {
    const match = matchRoutes([route(S, 'a', 'Crosstown')], [route(S, 'b', 'crosstown ')]);
    expect(match.pairs).toEqual([{ baseline: { ...route(S, 'a', 'Crosstown') }, proposed: { ...route(S, 'b', 'crosstown ') } }]);
  });

  it('lists the Baseline routes in order, then the Proposed-only ones in order', () => {
    const match = matchRoutes([route(S, 'a', 'A', '1'), route(S, 'b', 'B', '2')], [route(S, 'x', 'X', '9'), route(S, 'y', 'Y', '2')]);
    expect(match.pairs.map((pair) => [pair.baseline?.id ?? null, pair.proposed?.id ?? null])).toEqual([['a', null], ['b', 'y'], [null, 'x']]);
  });

  it('a blank key holds nothing, so Routes with no key are not matched on it', () => {
    const match = matchRoutes([route(S, 'a', 'Alpha', ' ')], [route(S, 'b', 'Beta', ' ')]);
    expect(match.pairs).toHaveLength(2);
    expect(match.ambiguous).toEqual([]);
  });
});
