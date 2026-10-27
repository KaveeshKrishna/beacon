import type { Metadata } from "next";
import Link from "next/link";

import { ActivityList } from "@/components/app/activity-list";
import { PageHeader } from "@/components/app/page-header";
import { buttonClasses } from "@/components/ui/button";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { listActivity } from "@/lib/data/activity";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Activity",
  robots: { index: false, follow: false },
};

const filters = [
  { value: "all", label: "Everything" },
  { value: "security", label: "Security" },
  { value: "devices", label: "Devices" },
  { value: "geofences", label: "Geofences" },
  { value: "commands", label: "Commands" },
] as const;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await requireVerifiedUser();
  const { filter: rawFilter } = await searchParams;
  const filter = filters.some((item) => item.value === rawFilter)
    ? (rawFilter as (typeof filters)[number]["value"])
    : "all";

  const entries = await listActivity(session.user.id, 140);
  const filtered = entries.filter((entry) => {
    if (filter === "all") return true;
    if (filter === "security")
      return entry.category === "security" || entry.category === "account";
    if (filter === "devices") return entry.category === "device";
    if (filter === "geofences") return entry.category === "geofence";
    if (filter === "commands") return entry.category === "command";
    return true;
  });

  return (
    <div className="space-y-5">
      <PageHeader
        actions={
          <Link
            className={buttonClasses({ variant: "secondary", size: "md" })}
            href="/app/settings/data"
          >
            Export data
          </Link>
        }
        description="Sign-ins, security changes, pairing, geofence transitions and remote commands. Times are shown in your account timezone."
        eyebrow="Audit trail"
        title="Activity"
      />

      <div className="flex flex-wrap items-center gap-1 border-b border-line pb-2">
        {filters.map((item) => (
          <Link
            className={cn(
              "rounded-[6px] px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
              filter === item.value
                ? "bg-surface-2 text-ink"
                : "text-muted hover:bg-surface-2/60 hover:text-ink",
            )}
            href={item.value === "all" ? "/app/activity" : `/app/activity?filter=${item.value}`}
            key={item.value}
          >
            {item.label}
          </Link>
        ))}
        <span className="mono ml-auto text-[10px] text-faint">
          {filtered.length} event{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="text-[12.5px] font-semibold">Recorded events</h2>
            <p className="mt-0.5 text-[10.5px] text-faint">
              Newest first. IP addresses are stored only as keyed hashes.
            </p>
          </div>
          <span className="mono text-[9.5px] uppercase tracking-[0.1em] text-faint">
            Retained 365 days
          </span>
        </div>
        <ActivityList
          entries={filtered}
          showDate
          timezone={session.user.timezone}
        />
      </section>

      <p className="max-w-[72ch] text-[10.5px] leading-4 text-faint">
        Geo-fence events are recorded when a fix crosses a boundary, even if the
        corresponding email was suppressed by your notification settings. Command
        entries show the server-side queue state; execution results appear when
        the device acknowledges them.
      </p>
    </div>
  );
}
