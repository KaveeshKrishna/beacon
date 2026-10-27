import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignupForm } from "@/components/auth/signup-form";
import { getOptionalUser } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage() {
  const user = await getOptionalUser();
  if (user) redirect("/app");

  return <SignupForm />;
}
