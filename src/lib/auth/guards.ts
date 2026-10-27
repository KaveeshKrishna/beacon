import "server-only";

import { redirect } from "next/navigation";

import { ApiError } from "@/lib/api";
import {
  getSession,
  isFullyAuthenticated,
  type AuthSession,
} from "@/lib/auth/session";

export async function getOptionalUser(): Promise<AuthSession | null> {
  return getSession();
}

export async function requireUser(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isFullyAuthenticated(session)) redirect("/login");
  return session;
}

export async function requireVerifiedUser(): Promise<AuthSession> {
  const session = await requireUser();
  if (!session.user.emailVerifiedAt) redirect("/verify-email?pending=1");
  return session;
}

export async function requireApiUser(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) {
    throw new ApiError(401, "unauthorized", "Sign in to continue.");
  }
  // A session that has only passed the password step must not be able to read
  // location history or change account settings while a second factor is
  // outstanding.
  if (!isFullyAuthenticated(session)) {
    throw new ApiError(
      403,
      "mfa_required",
      "Complete two-factor verification to continue.",
    );
  }
  return session;
}

export async function requireVerifiedApiUser(): Promise<AuthSession> {
  const session = await requireApiUser();
  if (!session.user.emailVerifiedAt) {
    throw new ApiError(
      403,
      "email_verification_required",
      "Verify your email address before using this feature.",
    );
  }
  return session;
}
