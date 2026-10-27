import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type BadgeTone =
  | "neutral"
  | "positive"
  | "warning"
  | "danger"
  | "accent"
  | "info";

const tones: Record<BadgeTone, string> = {
  neutral:
    "border-line-strong bg-surface-2 text-muted",
  positive:
    "border-positive/25 bg-positive/10 text-positive",
  warning:
    "border-warning/25 bg-warning/10 text-warning",
  danger: "border-danger/25 bg-danger/10 text-danger",
  accent: "border-accent/25 bg-accent/10 text-accent",
  info: "border-info/25 bg-info/10 text-info",
};

export function Badge({
  children,
  tone = "neutral",
  dot = false,
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
        tones[tone],
        className,
      )}
    >
      {dot ? <span className="status-dot" /> : null}
      {children}
    </span>
  );
}

export function StatusBadge({
  presence,
  className,
}: {
  presence: "online" | "stale" | "offline";
  className?: string;
}) {
  const map = {
    online: { tone: "positive" as const, label: "Online" },
    stale: { tone: "warning" as const, label: "Stale" },
    offline: { tone: "danger" as const, label: "Offline" },
  };
  const item = map[presence];
  return (
    <Badge className={className} dot tone={item.tone}>
      {item.label}
    </Badge>
  );
}
