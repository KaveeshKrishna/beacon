"use client";

import {
  BatteryCharging,
  BellRing,
  Camera,
  Crosshair,
  LocateFixed,
  Lock,
  MapPin,
  MessageSquare,
  Radio,
  RefreshCw,
  Smartphone,
  TriangleAlert,
  Volume2,
  Wifi,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { DeviceMap } from "@/components/map/device-map";
import { COMMAND_CONFIRMATIONS, type CommandConfirmation } from "@/components/app/device/command-copy";
import { Button, buttonClasses } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import type { CommandType, LocationRange } from "@/lib/constants";
import { cn } from "@/lib/cn";
import type {
  DeviceSummary,
  GeofenceDto,
  LocationDto,
} from "@/lib/data/devices";
import {
  formatAccuracy,
  formatBattery,
  formatCoordinates,
  formatDateTime,
  formatRelative,
  formatSpeed,
  providerLabel,
} from "@/lib/format";

const ranges: { value: LocationRange; label: string }[] = [
  { value: "1h", label: "1 h" },
  { value: "24h", label: "24 h" },
  { value: "7d", label: "7 d" },
  { value: "30d", label: "30 d" },
];

type PendingAction = CommandConfirmation;

export function DeviceOverview({
  summary,
  points,
  geofences,
  range,
  timezone,
  sending,
  onRangeChange,
  onSendCommand,
}: {
  summary: DeviceSummary;
  points: LocationDto[];
  geofences: GeofenceDto[];
  range: LocationRange;
  timezone: string;
  sending: CommandType | null;
  onRangeChange: (range: LocationRange) => void;
  onSendCommand: (type: CommandType, message?: string) => Promise<void>;
}) {
  const latest = points[points.length - 1] ?? null;
  const [fitToken, setFitToken] = useState(0);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const [message, setMessage] = useState("");

  function request(type: CommandType) {
    const action = COMMAND_CONFIRMATIONS[type];
    if (action) setPending(action);
    else void onSendCommand(type);
  }

  async function confirmAction() {
    if (!pending) return;
    const type = pending.type;
    setPending(null);
    await onSendCommand(type);
  }

  async function sendMessage() {
    const trimmed = message.trim();
    if (!trimmed) return;
    setMessageOpen(false);
    setMessage("");
    await onSendCommand("MESSAGE", trimmed);
  }

  const batteryTone =
    summary.batteryLevel === null
      ? "neutral"
      : summary.batteryLevel <= 20
        ? "danger"
        : summary.batteryLevel <= 40
          ? "warning"
          : "positive";

  return (
    <div className="space-y-4">
      {summary.status === "lost" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/25 bg-danger/[0.06] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="status-dot text-danger" />
            <div>
              <p className="text-[12.5px] font-semibold">Lost mode is active</p>
              <p className="mt-0.5 text-[11px] text-muted">
                Since {formatDateTime(summary.lostModeAt, timezone)}. Tracking
                cadence and battery use are elevated.
              </p>
            </div>
          </div>
          <Button
            loading={sending === "LOST_MODE_OFF"}
            onClick={() => request("LOST_MODE_OFF")}
            size="sm"
            variant="secondary"
          >
            Exit lost mode
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(310px,1fr)]">
        <div className="space-y-4">
          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "status-dot",
                    summary.presence === "online"
                      ? "text-positive"
                      : summary.presence === "stale"
                        ? "text-warning"
                        : "text-danger",
                  )}
                />
                <p className="mono text-[10px] uppercase tracking-[0.1em] text-muted">
                  {summary.presence === "online"
                    ? "Live"
                    : summary.presence === "stale"
                      ? "Stale signal"
                      : "Offline"}
                </p>
                <span className="mono text-[9.5px] text-faint">
                  {points.length} fix{points.length === 1 ? "" : "es"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-[7px] border border-line bg-surface-2 p-0.5">
                  {ranges.map((item) => (
                    <button
                      className={cn(
                        "rounded-[5px] px-2 py-1 text-[10.5px] font-medium transition-colors",
                        range === item.value
                          ? "bg-surface text-ink shadow-sm"
                          : "text-muted hover:text-ink",
                      )}
                      key={item.value}
                      onClick={() => onRangeChange(item.value)}
                      type="button"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <button
                  aria-label="Recentre map"
                  className="inline-flex size-7 items-center justify-center rounded-[6px] border border-line bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                  onClick={() => setFitToken((value) => value + 1)}
                  type="button"
                >
                  <LocateFixed className="size-3.5" />
                </button>
              </div>
            </div>

            <div className="h-[360px] sm:h-[430px] xl:h-[480px]">
              <DeviceMap
                emptyLabel="No fixes in this range. Widen the range or send Locate now."
                fences={geofences.map((fence) => ({
                  id: fence.id,
                  name: fence.name,
                  centerLat: fence.centerLat,
                  centerLon: fence.centerLon,
                  radiusM: fence.radiusM,
                }))}
                fitToken={fitToken}
                focus={
                  latest
                    ? { latitude: latest.latitude, longitude: latest.longitude }
                    : null
                }
                points={points.map((point) => ({
                  latitude: point.latitude,
                  longitude: point.longitude,
                  accuracyM: point.accuracyM,
                  recordedAt: point.recordedAt,
                  batteryLevel: point.batteryLevel,
                }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-5">
              <MapStat
                label="Last fix"
                value={latest ? formatRelative(latest.recordedAt) : "None"}
              />
              <MapStat
                label="Accuracy"
                value={latest ? formatAccuracy(latest.accuracyM) : "—"}
              />
              <MapStat
                label="Speed"
                value={latest ? formatSpeed(latest.speedMps) : "—"}
              />
              <MapStat
                label="Source"
                value={latest ? providerLabel(latest.provider) : "—"}
              />
              <MapStat
                label="Recorded"
                value={latest ? formatDateTime(latest.recordedAt, timezone) : "—"}
                wide
              />
            </div>
          </section>

          {latest ? (
            <section className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-md border border-line bg-surface-2">
                  <MapPin className="size-3.5 text-muted" />
                </span>
                <div>
                  <p className="mono text-[11px] text-ink">
                    {formatCoordinates(latest.latitude, latest.longitude, 6)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-faint">
                    {latest.isMocked
                      ? "Flagged as a mocked location"
                      : `Received ${formatRelative(latest.receivedAt)}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CopyButton
                  label="Copy coordinates"
                  value={`${latest.latitude}, ${latest.longitude}`}
                />
                <a
                  className={buttonClasses({ variant: "secondary", size: "sm" })}
                  href={`https://www.google.com/maps?q=${latest.latitude},${latest.longitude}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  Directions
                </a>
              </div>
            </section>
          ) : null}
        </div>

        <div className="space-y-4">
          <section className="card">
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-[12.5px] font-semibold">Telemetry</h2>
            </div>
            <div className="divide-y divide-line">
              <div className="px-4 py-3.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[11px] text-muted">
                    <BatteryCharging className="size-3.5" />
                    Battery
                  </span>
                  <span className="mono text-[11.5px]">
                    {formatBattery(summary.batteryLevel)}
                    {summary.isCharging ? " · charging" : ""}
                  </span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      batteryTone === "danger"
                        ? "bg-danger"
                        : batteryTone === "warning"
                          ? "bg-warning"
                          : "bg-positive",
                    )}
                    style={{ width: `${Math.max(2, summary.batteryLevel ?? 0)}%` }}
                  />
                </div>
              </div>
              <TelemetryRow
                icon={Wifi}
                label="Network"
                value={summary.networkType ?? "Not reported"}
              />
              <TelemetryRow
                icon={Radio}
                label="SIM state"
                value={summary.simState ?? "Not reported"}
              />
              <TelemetryRow
                icon={RefreshCw}
                label="Last check-in"
                value={formatRelative(summary.lastSeenAt)}
              />
              <TelemetryRow
                icon={Crosshair}
                label="Tracking profile"
                value={
                  summary.trackingProfile === "high"
                    ? "High frequency"
                    : summary.trackingProfile === "low"
                      ? "Low power"
                      : "Balanced"
                }
              />
              <TelemetryRow
                icon={Smartphone}
                label="Paired"
                value={formatDateTime(summary.pairedAt, timezone)}
              />
              <TelemetryRow
                icon={RefreshCw}
                label="Offline alert"
                value={`${summary.offlineAlertMinutes} min`}
              />
            </div>
            {latest?.isMocked ? (
              <div className="flex items-start gap-2 border-t border-line bg-warning/[0.06] px-4 py-3">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                <p className="text-[10.5px] leading-4 text-warning">
                  The latest fix is marked as mocked by Android. Treat it as
                  unreliable.
                </p>
              </div>
            ) : null}
          </section>

          <section className="card">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-[12.5px] font-semibold">Remote actions</h2>
              <span className="mono text-[9.5px] text-faint">queued</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 p-3">
              <ActionButton
                icon={Crosshair}
                label="Locate now"
                loading={sending === "LOCATE_NOW"}
                onClick={() => void onSendCommand("LOCATE_NOW")}
              />
              <ActionButton
                icon={Volume2}
                label="Sound alarm"
                loading={sending === "RING"}
                onClick={() => request("RING")}
              />
              <ActionButton
                icon={Lock}
                label="Lock device"
                loading={sending === "LOCK_DEVICE"}
                onClick={() => request("LOCK_DEVICE")}
              />
              <ActionButton
                icon={Camera}
                label="Request photo"
                loading={sending === "CAPTURE_PHOTO"}
                onClick={() => request("CAPTURE_PHOTO")}
              />
              <ActionButton
                icon={MessageSquare}
                label="Show message"
                loading={sending === "MESSAGE"}
                onClick={() => setMessageOpen(true)}
              />
              <ActionButton
                icon={RefreshCw}
                label="Force sync"
                loading={sending === "SYNC_NOW"}
                onClick={() => void onSendCommand("SYNC_NOW")}
              />
            </div>
            <div className="border-t border-line px-4 py-3">
              {summary.status === "lost" ? (
                <Button
                  className="w-full"
                  loading={sending === "LOST_MODE_OFF"}
                  onClick={() => request("LOST_MODE_OFF")}
                  size="sm"
                  variant="secondary"
                >
                  Exit lost mode
                </Button>
              ) : (
                <Button
                  className="w-full"
                  loading={sending === "LOST_MODE_ON"}
                  onClick={() => request("LOST_MODE_ON")}
                  size="sm"
                  variant="soft"
                >
                  <BellRing className="size-3.5" />
                  Enable lost mode
                </Button>
              )}
            </div>
          </section>

          <section className="card px-4 py-3.5">
            <div className="flex items-start gap-2">
              <Radio className="mt-0.5 size-3.5 shrink-0 text-faint" />
              <p className="text-[10.5px] leading-[1.6] text-faint">
                Commands are delivered when the app next checks in or receives a
                push. They expire after 24 hours. A queued command is not proof
                that Android executed it — check the result on the Commands tab.
              </p>
            </div>
            <Link
              className="mt-2.5 inline-block text-[11px] font-medium text-muted underline decoration-line-strong underline-offset-2 hover:text-ink"
              href="#commands"
              onClick={(event) => {
                event.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              How remote commands work
            </Link>
          </section>
        </div>
      </div>

      <Dialog
        description={pending?.description}
        footer={
          <>
            <Button onClick={() => setPending(null)} variant="ghost">
              Cancel
            </Button>
            <Button
              loading={pending ? sending === pending.type : false}
              onClick={() => void confirmAction()}
            >
              {pending?.confirmLabel ?? "Confirm"}
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        open={pending !== null}
        title={pending?.title ?? ""}
      />

      <Dialog
        description="The message appears as a notification on the device. Keep it short and actionable."
        footer={
          <>
            <Button onClick={() => setMessageOpen(false)} variant="ghost">
              Cancel
            </Button>
            <Button disabled={!message.trim()} onClick={() => void sendMessage()}>
              Queue message
            </Button>
          </>
        }
        onOpenChange={setMessageOpen}
        open={messageOpen}
        title="Show a message"
      >
        <Field htmlFor="device-message" label="Message">
          <Textarea
            id="device-message"
            maxLength={200}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Call this number when you find this phone."
            value={message}
          />
        </Field>
        <p className="mt-1.5 text-right text-[10px] text-faint">
          {message.length}/200
        </p>
      </Dialog>
    </div>
  );
}

function TelemetryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wifi;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="flex items-center gap-1.5 text-[11px] text-muted">
        <Icon className="size-3.5" />
        {label}
      </span>
      <span className="max-w-[55%] truncate text-right text-[11px] text-ink">
        {value}
      </span>
    </div>
  );
}

function MapStat({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={cn("bg-surface px-3 py-2.5", wide ? "col-span-2 sm:col-span-1" : "")}>
      <p className="mono text-[8.5px] uppercase tracking-[0.1em] text-faint">
        {label}
      </p>
      <p className="mono mt-1 truncate text-[10.5px] text-ink">{value}</p>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  loading,
}: {
  icon: typeof Crosshair;
  label: string;
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <button
      className="flex flex-col items-start gap-1.5 rounded-[8px] border border-line bg-surface px-2.5 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-surface-2 disabled:cursor-wait disabled:opacity-50"
      disabled={loading}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-3.5 text-muted" />
      <span className="text-[10.5px] font-medium leading-4">{label}</span>
    </button>
  );
}
