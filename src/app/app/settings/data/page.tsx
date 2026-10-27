import type { Metadata } from "next";

import { DataPrivacyPanel } from "@/components/app/settings/data-privacy-panel";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "Data & privacy",
  robots: { index: false, follow: false },
};

export default async function DataSettingsPage() {
  const session = await requireVerifiedUser();
  const env = getEnv();

  return (
    <DataPrivacyPanel
      auditRetentionDays={env.AUDIT_RETENTION_DAYS}
      email={session.user.email}
      locationRetentionDays={env.LOCATION_RETENTION_DAYS}
      sessionTtlDays={env.SESSION_TTL_DAYS}
    />
  );
}
