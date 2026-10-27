import { Check, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { Wordmark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const points = [
  "Offline queue on the device, not a promise in the cloud",
  "Opaque sessions, Argon2id passwords, encrypted fields",
  "Export or delete everything you have stored",
];

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.02fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[#0b0c0e] lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden="true" className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:72px_72px]" />
        <div
          aria-hidden="true"
          className="absolute -left-[30%] top-[10%] size-[640px] rounded-full bg-[radial-gradient(circle,rgba(255,106,69,0.16),transparent_62%)]"
        />

        <div className="relative p-10 xl:p-14">
          <Wordmark invert size="sm" />
        </div>

        <div className="relative max-w-[560px] p-10 xl:p-14">
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/35">
            Beacon · field manual
          </p>
          <h1 className="display mt-5 text-[clamp(34px,3.6vw,52px)] text-[#f4f1ea]">
            Location history is sensitive. Treat it that way.
          </h1>
          <p className="mt-5 max-w-[42ch] text-[13.5px] leading-6 text-white/50">
            Beacon is an Android-first locator you can inspect, self-host and
            leave. Your devices report to your database, not ours.
          </p>

          <ul className="mt-8 space-y-3.5">
            {points.map((point) => (
              <li className="flex items-start gap-2.5 text-[12.5px] text-white/60" key={point}>
                <Check className="mt-0.5 size-3.5 shrink-0 text-[#FF6A45]" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center justify-between border-t border-white/10 p-10 xl:px-14">
          <p className="mono text-[10px] uppercase tracking-[0.12em] text-white/30">
            AGPL-3.0-or-later
          </p>
          <p className="flex items-center gap-1.5 text-[10px] text-white/30">
            <ShieldCheck className="size-3" />
            No analytics
          </p>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        <div className="flex items-center justify-between px-6 py-5 sm:px-10">
          <div className="lg:hidden">
            <Wordmark size="sm" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link
              className="rounded-md px-3 py-2 text-[12px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              href="/"
            >
              Back to site
            </Link>
          </div>
        </div>

        <main className="flex flex-1 items-center justify-center px-6 pb-16 pt-4 sm:px-10">
          <div className="w-full max-w-[400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
