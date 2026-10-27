import type { Metadata } from "next";
import { Suspense } from "react";

import { VerifyEmailClient } from "@/components/auth/verify-email-client";

export const metadata: Metadata = { title: "Verify email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <Suspense fallback={<div className="h-80" />}>
      <VerifyEmailClient token={token ?? null} />
    </Suspense>
  );
}
