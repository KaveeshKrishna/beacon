"use client";

import {
  CheckCircle2,
  Clock3,
  KeyRound,
  Loader2,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { formatRelative } from "@/lib/format";

type Candidate = {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  androidVersion: string;
  appVersion: string;
  presence: "online" | "stale" | "offline";
  batteryLevel: number | null;
  isCharging: boolean | null;
  lastSeenAt: string | null;
  lastLocationAt: string | null;
  matched: boolean;
};

type ApproveResponse = {
  redirectUrl: string;
  expiresAt: string;
  deviceName: string;
};

function presenceLabel(presence: Candidate["presence"]): string {
  if (presence === "online") return "Online";
  if (presence === "stale") return "Seen recently";
  return "Offline";
}

export function ReconnectPanel({
  candidates,
  claimedName,
  claimedManufacturer,
  claimedModel,
  installHash,
  challenge,
  state,
}: {
  candidates: Candidate[];
  claimedName: string;
  claimedManufacturer: string;
  claimedModel: string;
  installHash: string;
  challenge: string;
  state: string;
}) {
  const matched = candidates.find((candidate) => candidate.matched) ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(
    matched?.id ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!redirecting) return;
    const timer = window.setTimeout(() => setRedirecting(false), 4000);
    return () => window.clearTimeout(timer);
  }, [redirecting]);

  const claimedLabel =
    [claimedManufacturer, claimedModel].filter(Boolean).join(" ") ||
    claimedName ||
    "an Android phone";

  async function approve() {
    if (!selectedId) {
      setError("Choose the device this phone replaces.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await apiFetch<ApproveResponse>(
        "/api/device/reconnect/approve",
        {
          method: "POST",
          body: JSON.stringify({
            deviceId: selectedId,
            challenge,
            state,
            installHash,
          }),
        },
      );

      // The browser hands a single-use code back through the app's custom
      // scheme. Without the PKCE verifier, which never leaves the phone, the
      // code cannot be redeemed by another app.
      setRedirecting(true);
      window.location.assign(result.redirectUrl);
    } catch (caught) {
      setError(errorMessage(caught));
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
      <section className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <Smartphone className="size-3.5 text-accent" />
          <h2 className="text-[12.5px] font-semibold">Confirm the device</h2>
        </div>

        <div className="p-6 sm:p-8">
          {redirecting ? (
            <div className="py-6 text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-xl border border-positive/30 bg-positive/10">
                <CheckCircle2 className="size-5 text-positive" />
              </span>
              <h3 className="mt-5 text-[15px] font-semibold">Returning to Beacon</h3>
              <p className="mx-auto mt-2 max-w-[42ch] text-[12.5px] leading-5 text-muted">
                Reconnect was approved. If the app did not come back to the front,
                open Beacon manually and choose &ldquo;Reconnect with Beacon
                account&rdquo; to finish.
              </p>
            </div>
          ) : (
            <>
              <p className="eyebrow">
                {matched ? "Automatic match" : "Owner confirmation"}
              </p>
              <h3 className="mt-2 text-[22px] font-semibold tracking-[-0.02em]">
                {matched ? matched.name : "Which device is this?"}
              </h3>
              <p className="mt-2 max-w-[56ch] text-[12.5px] leading-5 text-muted">
                {matched
                  ? "This phone reports the same install fingerprint as the device below. Reconnecting keeps its location history and geofences."
                  : `The phone describes itself as ${claimedLabel}. We could not match it to an install automatically, so choose the linked device it replaces.`}
              </p>

              {candidates.length === 0 ? (
                <div className="mt-6 rounded-xl border border-line bg-surface-2/50 p-5">
                  <p className="text-[12.5px] font-medium">
                    No active devices on this account
                  </p>
                  <p className="mt-1.5 text-[11.5px] leading-5 text-muted">
                    This account has no device that can be reconnected. Pair this
                    phone as a new device instead.
                  </p>
                  <Link
                    className="mt-4 inline-flex text-[12px] font-medium text-accent hover:underline"
                    href="/app/pair"
                  >
                    Pair a new device
                  </Link>
                </div>
              ) : (
                <>
                  <div className="mt-6 space-y-2">
                    {candidates.map((candidate) => {
                      const selected = candidate.id === selectedId;
                      return (
                        <button
                          className={`w-full rounded-xl border p-4 text-left transition ${
                            selected
                              ? "border-accent/60 bg-accent/[0.07]"
                              : "border-line bg-surface-2/30 hover:border-line-strong hover:bg-surface-2/60"
                          }`}
                          key={candidate.id}
                          onClick={() => setSelectedId(candidate.id)}
                          type="button"
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
                                selected
                                  ? "border-accent bg-accent text-background"
                                  : "border-line-strong bg-transparent"
                              }`}
                            >
                              {selected ? (
                                <CheckCircle2 className="size-3" />
                              ) : null}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[12.5px] font-semibold">
                                  {candidate.name}
                                </span>
                                {candidate.matched ? (
                                  <span className="rounded-full border border-positive/30 bg-positive/10 px-2 py-0.5 text-[9.5px] font-medium text-positive">
                                    Matches this phone
                                  </span>
                                ) : null}
                                <span className="mono text-[9.5px] text-faint">
                                  {presenceLabel(candidate.presence)}
                                </span>
                              </div>
                              <p className="mt-1 text-[11px] text-muted">
                                {[candidate.manufacturer, candidate.model]
                                  .filter(Boolean)
                                  .join(" ") || "Android device"}
                                {candidate.androidVersion
                                  ? ` · Android ${candidate.androidVersion}`
                                  : ""}
                              </p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-faint">
                                <span className="inline-flex items-center gap-1">
                                  <Clock3 className="size-3" />
                                  Last seen {formatRelative(candidate.lastSeenAt)}
                                </span>
                                {candidate.lastLocationAt ? (
                                  <span className="inline-flex items-center gap-1">
                                    <MapPin className="size-3" />
                                    Location{" "}
                                    {formatRelative(candidate.lastLocationAt)}
                                  </span>
                                ) : null}
                                {candidate.batteryLevel !== null ? (
                                  <span>
                                    Battery {Math.round(candidate.batteryLevel)}%
                                    {candidate.isCharging ? " · charging" : ""}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {!matched ? (
                    <p className="mt-4 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/[0.07] p-3 text-[10.5px] leading-4 text-muted">
                      <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                      Pick carefully. The selected device&rsquo;s location history
                      and geofences will belong to this phone again. If none of
                      these is the phone you are holding, pair it as new.
                    </p>
                  ) : null}
                </>
              )}

              {error ? (
                <div className="mt-5">
                  <FormMessage>{error}</FormMessage>
                </div>
              ) : null}

              <div className="mt-6 flex flex-wrap items-center gap-2">
                <Button
                  disabled={!selectedId || candidates.length === 0}
                  loading={loading}
                  onClick={approve}
                  size="lg"
                >
                  Reconnect this device
                </Button>
                <Link
                  className="inline-flex h-11 items-center rounded-lg px-4 text-[12px] font-medium text-muted transition hover:bg-surface-2 hover:text-foreground"
                  href="/app/pair"
                >
                  None of these — pair as new
                </Link>
              </div>

              <p className="mt-4 flex items-start gap-2 text-[10.5px] leading-4 text-faint">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                Only approve if you just chose &ldquo;Reconnect with Beacon
                account&rdquo; on that exact phone. The approval code is
                single-use and expires in ten minutes.
              </p>
            </>
          )}
        </div>
      </section>

      <section className="card">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <KeyRound className="size-3.5 text-accent" />
          <h2 className="text-[12.5px] font-semibold">What reconnect restores</h2>
        </div>
        <ol className="divide-y divide-line">
          {[
            {
              icon: Smartphone,
              title: "The same device row",
              copy: "Location history, geofences, commands and the owner's device name stay attached to this phone instead of creating a duplicate.",
            },
            {
              icon: ShieldCheck,
              title: "A fresh device token",
              copy: "The old token stops working immediately. The replacement is sealed in the Android Keystore.",
            },
            {
              icon: Loader2,
              title: "Tracking without waiting",
              copy: "The app resumes its check-in schedule as soon as the exchange succeeds, including background work when Android allows it.",
            },
            {
              icon: KeyRound,
              title: "Linked-phone access",
              copy: "Find My and the seven-day MFA recovery timer are restored for this phone. Your browser password never reaches it.",
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
        <div className="flex items-start gap-2.5 border-t border-line bg-surface-2/40 px-5 py-3.5">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-positive" />
          <p className="text-[10.5px] leading-4 text-muted">
            The fingerprint that identifies this install is a one-way hash. The
            server never receives your Android ID or advertising ID.
          </p>
        </div>
      </section>
    </div>
  );
}
