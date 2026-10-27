import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  auditLogs,
  commands,
  devices,
  geofences,
  locations,
} from "@/db/schema";
import { assertMethod, errorResponse } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireVerifiedApiUser } from "@/lib/auth/guards";
import { toLocationDto } from "@/lib/data/devices";
import { assertSameSiteNavigation, requestContext } from "@/lib/request";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    assertMethod(request, ["GET"]);
    // Triggered as a top-level download, which browsers send without Origin.
    assertSameSiteNavigation(request);
    const ctx = requestContext(request);
    const session = await requireVerifiedApiUser();

    const deviceRows = await db()
      .select()
      .from(devices)
      .where(eq(devices.userId, session.user.id));
    const deviceIds = deviceRows.map((device) => device.id);

    const [fences, commandRows, logs] = await Promise.all([
      deviceIds.length
        ? db()
            .select()
            .from(geofences)
            .where(inArray(geofences.deviceId, deviceIds))
        : Promise.resolve([]),
      deviceIds.length
        ? db()
            .select()
            .from(commands)
            .where(inArray(commands.deviceId, deviceIds))
            .orderBy(desc(commands.createdAt))
            .limit(1000)
        : Promise.resolve([]),
      db()
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.userId, session.user.id))
        .orderBy(desc(auditLogs.createdAt))
        .limit(500),
    ]);

    const locationRows = deviceIds.length
      ? await db()
          .select()
          .from(locations)
          .where(inArray(locations.deviceId, deviceIds))
          .orderBy(desc(locations.recordedAt))
          .limit(20_000)
      : [];

    const payload = {
      exportedAt: new Date().toISOString(),
      format: "beacon-export-v1",
      truncatedLocations: locationRows.length === 20_000,
      account: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        timezone: session.user.timezone,
        emailVerifiedAt: session.user.emailVerifiedAt,
        createdAt: session.user.createdAt,
        totpEnabled: Boolean(session.user.totpEnabledAt),
        emailMfaEnabled: session.user.emailMfaEnabled,
        notifications: {
          geofence: session.user.notifyGeofence,
          offline: session.user.notifyOffline,
          lowBattery: session.user.notifyLowBattery,
          security: session.user.notifySecurity,
        },
      },
      devices: deviceRows.map((device) => ({
        id: device.id,
        name: device.name,
        manufacturer: device.manufacturer,
        model: device.model,
        androidVersion: device.androidVersion,
        appVersion: device.appVersion,
        trackingProfile: device.trackingProfile,
        status: device.status,
        pairedAt: device.pairedAt,
        lastSeenAt: device.lastSeenAt,
        lastLocationAt: device.lastLocationAt,
        batteryLevel: device.batteryLevel,
      })),
      locations: locationRows.map((row) => ({
        ...toLocationDto(row),
        deviceId: row.deviceId,
      })),
      geofences: fences.map((fence) => ({
        id: fence.id,
        deviceId: fence.deviceId,
        name: fence.name,
        centerLat: fence.centerLat,
        centerLon: fence.centerLon,
        radiusM: fence.radiusM,
        notifyOnEnter: fence.notifyOnEnter,
        notifyOnExit: fence.notifyOnExit,
      })),
      commands: commandRows.map((command) => ({
        id: command.id,
        deviceId: command.deviceId,
        type: command.type,
        status: command.status,
        payload: command.payload,
        result: command.result,
        createdAt: command.createdAt,
        completedAt: command.completedAt,
      })),
      activity: logs.map((log) => ({
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        createdAt: log.createdAt,
      })),
    };

    await audit({
      userId: session.user.id,
      action: "account.exported",
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });

    const filename = `beacon-export-${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
