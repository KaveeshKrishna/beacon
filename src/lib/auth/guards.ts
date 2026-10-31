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
  if (session.user.mfaEnrollmentRequired) redirect("/mfa/setup");
  if (!isFullyAuthenticated(session)) redirect("/login");
  return session;
}

export async function requireVerifiedUser(): Promise<AuthSession> {
  const session = await requireUser();
  if (!session.user.emailVerifiedAt) redirect("/verify-email?pending=1");
  return session;
}

/**
 * Page guard for forced enrollment after an MFA reset. A normal pending-MFA
 * login has no session at all, so it can never reach this page.
 */
export async function requireEnrollmentPageUser(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (isFullyAuthenticated(session)) redirect("/app");
  if (!session.user.mfaEnrollmentRequired) redirect("/login");
  if (!session.user.emailVerifiedAt) redirect("/verify-email?pending=1");
  return session;
}

export async function requireApiUser(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) {
    throw new ApiError(401, "unauthorized", "Sign in to continue.");
  }
  if (session.user.mfaEnrollmentRequired) {
    throw new ApiError(
      403,
      "mfa_enrollment_required",
      "Enroll a new two-factor method before using the dashboard.",
    );
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

/**
 * Used only by the factor-enrollment routes. It deliberately skips the
 * `mfaEnrollmentRequired` block, but still requires a real session and a
 * verified email address. A pending-MFA cookie is not a session and cannot
 * use it.
 */
export async function requireVerifiedApiUserForEnrollment(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) {
    throw new ApiError(401, "unauthorized", "Sign in to continue.");
  }
  if (!session.user.emailVerifiedAt) {
    throw new ApiError(
      403,
      "email_verification_required",
      "Verify your email address before using this feature.",
    );
  }
  if (!session.user.mfaEnrollmentRequired && !isFullyAuthenticated(session)) {
    throw new ApiError(
      403,
      "mfa_required",
      "Complete two-factor verification to continue.",
    );
  }
  return session;
}
