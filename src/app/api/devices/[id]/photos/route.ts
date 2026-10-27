import type { NextRequest } from "next/server";

import { ApiError, assertMethod, errorResponse, ok } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/guards";
import { getDeviceForUser } from "@/lib/data/devices";
import { listDevicePhotos } from "@/lib/data/photos";

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

    return ok({ photos: await listDevicePhotos(device.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
