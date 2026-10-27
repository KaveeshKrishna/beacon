import "server-only";

import { and, desc, eq, gt, gte, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  commands,
  devices,
  geofences,
  locations,
  type Command,
  type Device,
  type Geofence,
  type LocationRow,
} from "@/db/schema";
import { LOCATION_RANGE_HOURS, type LocationRange } from "@/lib/constants";
import { deviceStatus } from "@/lib/format";
import { isUuid } from "@/lib/ids";
export type LocationDto = {
  id: number;
  recordedAt: string;
  receivedAt: string;
  latitude: number;
  longitude: number;
  accuracyM: number;
  altitudeM: number | null;
  speedMps: number | null;
  headingDeg: number | null;
  batteryLevel: number | null;
  isCharging: boolean | null;
  provider: string;
  networkType: string | null;
  isMocked: boolean;
  sequence: number;
};

export type DeviceSummary = {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  androidVersion: string;
  appVersion: string;
  status: "active" | "lost";
  presence: "online" | "stale" | "offline";
  trackingProfile: string;
  batteryLevel: number | null;
  isCharging: boolean | null;
  networkType: string | null;
  simState: string | null;
  fallbackSmsConfigured: boolean;
  lostModeAt: string | null;
  pairedAt: string;
  lastSeenAt: string | null;
  lastLocationAt: string | null;
  offlineAlertMinutes: number;
  lastLocation: LocationDto | null;
};

export type GeofenceDto = {
  id: string;
  name: string;
  centerLat: number;
  centerLon: number;
  radiusM: number;
  notifyOnEnter: boolean;
  notifyOnExit: boolean;
  lastInside: boolean | null;
};

export function toLocationDto(row: LocationRow): LocationDto {
  return {
    id: row.id,
    recordedAt: row.recordedAt.toISOString(),
    receivedAt: row.receivedAt.toISOString(),
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyM: row.accuracyM,
    altitudeM: row.altitudeM,
    speedMps: row.speedMps,
    headingDeg: row.headingDeg,
    batteryLevel: row.batteryLevel,
    isCharging: row.isCharging,
    provider: row.provider,
    networkType: row.networkType,
    isMocked: row.isMocked,
    sequence: row.sequence,
  };
}

export function toGeofenceDto(row: Geofence): GeofenceDto {
  return {
    id: row.id,
    name: row.name,
    centerLat: row.centerLat,
    centerLon: row.centerLon,
    radiusM: row.radiusM,
    notifyOnEnter: row.notifyOnEnter,
    notifyOnExit: row.notifyOnExit,
    lastInside: row.lastInside,
  };
}

export function toDeviceSummary(
  device: Device,
  lastLocation: LocationRow | null,
): DeviceSummary {
  return {
    id: device.id,
    name: device.name,
    manufacturer: device.manufacturer,
    model: device.model,
    androidVersion: device.androidVersion,
    appVersion: device.appVersion,
    status: device.status === "lost" ? "lost" : "active",
    presence: deviceStatus(device.lastSeenAt),
    trackingProfile: device.trackingProfile,
    batteryLevel: device.batteryLevel,
    isCharging: device.isCharging,
    networkType: device.networkType,
    simState: device.simState,
    fallbackSmsConfigured: Boolean(device.fallbackSmsEnc),
    lostModeAt: device.lostModeAt?.toISOString() ?? null,
    pairedAt: device.pairedAt.toISOString(),
    lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    lastLocationAt: device.lastLocationAt?.toISOString() ?? null,
    offlineAlertMinutes: device.config?.offlineAlertMinutes ?? 45,
    lastLocation: lastLocation ? toLocationDto(lastLocation) : null,
  };
}

