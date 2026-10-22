// Phase 1 reproduction (doc-vs-code): Decision 0010 says "A single request is limited to 500 trips";
// ui-conventions.md:68 bounds only Number of Trips. Check the Last Trip mode.
import { it, expect } from 'vitest';
import { generateRequestDepartures, validateGenerateTripsRequest } from '../../../src/domain/trips';

it('Last Trip mode is not limited to 500 departures', () => {
  const request = { scenarioId: 's', routeId: 'r', serviceDayId: 'd', patternId: 'p', firstTrip: 0, headwaySeconds: 60, lastTrip: 24 * 3600 } as any;
  const findings = validateGenerateTripsRequest(request);
  const departures = generateRequestDepartures(request);
  console.log(JSON.stringify({ findings: findings.map((f: any) => f.ruleId), departures: departures.length }));
  expect(departures.length).toBeLessThanOrEqual(500); // Decision 0010 expectation
});
