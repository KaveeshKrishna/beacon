import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MfaForm } from "@/components/auth/mfa-form";
import { getOptionalUser } from "@/lib/auth/guards";
import { isFullyAuthenticated } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Second factor" };

export default async function MfaPage() {
  const session = await getOptionalUser();
  if (session && isFullyAuthenticated(session)) redirect("/app");

  return <MfaForm />;
}
