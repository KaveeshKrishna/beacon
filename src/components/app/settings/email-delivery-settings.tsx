"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  ServerCog,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/cn";

type Priority =
  | "default"
  | "relay_first"
  | "resend_first"
  | "relay_only"
  | "resend_only";

type EmailSettingsData = {
  providers: Array<{
    name: "relay" | "resend";
    configured: boolean;
    from: string;
  }>;
  defaultPriority: Exclude<Priority, "default">;
  priority: Priority;
  recent: Array<{
    id: number;
    template: string;
    provider: string;
    status: string;
    latencyMs: number | null;
    createdAt: string;
  }>;
};

const priorityOptions: Array<{
  value: Priority;
  label: string;
  description: string;
}> = [
  {
    value: "default",
    label: "Use deployment default",
    description: "Follow the operator's configured order.",
  },
  {
    value: "relay_first",
    label: "Relay first",
    description: "Try Relay, then fall back to Resend.",
  },
  {
    value: "resend_first",
    label: "Resend first",
    description: "Try Resend, then fall back to Relay.",
  },
  {
    value: "relay_only",
    label: "Relay only",
    description: "Never route this account's mail through Resend.",
  },
  {
    value: "resend_only",
    label: "Resend only",
    description: "Never route this account's mail through Relay.",
  },
];

const templateLabels: Record<string, string> = {
  verify_email: "Verify email",
  reset_password: "Reset password",
  password_changed: "Password changed",
  mfa_code: "Sign-in code",
  mfa_enabled: "MFA changed",
  new_signin: "New sign-in",
  security_alert: "Security alert",
  test: "Test message",
  account_deleted: "Account deleted",
  geofence_enter: "Geofence entered",
  geofence_exit: "Geofence exited",
  device_offline: "Device offline",
  low_battery: "Low battery",
  sim_changed: "SIM changed",
};

function ProviderRow({
  provider,
  configured,
  from,
  isDefault,
}: {
  provider: "relay" | "resend";
  configured: boolean;
  from: string;
  isDefault: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[8px] border border-line bg-surface-2 text-muted">
          <ServerCog className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[12px] font-medium capitalize">{provider}</p>
            {configured ? (
              <Badge dot tone="positive">
                Configured
              </Badge>
            ) : (
              <Badge tone="neutral">Not configured</Badge>
            )}
            {isDefault ? <Badge tone="accent">Server default</Badge> : null}
          </div>
          <p className="mono mt-1 break-all text-[9.5px] text-faint">
            {configured ? from : "Credentials not present in this deployment"}
          </p>
        </div>
      </div>
    </div>
  );
}

