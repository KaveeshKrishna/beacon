import {
  MapPin,
  Radio,
  ShieldCheck,
  Smartphone,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { commandLabel } from "@/lib/activity";
import { cn } from "@/lib/cn";
import type { ActivityEntry } from "@/lib/data/activity";
import { auditActionLabel } from "@/lib/activity";
import { formatDateTime, formatRelative } from "@/lib/format";

function entryTitle(entry: ActivityEntry): string {
  if (entry.category === "geofence") {
    const action = entry.action === "geofence.exited" ? "Left" : "Entered";
    return `${entry.deviceName ?? "Device"} ${action.toLowerCase()} ${entry.geofenceName ?? "a geofence"}`;
  }
  if (entry.category === "command") {
    return commandLabel(entry.action);
  }
  return auditActionLabel(entry.action);
}

function EntryIcon({ entry }: { entry: ActivityEntry }) {
  const className = "size-3.5";
  if (entry.category === "security") return <ShieldCheck className={className} />;
  if (entry.category === "account") return <UserRound className={className} />;
  if (entry.category === "geofence") return <MapPin className={className} />;
  if (entry.category === "command") return <Radio className={className} />;
  return <Smartphone className={className} />;
}

export function ActivityList({
  entries,
  timezone,
  compact = false,
  showDate = false,
}: {
  entries: ActivityEntry[];
  timezone: string;
  compact?: boolean;
  showDate?: boolean;
}) {
  if (entries.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-[12px] text-faint">
        Nothing has happened yet.
      </p>
    );
  }

  return (
    <ul className={cn("divide-y divide-line", compact ? "" : "border-t border-line")}>
      {entries.map((entry) => (
        <li className="flex items-start gap-3 px-5 py-3" key={entry.key}>
          <span
            className={cn(
              "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border",
              entry.category === "security"
                ? "border-positive/20 bg-positive/5 text-positive"
                : entry.category === "command"
                  ? "border-accent/20 bg-accent/5 text-accent"
                  : "border-line bg-surface-2 text-muted",
            )}
          >
            <EntryIcon entry={entry} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-medium leading-5">{entryTitle(entry)}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-faint">
              <span>
                {showDate
                  ? formatDateTime(entry.occurredAt, timezone)
                  : formatRelative(entry.occurredAt)}
              </span>
              {entry.deviceName && entry.category !== "geofence" ? (
                <span>· {entry.deviceName}</span>
              ) : null}
              {entry.targetType === "device" && !entry.deviceName ? (
                <span>· device</span>
              ) : null}
            </p>
          </div>
          {entry.category === "command" && entry.detail ? (
            <Badge
              tone={
                entry.detail === "completed"
                  ? "positive"
                  : entry.detail === "failed" || entry.detail === "unsupported"
                    ? "danger"
                    : "neutral"
              }
            >
              {entry.detail}
            </Badge>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
