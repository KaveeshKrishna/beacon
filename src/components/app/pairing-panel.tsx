"use client";

import {
  CheckCircle2,
  Clock3,
  KeyRound,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { FormMessage } from "@/components/ui/field";
import { apiFetch, errorMessage } from "@/lib/client-api";

type PairingCode = {
  code: string;
  expiresAt: string;
  serverUrl: string;
  deepLink: string;
  qrDataUrl: string;
};

export function PairingPanel() {
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!pairing) return;
    function tick() {
      const seconds = Math.max(
        0,
        Math.floor((new Date(pairing!.expiresAt).getTime() - Date.now()) / 1000),
      );
      setRemaining(seconds);
    }
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [pairing]);

  async function generate() {
    setError(null);
    setLoading(true);
    try {
      const result = await apiFetch<PairingCode>("/api/devices/pairing-code", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setPairing(result);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  const expired = pairing !== null && remaining <= 0;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2">
            <KeyRound className="size-3.5 text-accent" />
            <h2 className="text-[12.5px] font-semibold">Pairing code</h2>
          </div>
          {pairing ? (
            <span className="mono flex items-center gap-1.5 text-[10px] text-faint">
              <Clock3 className="size-3" />
              {expired ? "Expired" : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`}
            </span>
          ) : null}
        </div>

        <div className="p-6 sm:p-8">
          {error ? <FormMessage>{error}</FormMessage> : null}

          {pairing ? (
            <div className={expired ? "opacity-50" : undefined}>
              <p className="eyebrow">Enter on the Android app</p>
              <p className="mono mt-3 select-all text-[clamp(34px,5vw,52px)] font-medium tracking-[0.04em]">
                {pairing.code}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <CopyButton label="Copy code" value={pairing.code} />
                <span className="mono text-[10px] text-faint">
                  {pairing.serverUrl}
                </span>
              </div>

              <div className="mt-7 grid gap-6 border-t border-line pt-6 sm:grid-cols-[190px_1fr] sm:items-center">
                <div className="rounded-xl border border-line bg-white p-3">
                  {/* QR is generated server-side as a data URL. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt="QR code containing the pairing link"
                    className="h-auto w-full"
                    height={260}
                    src={pairing.qrDataUrl}
                    width={260}
                  />
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-[12.5px] font-semibold">
                    <QrCode className="size-3.5 text-muted" />
                    Scan instead of typing
                  </p>
                  <p className="mt-1.5 text-[11.5px] leading-5 text-muted">
                    The QR encodes a local deep link containing the server URL
                    and this single-use code. It does not contain your password
                    or account token.
                  </p>
                  <p className="mt-3 text-[10.5px] leading-4 text-faint">
                    {expired
                      ? "This code has expired. Generate a new one."
                      : "The code can be used once and expires after 10 minutes."}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <Button
                  icon={<RefreshCw className="size-3.5" />}
                  loading={loading}
                  onClick={generate}
                  size="md"
                  variant="secondary"
                >
                  {expired ? "Generate a new code" : "Regenerate"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-xl border border-line bg-surface-2">
                <QrCode className="size-5 text-muted" />
              </span>
              <h3 className="mt-5 text-[15px] font-semibold">
                Ready when the phone is
              </h3>
              <p className="mx-auto mt-2 max-w-[36ch] text-[12.5px] leading-5 text-muted">
                Generate a single-use code. Open Beacon on Android, choose
                &ldquo;Pair with a code&rdquo;, and enter it within ten minutes.
              </p>
              <Button
                className="mt-6"
                loading={loading}
                onClick={generate}
                size="lg"
              >
                Generate pairing code
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-start gap-2.5 border-t border-line bg-surface-2/40 px-5 py-3.5">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-positive" />
          <p className="text-[10.5px] leading-4 text-muted">
            Pairing exchanges this short code for a per-device bearer token. The
            token is stored as an HMAC hash and can be revoked independently of
            every other device.
          </p>
        </div>
      </section>

      <section className="card">
        <div className="border-b border-line px-5 py-3.5">
          <h2 className="text-[12.5px] font-semibold">On the phone</h2>
        </div>
        <ol className="divide-y divide-line">
          {[
            {
              icon: Smartphone,
              title: "Install the app",
              copy: "Android 8.0 or newer. Sideload the signed APK; Play Services are not required.",
            },
            {
              icon: KeyRound,
              title: "Enter the code",
              copy: "The app verifies the server, claims the code, and stores its own token in encrypted storage.",
            },
            {
              icon: CheckCircle2,
              title: "Grant permissions",
              copy: "Background location, notifications and battery optimisation exemption. Each is explained in the app.",
            },
            {
              icon: ShieldCheck,
              title: "Confirm the first fix",
              copy: "Return here. The device appears in the sidebar and the map centres on its first reported point.",
            },
          ].map((step, index) => (
            <li className="flex gap-3.5 px-5 py-4" key={step.title}>
              <span className="mono mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-[9.5px] text-muted">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="flex items-center gap-1.5 text-[12px] font-medium">
                  <step.icon className="size-3 text-faint" />
                  {step.title}
                </p>
                <p className="mt-1 text-[11px] leading-[1.6] text-muted">
                  {step.copy}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <div className="border-t border-line px-5 py-4">
          <p className="text-[10.5px] leading-4 text-faint">
            Cannot scan the QR? Both devices must be able to reach the same
            server URL. If the dashboard runs on localhost, use manual entry and
            a tunnel instead.
          </p>
        </div>
      </section>
    </div>
  );
}
