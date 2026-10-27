import { Wordmark } from "@/components/brand/logo";
import { MobileHeader } from "@/components/app/mobile-header";
import {
  SidebarNav,
  UserMenu,
  type SidebarDevice,
} from "@/components/app/sidebar-nav";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function AppShell({
  user,
  devices,
  children,
}: {
  user: { name: string; email: string };
  devices: SidebarDevice[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[252px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-[64px] shrink-0 items-center border-b border-line px-5">
          <Wordmark size="sm" />
        </div>
        <div className="min-h-0 flex-1">
          <SidebarNav devices={devices} />
        </div>
        <div className="shrink-0 border-t border-line p-2">
          <div className="mb-1 flex items-center justify-between px-1">
            <p className="mono text-[9px] uppercase tracking-[0.12em] text-faint">
              Theme
            </p>
            <ThemeToggle />
          </div>
          <UserMenu email={user.email} name={user.name} />
        </div>
      </aside>

      <div className="min-w-0">
        <MobileHeader devices={devices} user={user} />
        <main
          className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-7 lg:px-9 lg:py-8"
          id="main"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
