"use client";

import dynamic from "next/dynamic";

import { cn } from "@/lib/cn";
import type { MapFence, MapPoint } from "@/components/map/map-canvas";

const MapCanvas = dynamic(() => import("@/components/map/map-canvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-surface-2">
      <div className="flex items-center gap-2 text-[11px] text-faint">
        <span className="size-1.5 animate-pulse rounded-full bg-accent" />
        Loading map
      </div>
    </div>
  ),
});

export function DeviceMap({
  points,
  fences = [],
  focus,
  fitToken = 0,
  className,
  emptyLabel = "No location fix has been received yet.",
  interactive = true,
}: {
  points: MapPoint[];
  fences?: MapFence[];
  focus?: { latitude: number; longitude: number } | null;
  fitToken?: number;
  className?: string;
  emptyLabel?: string;
  interactive?: boolean;
}) {
  return (
    <div className={cn("relative h-full w-full overflow-hidden bg-surface-2", className)}>
      <MapCanvas
        fences={fences}
        fitToken={fitToken}
        focus={focus}
        interactive={interactive}
        points={points}
      />
      {points.length === 0 && fences.length === 0 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-4">
          <p className="rounded-full border border-line bg-surface/90 px-3 py-1.5 text-[11px] text-muted backdrop-blur">
            {emptyLabel}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export type { MapFence, MapPoint };
