import type { Metadata } from "next";

import { MfaSetupForm } from "@/components/auth/mfa-setup-form";
import { requireEnrollmentPageUser } from "@/lib/auth/guards";

export const metadata: Metadata = {
  title: "Replace your authenticator",
  robots: { index: false, follow: false },
};

export default async function MfaSetupPage() {
  const session = await requireEnrollmentPageUser();

  return <MfaSetupForm email={session.user.email} />;
}
