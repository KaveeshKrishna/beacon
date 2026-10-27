"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Wordmark } from "@/components/brand/logo";
import { SidebarNav, UserMenu, type SidebarDevice } from "@/components/app/sidebar-nav";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function MobileHeader({
  devices,
  user,
}: {
  devices: SidebarDevice[];
  user: { name: string; email: string };
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-[58px] items-center justify-between border-b border-line bg-bg/90 px-4 backdrop-blur-xl lg:hidden">
        <Wordmark size="sm" />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            aria-label="Open navigation"
            className="inline-flex size-9 items-center justify-center rounded-md text-ink"
            onClick={() => setOpen(true)}
            type="button"
          >
            <Menu className="size-5" />
          </button>
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            type="button"
          />
          <div className="absolute inset-y-0 left-0 flex w-[290px] max-w-[86vw] flex-col border-r border-line bg-surface shadow-2xl">
            <div className="flex h-[58px] shrink-0 items-center justify-between border-b border-line px-4">
              <Wordmark href={null} size="sm" />
              <button
                aria-label="Close navigation"
                className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SidebarNav devices={devices} onNavigate={() => setOpen(false)} />
            </div>
            <div className="shrink-0 border-t border-line p-2">
              <UserMenu
                email={user.email}
                name={user.name}
                onNavigate={() => setOpen(false)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
