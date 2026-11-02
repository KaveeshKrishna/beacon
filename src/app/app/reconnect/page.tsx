import type { Metadata } from "next";
import Link from "next/link";

import { ReconnectPanel } from "@/components/app/reconnect-panel";
import { PageHeader } from "@/components/app/page-header";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { listReconnectCandidates } from "@/lib/data/devices";
import { isPkceChallenge } from "@/lib/pkce";

export const metadata: Metadata = {
  title: "Reconnect a phone",
  robots: { index: false, follow: false },
};

const STATE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const INSTALL_PATTERN = /^[a-f0-9]{64}$/;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function claimed(value: string | null, limit: number): string {
  return (value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, limit);
}

function reconnectPath(
  params: Record<string, string | string[] | undefined>,
): string {
  const query = new URLSearchParams();
  for (const key of [
    "state",
    "challenge",
    "install",
    "name",
    "manufacturer",
    "model",
  ]) {
    const value = single(params[key]);
    if (value) query.set(key, value);
  }
  return `/app/reconnect?${query.toString()}`;
}

export default async function ReconnectPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  // If the owner is signed out, keep the phone's request intact through login.
  const session = await requireVerifiedUser(reconnectPath(params));

  const state = single(params.state);
  const challenge = single(params.challenge);
  const installHash = single(params.install)?.toLowerCase() ?? null;
  const claimedName = claimed(single(params.name), 60);
  const claimedManufacturer = claimed(single(params.manufacturer), 60);
  const claimedModel = claimed(single(params.model), 60);

  const valid =
    Boolean(state && STATE_PATTERN.test(state)) &&
    Boolean(challenge && isPkceChallenge(challenge)) &&
    Boolean(installHash && INSTALL_PATTERN.test(installHash));

  const candidates =
    valid && installHash
      ? await listReconnectCandidates(session.user.id, installHash)
      : [];

  return (
    <div className="space-y-5">
      <PageHeader
        description="A phone that was previously paired is asking to reconnect. Confirm which linked device it is so its history and geofences are kept."
        eyebrow="Security"
        title="Reconnect this phone"
      />

      {!valid || !state || !challenge || !installHash ? (
        <section className="card p-6 sm:p-8">
          <h2 className="text-[15px] font-semibold">This reconnect request is not valid</h2>
          <p className="mt-2 max-w-[60ch] text-[12.5px] leading-5 text-muted">
            The link may have been copied incorrectly or it may be incomplete.
            Open Beacon on the phone and choose &ldquo;Reconnect with Beacon
            account&rdquo; to start again.
          </p>
          <p className="mt-4 text-[11px] text-faint">
            No account changes were made. You can close this tab.
          </p>
          <Link
            className="mt-6 inline-flex text-[12px] font-medium text-accent hover:underline"
            href="/app"
          >
            Back to the dashboard
          </Link>
        </section>
      ) : (
        <ReconnectPanel
          candidates={candidates}
          challenge={challenge}
          claimedManufacturer={claimedManufacturer}
          claimedModel={claimedModel}
          claimedName={claimedName}
          installHash={installHash}
          state={state}
        />
      )}
    </div>
  );
}
