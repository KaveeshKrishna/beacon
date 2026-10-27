import "server-only";

import { and, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  auditLogs,
  commands,
  devices,
  geofenceEvents,
  geofences,
  locations,
} from "@/db/schema";

export type ActivityEntry = {
  key: string;
  category: "security" | "account" | "device" | "geofence" | "command";
  action: string;
  occurredAt: string;
  targetType: string | null;
  targetId: string | null;
  deviceName?: string;
  geofenceName?: string;
  detail?: string;
};

export async function listActivity(
  userId: string,
  limit = 40,
): Promise<ActivityEntry[]> {
  const [logs, events, commandRows] = await Promise.all([
    db()
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(eq(auditLogs.userId, userId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(80),
    db()
      .select({
        id: geofenceEvents.id,
        type: geofenceEvents.type,
        occurredAt: geofenceEvents.occurredAt,
        geofenceName: geofences.name,
        deviceName: devices.name,
        deviceId: devices.id,
      })
      .from(geofenceEvents)
      .innerJoin(geofences, eq(geofences.id, geofenceEvents.geofenceId))
      .innerJoin(devices, eq(devices.id, geofenceEvents.deviceId))
      .where(eq(devices.userId, userId))
      .orderBy(desc(geofenceEvents.occurredAt))
      .limit(30),
    db()
      .select({
        id: commands.id,
        type: commands.type,
        status: commands.status,
        createdAt: commands.createdAt,
        deviceName: devices.name,
        deviceId: devices.id,
      })
      .from(commands)
      .innerJoin(devices, eq(devices.id, commands.deviceId))
      .where(eq(devices.userId, userId))
      .orderBy(desc(commands.createdAt))
      .limit(30),
  ]);

  const merged: ActivityEntry[] = [
    ...logs.map((log) => ({
      key: `audit-${log.id}`,
      category: log.action.startsWith("auth.")
        ? ("security" as const)
        : log.action.startsWith("account.")
          ? ("account" as const)
          : ("device" as const),
      action: log.action,
      occurredAt: log.createdAt.toISOString(),
      targetType: log.targetType,
      targetId: log.targetId,
    })),
    ...events.map((event) => ({
      key: `event-${event.id}`,
      category: "geofence" as const,
      action: event.type === "exit" ? "geofence.exited" : "geofence.entered",
      occurredAt: event.occurredAt.toISOString(),
      targetType: "device",
      targetId: event.deviceId,
      deviceName: event.deviceName,
      geofenceName: event.geofenceName,
    })),
    ...commandRows.map((command) => ({
      key: `command-${command.id}`,
      category: "command" as const,
      action: command.type,
      occurredAt: command.createdAt.toISOString(),
      targetType: "device",
      targetId: command.deviceId,
      deviceName: command.deviceName,
      detail: command.status,
    })),
  ];

  return merged
    .sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() -
        new Date(left.occurredAt).getTime(),
    )
    .slice(0, limit);
}

export async function getAccountStats(userId: string): Promise<{
  locations24h: number;
  geofenceCount: number;
  pendingCommands: number;
}> {
  const since = new Date(Date.now() - 24 * 3_600_000);

  const [locationRows, fenceRows, commandRows] = await Promise.all([
    db()
      .select({ count: sql<number>`count(*)::int` })
      .from(locations)
      .innerJoin(devices, eq(devices.id, locations.deviceId))
      .where(and(eq(devices.userId, userId), gte(locations.recordedAt, since))),
    db()
      .select({ count: sql<number>`count(*)::int` })
      .from(geofences)
      .innerJoin(devices, eq(devices.id, geofences.deviceId))
      .where(eq(devices.userId, userId)),
    db()
      .select({ count: sql<number>`count(*)::int` })
      .from(commands)
      .innerJoin(devices, eq(devices.id, commands.deviceId))
      .where(and(eq(devices.userId, userId), eq(commands.status, "pending"))),
  ]);

  return {
    locations24h: locationRows[0]?.count ?? 0,
    geofenceCount: fenceRows[0]?.count ?? 0,
    pendingCommands: commandRows[0]?.count ?? 0,
  };
}
