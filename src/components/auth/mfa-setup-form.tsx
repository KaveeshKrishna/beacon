"use client";

import {
  CheckCircle2,
  KeyRound,
  Loader2,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { apiFetch, errorMessage } from "@/lib/client-api";

type TotpSetup = {
  secret: string;
  uri: string;
  qrDataUrl: string;
};

export function MfaSetupForm({ email }: { email: string }) {
  const router = useRouter();
  const started = useRef(false);

  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [starting, setStarting] = useState(true);
  const [startError, setStartError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  async function begin() {
    setStartError(null);
    setStarting(true);
    try {
      const data = await apiFetch<TotpSetup>("/api/auth/mfa/totp/setup", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSetup(data);
    } catch (caught) {
      setStartError(errorMessage(caught));
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void begin();
    // `begin` only touches setters and is intentionally run once.
  }, []);

  async function enable(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setEnabling(true);
    try {
      const data = await apiFetch<{ recoveryCodes: string[] }>(
        "/api/auth/mfa/totp/enable",
        {
          method: "POST",
          body: JSON.stringify({ code: code.replace(/\s/g, "") }),
        },
      );
      setRecoveryCodes(data.recoveryCodes);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setEnabling(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await apiFetch("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({}),
      });
    } catch {
      // The cookie is cleared client-side by the redirect response in the
      // normal case; fall through to the login page regardless.
    }
    window.location.assign("/login");
  }

  if (recoveryCodes) {
    return (
      <div>
        <div className="flex size-11 items-center justify-center rounded-xl border border-positive/30 bg-positive/10">
          <CheckCircle2 className="size-5 text-positive" />
        </div>
        <p className="eyebrow mt-5">Recovery codes</p>
        <h1 className="display mt-2 text-[32px]">Save these now</h1>
        <p className="mt-2 text-[13px] leading-5 text-muted">
          Each code works once and replaces your authenticator at sign-in. They
          are shown only this one time.
        </p>

        <div className="mt-5 rounded-[10px] border border-line bg-surface-2 p-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {recoveryCodes.map((recoveryCode) => (
              <code className="mono text-[12px] tracking-[0.06em]" key={recoveryCode}>
                {recoveryCode}
              </code>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <CopyButton label="Copy all codes" value={recoveryCodes.join("\n")} />
          <span className="mono text-[9.5px] uppercase tracking-[0.1em] text-warning">
            Shown once
          </span>
        </div>

        <Button
          className="mt-6 w-full"
          onClick={() => {
            router.replace("/app");
            router.refresh();
          }}
          size="lg"
        >
          I have stored these codes
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface-2">
        <ShieldCheck className="size-5 text-accent" />
      </div>
      <p className="eyebrow mt-5">Two-factor recovery</p>
      <h1 className="display mt-2 text-[32px]">Replace your authenticator</h1>
      <p className="mt-2 text-[13px] leading-5 text-muted">
        Two-factor authentication was reset from a linked phone. Your password
        has not changed. Enroll a new authenticator to reopen the dashboard for{" "}
        {email}.
      </p>

      {starting ? (
        <div className="mt-8 flex items-center gap-2 text-[12px] text-muted">
          <Loader2 className="size-4 animate-spin" />
          Preparing a new secret
        </div>
      ) : startError ? (
        <div className="mt-6 space-y-4">
          <FormMessage>{startError}</FormMessage>
          <Button onClick={begin} size="md" variant="secondary">
            Try again
          </Button>
        </div>
      ) : setup ? (
        <form className="mt-6 space-y-4" onSubmit={enable}>
          {error ? <FormMessage>{error}</FormMessage> : null}

          <div className="flex flex-col items-center gap-3 rounded-[10px] border border-line bg-white p-4">
            <Image
              alt="New authenticator setup QR code"
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
            htmlFor="new-authenticator-code"
            label="Verification code"
          >
            <Input
              autoComplete="one-time-code"
              autoFocus
              id="new-authenticator-code"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setCode(event.target.value)}
              pattern="[0-9]{6}"
              placeholder="000000"
              required
              value={code}
            />
          </Field>

          <Button
            className="w-full"
            icon={<KeyRound className="size-3.5" />}
            loading={enabling}
            size="lg"
            type="submit"
          >
            Verify and restore access
          </Button>
        </form>
      ) : null}

      <div className="mt-6 flex items-center justify-between border-t border-line pt-4 text-[12px]">
        <button
          className="inline-flex items-center gap-1.5 text-muted transition-colors hover:text-ink disabled:opacity-50"
          disabled={signingOut}
          onClick={() => void signOut()}
          type="button"
        >
          {signingOut ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <LogOut className="size-3.5" />
          )}
          Sign out and finish later
        </button>
        <span className="text-[10px] text-faint">
          Other sessions stay revoked
        </span>
      </div>
    </div>
  );
}
