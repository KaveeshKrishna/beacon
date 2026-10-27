"use client";

import { Save, Smartphone, Trash2, Unlink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client-api";
import type { DeviceSummary } from "@/lib/data/devices";

const profiles = [
  {
    value: "low",
    label: "Low power",
    copy: "Fewer fixes, longer battery life. Best for a spare phone.",
  },
  {
    value: "balanced",
    label: "Balanced",
    copy: "Movement-aware updates with a sensible battery cost.",
  },
  {
    value: "high",
    label: "High frequency",
    copy: "Tighter intervals. Expect noticeably higher battery use.",
  },
] as const;

export function DeviceSettingsTab({
  summary,
  onUpdated,
}: {
  summary: DeviceSummary;
  onUpdated: (summary: DeviceSummary) => void;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [name, setName] = useState(summary.name);
  const [trackingProfile, setTrackingProfile] = useState(summary.trackingProfile);
  const [offlineAlertMinutes, setOfflineAlertMinutes] = useState(
    String(summary.offlineAlertMinutes),
  );
  const [fallbackSmsNumber, setFallbackSmsNumber] = useState("");
  const [removeFallbackSms, setRemoveFallbackSms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [unpairOpen, setUnpairOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeConfirm, setPurgeConfirm] = useState("");
  const [removing, setRemoving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const data = await apiFetch<{ summary: DeviceSummary }>(
        `/api/devices/${summary.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name,
            trackingProfile,
            offlineAlertMinutes: Number(offlineAlertMinutes),
            ...(fallbackSmsNumber.trim()
              ? { fallbackSmsNumber: fallbackSmsNumber.trim() }
              : removeFallbackSms
                ? { fallbackSmsNumber: "" }
                : {}),
          }),
        },
      );
      onUpdated(data.summary);
      setFallbackSmsNumber("");
      setRemoveFallbackSms(false);
      push({
        title: "Device settings saved",
        description: "The app picks these up on its next heartbeat.",
        tone: "success",
      });
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function remove(purge: boolean) {
    setRemoving(true);
    try {
      await apiFetch(
        `/api/devices/${summary.id}${purge ? "?purge=true" : ""}`,
        { method: "DELETE" },
      );
      push({
        title: purge ? "Device and history purged" : "Device unpaired",
        description: purge
          ? "Location history and geofences were deleted."
          : "The token is revoked. History remains stored under this account.",
        tone: "success",
      });
      router.push("/app");
      router.refresh();
    } catch (caught) {
      push({
        title: "Device could not be removed",
        description: errorMessage(caught),
        tone: "danger",
      });
      setRemoving(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
      <form className="card" onSubmit={save}>
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Smartphone className="size-3.5 text-muted" />
          <h2 className="text-[12.5px] font-semibold">Device settings</h2>
        </div>
        <div className="space-y-5 p-4 sm:p-5">
          {error ? <FormMessage>{error}</FormMessage> : null}

          <Field htmlFor="device-name" label="Display name">
            <Input
              id="device-name"
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </Field>

          <Field
            htmlFor="device-profile"
            hint="The tracking profile is applied by the Android app on its next heartbeat."
            label="Tracking profile"
          >
            <select
              className="field"
              id="device-profile"
              onChange={(event) => setTrackingProfile(event.target.value)}
              value={trackingProfile}
            >
              {profiles.map((profile) => (
                <option key={profile.value} value={profile.value}>
                  {profile.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="rounded-lg border border-line bg-surface-2/50 px-3.5 py-3">
            <p className="text-[11px] font-medium">
              {profiles.find((profile) => profile.value === trackingProfile)?.label}
            </p>
            <p className="mt-0.5 text-[10.5px] leading-4 text-muted">
              {
                profiles.find((profile) => profile.value === trackingProfile)
                  ?.copy
              }
            </p>
          </div>

          <Field
            htmlFor="offline-alert"
            hint="When no heartbeat arrives within this window, Beacon emails a stale-device alert. Minimum 10 minutes."
            label="Offline alert after (minutes)"
          >
            <Input
              id="offline-alert"
              max={10080}
              min={10}
              onChange={(event) => setOfflineAlertMinutes(event.target.value)}
              required
              type="number"
              value={offlineAlertMinutes}
            />
          </Field>

          <Field
            hint="Optional. Stored encrypted. The Android app may text one map link to this number when it has a fix but no data connection. Requires the SMS permission on the device and a working carrier; it is best-effort, not a guarantee."
            htmlFor="fallback-sms"
            label="SMS fallback number"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Input
                autoComplete="tel"
                className="min-w-0 flex-1"
                disabled={removeFallbackSms}
                id="fallback-sms"
                inputMode="tel"
                onChange={(event) => setFallbackSmsNumber(event.target.value)}
                placeholder={
                  summary.fallbackSmsConfigured
                    ? "Configured — enter a new number to replace"
                    : "+447700900123"
                }
                type="tel"
                value={fallbackSmsNumber}
              />
              {summary.fallbackSmsConfigured ? (
                removeFallbackSms ? (
                  <Button
                    onClick={() => setRemoveFallbackSms(false)}
                    size="sm"
                    variant="ghost"
                  >
                    Keep current
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      setRemoveFallbackSms(true);
                      setFallbackSmsNumber("");
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    Remove
                  </Button>
                )
              ) : null}
            </div>
            <p className="mt-1.5 text-[10px] text-faint">
              {removeFallbackSms
                ? "The number will be removed when you save."
                : summary.fallbackSmsConfigured
                  ? "A fallback number is configured. It is never shown again in the console."
                  : "No fallback number configured. SMS is optional."}
            </p>
          </Field>

          <div className="flex items-center gap-2 border-t border-line pt-4">
            <Button
              icon={<Save className="size-3.5" />}
              loading={saving}
              type="submit"
            >
              Save changes
            </Button>
            <p className="text-[10px] text-faint">
              Changes are written to the audit log.
            </p>
          </div>
        </div>
      </form>

      <div className="space-y-4">
        <section className="card">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-[12.5px] font-semibold">Device identity</h2>
          </div>
          <dl className="divide-y divide-line">
            {[
              ["Manufacturer", summary.manufacturer || "Not reported"],
              ["Model", summary.model || "Not reported"],
              ["Android", summary.androidVersion || "Not reported"],
              ["App version", summary.appVersion || "Not reported"],
              ["Device ID", summary.id],
            ].map(([label, value]) => (
              <div className="flex items-start justify-between gap-3 px-4 py-2.5" key={label}>
                <dt className="text-[10.5px] text-muted">{label}</dt>
                <dd className="mono max-w-[62%] break-all text-right text-[10px] text-ink">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="card border-danger/20">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-[12.5px] font-semibold">Danger zone</h2>
          </div>
          <div className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11.5px] font-medium">Unpair device</p>
                <p className="mt-0.5 text-[10.5px] leading-4 text-muted">
                  Revokes the token immediately. Location history and geofences
                  remain available to this account.
                </p>
              </div>
              <Button
                icon={<Unlink className="size-3.5" />}
                onClick={() => setUnpairOpen(true)}
                size="sm"
                variant="secondary"
              >
                Unpair
              </Button>
            </div>
            <div className="border-t border-line pt-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11.5px] font-medium text-danger">
                    Purge device
                  </p>
                  <p className="mt-0.5 text-[10.5px] leading-4 text-muted">
                    Permanently deletes the device, its locations, geofences and
                    commands. This cannot be undone.
                  </p>
                </div>
                <Button
                  icon={<Trash2 className="size-3.5" />}
                  onClick={() => setPurgeOpen(true)}
                  size="sm"
                  variant="danger"
                >
                  Purge
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <Dialog
        description="The device will stop reporting immediately. Its stored history remains attached to your account and can be exported."
        footer={
          <>
            <Button onClick={() => setUnpairOpen(false)} variant="ghost">
              Cancel
            </Button>
            <Button
              loading={removing}
              onClick={() => void remove(false)}
              variant="danger"
            >
              Unpair device
            </Button>
          </>
        }
        onOpenChange={setUnpairOpen}
        open={unpairOpen}
        title="Unpair this device?"
      />

      <Dialog
        description="This deletes the device and every location, geofence, command and event attached to it. Type the device name to confirm."
        footer={
          <>
            <Button onClick={() => setPurgeOpen(false)} variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={purgeConfirm !== summary.name}
              loading={removing}
              onClick={() => void remove(true)}
              variant="danger"
            >
              Purge permanently
            </Button>
          </>
        }
        onOpenChange={(open) => {
          setPurgeOpen(open);
          if (!open) setPurgeConfirm("");
        }}
        open={purgeOpen}
        title="Purge device and history"
      >
        <Field htmlFor="purge-confirm" label={`Type “${summary.name}” to confirm`}>
          <Input
            autoComplete="off"
            id="purge-confirm"
            onChange={(event) => setPurgeConfirm(event.target.value)}
            placeholder={summary.name}
            value={purgeConfirm}
          />
        </Field>
      </Dialog>
    </div>
  );
}
