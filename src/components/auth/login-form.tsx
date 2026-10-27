"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { apiFetch, errorMessage } from "@/lib/client-api";

type LoginResponse = {
  mfaRequired: boolean;
  methods?: string[];
  email?: string;
  redirect?: string;
};

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await apiFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      if (result.mfaRequired) {
        sessionStorage.setItem(
          "beacon_mfa_methods",
          JSON.stringify(result.methods ?? []),
        );
        if (result.email) {
          sessionStorage.setItem("beacon_mfa_email", result.email);
        }
        router.push("/mfa");
        return;
      }

      const next = searchParams.get("next");
      let destination = result.redirect ?? "/app";
      if (next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")) {
        try {
          if (new URL(next, window.location.origin).origin === window.location.origin) {
            destination = next;
          }
        } catch {
          // Fall back to the server-provided destination.
        }
      }
      router.replace(destination);
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p className="eyebrow">Welcome back</p>
      <h1 className="display mt-3 text-[34px]">Sign in to Beacon</h1>
      <p className="mt-2 text-[13px] leading-5 text-muted">
        Use the email address on your account. Sessions are device-specific and
        can be revoked from Security.
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

        <Field
          htmlFor="password"
          label="Password"
          hint={
            <span className="flex justify-between">
              <span>Case-sensitive.</span>
              <Link
                className="font-medium text-muted underline decoration-line-strong underline-offset-2 hover:text-ink"
                href="/forgot-password"
              >
                Forgot password?
              </Link>
            </span>
          }
        >
          <PasswordInput
            autoComplete="current-password"
            id="password"
            name="password"
            onChange={setPassword}
            value={password}
          />
        </Field>

        <Button className="w-full" loading={loading} size="lg" type="submit">
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-[12.5px] text-muted">
        No account?{" "}
        <Link
          className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-accent"
          href="/signup"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
