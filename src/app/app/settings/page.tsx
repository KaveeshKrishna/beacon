import type { Metadata } from "next";

import { ProfileForm } from "@/components/app/settings/profile-form";
import { Badge } from "@/components/ui/badge";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Profile",
  robots: { index: false, follow: false },
};

const fallbackZones = [
  "UTC",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Perth",
  "Pacific/Auckland",
];

function timezoneOptions(current: string): string[] {
  let zones: string[] = fallbackZones;
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.("timeZone");
    if (supported && supported.length > 0) zones = supported;
  } catch {
    // Use the fallback list.
  }
  return Array.from(new Set(["UTC", current, ...zones])).sort();
}

export default async function ProfileSettingsPage() {
  const session = await requireVerifiedUser();

  return (
    <div className="space-y-4">
      <ProfileForm
        email={session.user.email}
        emailVerified={Boolean(session.user.emailVerifiedAt)}
        name={session.user.name}
        timezone={session.user.timezone}
        timezones={timezoneOptions(session.user.timezone)}
      />

      <section className="card">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-[12.5px] font-semibold">Account record</h2>
        </div>
        <div className="divide-y divide-line">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="text-[10.5px] text-muted">Account ID</span>
            <span className="mono max-w-[64%] break-all text-right text-[10px] text-ink">
              {session.user.id}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="text-[10.5px] text-muted">Created</span>
            <span className="text-[11px] text-ink">
              {formatDate(session.user.createdAt, session.user.timezone)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="text-[10.5px] text-muted">Second factor</span>
            <span className="flex gap-1.5">
              <Badge tone={session.user.totpEnabledAt ? "positive" : "neutral"}>
                Authenticator {session.user.totpEnabledAt ? "on" : "off"}
              </Badge>
              <Badge tone={session.user.emailMfaEnabled ? "positive" : "neutral"}>
                Email {session.user.emailMfaEnabled ? "on" : "off"}
              </Badge>
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="text-[10.5px] text-muted">Email provider policy</span>
            <span className="mono text-[10px] text-ink">
              {session.user.emailProviderPriority}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
