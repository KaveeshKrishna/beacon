"use client";

import { ArrowLeft, KeyRound, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { cn } from "@/lib/cn";

type Method = "totp" | "email" | "recovery";

const labels: Record<Method, string> = {
  totp: "Authenticator",
  email: "Email code",
  recovery: "Recovery code",
};

export function MfaForm() {
  const router = useRouter();
  const [methods, setMethods] = useState<Method[]>([]);
  const [method, setMethod] = useState<Method>("totp");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let available: Method[] = ["totp", "email", "recovery"];
    try {
      const raw = sessionStorage.getItem("beacon_mfa_methods");
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        const filtered = parsed.filter((value): value is Method =>
          ["totp", "email", "recovery"].includes(value),
        );
        if (filtered.length > 0) available = filtered;
      }
      setMaskedEmail(sessionStorage.getItem("beacon_mfa_email") ?? "");
    } catch {
      // Keep the full fallback list.
    }
    setMethods(available);
    setMethod(available[0] ?? "totp");
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const endpoint =
        method === "totp"
          ? "/api/auth/mfa/totp"
          : method === "email"
            ? "/api/auth/mfa/email/verify"
            : "/api/auth/mfa/recovery";
      const result = await apiFetch<{ redirect: string }>(endpoint, {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      sessionStorage.removeItem("beacon_mfa_methods");
      sessionStorage.removeItem("beacon_mfa_email");
      router.replace(result.redirect ?? "/app");
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function sendEmailCode() {
    setError(null);
    setNotice(null);
    setSending(true);
    try {
      const result = await apiFetch<{ email: string; expiresInMinutes: number }>(
        "/api/auth/mfa/email/send",
        { method: "POST", body: JSON.stringify({}) },
      );
      setMaskedEmail(result.email);
      setNotice(`Code sent to ${result.email}. It expires in ${result.expiresInMinutes} minutes.`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSending(false);
    }
  }

  const active = methods.length > 0 ? method : "totp";

  return (
    <div>
      <div className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface-2">
        <ShieldCheck className="size-5 text-accent" />
      </div>
      <p className="eyebrow mt-5">Second factor</p>
      <h1 className="display mt-2 text-[34px]">Confirm it is you</h1>
      <p className="mt-2 text-[13px] leading-5 text-muted">
        Your password was accepted. Complete one more check to create the
        session.
      </p>

      {methods.length > 1 ? (
        <div className="mt-6 grid grid-cols-3 gap-1 rounded-lg border border-line bg-surface-2 p-1">
          {methods.map((item) => (
            <button
              className={cn(
                "flex flex-col items-center gap-1 rounded-[6px] px-1 py-2 text-[10.5px] font-medium transition-colors",
                active === item
                  ? "bg-surface text-ink shadow-sm"
                  : "text-muted hover:text-ink",
              )}
              key={item}
              onClick={() => {
                setMethod(item);
                setCode("");
                setError(null);
                setNotice(null);
              }}
              type="button"
            >
              {item === "totp" ? (
                <KeyRound className="size-3.5" />
              ) : item === "email" ? (
                <Mail className="size-3.5" />
              ) : (
                <ShieldCheck className="size-3.5" />
              )}
              {labels[item]}
            </button>
          ))}
        </div>
      ) : null}

      <form className="mt-6 space-y-4" onSubmit={submit}>
        {error ? <FormMessage>{error}</FormMessage> : null}
        {notice ? <FormMessage tone="success">{notice}</FormMessage> : null}

        {active === "email" ? (
          <div className="rounded-lg border border-line bg-surface-2 px-3.5 py-3">
            <p className="text-[12px] leading-5 text-muted">
              {maskedEmail
                ? `A code can be sent to ${maskedEmail}.`
                : "Send a one-time code to the address on this account."}
            </p>
            <Button
              className="mt-2.5"
              loading={sending}
              onClick={sendEmailCode}
              size="sm"
              type="button"
              variant="secondary"
            >
              Send email code
            </Button>
          </div>
        ) : null}

        <Field
          htmlFor="code"
          label={
            active === "recovery"
              ? "Recovery code"
              : active === "email"
                ? "Email code"
                : "Authenticator code"
          }
          hint={
            active === "recovery"
              ? "Format: abcde-fghij. Each code works once."
              : "Six digits. Codes rotate every 30 seconds."
          }
        >
          <Input
            autoComplete="one-time-code"
            className="mono text-center text-[20px] tracking-[0.32em]"
            id="code"
            inputMode={active === "recovery" ? "text" : "numeric"}
            maxLength={active === "recovery" ? 20 : 6}
            name="code"
            onChange={(event) => setCode(event.target.value)}
            placeholder={active === "recovery" ? "abcde-fghij" : "000000"}
            required
            value={code}
          />
        </Field>

        <Button className="w-full" loading={loading} size="lg" type="submit">
          Verify and continue
        </Button>
      </form>

      <div className="mt-6 flex items-center justify-between text-[12px]">
        <Link
          className="inline-flex items-center gap-1.5 text-muted hover:text-ink"
          href="/login"
        >
          <ArrowLeft className="size-3.5" />
          Start over
        </Link>
        <Link
          className="text-muted underline decoration-line-strong underline-offset-2 hover:text-ink"
          href="/forgot-password"
        >
          Forgot password?
        </Link>
      </div>
    </div>
  );
}
