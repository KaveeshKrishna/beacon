import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-dvh bg-bg">
      <SiteHeader />
      <main
        className="container-page flex min-h-[64vh] flex-col justify-center py-20"
        id="main"
      >
        <div className="max-w-[560px]">
          <p className="eyebrow">404 — off the map</p>
          <h1 className="display mt-4 text-[44px] sm:text-[60px]">
            This page is not here.
          </h1>
          <p className="mt-5 max-w-[52ch] text-[14px] leading-6 text-muted">
            The link may be old, mistyped or tied to an account you no longer
            have access to. Your devices and location history are not affected.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            <Link className={buttonClasses({ size: "lg" })} href="/">
              <ArrowLeft className="size-4" /> Back to Beacon
            </Link>
            <Link
              className={buttonClasses({ variant: "secondary", size: "lg" })}
              href="/app"
            >
              <Compass className="size-4" /> Open console
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
