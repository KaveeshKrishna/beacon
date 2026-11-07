"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { ApiClientError, apiFetch } from "@/lib/client-api";

const HEARTBEAT_MS = 30_000;

/**
 * Detects a browser session that was revoked from another tab or a different
 * device. Without this the dashboard keeps rendering server data until the
 * next navigation; the API would reject that navigation, but an idle tab would
 * look signed in indefinitely.
 */
export function SessionHeartbeat() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let stopped = false;
    let inFlight = false;

    async function check() {
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        await apiFetch<{ sessionId: string; expiresAt: string }>(
          "/api/auth/session",
        );
      } catch (error) {
        if (stopped) return;
        if (error instanceof ApiClientError && error.status === 401) {
          const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
          const separator = next ? "&" : "?";
          router.replace(`/login${next}${separator}reason=session-ended`);
          router.refresh();
        }
      } finally {
        inFlight = false;
      }
    }

    function onVisible() {
      if (document.visibilityState === "visible") void check();
    }

    void check();
    const timer = window.setInterval(() => void check(), HEARTBEAT_MS);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname, router]);

  return null;
}
