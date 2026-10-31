"use client";

import {
  CheckCircle2,
  Clock3,
  KeyRound,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { apiFetch, errorMessage } from "@/lib/client-api";

type ApproveResponse = {
  redirectUrl: string;
  expiresAt: string;
  deviceName: string;
};

export function LinkDevicePanel({
  deviceId,
  deviceName,
  challenge,
  state,
}: {
  deviceId: string;
  deviceName: string;
  challenge: string;
  state: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!redirecting) return;
    const timer = window.setTimeout(() => setRedirecting(false), 4000);
    return () => window.clearTimeout(timer);
  }, [redirecting]);

  async function approve() {
    setError(null);
    setLoading(true);
    try {
      const result = await apiFetch<ApproveResponse>("/api/mobile/link/approve", {
        method: "POST",
        body: JSON.stringify({ deviceId, challenge, state }),
      });

      // Hand the single-use code back to the app through its custom scheme. The
      // code is useless without the PKCE verifier that never left the phone.
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
          <h2 className="text-[12.5px] font-semibold">Approve this phone</h2>
        </div>

        <div className="p-6 sm:p-8">
          {redirecting ? (
            <div className="py-6 text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-xl border border-positive/30 bg-positive/10">
                <CheckCircle2 className="size-5 text-positive" />
              </span>
              <h3 className="mt-5 text-[15px] font-semibold">Returning to Beacon</h3>
              <p className="mx-auto mt-2 max-w-[42ch] text-[12.5px] leading-5 text-muted">
                The link was approved. If the app did not come back to the front,
                open Beacon manually and choose &ldquo;Linked phones&rdquo; to
                finish.
              </p>
            </div>
          ) : (
            <>
              <p className="eyebrow">Account access</p>
              <h3 className="mt-2 text-[22px] font-semibold tracking-[-0.02em]">
                {deviceName}
              </h3>
              <p className="mt-2 max-w-[56ch] text-[12.5px] leading-5 text-muted">
                This phone will be linked to your Beacon account. It does not
                receive your password, your authenticator secret, or a browser
                session.
              </p>

              <ul className="mt-6 divide-y divide-line border-y border-line">
                {[
                  {
                    icon: Smartphone,
                    title: "See where your devices are",
                    copy: "Name, battery, last seen and the most recent location of every device on this account.",
                  },
                  {
                    icon: KeyRound,
                    title: "Recover a lost authenticator",
                    copy: "After seven days, with biometrics and your account password, this phone can reset two-factor authentication. That signs out every browser.",
                  },
                  {
                    icon: ShieldCheck,
                    title: "Nothing else",
                    copy: "It cannot send commands, change tracking settings, read location history, or manage the account.",
                  },
                ].map((item) => (
                  <li className="flex gap-3.5 py-4" key={item.title}>
                    <item.icon className="mt-0.5 size-3.5 shrink-0 text-faint" />
                    <div>
                      <p className="text-[12px] font-medium">{item.title}</p>
                      <p className="mt-1 text-[11px] leading-[1.6] text-muted">
                        {item.copy}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              {error ? (
                <div className="mt-5">
                  <FormMessage>{error}</FormMessage>
                </div>
              ) : null}

              <div className="mt-6 flex flex-wrap items-center gap-2">
                <Button loading={loading} onClick={approve} size="lg">
                  Approve this phone
                </Button>
                <Button
                  disabled={loading}
                  onClick={() => {
                    router.push("/app/settings/security");
                  }}
                  size="lg"
                  variant="ghost"
                >
                  Cancel
                </Button>
              </div>

              <p className="mt-4 flex items-start gap-2 text-[10.5px] leading-4 text-faint">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                Only approve if you just started this from the Beacon app on that
                exact phone. The approval code is single-use and expires in five
                minutes.
              </p>
            </>
          )}
        </div>
      </section>

      <section className="card">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <Clock3 className="size-3.5 text-accent" />
          <h2 className="text-[12.5px] font-semibold">What happens next</h2>
        </div>
        <ol className="divide-y divide-line">
          {[
            {
              title: "The browser hands back a code",
              copy: "Approval creates a one-time code and returns it to the app through a beacon:// link.",
            },
            {
              title: "The phone proves it started the request",
              copy: "The app exchanges the code with a secret verifier that never entered the browser. An intercepted code cannot be used.",
            },
            {
              title: "You can revoke it at any time",
              copy: "Linked phones appear under Security settings with a last-used time and a Revoke button.",
            },
          ].map((step, index) => (
            <li className="flex gap-3.5 px-5 py-4" key={step.title}>
              <span className="mono mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-[9.5px] text-muted">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="text-[12px] font-medium">{step.title}</p>
                <p className="mt-1 text-[11px] leading-[1.6] text-muted">
                  {step.copy}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex items-start gap-2.5 border-t border-line bg-surface-2/40 px-5 py-3.5">
          <Loader2 className="mt-0.5 size-3.5 shrink-0 text-faint" />
          <p className="text-[10.5px] leading-4 text-muted">
            Keep this tab open until the app returns. If it does not, the request
            expires without linking anything.
          </p>
        </div>
      </section>
    </div>
  );
}
