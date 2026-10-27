"use client";

import { Check, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { apiFetch, errorMessage } from "@/lib/client-api";

const requirements = [
  { label: "At least 12 characters", test: (value: string) => value.length >= 12 },
  { label: "One uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
  { label: "One lowercase letter", test: (value: string) => /[a-z]/.test(value) },
  { label: "One number", test: (value: string) => /\d/.test(value) },
];

export function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("The passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const result = await apiFetch<{ message: string }>("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      setSent(result.message);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div>
        <div className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface-2">
          <MailCheck className="size-5 text-accent" />
        </div>
        <h1 className="display mt-5 text-[32px]">Check your inbox</h1>
        <p className="mt-3 text-[13.5px] leading-6 text-muted">{sent}</p>
        <div className="mt-6 rounded-lg border border-line bg-surface-2 px-4 py-3.5">
          <p className="text-[12px] font-medium">Before you sign in</p>
          <ul className="mt-2 space-y-1.5 text-[12px] leading-5 text-muted">
            <li>Open the verification link within 24 hours.</li>
            <li>Check spam before requesting another message.</li>
            <li>You need a verified address before pairing a device.</li>
          </ul>
        </div>
        <div className="mt-6 flex items-center gap-3">
          <Link className="text-[12.5px] font-medium underline decoration-line-strong underline-offset-4 hover:decoration-accent" href="/login">
            Return to sign in
          </Link>
          <span className="text-faint">·</span>
          <Link className="text-[12.5px] text-muted underline decoration-line-strong underline-offset-4 hover:text-ink" href="/verify-email">
            Resend verification
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="eyebrow">New account</p>
      <h1 className="display mt-3 text-[34px]">Create your Beacon</h1>
      <p className="mt-2 text-[13px] leading-5 text-muted">
        One account holds your devices, geofences and history. You can export or
        delete all of it at any time.
      </p>

      <form className="mt-7 space-y-4" onSubmit={submit}>
        {error ? <FormMessage>{error}</FormMessage> : null}

        <Field htmlFor="name" label="Name">
          <Input
            autoComplete="name"
            id="name"
            maxLength={80}
            name="name"
            onChange={(event) => setName(event.target.value)}
            placeholder="Alex Rivera"
            required
            value={name}
          />
        </Field>

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

        <Field htmlFor="password" label="Password">
          <PasswordInput
            autoComplete="new-password"
            id="password"
            minLength={12}
            name="password"
            onChange={setPassword}
            value={password}
          />
        </Field>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {requirements.map((requirement) => {
            const met = requirement.test(password);
            return (
              <span
                className={
                  met
                    ? "flex items-center gap-1.5 text-[11px] text-positive"
                    : "flex items-center gap-1.5 text-[11px] text-faint"
                }
                key={requirement.label}
              >
                <Check className="size-3" />
                {requirement.label}
              </span>
            );
          })}
        </div>

        <Field htmlFor="confirm" label="Confirm password">
          <PasswordInput
            autoComplete="new-password"
            id="confirm"
            name="confirm"
            onChange={setConfirm}
            value={confirm}
          />
        </Field>

        <Button className="w-full" loading={loading} size="lg" type="submit">
          Create account
        </Button>
        <p className="text-[11px] leading-5 text-faint">
          By creating an account you agree to the{" "}
          <Link className="underline decoration-line-strong underline-offset-2 hover:text-muted" href="/terms">
            terms
          </Link>{" "}
          and{" "}
          <Link className="underline decoration-line-strong underline-offset-2 hover:text-muted" href="/privacy">
            privacy notice
          </Link>
          .
        </p>
      </form>

      <p className="mt-5 text-center text-[12.5px] text-muted">
        Already have an account?{" "}
        <Link
          className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-accent"
          href="/login"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
