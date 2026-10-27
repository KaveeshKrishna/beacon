"use client";

import { Save } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client-api";

const rows = [
  {
    key: "notifyGeofence" as const,
    title: "Geofence transitions",
    copy: "Send an email when a device crosses a boundary, for fences with enter or exit alerts enabled.",
  },
  {
    key: "notifyOffline" as const,
    title: "Device goes offline",
    copy: "Send a stale-device alert when no heartbeat arrives within the threshold set on each device.",
  },
  {
    key: "notifyLowBattery" as const,
    title: "Low battery",
    copy: "Send an alert when a device reports 20% or lower while not charging. Repeated alerts are rate-limited.",
  },
  {
    key: "notifySecurity" as const,
    title: "Security activity",
    copy: "New sign-ins, password changes, MFA changes and recovery-code regeneration.",
  },
];

export function NotificationSettingsForm({
  initial,
}: {
  initial: Record<string, boolean>;
}) {
  const { push } = useToast();
  const [settings, setSettings] = useState({
    notifyGeofence: initial.notifyGeofence ?? true,
    notifyOffline: initial.notifyOffline ?? true,
    notifyLowBattery: initial.notifyLowBattery ?? true,
    notifySecurity: initial.notifySecurity ?? true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/api/settings/notifications", {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
      setSaved(true);
      push({
        title: "Notification preferences saved",
        description: "New events will follow these rules immediately.",
        tone: "success",
      });
      window.setTimeout(() => setSaved(false), 2500);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card" onSubmit={save}>
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-[12.5px] font-semibold">Alert preferences</h2>
        <p className="mt-0.5 text-[10.5px] text-faint">
          Applies to email alerts. Command push notifications are separate.
        </p>
      </div>
      <div className="divide-y divide-line">
        {rows.map((row) => (
          <div
            className="flex items-start justify-between gap-4 px-4 py-4 sm:px-5"
            key={row.key}
          >
            <div className="min-w-0">
              <p className="text-[12px] font-medium">{row.title}</p>
              <p className="mt-1 max-w-[56ch] text-[10.5px] leading-[1.6] text-muted">
                {row.copy}
              </p>
            </div>
            <Switch
              aria-label={row.title}
              checked={settings[row.key]}
              onCheckedChange={(value) =>
                setSettings((current) => ({ ...current, [row.key]: value }))
              }
            />
          </div>
        ))}
      </div>
      <div className="space-y-3 border-t border-line p-4 sm:px-5">
        {error ? <FormMessage>{error}</FormMessage> : null}
        <div className="flex items-center gap-3">
          <Button icon={<Save className="size-3.5" />} loading={loading} type="submit">
            Save preferences
          </Button>
          {saved ? (
            <span className="mono text-[10px] uppercase tracking-[0.1em] text-positive">
              Saved
            </span>
          ) : null}
        </div>
        <p className="text-[10px] leading-4 text-faint">
          Alerts are still recorded in Activity when email is suppressed. Email
          delivery must be configured at the server level for any message to
          leave the system.
        </p>
      </div>
    </form>
  );
}
