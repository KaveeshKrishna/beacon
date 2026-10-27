import type { Metadata } from "next";

import { AppShell } from "@/components/app/app-shell";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { listDeviceSummaries } from "@/lib/data/devices";

export const metadata: Metadata = {
  title: "Overview",
  robots: { index: false, follow: false },
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireVerifiedUser();
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
