import type { Metadata } from "next";

import { SecuritySettings } from "@/components/app/settings/security-settings";
import { requireVerifiedUser } from "@/lib/auth/guards";

export const metadata: Metadata = {
  title: "Security",
  robots: { index: false, follow: false },
};

export default async function SecuritySettingsPage() {
  const session = await requireVerifiedUser();

  return (
    <SecuritySettings
      email={session.user.email}
      emailMfaEnabled={session.user.emailMfaEnabled}
      recoveryCodesGeneratedAt={
        session.user.recoveryCodesGeneratedAt?.toISOString() ?? null
      }
      timezone={session.user.timezone}
      totpEnabled={Boolean(session.user.totpEnabledAt)}
    />
  );
}
