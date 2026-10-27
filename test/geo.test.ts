import { describe, expect, it } from "vitest";

import {
  boundingBox,
  geoUri,
  googleMapsUrl,
  haversineMeters,
  isInsideGeofence,
  isValidCoordinate,
} from "@/lib/geo";

describe("geospatial helpers", () => {
  it("measures a known great-circle distance", () => {
    const london = { latitude: 51.5074, longitude: -0.1278 };
    const paris = { latitude: 48.8566, longitude: 2.3522 };
    const distance = haversineMeters(london, paris);
    expect(distance).toBeGreaterThan(340_000);
    expect(distance).toBeLessThan(346_000);
  });

  it("returns zero for identical points", () => {
    expect(
      haversineMeters(
        { latitude: 1.23, longitude: 4.56 },
        { latitude: 1.23, longitude: 4.56 },
      ),
    ).toBe(0);
  });

  it("applies geofence radius inclusively", () => {
    const center = { latitude: 51.5074, longitude: -0.1278 };
    expect(isInsideGeofence(center, center, 50)).toBe(true);
    expect(isInsideGeofence({ latitude: 51.5079, longitude: -0.1278 }, center, 100)).toBe(true);
    expect(isInsideGeofence({ latitude: 51.52, longitude: -0.1278 }, center, 100)).toBe(false);
  });

  it("validates coordinate ranges", () => {
    expect(isValidCoordinate(0, 0)).toBe(true);
    expect(isValidCoordinate(-90, 180)).toBe(true);
    expect(isValidCoordinate(90.1, 0)).toBe(false);
    expect(isValidCoordinate(0, -180.1)).toBe(false);
    expect(isValidCoordinate(Number.NaN, 0)).toBe(false);
  });

  it("builds a padded bounding box", () => {
    const box = boundingBox(
      [
        { latitude: 10, longitude: 20 },
        { latitude: 12, longitude: 22 },
      ],
      0.1,
    );
    expect(box).toEqual([9.9, 19.9, 12.1, 22.1]);
    expect(boundingBox([])).toBeNull();
  });

  it("produces safe external map links", () => {
    const google = googleMapsUrl(51.5074, -0.1278);
    expect(google).toContain("google.com/maps");
    expect(google).toContain(encodeURIComponent("51.5074,-0.1278"));
    expect(geoUri(51.5074, -0.1278)).toBe(
      "geo:51.5074,-0.1278?q=51.5074,-0.1278",
    );
  });
});
