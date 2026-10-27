import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { devicePhotos } from "@/db/schema";

export type DevicePhotoDto = {
  id: string;
  capturedAt: string;
  width: number;
  height: number;
  byteSize: number;
  url: string;
};

export async function listDevicePhotos(
  deviceId: string,
  limit = 40,
): Promise<DevicePhotoDto[]> {
  const rows = await db()
    .select({
      id: devicePhotos.id,
      capturedAt: devicePhotos.capturedAt,
      width: devicePhotos.width,
      height: devicePhotos.height,
      byteSize: devicePhotos.byteSize,
    })
    .from(devicePhotos)
    .where(eq(devicePhotos.deviceId, deviceId))
    .orderBy(desc(devicePhotos.capturedAt))
    .limit(Math.min(limit, 100));

  return rows.map((row) => ({
    id: row.id,
    capturedAt: row.capturedAt.toISOString(),
    width: row.width,
    height: row.height,
    byteSize: row.byteSize,
    url: `/api/devices/${deviceId}/photos/${row.id}`,
  }));
}