export function EmailDeliverySettings() {
  const { push } = useToast();
  const [data, setData] = useState<EmailSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [priority, setPriority] = useState<Priority>("default");

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<EmailSettingsData>("/api/settings/email");
      setData(result);
      setPriority(result.priority);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePriority(next: Priority) {
    setPriority(next);
    setSaving(true);
    setError(null);
    try {
      await apiFetch<{ priority: Priority }>("/api/settings/email", {
        method: "PATCH",
        body: JSON.stringify({ priority: next }),
      });
      setData((current) => (current ? { ...current, priority: next } : current));
      push({
        title: "Delivery policy saved",
        description:
          next === "default"
            ? "This account follows the deployment default."
            : "Future messages use the selected provider order.",
        tone: "success",
      });
    } catch (caught) {
      setPriority(data?.priority ?? "default");
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setError(null);
    try {
      const result = await apiFetch<{ sent: boolean; provider: string }>(
        "/api/settings/email/test",
        { method: "POST", body: JSON.stringify({}) },
      );
      push({
        title: "Test message accepted",
        description:
          result.provider === "dev-log"
            ? "Development logging mode: the message was written to the server log, not sent."
            : `Delivered through ${result.provider}. Check your inbox and delivery log below.`,
        tone: "success",
      });
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="card flex items-center gap-3 px-4 py-8 text-[12px] text-muted sm:px-5">
        <Loader2 className="size-4 animate-spin" /> Loading delivery configuration
      </div>
    );
  }

  if (!data) {
    return <FormMessage>{error ?? "Email settings could not be loaded."}</FormMessage>;
  }

  const providers = ["relay", "resend"] as const;
  const configuredCount = data.providers.filter((item) => item.configured).length;

  return (
    <div className="space-y-4">
      {error ? <FormMessage>{error}</FormMessage> : null}

      {configuredCount === 0 ? (
        <div className="flex items-start gap-3 rounded-[12px] border border-warning/30 bg-warning/10 px-4 py-3.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="text-[12px] font-medium text-warning">
              No email provider is configured
            </p>
            <p className="mt-1 text-[10.5px] leading-[1.65] text-muted">
              Verification, password reset, sign-in codes and alerts cannot
              leave the server. In development, messages are written to the
              server log when <code className="mono">EMAIL_DEV_LOG=true</code>.
              In production, set Relay or Resend credentials in the deployment
              environment. Secrets are never shown in this console.
            </p>
          </div>
        </div>
      ) : configuredCount === 1 ? (
        <div className="flex items-start gap-3 rounded-[12px] border border-info/25 bg-info/10 px-4 py-3.5">
          <Mail className="mt-0.5 size-4 shrink-0 text-info" />
          <p className="text-[10.5px] leading-[1.65] text-muted">
            Only one email provider is configured. There is no secondary
            failover path; a provider outage will delay all outgoing mail until
            delivery is retried or credentials are restored.
          </p>
        </div>
      ) : null}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          <div>
            <h2 className="text-[12.5px] font-semibold">Providers</h2>
            <p className="mt-1 text-[10.5px] leading-[1.6] text-muted">
              Addresses and API credentials are configured at the deployment
              level. Beacon uses the account policy below to choose a path.
            </p>
          </div>
          <Badge dot tone={configuredCount > 0 ? "positive" : "warning"}>
            {configuredCount} of 2 ready
          </Badge>
        </div>
        <div className="divide-y divide-line">
          {providers.map((name) => {
            const provider = data.providers.find((item) => item.name === name);
            const effectiveDefault =
              data.defaultPriority === `${name}_first` ||
              data.defaultPriority === `${name}_only`;
            return (
              <ProviderRow
                configured={Boolean(provider?.configured)}
                from={provider?.from ?? ""}
                isDefault={effectiveDefault}
                key={name}
                provider={name}
              />
            );
          })}
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-line px-4 py-3.5 sm:px-5">
          <h2 className="text-[12.5px] font-semibold">Delivery policy</h2>
          <p className="mt-1 max-w-[70ch] text-[10.5px] leading-[1.6] text-muted">
            Controls which provider is attempted first for mail addressed to
            this account. If both providers are allowed, the second is attempted
            only when the first fails. An <em>only</em> policy disables failover
            by design. Server default:{" "}
            <span className="mono text-ink">{data.defaultPriority}</span>.
          </p>
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5">
          {priorityOptions.map((option) => {
            const active = priority === option.value;
            return (
              <button
                className={cn(
                  "rounded-[10px] border px-3 py-3 text-left transition-colors",
                  active
                    ? "border-accent/50 bg-accent/[0.06]"
                    : "border-line hover:border-line-strong hover:bg-surface-2/50",
                )}
                disabled={saving}
                key={option.value}
                onClick={() => {
                  if (option.value !== priority) void savePriority(option.value);
                }}
                type="button"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[11.5px] font-medium">
                    {option.value === "default"
                      ? `${option.label} (${data.defaultPriority})`
                      : option.label}
                  </span>
                  {active ? (
                    <CheckCircle2 className="size-3.5 shrink-0 text-accent" />
                  ) : null}
                </span>
                <span className="mt-1 block text-[10px] leading-[1.5] text-muted">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3.5 sm:px-5">
          <p className="text-[10px] text-faint">
            {saving ? "Saving policy..." : "Changes apply to the next message."}
          </p>
          <Button
            icon={<Send className="size-3.5" />}
            loading={testing}
            onClick={sendTest}
            size="sm"
            variant="secondary"
          >
            Send test email
          </Button>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          <div>
            <h2 className="text-[12.5px] font-semibold">Recent delivery attempts</h2>
            <p className="mt-1 text-[10.5px] leading-[1.6] text-muted">
              The eight most recent messages for this account. Delivery logs
              never contain message bodies or verification codes.
            </p>
          </div>
          <Button
            aria-label="Refresh delivery log"
            icon={<RefreshCw className="size-3.5" />}
            onClick={() => void load()}
            size="icon"
            variant="ghost"
          />
        </div>
        {data.recent.length === 0 ? (
          <p className="px-4 py-8 text-center text-[11px] text-muted sm:px-5">
            No messages have been sent to this account yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="border-b border-line">
                  <th className="px-4 py-2 text-[9.5px] font-medium uppercase tracking-[0.08em] text-faint sm:px-5">
                    Message
                  </th>
                  <th className="px-3 py-2 text-[9.5px] font-medium uppercase tracking-[0.08em] text-faint">
                    Provider
                  </th>
                  <th className="px-3 py-2 text-[9.5px] font-medium uppercase tracking-[0.08em] text-faint">
                    Status
                  </th>
                  <th className="px-4 py-2 text-right text-[9.5px] font-medium uppercase tracking-[0.08em] text-faint sm:px-5">
                    When
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.recent.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2.5 text-[11px] sm:px-5">
                      {templateLabels[row.template] ?? row.template}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="mono text-[10px] capitalize text-muted">
                        {row.provider}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        dot
                        tone={row.status === "sent" ? "positive" : "danger"}
                      >
                        {row.status === "sent" ? "Sent" : "Failed"}
                      </Badge>
                      {row.latencyMs !== null ? (
                        <span className="mono ml-2 text-[9px] text-faint">
                          {row.latencyMs} ms
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-right sm:px-5">
                      <span
                        className="mono text-[9.5px] text-faint"
                        title={formatDateTime(row.createdAt)}
                      >
                        {formatRelative(row.createdAt)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-[12px] border border-line bg-surface-2/50 px-4 py-3.5">
        <div className="flex items-start gap-2.5">
          <Mail className="mt-0.5 size-4 shrink-0 text-faint" />
          <p className="text-[10.5px] leading-[1.7] text-muted">
            Security mail is intentionally not suppressible: password resets,
            email verification and sign-in codes are always sent. Alert email
            follows the preferences under Notifications. A failed send is logged
            once per provider attempt, and Beacon never retries a security
            message indefinitely.
          </p>
        </div>
      </section>
    </div>
  );
}
