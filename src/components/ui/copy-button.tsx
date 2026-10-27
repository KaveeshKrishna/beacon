"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";

export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-line-strong bg-surface px-2.5 text-[12px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink",
        className,
      )}
      onClick={copy}
      type="button"
    >
      {copied ? (
        <Check className="size-3.5 text-positive" />
      ) : (
        <Copy className="size-3.5" />
      )}
      {copied ? "Copied" : label}
    </button>
  );
}
