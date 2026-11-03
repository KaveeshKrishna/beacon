import type { Metadata } from "next";
import { headers } from "next/headers";

import { AppShell } from "@/components/app/app-shell";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { listDeviceSummaries } from "@/lib/data/devices";
import { safeNextPath } from "@/lib/safe-path";

export const metadata: Metadata = {
  title: "Overview",
  robots: { index: false, follow: false },
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The middleware writes `x-beacon-path` from the real request URL, so clients
  // cannot spoof it. Preserve the path (including the reconnect query) through
  // the sign-in redirect. `safeNextPath` is defence in depth for the header.
  const requestHeaders = await headers();
  const nextPath = safeNextPath(requestHeaders.get("x-beacon-path"));
  const session = await requireVerifiedUser(nextPath ?? undefined);
  const devices = await listDeviceSummaries(session.user.id);

  return (
    <AppShell
      devices={devices.map((device) => ({
        id: device.id,
        name: device.name,
        presence: device.presence,
        status: device.status,
      }))}
      user={{ name: session.user.name, email: session.user.email }}
    >
      {children}
    </AppShell>
  );
}
