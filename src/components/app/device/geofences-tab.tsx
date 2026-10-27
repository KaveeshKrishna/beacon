"use client";

import { MapPin, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { formatCoordinates, formatRelative } from "@/lib/format";
import type { GeofenceDto, LocationDto } from "@/lib/data/devices";

export function GeofencesTab({
  deviceId,
  geofences,
  latest,
  onChange,
}: {
  deviceId: string;
  geofences: GeofenceDto[];
  latest: LocationDto | null;
  onChange: (geofences: GeofenceDto[]) => void;
}) {
  const { push } = useToast();
  const [name, setName] = useState("");
  const [radius, setRadius] = useState("250");
  const [latitude, setLatitude] = useState(
    latest ? latest.latitude.toFixed(6) : "",
  );
  const [longitude, setLongitude] = useState(
    latest ? latest.longitude.toFixed(6) : "",
  );
  const [notifyEnter, setNotifyEnter] = useState(true);
  const [notifyExit, setNotifyExit] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<GeofenceDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await apiFetch<{ geofence: GeofenceDto }>(
        `/api/devices/${deviceId}/geofences`,
        {
          method: "POST",
          body: JSON.stringify({
            name,
            centerLat: Number(latitude),
            centerLon: Number(longitude),
            radiusM: Number(radius),
            notifyOnEnter: notifyEnter,
            notifyOnExit: notifyExit,
          }),
        },
      );
      onChange([result.geofence, ...geofences]);
      setEvents(result.geofence, `Created ${result.geofence.name}.`);
      setName("");
      setRadius("250");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  function setEvents(fence: GeofenceDto, message: string) {
    push({ title: message, tone: "success", description: `${fence.radiusM} m radius.` });
  }

  async function toggle(
    fence: GeofenceDto,
    key: "notifyOnEnter" | "notifyOnExit",
    value: boolean,
  ) {
    const next = geofences.map((item) =>
      item.id === fence.id ? { ...item, [key]: value } : item,
    );
    onChange(next);
    try {
      await apiFetch(`/api/geofences/${fence.id}`, {
        method: "PATCH",
        body: JSON.stringify({ [key]: value }),
      });
    } catch (caught) {
      onChange(geofences);
      push({
        title: "Preference was not saved",
        description: errorMessage(caught),
        tone: "danger",
      });
    }
  }

  async function remove() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await apiFetch(
        `/api/devices/${deviceId}/geofences?geofenceId=${encodeURIComponent(toDelete.id)}`,
        { method: "DELETE" },
      );
      onChange(geofences.filter((fence) => fence.id !== toDelete.id));
      push({ title: `Deleted ${toDelete.name}`, tone: "success" });
      setToDelete(null);
    } catch (caught) {
      push({
        title: "Geofence was not deleted",
        description: errorMessage(caught),
        tone: "danger",
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
      <section className="card">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="text-[12.5px] font-semibold">Geofences</h2>
            <p className="mt-0.5 text-[10.5px] text-faint">
              Checked server-side against every accepted fix.
            </p>
          </div>
          <span className="mono text-[10px] text-faint">{geofences.length}/20</span>
        </div>

        {geofences.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <span className="mx-auto flex size-10 items-center justify-center rounded-full border border-line bg-surface-2">
              <MapPin className="size-4 text-muted" />
            </span>
            <p className="mt-3 text-[13px] font-semibold">No boundaries yet</p>
            <p className="mx-auto mt-1.5 max-w-[34ch] text-[11.5px] leading-5 text-muted">
              Add a home, office or school perimeter. Enter and exit alerts are
              evaluated when a location arrives, not by the phone.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {geofences.map((fence) => (
              <li className="px-4 py-4" key={fence.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-info/20 bg-info/5 text-info">
                      <MapPin className="size-3.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-[12.5px] font-semibold">
                          {fence.name}
                        </p>
                        <Badge
                          tone={
                            fence.lastInside === null
                              ? "neutral"
                              : fence.lastInside
                                ? "positive"
                                : "neutral"
                          }
                        >
                          {fence.lastInside === null
                            ? "Not evaluated"
                            : fence.lastInside
                              ? "Inside"
                              : "Outside"}
                        </Badge>
                      </div>
                      <p className="mono mt-1 text-[10px] text-faint">
                        {fence.radiusM} m ·{" "}
                        {formatCoordinates(fence.centerLat, fence.centerLon, 5)}
                      </p>
                    </div>
                  </div>
                  <button
                    aria-label={`Delete ${fence.name}`}
                    className="inline-flex size-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-danger/10 hover:text-danger"
                    onClick={() => setToDelete(fence)}
                    type="button"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 pl-9">
                  <label className="flex items-center gap-2 text-[10.5px] text-muted">
                    <Switch
                      checked={fence.notifyOnEnter}
                      onCheckedChange={(value) => void toggle(fence, "notifyOnEnter", value)}
                      className="scale-[0.82]"
                    />
                    Enter alert
                  </label>
                  <label className="flex items-center gap-2 text-[10.5px] text-muted">
                    <Switch
                      checked={fence.notifyOnExit}
                      onCheckedChange={(value) => void toggle(fence, "notifyOnExit", value)}
                      className="scale-[0.82]"
                    />
                    Exit alert
                  </label>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-start gap-2 border-t border-line bg-surface-2/40 px-4 py-3">
          <MapPin className="mt-0.5 size-3 shrink-0 text-faint" />
          <p className="text-[10px] leading-4 text-faint">
            Geofences are not stored on the phone. They work whenever a fix
            reaches the server, including points uploaded late from the offline
            queue.
          </p>
        </div>
      </section>

      <section className="card">
        <div className="border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-1.5 text-[12.5px] font-semibold">
            <Plus className="size-3.5 text-muted" />
            Add a geofence
          </h2>
        </div>
        <form className="space-y-4 p-4" onSubmit={create}>
          {error ? <FormMessage>{error}</FormMessage> : null}

          <Field htmlFor="fence-name" label="Name">
            <Input
              id="fence-name"
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
              placeholder="Home"
              required
              value={name}
            />
          </Field>

          <Field htmlFor="fence-radius" label="Radius (metres)">
            <Input
              id="fence-radius"
              max={50000}
              min={50}
              onChange={(event) => setRadius(event.target.value)}
              required
              type="number"
              value={radius}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field htmlFor="fence-lat" label="Latitude">
              <Input
                id="fence-lat"
                max={90}
                min={-90}
                onChange={(event) => setLatitude(event.target.value)}
                placeholder="51.5074"
                required
                step="any"
                type="number"
                value={latitude}
              />
            </Field>
            <Field htmlFor="fence-lon" label="Longitude">
              <Input
                id="fence-lon"
                max={180}
                min={-180}
                onChange={(event) => setLongitude(event.target.value)}
                placeholder="-0.1278"
                required
                step="any"
                type="number"
                value={longitude}
              />
            </Field>
          </div>

          {latest ? (
            <button
              className="text-[10.5px] font-medium text-muted underline decoration-line-strong underline-offset-2 hover:text-ink"
              onClick={() => {
                setLatitude(latest.latitude.toFixed(6));
                setLongitude(latest.longitude.toFixed(6));
              }}
              type="button"
            >
              Use latest fix ({formatRelative(latest.recordedAt)})
            </button>
          ) : (
            <p className="text-[10.5px] text-faint">
              No fix yet. Enter coordinates manually or wait for the first sync.
            </p>
          )}

          <div className="space-y-2 border-t border-line pt-3">
            <label className="flex items-center justify-between gap-3 text-[11px] text-muted">
              Notify on enter
              <Switch checked={notifyEnter} onCheckedChange={setNotifyEnter} />
            </label>
            <label className="flex items-center justify-between gap-3 text-[11px] text-muted">
              Notify on exit
              <Switch checked={notifyExit} onCheckedChange={setNotifyExit} />
            </label>
          </div>

          <Button className="w-full" loading={loading} type="submit">
            Create geofence
          </Button>
          <p className="text-[10px] leading-4 text-faint">
            Alerts respect your notification preferences and are delivered by
            email. At least one channel must be enabled.
          </p>
        </form>
      </section>

      <Dialog
        description={
          toDelete
            ? `Delete “${toDelete.name}”? Its event history remains in the activity log, but the boundary stops being evaluated immediately.`
            : undefined
        }
        footer={
          <>
            <Button onClick={() => setToDelete(null)} variant="ghost">
              Cancel
            </Button>
            <Button loading={deleting} onClick={() => void remove()} variant="danger">
              Delete geofence
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        open={toDelete !== null}
        title="Delete this geofence?"
      />
    </div>
  );
}
