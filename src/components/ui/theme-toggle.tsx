"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from "@/components/ui/dropdown";

type Theme = "light" | "dark" | "system";

function applyTheme(theme: Theme) {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.dataset.theme = theme;
  }
  document.cookie = `beacon_theme=${theme};path=/;max-age=31536000;samesite=lax`;
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = document.documentElement.dataset.theme;
    setTheme(stored === "light" || stored === "dark" ? stored : "system");
    setMounted(true);
  }, []);

  function select(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  const Icon = !mounted
    ? Monitor
    : theme === "light"
      ? Sun
      : theme === "dark"
        ? Moon
        : Monitor;

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          aria-label="Change theme"
          className={cn(
            "inline-flex size-9 items-center justify-center rounded-[8px] border border-transparent text-muted transition-colors hover:bg-surface-2 hover:text-ink",
            className,
          )}
          type="button"
        >
          <Icon className="size-4" />
        </button>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownItem onSelect={() => select("light")}>
          <Sun className="size-3.5 text-muted" /> Light
        </DropdownItem>
        <DropdownItem onSelect={() => select("dark")}>
          <Moon className="size-3.5 text-muted" /> Dark
        </DropdownItem>
        <DropdownItem onSelect={() => select("system")}>
          <Monitor className="size-3.5 text-muted" /> System
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}
