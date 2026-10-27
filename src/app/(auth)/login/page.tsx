import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { getOptionalUser } from "@/lib/auth/guards";
import { isFullyAuthenticated } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const session = await getOptionalUser();
  if (session && isFullyAuthenticated(session)) redirect("/app");

  return (
    <Suspense fallback={<div className="h-80" />}>
      <LoginForm />
    </Suspense>
  );
}
