import type { NextRequest } from "next/server";

import {
  ApiError,
  assertMethod,
  errorResponse,
  ok,
} from "@/lib/api";
import { requireApiUser } from "@/lib/auth/guards";
import {
  getDeviceForUser,
  getLatestLocation,
  getLocationsForRange,
  getLocationsSince,
  toDeviceSummary,
} from "@/lib/data/devices";
import { liveLocationsQuerySchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertMethod(request, ["GET"]);
    const session = await requireApiUser();
    const { id } = await context.params;
    const device = await getDeviceForUser(session.user.id, id);
    if (!device) throw new ApiError(404, "not_found", "Device not found.");

    const parsed = liveLocationsQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    if (!parsed.success) {
      throw new ApiError(422, "invalid_query", "Invalid location query.");
    }

    const since = parsed.data.since ? new Date(parsed.data.since) : null;
    if (since && (Number.isNaN(since.getTime()) || since.getTime() > Date.now() + 60_000)) {
      throw new ApiError(422, "invalid_query", "Invalid since timestamp.");
    }

    const [points, latest] = await Promise.all([
      since
        ? getLocationsSince(device.id, since, 500)
        : getLocationsForRange(device.id, parsed.data.range, 1500),
      getLatestLocation(device.id),
    ]);

    return ok({
      points,
      summary: toDeviceSummary(device, latest),
      serverTime: new Date().toISOString(),
      range: parsed.data.range,
      incremental: Boolean(since),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
