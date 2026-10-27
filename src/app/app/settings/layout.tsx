import { PageHeader } from "@/components/app/page-header";
import { SettingsNav } from "@/components/app/settings/settings-nav";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <PageHeader
        description="Account identity, sign-in factors, alerting and the data you keep."
        eyebrow="Account"
        title="Settings"
      />
      <div className="grid gap-6 lg:grid-cols-[172px_minmax(0,1fr)] lg:items-start">
        <div className="lg:sticky lg:top-6">
          <SettingsNav />
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
