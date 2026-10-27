"use client";

import {
  Bell,
  Database,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

const items = [
  { href: "/app/settings", label: "Profile", icon: UserRound, exact: true },
  { href: "/app/settings/security", label: "Security", icon: ShieldCheck },
  { href: "/app/settings/notifications", label: "Notifications", icon: Bell },
  { href: "/app/settings/email", label: "Email delivery", icon: Mail },
  { href: "/app/settings/data", label: "Data & privacy", icon: Database },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Settings sections"
      className="flex gap-1 overflow-x-auto border-b border-line pb-2 lg:flex-col lg:overflow-visible lg:border-b-0 lg:pb-0"
    >
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-[7px] px-2.5 py-2 text-[12px] font-medium transition-colors",
              active
                ? "bg-surface-2 text-ink"
                : "text-muted hover:bg-surface-2/60 hover:text-ink",
            )}
            href={item.href}
            key={item.href}
          >
            <item.icon
              className={cn("size-3.5", active ? "text-accent" : "text-faint")}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
