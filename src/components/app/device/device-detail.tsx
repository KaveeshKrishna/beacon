"use client";

import {
  ChevronLeft,
  Images,
  MapPin,
  Settings2,
  Terminal,
  Map as MapIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { DeviceOverview } from "@/components/app/device/overview-tab";
import { GeofencesTab } from "@/components/app/device/geofences-tab";
import { CommandsTab } from "@/components/app/device/commands-tab";
import { PhotosTab } from "@/components/app/device/photos-tab";
import { DeviceSettingsTab } from "@/components/app/device/settings-tab";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import type {
  CommandDto,
  DeviceSummary,
  GeofenceDto,
  LocationDto,
} from "@/lib/data/devices";
import type { DevicePhotoDto } from "@/lib/data/photos";
import type { CommandType } from "@/lib/constants";
import type { LocationRange } from "@/lib/constants";

export type DeviceTab =
  | "overview"
  | "photos"
  | "geofences"
  | "commands"
  | "settings";

const tabs: { id: DeviceTab; label: string; icon: typeof MapIcon }[] = [
  { id: "overview", label: "Live view", icon: MapIcon },
  { id: "photos", label: "Photos", icon: Images },
  { id: "geofences", label: "Geofences", icon: MapPin },
  { id: "commands", label: "Commands", icon: Terminal },
  { id: "settings", label: "Settings", icon: Settings2 },
];

export function DeviceDetail({
  initial,
  timezone,
  initialTab,
}: {
  initial: {
    summary: DeviceSummary;
    points: LocationDto[];
    geofences: GeofenceDto[];
    commands: CommandDto[];
    range: LocationRange;
  };
  timezone: string;
  initialTab: DeviceTab;
}) {
  const { push } = useToast();
  const [tab, setTab] = useState<DeviceTab>(initialTab);
  const [summary, setSummary] = useState(initial.summary);
  const [points, setPoints] = useState(initial.points);
  const [geofences, setGeofences] = useState(initial.geofences);
  const [commands, setCommands] = useState(initial.commands);
  const [photos, setPhotos] = useState<DevicePhotoDto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photosError, setPhotosError] = useState<string | null>(null);
  const [range, setRange] = useState<LocationRange>(initial.range);
  const [sending, setSending] = useState<CommandType | null>(null);
  const pointsRef = useRef(points);

  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    let cancelled = false;
    let first = true;

    async function load() {
      const current = pointsRef.current;
      const since =
        !first && current.length > 0
          ? current[current.length - 1]?.recordedAt
          : null;
      try {
        const data = await apiFetch<{
          points: LocationDto[];
          summary: DeviceSummary;
        }>(
          `/api/devices/${initial.summary.id}/locations?range=${range}${
            since ? `&since=${encodeURIComponent(since)}` : ""
          }`,
        );
        if (cancelled) return;
        setSummary(data.summary);
        if (since) {
          setPoints((existing) => {
            const byId = new Map(existing.map((point) => [point.id, point]));
            data.points.forEach((point) => byId.set(point.id, point));
            return [...byId.values()].sort(
              (left, right) =>
                new Date(left.recordedAt).getTime() -
                new Date(right.recordedAt).getTime(),
            );
          });
        } else {
          setPoints(data.points);
        }
      } catch {
        // Polling failures are silent; the next tick retries.
      } finally {
        first = false;
      }
    }

    void load();
    const timer = window.setInterval(load, 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [initial.summary.id, range]);

  useEffect(() => {
    const deviceId = initial.summary.id;
    async function loadCommands() {
      try {
        const data = await apiFetch<{ commands: CommandDto[] }>(
          `/api/devices/${deviceId}/commands`,
        );
        setCommands(data.commands);
      } catch {
        // Keep the last known list.
      }
    }
    const timer = window.setInterval(loadCommands, 25_000);
    return () => window.clearInterval(timer);
  }, [initial.summary.id]);

  const deviceId = initial.summary.id;

  const loadPhotos = useCallback(async () => {
    const data = await apiFetch<{ photos: DevicePhotoDto[] }>(
      `/api/devices/${deviceId}/photos`,
    );
    setPhotos(data.photos);
    setPhotosError(null);
  }, [deviceId]);

  useEffect(() => {
    if (tab !== "photos") return;
    let cancelled = false;
    let first = true;

    async function load() {
      if (first) setPhotosLoading(true);
      try {
        await loadPhotos();
      } catch (caught) {
        if (!cancelled) setPhotosError(errorMessage(caught));
      } finally {
        if (!cancelled) {
          setPhotosLoading(false);
          first = false;
        }
      }
    }

    void load();
    const timer = window.setInterval(load, 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tab, loadPhotos]);

  async function sendCommand(type: CommandType, message?: string) {
    setSending(type);
    try {
      const data = await apiFetch<{ command: CommandDto; label: string }>(
        `/api/devices/${initial.summary.id}/commands`,
        {
          method: "POST",
          body: JSON.stringify(message ? { type, message } : { type }),
        },
      );
      setCommands((current) => [data.command, ...current]);
      if (type === "LOST_MODE_ON") {
        setSummary((current) => ({
          ...current,
          status: "lost",
          lostModeAt: new Date().toISOString(),
        }));
      }
      if (type === "LOST_MODE_OFF") {
        setSummary((current) => ({
          ...current,
          status: "active",
          lostModeAt: null,
        }));
      }
      push({
        title: `${data.label} queued`,
        description:
          type === "CAPTURE_PHOTO"
            ? "Open Beacon on the device to take the photo. The encrypted upload will appear on the Photos tab."
            : summary.presence === "online"
              ? "The device will act on its next check-in."
              : "The command is stored until the device reconnects.",
        tone: "success",
      });
    } catch (caught) {
      push({
        title: "Command could not be queued",
        description: errorMessage(caught),
        tone: "danger",
      });
    } finally {
      setSending(null);
    }
  }

  const latest = points[points.length - 1] ?? null;

  return (
    <div className="space-y-5">
      <div>
        <Link
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted transition-colors hover:text-ink"
          href="/app"
        >
          <ChevronLeft className="size-3.5" />
          Overview
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="display truncate text-[28px] sm:text-[32px]">
                {summary.name}
              </h1>
              <StatusBadge presence={summary.presence} />
              {summary.status === "lost" ? (
                <Badge dot tone="danger">
                  Lost mode
                </Badge>
              ) : null}
            </div>
            <p className="mt-1.5 text-[12px] text-muted">
              {[summary.manufacturer, summary.model].filter(Boolean).join(" ") ||
                "Android device"}
              {summary.androidVersion ? ` · Android ${summary.androidVersion}` : ""}
              {summary.appVersion ? ` · App ${summary.appVersion}` : ""}
            </p>
          </div>
          {latest ? (
            <a
              className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-line-strong bg-surface px-3 text-[12px] font-medium text-ink transition-colors hover:bg-surface-2"
              href={`https://www.google.com/maps?q=${latest.latitude},${latest.longitude}`}
              rel="noreferrer"
              target="_blank"
            >
              <MapPin className="size-3.5 text-muted" />
              Open in Google Maps
            </a>
          ) : null}
        </div>
      </div>

      <div
        aria-label="Device sections"
        className="flex gap-0.5 overflow-x-auto border-b border-line"
        role="tablist"
      >
        {tabs.map((item) => {
          const active = tab === item.id;
          const count =
            item.id === "photos"
              ? photos.length
              : item.id === "geofences"
                ? geofences.length
                : item.id === "commands"
                  ? commands.length
                  : null;
          return (
            <button
              aria-selected={active}
              className={cn(
                "relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-[12px] font-medium transition-colors",
                active ? "text-ink" : "text-muted hover:text-ink",
              )}
              key={item.id}
              onClick={() => setTab(item.id)}
              role="tab"
              type="button"
            >
              <item.icon className="size-3.5" />
              {item.label}
              {count !== null && count > 0 ? (
                <span className="mono rounded-full bg-surface-2 px-1.5 text-[9.5px] text-faint">
                  {count}
                </span>
              ) : null}
              {active ? (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />
              ) : null}
            </button>
          );
        })}
      </div>

      {tab === "overview" ? (
        <DeviceOverview
          geofences={geofences}
          points={points}
          range={range}
          sending={sending}
          summary={summary}
          timezone={timezone}
          onRangeChange={setRange}
          onSendCommand={sendCommand}
        />
      ) : null}

      {tab === "photos" ? (
        <PhotosTab
          deviceId={summary.id}
          error={photosError}
          loading={photosLoading}
          photos={photos}
          sending={sending}
          timezone={timezone}
          onRefresh={loadPhotos}
          onSendCommand={sendCommand}
        />
      ) : null}

      {tab === "geofences" ? (
        <GeofencesTab
          deviceId={summary.id}
          geofences={geofences}
          latest={latest}
          onChange={setGeofences}
        />
      ) : null}

      {tab === "commands" ? (
        <CommandsTab
          commands={commands}
          sending={sending}
          timezone={timezone}
          onRefresh={async () => {
            try {
              const data = await apiFetch<{ commands: CommandDto[] }>(
                `/api/devices/${summary.id}/commands`,
              );
              setCommands(data.commands);
            } catch (caught) {
              push({
                title: "Could not refresh commands",
                description: errorMessage(caught),
                tone: "danger",
              });
            }
          }}
          onSendCommand={sendCommand}
        />
      ) : null}

      {tab === "settings" ? (
        <DeviceSettingsTab
          summary={summary}
          onUpdated={(next) => setSummary(next)}
        />
      ) : null}
    </div>
  );
}
