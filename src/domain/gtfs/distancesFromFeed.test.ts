import { describe, expect, it } from 'vitest';
import { greatCircleMiles } from '../geo';
import { commonShapeId, measurePattern, stopCoordinates, type Coordinates } from './distancesFromFeed';
import { type FeedShapePoint } from './routeFromFeed';
import { type FeedTrip } from './tripsOnDate';

const at = (lat: number, lon: number): Coordinates => ({ latitude: lat, longitude: lon });

function shapeOf(points: Array<[number, number]>): FeedShapePoint[] {
  return points.map(([latitude, longitude], index) => ({ latitude, longitude, sequence: index + 1 }));
}

function trip(tripId: string, shapeId: string | undefined, startHour: number): FeedTrip {
  return {
    tripId,
    sourceTripId: tripId,
    routeId: 'R1',
    serviceId: 'WK',
    shapeId,
    stopTimes: [{ stopId: 'A', sequence: 1, departure: startHour * 3600 }, { stopId: 'B', sequence: 2, arrival: startHour * 3600 + 600 }],
  };
}

function expectRounded(values: number[]): void {
  for (const value of values) expect(Math.abs(value * 100 - Math.round(value * 100))).toBeLessThan(1e-9);
}

describe('stopCoordinates', () => {
  it('reads latitude and longitude when both are numbers in range', () => {
    expect(stopCoordinates({ stop_lat: '39.74', stop_lon: '-104.99' })).toEqual({ latitude: 39.74, longitude: -104.99 });
  });

  it('is undefined when either value is blank, not a number, or out of range', () => {
    expect(stopCoordinates({ stop_lat: '', stop_lon: '-104.99' })).toBeUndefined();
    expect(stopCoordinates({ stop_lat: '39.74', stop_lon: 'west' })).toBeUndefined();
    expect(stopCoordinates({ stop_lat: '91', stop_lon: '0' })).toBeUndefined();
    expect(stopCoordinates({ stop_lat: '0', stop_lon: '181' })).toBeUndefined();
    expect(stopCoordinates(undefined)).toBeUndefined();
  });
});

describe('commonShapeId', () => {
  it('is the most common non-blank shape, and a tie goes to the earliest trip', () => {
    const trips = [trip('late', 'SH_B', 9), trip('early', 'SH_A', 6), trip('none', '', 7), trip('third', 'SH_B', 8)];
    expect(commonShapeId(trips)).toBe('SH_B');
    expect(commonShapeId([trip('early', 'SH_A', 6), trip('late', 'SH_B', 9)])).toBe('SH_A');
    expect(commonShapeId([trip('none', undefined, 6)])).toBeUndefined();
  });
});

describe('measurePattern on a shape', () => {
  it('measures along the shape to each point, rounded to 0.01 mile, starting at 0', () => {
    const shape = shapeOf([[0, 0], [0, 0.1], [0, 0.2]]);
    const stops = [at(0, 0), at(0, 0.1), at(0, 0.2)];
    const result = measurePattern({ stops, pointAt: [0, 1, 2], shape });
    expect(result.method).toBe('shape');
    expect(result.cumulativeMiles[0]).toBe(0);
    expect(Math.abs(result.cumulativeMiles[1] - greatCircleMiles(at(0, 0), at(0, 0.1)))).toBeLessThanOrEqual(0.01);
    expect(Math.abs(result.cumulativeMiles[2] - greatCircleMiles(at(0, 0), at(0, 0.2)))).toBeLessThanOrEqual(0.01);
    expectRounded(result.cumulativeMiles);
  });

  it('projects points in order, so a later point is never placed before an earlier one on an out-and-back shape', () => {
    // Out along the shape to -104.98, then back to -104.99. The second point sits on both legs; it must take the return leg.
    const shape = shapeOf([[39.7, -105.0], [39.7, -104.99], [39.7, -104.98], [39.7, -104.99], [39.7, -105.0]]);
    const leg = greatCircleMiles(at(39.7, -104.99), at(39.7, -104.98));
    const stops = [at(39.7, -104.985), at(39.7, -104.99)];
    const result = measurePattern({ stops, pointAt: [0, 1], shape });
    expect(result.method).toBe('shape');
    expect(Math.abs(result.cumulativeMiles[1] - 1.5 * leg)).toBeLessThanOrEqual(0.01);
  });

  it('falls back to straight lines when a point is more than 0.25 miles from the shape', () => {
    const shape = shapeOf([[39.7, -105.0], [39.7, -104.99]]);
    const stops = [at(39.71, -105.0), at(39.71, -104.99)];
    const result = measurePattern({ stops, pointAt: [0, 1], shape });
    expect(result.method).toBe('straightLine');
    expect(Math.abs(result.cumulativeMiles[1] - greatCircleMiles(stops[0], stops[1]))).toBeLessThanOrEqual(0.01);
  });

  it('falls back to straight lines when the shape has fewer than two points', () => {
    const result = measurePattern({ stops: [at(39.7, -105), at(39.7, -104.99)], pointAt: [0, 1], shape: shapeOf([[39.7, -105]]) });
    expect(result.method).toBe('straightLine');
  });
});

describe('measurePattern without a shape', () => {
  it('sums great-circle distances through every located stop between two points', () => {
    const stops = [at(39.76, -104.99), at(39.75, -104.99), at(39.74, -104.99)];
    const result = measurePattern({ stops, pointAt: [0, 2] });
    expect(result.method).toBe('straightLine');
    expect(Math.abs(result.cumulativeMiles[1] - greatCircleMiles(stops[0], stops[2]))).toBeLessThanOrEqual(0.01);
  });

  it('skips a stop without a location and gives a point without one the value before it', () => {
    const stops = [at(39.74, -104.99), undefined, at(39.74, -104.98)];
    const result = measurePattern({ stops, pointAt: [0, 1, 2] });
    expect(result.method).toBe('straightLine');
    expect(result.cumulativeMiles[1]).toBe(0);
    expect(Math.abs(result.cumulativeMiles[2] - greatCircleMiles(at(39.74, -104.99), at(39.74, -104.98)))).toBeLessThanOrEqual(0.01);
  });

  it('is unmeasured, with zero miles throughout, when fewer than two points have a location', () => {
    const result = measurePattern({ stops: [at(39.74, -104.99), undefined, undefined], pointAt: [0, 1, 2] });
    expect(result).toEqual({ cumulativeMiles: [0, 0, 0], method: 'unmeasured' });
  });
});
