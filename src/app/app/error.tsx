"use client";

import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { buttonClasses } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the digest visible in the browser console for support requests.
    console.error("Beacon console error", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-16">
      <span className="flex size-11 items-center justify-center rounded-xl border border-danger/25 bg-danger/10 text-danger">
        <TriangleAlert className="size-5" />
      </span>
      <p className="eyebrow mt-6">Console error</p>
      <h1 className="display mt-2 text-[32px]">This view did not load.</h1>
      <p className="mt-3 text-[13px] leading-6 text-muted">
        The server returned an error before this page could render. Location
        collection on paired devices is independent and continues in the
        background. Try again, or return to the overview.
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
          href="/app"
        >
          Return to overview
        </Link>
      </div>
    </div>
  );
}
