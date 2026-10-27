"use client";

import { CheckCircle2, Loader2, MailCheck, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { apiFetch, errorMessage } from "@/lib/client-api";

export function VerifyEmailClient({ token }: { token: string | null }) {
  const [state, setState] = useState<"idle" | "verifying" | "done" | "error">(
    token ? "verifying" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    async function verify() {
      try {
        await apiFetch<{ message: string }>("/api/auth/verify-email", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        setState("done");
      } catch (caught) {
        setError(errorMessage(caught));
        setState("error");
      }
    }
    void verify();
  }, [token]);

  if (state === "verifying") {
    return (
      <div className="py-10 text-center">
        <Loader2 className="mx-auto size-6 animate-spin text-accent" />
        <p className="mt-4 text-[13px] text-muted">Verifying your email address…</p>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div>
        <div className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface-2">
          <CheckCircle2 className="size-5 text-positive" />
        </div>
        <h1 className="display mt-5 text-[32px]">Email verified</h1>
        <p className="mt-3 text-[13.5px] leading-6 text-muted">
          Your account is active. Pair an Android device, or review the security
          settings before you do.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            className="inline-flex h-10 items-center rounded-[9px] bg-accent px-4 text-sm font-medium text-accent-ink"
            href="/app"
          >
            Open dashboard
          </Link>
          <Link
            className="inline-flex h-10 items-center rounded-[9px] border border-line-strong bg-surface px-4 text-sm font-medium text-ink"
            href="/app/settings/security"
          >
            Security settings
          </Link>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div>
        <div className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface-2">
          <ShieldAlert className="size-5 text-warning" />
        </div>
        <h1 className="display mt-5 text-[32px]">Link could not be used</h1>
        <p className="mt-3 text-[13.5px] leading-6 text-muted">{error}</p>
        <p className="mt-2 text-[12px] leading-5 text-faint">
          Verification links expire after 24 hours and only work once. Request a
          new one below.
        </p>
        <ResendForm />
      </div>
    );
  }

  return (
    <div>
      <div className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface-2">
        <MailCheck className="size-5 text-accent" />
      </div>
      <h1 className="display mt-5 text-[32px]">Verify your email</h1>
      <p className="mt-3 text-[13.5px] leading-6 text-muted">
        Open the verification link we sent. If it expired, enter the address
        again and we will send a new one.
      </p>
      <ResendForm />
    </div>
  );
}

function ResendForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const result = await apiFetch<{ message: string }>(
        "/api/auth/resend-verification",
        { method: "POST", body: JSON.stringify({ email }) },
      );
      setMessage(result.message);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="mt-6 space-y-3" onSubmit={submit}>
      {error ? <FormMessage>{error}</FormMessage> : null}
      {message ? <FormMessage tone="success">{message}</FormMessage> : null}
      <Field htmlFor="email" label="Email address">
        <Input
          autoComplete="email"
          id="email"
          inputMode="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={email}
        />
      </Field>
      <Button loading={loading} size="md" type="submit" variant="secondary">
        Send a new link
      </Button>
      <p className="text-[11.5px] text-muted">
        Verified already?{" "}
        <Link className="underline decoration-line-strong underline-offset-2 hover:text-ink" href="/login">
          Sign in
        </Link>
      </p>
    </form>
  );
}
