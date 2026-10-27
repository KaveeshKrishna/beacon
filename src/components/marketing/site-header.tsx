"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Wordmark } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const links = [
  { href: "/#capabilities", label: "Capabilities" },
  { href: "/#android", label: "Android" },
  { href: "/security", label: "Security" },
  { href: "/#questions", label: "Questions" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-bg/80 backdrop-blur-xl">
      <div className="container-page flex h-[66px] items-center justify-between gap-6">
        <Wordmark size="sm" />

        <nav className="hidden items-center gap-7 md:flex" aria-label="Main">
          {links.map((link) => (
            <Link
              className="text-[13px] font-medium text-muted transition-colors hover:text-ink"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Link
            className={buttonClasses({ variant: "ghost", size: "sm", className: "hidden sm:inline-flex" })}
            href="/login"
          >
            Sign in
          </Link>
          <Link
            className={buttonClasses({ size: "sm", className: "hidden sm:inline-flex" })}
            href="/signup"
          >
            Create account
          </Link>
          <button
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex size-9 items-center justify-center rounded-md text-ink md:hidden"
            onClick={() => setOpen((value) => !value)}
            type="button"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-line bg-surface px-6 py-4 md:hidden">
          <nav className="flex flex-col" aria-label="Mobile">
            {links.map((link) => (
              <Link
                className="border-b border-line py-3 text-sm font-medium text-ink last:border-0"
                href={link.href}
                key={link.href}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 flex gap-2">
            <Link
              className={buttonClasses({ variant: "secondary", className: "flex-1" })}
              href="/login"
            >
              Sign in
            </Link>
            <Link className={buttonClasses({ className: "flex-1" })} href="/signup">
              Create account
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
