"use client";

import { CheckCircle2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { apiFetch, errorMessage } from "@/lib/client-api";

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!token) {
      setError("This reset link is incomplete. Request a new one.");
      return;
    }
    if (password !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch<{ message: string }>("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div>
        <div className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface-2">
          <CheckCircle2 className="size-5 text-positive" />
        </div>
        <h1 className="display mt-5 text-[32px]">Password updated</h1>
        <p className="mt-3 text-[13.5px] leading-6 text-muted">
          Other sessions were revoked. Sign in with the new password to continue.
        </p>
        <Link
          className="mt-6 inline-flex h-10 items-center rounded-[9px] bg-accent px-4 text-sm font-medium text-accent-ink"
          href="/login"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (!token) {
    return (
      <div>
        <div className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface-2">
          <ShieldAlert className="size-5 text-warning" />
        </div>
        <h1 className="display mt-5 text-[32px]">Link incomplete</h1>
        <p className="mt-3 text-[13.5px] leading-6 text-muted">
          This page needs the token from your reset email. Request a fresh link
          to continue.
        </p>
        <Link
          className="mt-6 inline-flex h-10 items-center rounded-[9px] bg-accent px-4 text-sm font-medium text-accent-ink"
          href="/forgot-password"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div>
      <p className="eyebrow">Account recovery</p>
      <h1 className="display mt-3 text-[34px]">Choose a new password</h1>
      <p className="mt-2 text-[13px] leading-5 text-muted">
        Use at least 12 characters. All active sessions will be revoked once the
        password changes.
      </p>

      <form className="mt-7 space-y-4" onSubmit={submit}>
        {error ? <FormMessage>{error}</FormMessage> : null}
        <Field htmlFor="password" label="New password">
          <PasswordInput
            autoComplete="new-password"
            id="password"
            minLength={12}
            name="password"
            onChange={setPassword}
            value={password}
          />
        </Field>
        <Field htmlFor="confirm" label="Confirm new password">
          <PasswordInput
            autoComplete="new-password"
            id="confirm"
            name="confirm"
            onChange={setConfirm}
            value={confirm}
          />
        </Field>
        <Button className="w-full" loading={loading} size="lg" type="submit">
          Update password
        </Button>
      </form>
    </div>
  );
}
