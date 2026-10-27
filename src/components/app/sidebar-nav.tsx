"use client";

import {
  Activity,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Plus,
  Settings,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { cn } from "@/lib/cn";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { initials } from "@/lib/format";

export type SidebarDevice = {
  id: string;
  name: string;
  presence: "online" | "stale" | "offline";
  status: "active" | "lost";
};

const nav = [
  { href: "/app", label: "Overview", icon: LayoutDashboard },
  { href: "/app/activity", label: "Activity", icon: Activity },
  { href: "/app/pair", label: "Pair a device", icon: Plus },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  if (href === "/app/settings") return pathname.startsWith("/app/settings");
  return pathname === href;
}

export function SidebarNav({
  devices,
  onNavigate,
}: {
  devices: SidebarDevice[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <nav className="space-y-0.5 p-3" aria-label="Dashboard">
        {nav.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              className={cn(
                "flex items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-[12.5px] font-medium transition-colors",
                active
                  ? "bg-surface-2 text-ink"
                  : "text-muted hover:bg-surface-2/70 hover:text-ink",
              )}
              href={item.href}
              key={item.href}
              onClick={onNavigate}
            >
              <item.icon
                className={cn("size-3.5", active ? "text-accent" : "text-faint")}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mx-3 border-t border-line" />

      <div className="flex items-center justify-between px-5 pb-2 pt-4">
        <p className="eyebrow text-[10px]">
          Devices · {devices.length}
        </p>
        <Link
          aria-label="Pair a device"
          className="inline-flex size-6 items-center justify-center rounded-md text-faint transition-colors hover:bg-surface-2 hover:text-ink"
          href="/app/pair"
          onClick={onNavigate}
        >
          <Plus className="size-3.5" />
        </Link>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
        {devices.length === 0 ? (
          <p className="px-2.5 py-2 text-[11.5px] leading-4 text-faint">
            No devices paired yet.
          </p>
        ) : (
          devices.map((device) => {
            const active = pathname === `/app/devices/${device.id}`;
            return (
              <Link
                className={cn(
                  "group flex items-center gap-2.5 rounded-[7px] px-2.5 py-2 transition-colors",
                  active ? "bg-surface-2" : "hover:bg-surface-2/70",
                )}
                href={`/app/devices/${device.id}`}
                key={device.id}
                onClick={onNavigate}
              >
                <span className="relative flex size-7 shrink-0 items-center justify-center rounded-md border border-line bg-bg">
                  <Smartphone className="size-3.5 text-muted" />
                  <span
                    className={cn(
                      "absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-surface",
                      device.presence === "online"
                        ? "bg-positive"
                        : device.presence === "stale"
                          ? "bg-warning"
                          : "bg-danger",
                    )}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-ink">
                    {device.name}
                  </span>
                  <span className="block text-[10px] text-faint">
                    {device.status === "lost" ? "Lost mode" : device.presence}
                  </span>
                </span>
                <ChevronRight className="size-3 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            );
          })
        )}
      </div>

      <div className="border-t border-line p-3">
        <Link
          className="flex items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-[12px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          href="/app/settings/security"
          onClick={onNavigate}
        >
          <ShieldCheck className="size-3.5 text-faint" />
          Security
        </Link>
      </div>
    </div>
  );
}

export function UserMenu({
  name,
  email,
  onNavigate,
}: {
  name: string;
  email: string;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      onNavigate?.();
      router.replace("/");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          className="flex w-full items-center gap-2.5 rounded-[8px] px-2 py-2 text-left transition-colors hover:bg-surface-2"
          type="button"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-[11px] font-semibold">
            {initials(name) || "B"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-medium">{name}</span>
            <span className="block truncate text-[10.5px] text-faint">{email}</span>
          </span>
          <ChevronRight className="size-3.5 shrink-0 text-faint" />
        </button>
      </DropdownTrigger>
      <DropdownContent align="start">
        <DropdownItem onSelect={() => a11yNavigate(onNavigate, router, "/app/settings")}>
          <Settings className="size-3.5 text-muted" /> Account settings
        </DropdownItem>
        <DropdownItem
          onSelect={() => a11yNavigate(onNavigate, router, "/app/settings/security")}
        >
          <ShieldCheck className="size-3.5 text-muted" /> Security
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem
          className="text-danger data-[highlighted]:bg-danger/10"
          disabled={signingOut}
          onSelect={() => void signOut()}
        >
          <LogOut className="size-3.5" /> {signingOut ? "Signing out…" : "Sign out"}
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}

function a11yNavigate(
  onNavigate: (() => void) | undefined,
  router: ReturnType<typeof useRouter>,
  href: string,
) {
  onNavigate?.();
  router.push(href);
}
