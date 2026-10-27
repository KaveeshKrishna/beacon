/* eslint-disable @next/next/no-img-element -- brand SVGs are already vector and
   must not go through the raster image optimizer. */
import Link from "next/link";

import { cn } from "@/lib/cn";

const LOCKUP_WIDTH = 857;
const LOCKUP_HEIGHT = 231;

export function BeaconMark({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={cn("block w-auto", className)}
      height={size}
      src="/brand/beacon-mark.svg"
      style={{ height: size }}
      width={Math.round(size * (985 / 1773))}
    />
  );
}

function Lockup({
  height,
  variant,
}: {
  height: number;
  variant: "on-light" | "on-dark";
}) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={cn(
        "block w-auto",
        variant === "on-light" ? "brand-lockup-on-light" : "brand-lockup-on-dark",
      )}
      height={height}
      src={`/brand/beacon-lockup-${variant}.svg`}
      style={{ height }}
      width={Math.round(height * (LOCKUP_WIDTH / LOCKUP_HEIGHT))}
    />
  );
}

export function Wordmark({
  className,
  href = "/",
  size = "md",
  invert = false,
  tone,
}: {
  className?: string;
  href?: string | null;
  size?: "sm" | "md" | "lg";
  invert?: boolean;
  tone?: "dark" | "light";
}) {
  const height = size === "lg" ? 40 : size === "sm" ? 26 : 30;
  const forced = tone ?? (invert ? "dark" : null);

  const content = forced ? (
    <span className={cn("inline-flex items-center", className)}>
      <img
        alt=""
        aria-hidden="true"
        className="block w-auto"
        height={height}
        src={`/brand/beacon-lockup-on-${forced === "dark" ? "dark" : "light"}.svg`}
        style={{ height }}
        width={Math.round(height * (LOCKUP_WIDTH / LOCKUP_HEIGHT))}
      />
      <span className="sr-only">Beacon</span>
    </span>
  ) : (
    <span className={cn("inline-flex items-center", className)}>
      <Lockup height={height} variant="on-light" />
      <Lockup height={height} variant="on-dark" />
      <span className="sr-only">Beacon</span>
    </span>
  );

  if (!href) return content;
  return (
    <Link
      aria-label="Beacon home"
      className="inline-flex rounded-sm"
      href={href}
    >
      {content}
    </Link>
  );
}
