"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Wordmark } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";

export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Beacon route error", error.digest ?? error.message);
  }, [error]);

  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 py-16"
      id="main"
    >
      <div className="w-full max-w-lg">
        <Wordmark size="sm" />
        <p className="eyebrow mt-10">Something went wrong</p>
        <h1 className="display mt-3 text-[36px] sm:text-[44px]">
          The page could not be rendered.
        </h1>
        <p className="mt-4 text-[13px] leading-6 text-muted">
          This is a server-side failure, not a problem with your account. No
          remote command is sent by loading a page. Try the request again, or
          return to the overview.
        </p>
        {error.digest ? (
          <p className="mono mt-4 rounded-[8px] border border-line bg-surface px-3 py-2 text-[10px] text-faint">
            Reference: {error.digest}
          </p>
        ) : null}
        <div className="mt-7 flex flex-wrap gap-2">
          <button
            className={buttonClasses({ size: "md" })}
            onClick={reset}
            type="button"
          >
            <RotateCcw className="size-3.5" /> Try again
          </button>
          <Link
            className={buttonClasses({ variant: "secondary", size: "md" })}
            href="/"
          >
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
