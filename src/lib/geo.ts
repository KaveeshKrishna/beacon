export const EARTH_RADIUS_M = 6_371_008.8;

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance in metres. */
export function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isInsideGeofence(
  point: { latitude: number; longitude: number },
  center: { latitude: number; longitude: number },
  radiusM: number,
): boolean {
  return haversineMeters(point, center) <= radiusM;
}

export function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/** Returns a padded [south, west, north, east] box for a set of points. */
export function boundingBox(
  points: Array<{ latitude: number; longitude: number }>,
  paddingDegrees = 0.005,
): [number, number, number, number] | null {
  if (points.length === 0) return null;
  let south = 90;
  let west = 180;
  let north = -90;
  let east = -180;
  for (const point of points) {
    south = Math.min(south, point.latitude);
    north = Math.max(north, point.latitude);
    west = Math.min(west, point.longitude);
    east = Math.max(east, point.longitude);
  }
  return [
    south - paddingDegrees,
    west - paddingDegrees,
    north + paddingDegrees,
    east + paddingDegrees,
  ];
}

export function googleMapsUrl(latitude: number, longitude: number): string {
  const query = encodeURIComponent(`${latitude},${longitude}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function geoUri(latitude: number, longitude: number): string {
  return `geo:${latitude},${longitude}?q=${latitude},${longitude}`;
}
