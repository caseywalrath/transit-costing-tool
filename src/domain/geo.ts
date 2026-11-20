/** Decision 0085 item 8. Earth radius used for straight-line distances between stops, in miles. */
export const EARTH_RADIUS_MILES = 3958.8;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Section 4.5. Haversine distance in miles between two points given in decimal degrees (WGS 84). The square root is clamped to 1 so that
 * floating-point error for near-antipodal points cannot produce NaN.
 */
export function greatCircleMiles(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const phi1 = toRadians(a.latitude);
  const phi2 = toRadians(b.latitude);
  const deltaPhi = toRadians(b.latitude - a.latitude);
  const deltaLambda = toRadians(b.longitude - a.longitude);
  const h = Math.sin(deltaPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}
