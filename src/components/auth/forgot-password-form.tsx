"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { apiFetch, errorMessage } from "@/lib/client-api";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await apiFetch<{ message: string }>(
        "/api/auth/forgot-password",
        { method: "POST", body: JSON.stringify({ email }) },
      );
      setMessage(result.message);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  if (message) {
    return (
      <div>
        <div className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface-2">
          <MailCheck className="size-5 text-accent" />
        </div>
        <h1 className="display mt-5 text-[32px]">Check your inbox</h1>
        <p className="mt-3 text-[13.5px] leading-6 text-muted">{message}</p>
        <p className="mt-3 text-[12px] leading-5 text-faint">
          The reset link expires in 60 minutes and can be used once. If it does
          not arrive, check spam or request another.
        </p>
        <Button
          className="mt-6"
          onClick={() => setMessage(null)}
          variant="secondary"
        >
          Use a different address
        </Button>
        <p className="mt-6 text-[12.5px] text-muted">
          <Link
            className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-accent"
            href="/login"
          >
            Return to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="eyebrow">Account recovery</p>
      <h1 className="display mt-3 text-[34px]">Reset your password</h1>
      <p className="mt-2 text-[13px] leading-5 text-muted">
        Enter the email address on the account. If it exists, we will send a
        single-use reset link. The response is the same either way.
      </p>

      <form className="mt-7 space-y-4" onSubmit={submit}>
        {error ? <FormMessage>{error}</FormMessage> : null}
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
        <Button className="w-full" loading={loading} size="lg" type="submit">
          Send reset link
        </Button>
      </form>

      <p className="mt-6 text-center text-[12.5px] text-muted">
        Remembered it?{" "}
        <Link
          className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-accent"
          href="/login"
        >
          Return to sign in
        </Link>
      </p>
    </div>
  );
}
