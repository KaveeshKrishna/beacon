import type { Metadata } from "next";

import { EmailDeliverySettings } from "@/components/app/settings/email-delivery-settings";
import { requireVerifiedUser } from "@/lib/auth/guards";

export const metadata: Metadata = {
  title: "Email delivery",
  robots: { index: false, follow: false },
};

export default async function EmailSettingsPage() {
  await requireVerifiedUser();
  return <EmailDeliverySettings />;
}
