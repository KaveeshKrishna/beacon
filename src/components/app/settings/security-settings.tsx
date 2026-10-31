"use client";

import {
  KeyRound,
  Link2,
  Loader2,
  LockKeyhole,
  MailCheck,
  MonitorSmartphone,
  RefreshCcw,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { formatDateTime, formatRelative } from "@/lib/format";

type TotpSetup = {
  secret: string;
  uri: string;
  qrDataUrl: string;
};

type SessionRow = {
  id: string;
  current: boolean;
  device: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  mfaVerified: boolean;
};

type MobileSessionRow = {
  id: string;
  deviceId: string;
  deviceName: string;
  device: string;
  userAgent: string;
  createdAt: string;
  lastUsedAt: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  recoveryEligible: boolean;
};

type DialogState =
  | { type: "none" }
  | { type: "totp-setup" }
  | { type: "totp-disable" }
  | { type: "email-mfa" }
  | { type: "regenerate" }
  | { type: "recovery-codes"; codes: string[] };

function SettingsCard({
  title,
  description,
  children,
  action,
  tone = "default",
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2
            className={
              tone === "danger"
                ? "text-[12.5px] font-semibold text-danger"
                : "text-[12.5px] font-semibold"
            }
          >
            {title}
          </h2>
          <p className="mt-1 max-w-[64ch] text-[10.5px] leading-[1.6] text-muted">
            {description}
          </p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function SecuritySettings({
  email,
  totpEnabled,
  emailMfaEnabled,
  recoveryCodesGeneratedAt,
  timezone,
}: {
  email: string;
  totpEnabled: boolean;
  emailMfaEnabled: boolean;
  recoveryCodesGeneratedAt: string | null;
  timezone: string;
}) {
  const router = useRouter();
  const { push } = useToast();

  const [dialog, setDialog] = useState<DialogState>({ type: "none" });
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [emailMfaPassword, setEmailMfaPassword] = useState("");
  const [pendingEmailMfa, setPendingEmailMfa] = useState(false);
  const [regeneratePassword, setRegeneratePassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const [mobileSessions, setMobileSessions] = useState<MobileSessionRow[]>([]);
  const [mobileLoading, setMobileLoading] = useState(true);
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [revokingMobile, setRevokingMobile] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await apiFetch<{ sessions: SessionRow[] }>(
          "/api/auth/sessions",
        );
        if (!cancelled) setSessions(data.sessions);
      } catch (caught) {
        if (!cancelled) setSessionsError(errorMessage(caught));
      } finally {
        if (!cancelled) setSessionsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await apiFetch<{ sessions: MobileSessionRow[] }>(
          "/api/mobile/sessions",
        );
        if (!cancelled) setMobileSessions(data.sessions);
      } catch (caught) {
        if (!cancelled) setMobileError(errorMessage(caught));
      } finally {
        if (!cancelled) setMobileLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function closeDialog() {
    setDialog({ type: "none" });
    setDialogError(null);
    setSetup(null);
    setTotpCode("");
    setDisablePassword("");
    setDisableCode("");
    setEmailMfaPassword("");
    setRegeneratePassword("");
    setRecoveryCodes([]);
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setDialogError(null);
    if (newPassword !== confirmPassword) {
      setDialogError("The new passwords do not match.");
      return;
    }
    setBusyAction("password");
    try {
      await apiFetch<{ message: string }>("/api/auth/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      push({
        title: "Password changed",
        description: "Other sessions were signed out. This browser stayed signed in.",
        tone: "success",
      });
      router.refresh();
      const data = await apiFetch<{ sessions: SessionRow[] }>(
        "/api/auth/sessions",
      );
      setSessions(data.sessions);
    } catch (caught) {
      setDialogError(errorMessage(caught));
    } finally {
      setBusyAction(null);
    }
  }

  async function startTotpSetup() {
    setDialogError(null);
    setBusyAction("totp-setup");
    try {
      const data = await apiFetch<TotpSetup>("/api/auth/mfa/totp/setup", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSetup(data);
      setDialog({ type: "totp-setup" });
    } catch (caught) {
      push({
        title: "Could not start setup",
        description: errorMessage(caught),
        tone: "danger",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function enableTotp(event: React.FormEvent) {
    event.preventDefault();
    setDialogError(null);
    setBusyAction("totp-enable");
    try {
      const data = await apiFetch<{ recoveryCodes: string[] }>(
        "/api/auth/mfa/totp/enable",
        {
          method: "POST",
          body: JSON.stringify({ code: totpCode.replace(/\s/g, "") }),
        },
      );
      setDialog({ type: "recovery-codes", codes: data.recoveryCodes });
      setRecoveryCodes(data.recoveryCodes);
      setTotpCode("");
      router.refresh();
      push({
        title: "Authenticator enabled",
        description: "Store your recovery codes before closing this dialog.",
        tone: "success",
      });
    } catch (caught) {
      setDialogError(errorMessage(caught));
    } finally {
      setBusyAction(null);
    }
  }

  async function disableTotp(event: React.FormEvent) {
    event.preventDefault();
    setDialogError(null);
    setBusyAction("totp-disable");
    try {
      await apiFetch("/api/auth/mfa/totp/disable", {
        method: "POST",
        body: JSON.stringify({
          password: disablePassword,
          code: disableCode.replace(/\s/g, ""),
        }),
      });
      push({
        title: "Authenticator disabled",
        description: "Recovery codes were revoked with this factor.",
        tone: "success",
      });
      closeDialog();
      router.refresh();
    } catch (caught) {
      setDialogError(errorMessage(caught));
    } finally {
      setBusyAction(null);
    }
  }

  async function updateEmailMfa() {
    setDialogError(null);
    setBusyAction("email-mfa");
    try {
      await apiFetch<{ emailMfaEnabled: boolean }>(
        "/api/auth/mfa/email/toggle",
        {
          method: "POST",
          body: JSON.stringify({
            enabled: pendingEmailMfa,
            password: emailMfaPassword,
          }),
        },
      );
      push({
        title: pendingEmailMfa ? "Email verification enabled" : "Email verification disabled",
        description: pendingEmailMfa
          ? "A one-time code will be sent to your verified address at sign-in."
          : "Email codes will no longer be accepted at sign-in.",
        tone: "success",
      });
      closeDialog();
      router.refresh();
    } catch (caught) {
      setDialogError(errorMessage(caught));
    } finally {
      setBusyAction(null);
    }
  }

  async function regenerate(event: React.FormEvent) {
    event.preventDefault();
    setDialogError(null);
    setBusyAction("regenerate");
    try {
      const data = await apiFetch<{ recoveryCodes: string[] }>(
        "/api/auth/mfa/recovery/regenerate",
        {
          method: "POST",
          body: JSON.stringify({ password: regeneratePassword }),
        },
      );
      setRecoveryCodes(data.recoveryCodes);
      setDialog({ type: "recovery-codes", codes: data.recoveryCodes });
      setRegeneratePassword("");
      router.refresh();
    } catch (caught) {
      setDialogError(errorMessage(caught));
    } finally {
      setBusyAction(null);
    }
  }

  async function revokeSession(id: string, current: boolean) {
    if (
      !window.confirm(
        current
          ? "Sign out of this browser? You will need to sign in again."
          : "Revoke this session? The device will be signed out immediately.",
      )
    ) {
      return;
    }
    setRevoking(id);
    try {
      await apiFetch<{ revoked: boolean; current: boolean }>(
        `/api/auth/sessions/${id}`,
        { method: "DELETE", body: JSON.stringify({}) },
      );
      if (current) {
        window.location.assign("/login");
        return;
      }
      setSessions((rows) => rows.filter((row) => row.id !== id));
      push({ title: "Session revoked", tone: "success" });
    } catch (caught) {
      push({
        title: "Could not revoke session",
        description: errorMessage(caught),
        tone: "danger",
      });
    } finally {
      setRevoking(null);
    }
  }

  async function revokeLinkedPhone(id: string, deviceName: string) {
    if (
      !window.confirm(
        `Revoke Beacon access for ${deviceName}? It will need to be linked again from the app.`,
      )
    ) {
      return;
    }
    setRevokingMobile(id);
    try {
      await apiFetch<{ revoked: boolean }>(`/api/mobile/sessions/${id}`, {
        method: "DELETE",
        body: JSON.stringify({}),
      });
      setMobileSessions((rows) => rows.filter((row) => row.id !== id));
      push({ title: "Linked phone revoked", tone: "success" });
    } catch (caught) {
      push({
        title: "Could not revoke linked phone",
        description: errorMessage(caught),
        tone: "danger",
      });
    } finally {
      setRevokingMobile(null);
    }
  }

  return (
    <div className="space-y-4">
      <SettingsCard
        description="Use a unique passphrase of at least 12 characters. Changing it revokes every other session."
        title="Password"
      >
        <form className="space-y-4 p-4 sm:p-5" onSubmit={changePassword}>
          {dialogError && dialog.type === "none" ? (
            <FormMessage>{dialogError}</FormMessage>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2" htmlFor="current-password" label="Current password">
              <Input
                autoComplete="current-password"
                id="current-password"
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                type="password"
                value={currentPassword}
              />
            </Field>
            <Field
              hint="12 characters or more. Avoid reused or breached passwords."
              htmlFor="new-password"
              label="New password"
            >
              <Input
                autoComplete="new-password"
                id="new-password"
                minLength={12}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                type="password"
                value={newPassword}
              />
            </Field>
            <Field htmlFor="confirm-password" label="Confirm new password">
              <Input
                autoComplete="new-password"
                id="confirm-password"
                minLength={12}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                type="password"
                value={confirmPassword}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button
              icon={<KeyRound className="size-3.5" />}
              loading={busyAction === "password"}
              type="submit"
            >
              Update password
            </Button>
            <span className="text-[10px] text-faint">
              A confirmation email is sent after a successful change.
            </span>
          </div>
        </form>
      </SettingsCard>

      <SettingsCard
        action={
          totpEnabled ? (
            <Badge dot tone="positive">
              Enabled
            </Badge>
          ) : (
            <Badge tone="warning">Not configured</Badge>
          )
        }
        description="A time-based one-time password from an authenticator app is the strongest second factor. Recovery codes are issued once and stored only as hashes."
        title="Authenticator app"
      >
        <div className="divide-y divide-line">
          <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[8px] border border-line bg-surface-2 text-muted">
                <Smartphone className="size-4" />
              </span>
              <div>
                <p className="text-[12px] font-medium">
                  {totpEnabled ? "Authenticator protection is active" : "Add an authenticator app"}
                </p>
                <p className="mt-1 max-w-[58ch] text-[10.5px] leading-[1.6] text-muted">
                  {totpEnabled
                    ? "Sign-in requires a 6-digit code after your password. Time drift is tolerated by one step."
                    : "Use 1Password, Bitwarden, Aegis, Google Authenticator or any TOTP-compatible app."}
                </p>
                {recoveryCodesGeneratedAt ? (
                  <p className="mono mt-1.5 text-[9.5px] text-faint">
                    Recovery codes generated {formatDateTime(recoveryCodesGeneratedAt, timezone)}
                  </p>
                ) : null}
              </div>
            </div>
            {totpEnabled ? (
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setDialogError(null);
                    setDialog({ type: "regenerate" });
                  }}
                  size="sm"
                  variant="secondary"
                >
                  New recovery codes
                </Button>
                <Button
                  onClick={() => {
                    setDialogError(null);
                    setDialog({ type: "totp-disable" });
                  }}
                  size="sm"
                  variant="ghost"
                >
                  Disable
                </Button>
              </div>
            ) : (
              <Button
                icon={
                  busyAction === "totp-setup" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="size-3.5" />
                  )
                }
                loading={busyAction === "totp-setup"}
                onClick={startTotpSetup}
                size="sm"
              >
                Set up
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[8px] border border-line bg-surface-2 text-muted">
                <MailCheck className="size-4" />
              </span>
              <div>
                <p className="text-[12px] font-medium">Email one-time code</p>
                <p className="mt-1 max-w-[58ch] text-[10.5px] leading-[1.6] text-muted">
                  A 10-minute code is sent to {email}. Useful as a fallback if
                  you lose your authenticator, but weaker than TOTP because it
                  depends on your inbox.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="mono text-[9.5px] uppercase tracking-[0.1em] text-faint">
                {emailMfaEnabled ? "On" : "Off"}
              </span>
              <Switch
                aria-label="Email one-time code"
                checked={emailMfaEnabled}
                onCheckedChange={(enabled) => {
                  setDialogError(null);
                  setPendingEmailMfa(enabled);
                  setEmailMfaPassword("");
                  setDialog({ type: "email-mfa" });
                }}
              />
            </div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        action={
          <Badge tone="neutral">
            {sessions.length} active
          </Badge>
        }
        description="Every browser and device with a live sign-in. Revoke anything you do not recognise. Sessions expire automatically."
        title="Signed-in sessions"
      >
        {sessionsError ? (
          <div className="p-4">
            <FormMessage>{sessionsError}</FormMessage>
          </div>
        ) : sessionsLoading ? (
          <div className="flex items-center gap-2 px-4 py-6 text-[11px] text-muted sm:px-5">
            <Loader2 className="size-3.5 animate-spin" /> Loading sessions
          </div>
        ) : sessions.length === 0 ? (
          <p className="px-4 py-6 text-[11px] text-muted sm:px-5">
            No active sessions.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {sessions.map((row) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5"
                key={row.id}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[8px] border border-line bg-surface-2 text-muted">
                    <MonitorSmartphone className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[12px] font-medium">{row.device}</p>
                      {row.current ? (
                        <Badge tone="accent">This device</Badge>
                      ) : null}
                      {row.mfaVerified ? (
                        <Badge tone="positive">2FA</Badge>
                      ) : (
                        <Badge tone="warning">No 2FA</Badge>
                      )}
                    </div>
                    <p className="mono mt-1 text-[9.5px] text-faint">
                      Last seen {formatRelative(row.lastSeenAt)} · created{" "}
                      {formatRelative(row.createdAt)}
                    </p>
                    <p className="mt-0.5 max-w-[64ch] truncate text-[9.5px] text-faint">
                      {row.userAgent || "No user agent recorded"}
                    </p>
                  </div>
                </div>
                <Button
                  disabled={revoking === row.id}
                  icon={
                    revoking === row.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )
                  }
                  onClick={() => revokeSession(row.id, row.current)}
                  size="sm"
                  variant="ghost"
                >
                  {row.current ? "Sign out" : "Revoke"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <SettingsCard
        action={
          <Badge tone="neutral">{mobileSessions.length} linked</Badge>
        }
        description="Phones approved from the Android app. A linked phone can see every device's latest location and, after seven days, reset a lost authenticator with your password and biometrics. It cannot send commands or change settings."
        title="Linked phones"
      >
        {mobileError ? (
          <div className="p-4">
            <FormMessage>{mobileError}</FormMessage>
          </div>
        ) : mobileLoading ? (
          <div className="flex items-center gap-2 px-4 py-6 text-[11px] text-muted sm:px-5">
            <Loader2 className="size-3.5 animate-spin" /> Loading linked phones
          </div>
        ) : mobileSessions.length === 0 ? (
          <div className="px-4 py-6 sm:px-5">
            <p className="text-[11px] leading-5 text-muted">
              No phones are linked. On Android, open Beacon and choose
              &ldquo;Link this phone&rdquo; under Account to start.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {mobileSessions.map((row) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5"
                key={row.id}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[8px] border border-line bg-surface-2 text-muted">
                    <Link2 className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[12px] font-medium">
                        {row.deviceName}
                      </p>
                      {row.recoveryEligible ? (
                        <Badge tone="positive">Recovery ready</Badge>
                      ) : (
                        <Badge tone="warning">Recovery pending</Badge>
                      )}
                    </div>
                    <p className="mono mt-1 text-[9.5px] text-faint">
                      {row.device || "Android app"} · linked{" "}
                      {formatRelative(row.createdAt)} · last used{" "}
                      {formatRelative(row.lastUsedAt)}
                    </p>
                    <p className="mt-0.5 text-[9.5px] text-faint">
                      {row.recoveryEligible
                        ? "Can reset two-factor after biometrics and your password."
                        : "Recovery unlocks seven days after linking."}
                    </p>
                  </div>
                </div>
                <Button
                  disabled={revokingMobile === row.id}
                  icon={
                    revokingMobile === row.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )
                  }
                  onClick={() => revokeLinkedPhone(row.id, row.deviceName)}
                  size="sm"
                  variant="ghost"
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-start gap-2.5 border-t border-line bg-surface-2/40 px-4 py-3.5 sm:px-5">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-positive" />
          <p className="text-[10.5px] leading-4 text-muted">
            Linking never gives the phone your password or a browser session.
            Revoking a phone invalidates its access and refresh tokens
            immediately.
          </p>
        </div>
      </SettingsCard>

      <section className="rounded-[12px] border border-line bg-surface-2/50 px-4 py-3.5">
        <div className="flex items-start gap-2.5">
          <LockKeyhole className="mt-0.5 size-4 shrink-0 text-faint" />
          <p className="text-[10.5px] leading-[1.7] text-muted">
            Beacon never stores passwords in plaintext or logs one-time codes.
            TOTP secrets are encrypted at rest, session tokens are stored as
            keyed hashes, and every security change is written to your Activity
            log. If you see a change you did not make, change your password,
            revoke all sessions, and rotate the deployment secrets.
          </p>
        </div>
      </section>

      <Dialog
        description="Scan the code with your authenticator app, then enter the 6-digit code it shows. The secret is shown once as a fallback for manual entry."
        onOpenChange={(open) => {
          if (!open && !busyAction) closeDialog();
        }}
        open={dialog.type === "totp-setup"}
        title="Set up authenticator"
      >
        {setup ? (
          <form className="space-y-4" onSubmit={enableTotp}>
            {dialogError ? <FormMessage>{dialogError}</FormMessage> : null}
            <div className="flex flex-col items-center gap-3 rounded-[10px] border border-line bg-white p-4">
              <Image
                alt="Authenticator setup QR code"
                height={208}
                src={setup.qrDataUrl}
                unoptimized
                width={208}
              />
              <div className="flex w-full items-center gap-2 rounded-md bg-[#f5f3ee] px-2.5 py-2">
                <code className="mono min-w-0 flex-1 break-all text-[10px] text-[#14161a]">
                  {setup.secret}
                </code>
                <CopyButton
                  className="border-[#cec8ba] bg-white text-[#62666e]"
                  label="Copy"
                  value={setup.secret}
                />
              </div>
            </div>
            <Field
              hint="Codes rotate every 30 seconds. Enter the current code without spaces."
              htmlFor="setup-code"
              label="Verification code"
            >
              <Input
                autoComplete="one-time-code"
                autoFocus
                id="setup-code"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => setTotpCode(event.target.value)}
                pattern="[0-9]{6}"
                placeholder="000000"
                required
                value={totpCode}
              />
            </Field>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button onClick={closeDialog} variant="ghost">
                Cancel
              </Button>
              <Button
                icon={<ShieldCheck className="size-3.5" />}
                loading={busyAction === "totp-enable"}
                type="submit"
              >
                Verify and enable
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted" />
          </div>
        )}
      </Dialog>

      <Dialog
        description="Disabling this factor removes recovery codes too. Your password will be the only sign-in requirement unless email verification is enabled."
        onOpenChange={(open) => {
          if (!open && !busyAction) closeDialog();
        }}
        open={dialog.type === "totp-disable"}
        title="Disable authenticator"
      >
        <form className="space-y-4" onSubmit={disableTotp}>
          {dialogError ? <FormMessage>{dialogError}</FormMessage> : null}
          <Field htmlFor="disable-password" label="Password">
            <Input
              autoComplete="current-password"
              id="disable-password"
              onChange={(event) => setDisablePassword(event.target.value)}
              required
              type="password"
              value={disablePassword}
            />
          </Field>
          <Field
            hint="Proves you still control the authenticator."
            htmlFor="disable-code"
            label="Authenticator code"
          >
            <Input
              autoComplete="one-time-code"
              id="disable-code"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setDisableCode(event.target.value)}
              pattern="[0-9]{6}"
              placeholder="000000"
              required
              value={disableCode}
            />
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button onClick={closeDialog} variant="ghost">
              Cancel
            </Button>
            <Button
              icon={<ShieldOff className="size-3.5" />}
              loading={busyAction === "totp-disable"}
              type="submit"
              variant="danger"
            >
              Disable authenticator
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        description={
          pendingEmailMfa
            ? "Confirm your password to start receiving a one-time code by email at sign-in."
            : "Confirm your password to stop using email codes at sign-in."
        }
        onOpenChange={(open) => {
          if (!open && !busyAction) closeDialog();
        }}
        open={dialog.type === "email-mfa"}
        title={pendingEmailMfa ? "Enable email verification" : "Disable email verification"}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void updateEmailMfa();
          }}
        >
          {dialogError ? <FormMessage>{dialogError}</FormMessage> : null}
          <Field htmlFor="email-mfa-password" label="Password">
            <Input
              autoComplete="current-password"
              autoFocus
              id="email-mfa-password"
              onChange={(event) => setEmailMfaPassword(event.target.value)}
              required
              type="password"
              value={emailMfaPassword}
            />
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button onClick={closeDialog} variant="ghost">
              Cancel
            </Button>
            <Button loading={busyAction === "email-mfa"} type="submit">
              {pendingEmailMfa ? "Enable email codes" : "Disable email codes"}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        description="Generating new codes invalidates every old code immediately. Existing codes cannot be recovered."
        onOpenChange={(open) => {
          if (!open && !busyAction) closeDialog();
        }}
        open={dialog.type === "regenerate"}
        title="Generate new recovery codes"
      >
        <form className="space-y-4" onSubmit={regenerate}>
          {dialogError ? <FormMessage>{dialogError}</FormMessage> : null}
          <Field htmlFor="regenerate-password" label="Password">
            <Input
              autoComplete="current-password"
              autoFocus
              id="regenerate-password"
              onChange={(event) => setRegeneratePassword(event.target.value)}
              required
              type="password"
              value={regeneratePassword}
            />
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button onClick={closeDialog} variant="ghost">
              Cancel
            </Button>
            <Button
              icon={<RefreshCcw className="size-3.5" />}
              loading={busyAction === "regenerate"}
              type="submit"
              variant="danger"
            >
              Regenerate codes
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        className="max-w-lg"
        description="Each code works once. Store them in a password manager or print them. Anyone with a code can bypass your authenticator."
        onOpenChange={(open) => {
          if (!open) {
            setDialog({ type: "none" });
            setRecoveryCodes([]);
          }
        }}
        open={dialog.type === "recovery-codes"}
        title="Save your recovery codes"
      >
        <div className="space-y-4">
          <div className="rounded-[10px] border border-line bg-surface-2 p-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {recoveryCodes.map((code) => (
                <code className="mono text-[12px] tracking-[0.06em]" key={code}>
                  {code}
                </code>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <CopyButton label="Copy all codes" value={recoveryCodes.join("\n")} />
            <span className="mono text-[9.5px] uppercase tracking-[0.1em] text-warning">
              Shown once
            </span>
          </div>
          <div className="flex justify-end border-t border-line pt-4">
            <Button
              onClick={() => {
                setDialog({ type: "none" });
                setRecoveryCodes([]);
              }}
            >
              I have stored these codes
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
