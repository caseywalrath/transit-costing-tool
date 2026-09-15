import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import { validateNode, validateRoute, validateRouteDefinition } from './validation';

describe('route-definition validation', () => {
  it('returns structured required-field findings', () => {
    const route = { id: 'r', scenarioId: 's', name: '', ...metadata() };
    const node = { id: 'n', scenarioId: 's', routeId: 'r', name: '', kind: 'timepoint' as const, ...metadata() };
    expect(validateRoute(route)[0]).toMatchObject({ ruleId: 'route.nameRequired', severity: 'error', field: 'name' });
    expect(validateNode(node, route)[0]).toMatchObject({ ruleId: 'node.nameRequired', severity: 'error', field: 'name' });
    expect(validateRouteDefinition({ route, nodes: [node], patterns: [] })).toHaveLength(2);
  });
});
