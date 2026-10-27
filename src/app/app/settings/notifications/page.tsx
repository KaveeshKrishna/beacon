import type { Metadata } from "next";

import { NotificationSettingsForm } from "@/components/app/settings/notification-settings-form";
import { requireVerifiedUser } from "@/lib/auth/guards";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

export default async function NotificationSettingsPage() {
  const session = await requireVerifiedUser();

  return (
    <div className="space-y-4">
      <NotificationSettingsForm
        initial={{
          notifyGeofence: session.user.notifyGeofence,
          notifyOffline: session.user.notifyOffline,
          notifyLowBattery: session.user.notifyLowBattery,
          notifySecurity: session.user.notifySecurity,
        }}
      />
      <section className="card px-4 py-3.5">
        <p className="text-[10.5px] leading-[1.7] text-muted">
          Beacon sends alerts by email because it works when the app is closed
          and does not depend on Google Play services. Push notifications are
          used only to wake the Android app for commands when FCM is configured.
          If both email providers are down, the alert remains in the Activity
          log and delivery is retried through the fallback provider for that
          attempt.
        </p>
      </section>
    </div>
  );
}
