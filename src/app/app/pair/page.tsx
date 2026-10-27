import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { PairingPanel } from "@/components/app/pairing-panel";

export const metadata: Metadata = {
  title: "Pair a device",
  robots: { index: false, follow: false },
};

export default function PairPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        description="Pairing codes are single-use, expire after ten minutes, and never expose your account password to the device."
        eyebrow="Devices"
        title="Pair an Android device"
      />
      <PairingPanel />
    </div>
  );
}