export async function listDeviceSummaries(
  userId: string,
): Promise<DeviceSummary[]> {
  const rows = await db()
    .select()
    .from(devices)
    .where(and(eq(devices.userId, userId), isNull(devices.revokedAt)))
    .orderBy(desc(devices.lastSeenAt), desc(devices.createdAt));

  if (rows.length === 0) return [];

  const latest = await db()
    .selectDistinctOn([locations.deviceId])
    .from(locations)
    .where(
      inArray(
        locations.deviceId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(locations.deviceId, desc(locations.recordedAt));

  const byDevice = new Map(latest.map((row) => [row.deviceId, row]));
  return rows.map((device) =>
    toDeviceSummary(device, byDevice.get(device.id) ?? null),
  );
}

export async function getDeviceForUser(
  userId: string,
  deviceId: string,
): Promise<Device | null> {
  if (!isUuid(deviceId)) return null;
  const rows = await db()
    .select()
    .from(devices)
    .where(
      and(
        eq(devices.id, deviceId),
        eq(devices.userId, userId),
        isNull(devices.revokedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getLatestLocation(
  deviceId: string,
): Promise<LocationRow | null> {
  const rows = await db()
    .select()
    .from(locations)
    .where(eq(locations.deviceId, deviceId))
    .orderBy(desc(locations.recordedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLocationsForRange(
  deviceId: string,
  range: LocationRange,
  limit = 1500,
): Promise<LocationDto[]> {
  const hours = LOCATION_RANGE_HOURS[range];
  const since = new Date(Date.now() - hours * 3_600_000);
  const rows = await db()
    .select()
    .from(locations)
    .where(
      and(
        eq(locations.deviceId, deviceId),
        gte(locations.recordedAt, since),
      ),
    )
    .orderBy(desc(locations.recordedAt))
    .limit(Math.min(limit, 2500));

  return rows.reverse().map(toLocationDto);
}

export async function getLocationsSince(
  deviceId: string,
  since: Date,
  limit = 500,
): Promise<LocationDto[]> {
  const rows = await db()
    .select()
    .from(locations)
    .where(
      and(
        eq(locations.deviceId, deviceId),
        gt(locations.recordedAt, since),
      ),
    )
    .orderBy(desc(locations.recordedAt))
    .limit(Math.min(limit, 500));
  return rows.reverse().map(toLocationDto);
}

export async function getDeviceGeofences(
  deviceId: string,
): Promise<GeofenceDto[]> {
  const rows = await db()
    .select()
    .from(geofences)
    .where(eq(geofences.deviceId, deviceId))
    .orderBy(desc(geofences.createdAt));
  return rows.map(toGeofenceDto);
}

export type CommandDto = {
  id: string;
  type: string;
  status: string;
  message: string | null;
  createdAt: string;
  deliveredAt: string | null;
  completedAt: string | null;
  result: Record<string, unknown> | null;
};

export function toCommandDto(row: Command): CommandDto {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    message: row.payload?.message ? String(row.payload.message) : null,
    createdAt: row.createdAt.toISOString(),
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    result: row.result ?? null,
  };
}

export async function getRecentCommands(
  deviceId: string,
  limit = 12,
): Promise<CommandDto[]> {
  const rows = await db()
    .select()
    .from(commands)
    .where(eq(commands.deviceId, deviceId))
    .orderBy(desc(commands.createdAt))
    .limit(limit);
  return rows.map(toCommandDto);
}

export async function getDeviceSnapshot(
  userId: string,
  deviceId: string,
  range: LocationRange = "24h",
): Promise<{
  device: Device;
  summary: DeviceSummary;
  points: LocationDto[];
  geofences: GeofenceDto[];
  commands: CommandDto[];
} | null> {
  const device = await getDeviceForUser(userId, deviceId);
  if (!device) return null;

  const [latest, points, fences, recentCommands] = await Promise.all([
    getLatestLocation(device.id),
    getLocationsForRange(device.id, range, 1500),
    getDeviceGeofences(device.id),
    getRecentCommands(device.id),
  ]);

  return {
    device,
    summary: toDeviceSummary(device, latest),
    points,
    geofences: fences,
    commands: recentCommands,
  };
}
