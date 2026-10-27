import {
  ArrowRight,
  ChevronRight,
  Clock3,
  Crosshair,
  ExternalLink,
  MapPin,
  Radio,
  ShieldAlert,
  Smartphone,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";

import { ActivityList } from "@/components/app/activity-list";
import { PageHeader } from "@/components/app/page-header";
import { DeviceMap } from "@/components/map/device-map";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { getAccountStats, listActivity } from "@/lib/data/activity";
import { getDeviceSnapshot, listDeviceSummaries } from "@/lib/data/devices";
import {
  formatAccuracy,
  formatBattery,
  formatRelative,
} from "@/lib/format";

export default async function OverviewPage() {
  const session = await requireVerifiedUser();
  const [devices, stats, activity] = await Promise.all([
    listDeviceSummaries(session.user.id),
    getAccountStats(session.user.id),
    listActivity(session.user.id, 6),
  ]);

  const selected =
    devices.find((device) => device.status === "lost") ??
    devices.find((device) => device.presence === "online") ??
    devices[0] ??
    null;

  const snapshot = selected
    ? await getDeviceSnapshot(session.user.id, selected.id, "24h")
    : null;

  if (devices.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          description="Pair an Android device to start collecting encrypted, offline-first location history."
          eyebrow="Operations"
          title="Overview"
        />
        <section className="card overflow-hidden">
          <div className="grid gap-10 p-7 sm:p-10 lg:grid-cols-[1fr_0.85fr] lg:p-12">
            <div>
              <span className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface-2">
                <Smartphone className="size-5 text-accent" />
              </span>
              <h2 className="display mt-6 max-w-[16ch] text-[32px] sm:text-[38px]">
                Pair your first Android device.
              </h2>
              <p className="mt-4 max-w-[48ch] text-[13.5px] leading-6 text-muted">
                Account setup is complete. A pairing code connects the app to
                this dashboard without ever sending your account password to the
                phone.
              </p>
              <div className="mt-7">
                <Link className={buttonClasses({ size: "lg" })} href="/app/pair">
                  Generate a pairing code
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-surface-2/60 p-5">
              <p className="eyebrow">Before you start</p>
              <ol className="mt-4 space-y-4">
                {[
                  "Install the signed APK on the Android phone.",
                  "Enter the pairing code from the next screen.",
                  "Grant background location and notification access.",
                  "Send a test fix from the device detail page.",
                ].map((step, index) => (
                  <li className="flex gap-3" key={step}>
                    <span className="mono flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-[10px] text-muted">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[12px] leading-5 text-muted">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line bg-surface px-7 py-4 text-[11px] text-faint sm:px-10 lg:px-12">
            <span className="flex items-center gap-1.5">
              <ShieldAlert className="size-3.5" />
              Pairing codes expire in 10 minutes
            </span>
            <span className="flex items-center gap-1.5">
              <Radio className="size-3.5" />
              Each device receives its own revocable token
            </span>
          </div>
        </section>
      </div>
    );
  }

  const online = devices.filter((device) => device.presence === "online").length;
  const attention = devices.filter(
    (device) =>
      device.status === "lost" ||
      device.presence !== "online" ||
      (device.batteryLevel !== null &&
        device.batteryLevel <= 20 &&
        !device.isCharging),
  ).length;

  const latest = snapshot?.points[snapshot.points.length - 1] ?? null;
  const googleMaps = latest
    ? `https://www.google.com/maps?q=${latest.latitude},${latest.longitude}`
    : null;

  return (
    <div className="space-y-5">
      <PageHeader
        actions={
          <Link className={buttonClasses({ size: "md" })} href="/app/pair">
            <Smartphone className="size-4" />
            Pair device
          </Link>
        }
        description={
          selected
            ? `Last contact with ${selected.name} ${formatRelative(selected.lastSeenAt)}. History is retained for 90 days by default.`
            : undefined
        }
        eyebrow="Operations"
        title="Overview"
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          icon={Smartphone}
          label="Tracked devices"
          sub={`${devices.length - online} not reporting`}
          value={`${online}/${devices.length}`}
        />
        <Stat
          icon={Clock3}
          label="Last contact"
          sub={selected?.name ?? "—"}
          value={selected ? formatRelative(selected.lastSeenAt) : "—"}
        />
        <Stat
          icon={Crosshair}
          label="Fixes · 24 h"
          sub={`${stats.pendingCommands} command${stats.pendingCommands === 1 ? "" : "s"} pending`}
          value={String(stats.locations24h)}
        />
        <Stat
          icon={TriangleAlert}
          label="Need attention"
          sub={attention === 0 ? "All clear" : "Review device state"}
          tone={attention > 0 ? "warning" : "default"}
          value={String(attention)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-7 items-center justify-center rounded-md border border-line bg-surface-2">
                <Smartphone className="size-3.5 text-muted" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-semibold">
                  {selected?.name}
                </p>
                <p className="mono text-[9.5px] text-faint">
                  {selected?.model || "Android device"}
                  {latest
                    ? ` · ±${Math.round(latest.accuracyM)} m`
                    : " · awaiting first fix"}
                </p>
              </div>
              {selected ? <StatusBadge presence={selected.presence} /> : null}
              {selected?.status === "lost" ? (
                <Badge tone="danger" dot>
                  Lost mode
                </Badge>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {googleMaps ? (
                <a
                  className={buttonClasses({
                    variant: "ghost",
                    size: "sm",
                    className: "hidden sm:inline-flex",
                  })}
                  href={googleMaps}
                  rel="noreferrer"
                  target="_blank"
                >
                  Google Maps
                  <ExternalLink className="size-3" />
                </a>
              ) : null}
              {selected ? (
                <Link
                  className={buttonClasses({ variant: "secondary", size: "sm" })}
                  href={`/app/devices/${selected.id}`}
                >
                  Open device
                  <ChevronRight className="size-3" />
                </Link>
              ) : null}
            </div>
          </div>

          <div className="h-[340px] sm:h-[400px] xl:h-[430px]">
            <DeviceMap
              emptyLabel="The map will centre when the first fix arrives."
              fences={
                snapshot?.geofences.map((fence) => ({
                  id: fence.id,
                  name: fence.name,
                  centerLat: fence.centerLat,
                  centerLon: fence.centerLon,
                  radiusM: fence.radiusM,
                })) ?? []
              }
              focus={
                latest
                  ? { latitude: latest.latitude, longitude: latest.longitude }
                  : null
              }
              points={snapshot?.points ?? []}
            />
          </div>

          <div className="grid gap-px border-t border-line bg-line sm:grid-cols-4">
            <MapMetric
              label="Last fix"
              value={latest ? formatRelative(latest.recordedAt) : "None"}
            />
            <MapMetric
              label="Accuracy"
              value={latest ? formatAccuracy(latest.accuracyM) : "—"}
            />
            <MapMetric
              label="Battery"
              value={formatBattery(selected?.batteryLevel)}
            />
            <MapMetric
              label="Coordinates"
              value={
                latest
                  ? `${latest.latitude.toFixed(4)}, ${latest.longitude.toFixed(4)}`
                  : "—"
              }
            />
          </div>
        </section>

        <div className="space-y-4">
          <section className="card">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-[12.5px] font-semibold">Devices</h2>
              <span className="mono text-[10px] text-faint">{devices.length}</span>
            </div>
            <div className="max-h-[330px] divide-y divide-line overflow-y-auto">
              {devices.map((device) => (
                <Link
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60"
                  href={`/app/devices/${device.id}`}
                  key={device.id}
                >
                  <span className="relative flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-bg">
                    <Smartphone className="size-4 text-muted" />
                    <span
                      className={
                        device.presence === "online"
                          ? "absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-surface bg-positive"
                          : device.presence === "stale"
                            ? "absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-surface bg-warning"
                            : "absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-surface bg-danger"
                      }
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-[12px] font-medium">{device.name}</p>
                      {device.status === "lost" ? (
                        <span className="mono text-[9px] uppercase tracking-[0.08em] text-danger">
                          Lost
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[10.5px] text-faint">
                      {formatRelative(device.lastSeenAt)} · {formatBattery(device.batteryLevel)}
                    </p>
                  </div>
                  <ChevronRight className="size-3.5 text-faint" />
                </Link>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-[12.5px] font-semibold">Needs attention</h2>
              <span className="mono text-[10px] text-faint">{attention}</span>
            </div>
            {attention === 0 ? (
              <div className="flex items-start gap-2.5 px-4 py-5">
                <span className="status-dot mt-1.5 text-positive" />
                <div>
                  <p className="text-[12px] font-medium">No open issues</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-muted">
                    Every paired device has checked in recently and is not in
                    lost mode.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {devices
                  .filter(
                    (device) =>
                      device.status === "lost" ||
                      device.presence !== "online" ||
                      (device.batteryLevel !== null &&
                        device.batteryLevel <= 20 &&
                        !device.isCharging),
                  )
                  .slice(0, 4)
                  .map((device) => (
                    <li key={device.id}>
                      <Link
                        className="flex items-start gap-2.5 px-4 py-3 transition-colors hover:bg-surface-2/60"
                        href={`/app/devices/${device.id}`}
                      >
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11.5px] font-medium">
                            {device.name}
                          </p>
                          <p className="mt-0.5 text-[10.5px] leading-4 text-muted">
                            {device.status === "lost"
                              ? "Lost mode is active."
                              : device.presence === "offline"
                                ? `No contact since ${formatRelative(device.lastSeenAt)}.`
                                : device.presence === "stale"
                                  ? `Last check-in ${formatRelative(device.lastSeenAt)}.`
                                  : `Battery at ${formatBattery(device.batteryLevel)}.`}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-[12.5px] font-semibold">Recent activity</h2>
            <Link
              className="text-[11px] font-medium text-muted hover:text-ink"
              href="/app/activity"
            >
              View all
            </Link>
          </div>
          <ActivityList
            compact
            entries={activity}
            timezone={session.user.timezone}
          />
        </section>

        <section className="card">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-[12.5px] font-semibold">Geofences</h2>
          </div>
          <div className="px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="display text-[30px]">{stats.geofenceCount}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  Active boundaries across all devices
                </p>
              </div>
              <span className="flex size-9 items-center justify-center rounded-full border border-line bg-surface-2">
                <MapPin className="size-4 text-muted" />
              </span>
            </div>
            {snapshot?.geofences.length ? (
              <ul className="mt-4 space-y-2.5 border-t border-line pt-3.5">
                {snapshot.geofences.slice(0, 3).map((fence) => (
                  <li
                    className="flex items-center justify-between gap-3 text-[11px]"
                    key={fence.id}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="size-1.5 shrink-0 rounded-full bg-info" />
                      <span className="truncate text-ink">{fence.name}</span>
                    </span>
                    <span className="mono shrink-0 text-[10px] text-faint">
                      {fence.radiusM} m
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 border-t border-line pt-3.5 text-[11px] leading-4 text-faint">
                No geofences yet. Add one from a device page to receive enter and
                exit alerts.
              </p>
            )}
            {selected ? (
              <Link
                className={buttonClasses({
                  variant: "secondary",
                  size: "sm",
                  className: "mt-4 w-full",
                })}
                href={`/app/devices/${selected.id}?tab=geofences`}
              >
                Manage geofences
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: typeof Smartphone;
  label: string;
  value: string;
  sub: string;
  tone?: "default" | "warning";
}) {
  return (
    <div className="card px-4 py-3.5">
      <div className="flex items-center justify-between">
        <p className="mono text-[9.5px] uppercase tracking-[0.1em] text-faint">
          {label}
        </p>
        <Icon
          className={
            tone === "warning" ? "size-3.5 text-warning" : "size-3.5 text-faint"
          }
        />
      </div>
      <p className="display mt-2 text-[24px] tracking-[-0.03em]">{value}</p>
      <p className="mt-0.5 truncate text-[10.5px] text-faint">{sub}</p>
    </div>
  );
}

function MapMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-4 py-2.5">
      <p className="mono text-[9px] uppercase tracking-[0.1em] text-faint">
        {label}
      </p>
      <p className="mono mt-1 truncate text-[11px] text-ink">{value}</p>
    </div>
  );
}
