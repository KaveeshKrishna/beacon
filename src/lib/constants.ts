export const APP_NAME = "Beacon";
export const APP_DESCRIPTION =
  "Android-first device location with offline-first breadcrumbs, remote actions and a security posture built for the worst day.";

export const SESSION_COOKIE_PROD = "__Host-beacon_session";
export const SESSION_COOKIE_DEV = "beacon_session";
export const MFA_COOKIE_PROD = "__Host-beacon_mfa";
export const MFA_COOKIE_DEV = "beacon_mfa";

export const EMAIL_TOKEN_PURPOSES = {
  verifyEmail: "verify_email",
  resetPassword: "reset_password",
} as const;

export const EMAIL_PROVIDER_PRIORITIES = [
  "default",
  "relay_first",
  "resend_first",
  "relay_only",
  "resend_only",
] as const;

export type EmailProviderPriority =
  (typeof EMAIL_PROVIDER_PRIORITIES)[number];

export const TRACKING_PROFILES = ["low", "balanced", "high"] as const;
export type TrackingProfile = (typeof TRACKING_PROFILES)[number];

export const COMMAND_TYPES = [
  "LOCATE_NOW",
  "RING",
  "LOST_MODE_ON",
  "LOST_MODE_OFF",
  "LOCK_DEVICE",
  "CAPTURE_PHOTO",
  "MESSAGE",
  "SYNC_NOW",
] as const;

export type CommandType = (typeof COMMAND_TYPES)[number];

export const COMMAND_LABELS: Record<CommandType, string> = {
  LOCATE_NOW: "Locate now",
  RING: "Sound alarm",
  LOST_MODE_ON: "Enable lost mode",
  LOST_MODE_OFF: "Disable lost mode",
  LOCK_DEVICE: "Lock device",
  CAPTURE_PHOTO: "Capture evidence photo",
  MESSAGE: "Show message",
  SYNC_NOW: "Sync now",
};

export const COMMAND_TTL_MINUTES = 24 * 60;
export const PAIRING_CODE_TTL_MINUTES = 10;
export const PAIRING_CODE_LENGTH = 8;
export const EMAIL_CODE_TTL_MINUTES = 10;
export const EMAIL_VERIFY_TTL_HOURS = 24;
export const PASSWORD_RESET_TTL_MINUTES = 60;
export const MFA_PENDING_TTL_MINUTES = 10;
export const RECOVERY_CODE_COUNT = 10;
export const MAX_DEVICES_DEFAULT = 10;

export const RATE_LIMITS = {
  loginIp: { limit: 30, windowSec: 15 * 60 },
  loginAccount: { limit: 10, windowSec: 15 * 60 },
  signupIp: { limit: 5, windowSec: 60 * 60 },
  passwordResetIp: { limit: 5, windowSec: 60 * 60 },
  passwordResetAccount: { limit: 3, windowSec: 60 * 60 },
  resendVerify: { limit: 3, windowSec: 15 * 60 },
  emailCode: { limit: 3, windowSec: 10 * 60 },
  mfaAttempt: { limit: 10, windowSec: 10 * 60 },
  pairingCreate: { limit: 10, windowSec: 60 * 60 },
  pairingAttemptIp: { limit: 30, windowSec: 15 * 60 },
  deviceIngest: { limit: 120, windowSec: 60 },
  deviceHeartbeat: { limit: 30, windowSec: 60 },
  commandCreate: { limit: 30, windowSec: 60 },
  testEmail: { limit: 5, windowSec: 60 * 60 },
  changePassword: { limit: 5, windowSec: 15 * 60 },
} as const;

export const LOCATION_RANGE_HOURS = {
  "1h": 1,
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
} as const;

export type LocationRange = keyof typeof LOCATION_RANGE_HOURS;

export const MAX_LOCATIONS_PER_REQUEST = 200;
export const MAX_LOCATIONS_PER_QUERY = 2500;

export const MAP_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>';
