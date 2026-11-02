import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MfaForm } from "@/components/auth/mfa-form";
import { getOptionalUser } from "@/lib/auth/guards";
import { isFullyAuthenticated } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/safe-path";

export const metadata: Metadata = { title: "Second factor" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function MfaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const session = await getOptionalUser();
  if (session && isFullyAuthenticated(session)) redirect(next ?? "/app");

  return <MfaForm next={next ?? undefined} />;
}
