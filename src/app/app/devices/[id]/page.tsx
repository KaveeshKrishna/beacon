import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  DeviceDetail,
  type DeviceTab,
} from "@/components/app/device/device-detail";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { LOCATION_RANGE_HOURS, type LocationRange } from "@/lib/constants";
import { getDeviceSnapshot } from "@/lib/data/devices";

export const metadata: Metadata = {
  title: "Device",
  robots: { index: false, follow: false },
};

const tabValues: DeviceTab[] = [
  "overview",
  "photos",
  "geofences",
  "commands",
  "settings",
];

export default async function DevicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; range?: string }>;
}) {
  const session = await requireVerifiedUser();
  const { id } = await params;
  const query = await searchParams;

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const range: LocationRange =
    query.range && query.range in LOCATION_RANGE_HOURS
      ? (query.range as LocationRange)
      : "24h";

  const initialTab: DeviceTab = tabValues.includes(query.tab as DeviceTab)
    ? (query.tab as DeviceTab)
    : "overview";

  const snapshot = await getDeviceSnapshot(session.user.id, id, range);
  if (!snapshot) notFound();

  return (
    <DeviceDetail
      initial={{
        summary: snapshot.summary,
        points: snapshot.points,
        geofences: snapshot.geofences,
        commands: snapshot.commands,
        range,
      }}
      initialTab={initialTab}
      timezone={session.user.timezone}
    />
  );
}
