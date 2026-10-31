import type { Metadata } from "next";
import Link from "next/link";

import { LinkDevicePanel } from "@/components/app/link-device-panel";
import { PageHeader } from "@/components/app/page-header";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { getDeviceForUser } from "@/lib/data/devices";
import { isPkceChallenge } from "@/lib/pkce";

export const metadata: Metadata = {
  title: "Link a phone",
  robots: { index: false, follow: false },
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

export default async function LinkDevicePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireVerifiedUser();
  const params = await searchParams;

  const deviceId = single(params.device);
  const challenge = single(params.challenge);
  const state = single(params.state);

  const valid =
    Boolean(deviceId && UUID_PATTERN.test(deviceId)) &&
    Boolean(challenge && isPkceChallenge(challenge)) &&
    Boolean(state && STATE_PATTERN.test(state));

  const device =
    valid && deviceId ? await getDeviceForUser(session.user.id, deviceId) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        description="A phone is asking to join this account. Approving lets it see where your devices are and, after seven days, reset a lost authenticator."
        eyebrow="Security"
        title="Link a phone"
      />

      {!valid || !device || !challenge || !state || !deviceId ? (
        <section className="card p-6 sm:p-8">
          <h2 className="text-[15px] font-semibold">This link request is not valid</h2>
          <p className="mt-2 max-w-[60ch] text-[12.5px] leading-5 text-muted">
            The link may have been copied incorrectly, or it may name a device
            that is not on this account. Start the link again from Beacon on the
            phone you want to add.
          </p>
          <p className="mt-4 text-[11px] text-faint">
            No account changes were made. You can close this tab.
          </p>
          <Link
            className="mt-6 inline-flex text-[12px] font-medium text-accent hover:underline"
            href="/app/settings/security"
          >
            Back to security settings
          </Link>
        </section>
      ) : (
        <LinkDevicePanel
          challenge={challenge}
          deviceId={deviceId}
          deviceName={device.name}
          state={state}
        />
      )}
    </div>
  );
}
