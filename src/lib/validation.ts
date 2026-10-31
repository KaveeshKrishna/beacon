import { z } from "zod";

import {
  COMMAND_TYPES,
  EMAIL_PROVIDER_PRIORITIES,
  TRACKING_PROFILES,
} from "@/lib/constants";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .max(254);

const password = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128, "Use 128 characters or fewer.");

const uuid = z.string().uuid();

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80),
  email,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(256),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(20).max(200),
});

export const resendVerificationSchema = z.object({ email });

export const mfaCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
});

export const mfaRecoverySchema = z.object({
  code: z.string().trim().min(8).max(20),
});

export const emailCodeRequestSchema = z.object({}).strict();

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: password,
});

export const mfaPasswordSchema = z.object({
  password: z.string().min(1).max(256),
});

export const mfaDisableSchema = z.object({
  password: z.string().min(1).max(256),
  code: z.string().trim().max(20).optional(),
});

export const emailMfaToggleSchema = z.object({
  enabled: z.boolean(),
  password: z.string().min(1).max(256),
});

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  timezone: z.string().max(64).optional(),
});

export const emailSettingsSchema = z.object({
  priority: z.enum(EMAIL_PROVIDER_PRIORITIES),
});

export const notificationSettingsSchema = z.object({
  notifyGeofence: z.boolean(),
  notifyOffline: z.boolean(),
  notifyLowBattery: z.boolean(),
  notifySecurity: z.boolean(),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(256),
  confirmation: z.literal("DELETE"),
});

export const createPairingCodeSchema = z.object({
  deviceName: z.string().trim().max(80).optional(),
});

export const pairDeviceSchema = z.object({
  code: z.string().trim().min(6).max(16),
  name: z.string().trim().min(1).max(80),
  manufacturer: z.string().trim().max(80).optional().default(""),
  model: z.string().trim().max(80).optional().default(""),
  androidVersion: z.string().trim().max(40).optional().default(""),
  appVersion: z.string().trim().max(40).optional().default(""),
});

export const locationPointSchema = z.object({
  id: uuid,
  recordedAt: z.string().datetime({ offset: true }),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracyM: z.number().finite().min(0).max(100_000),
  altitudeM: z.number().finite().min(-1_000).max(20_000).nullish(),
  speedMps: z.number().finite().min(0).max(400).nullish(),
  headingDeg: z.number().finite().min(0).max(360).nullish(),
  batteryLevel: z.number().int().min(0).max(100).nullish(),
  isCharging: z.boolean().nullish(),
  provider: z.string().max(32).optional().default("unknown"),
  networkType: z.string().max(32).nullish(),
  isMocked: z.boolean().optional().default(false),
  sequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional().default(0),
});

export const locationBatchSchema = z.object({
  points: z.array(locationPointSchema).min(1).max(200),
});

export const heartbeatSchema = z.object({
  batteryLevel: z.number().int().min(0).max(100).nullish(),
  isCharging: z.boolean().nullish(),
  networkType: z.string().max(32).nullish(),
  simState: z.string().max(32).nullish(),
  fcmToken: z
    .string()
    .max(4096)
    .regex(/^[A-Za-z0-9_:.-]+$/, "Invalid push token.")
    .nullish(),
  appVersion: z.string().max(40).optional(),
  androidVersion: z.string().max(40).optional(),
});

export const deviceUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    trackingProfile: z.enum(TRACKING_PROFILES).optional(),
    offlineAlertMinutes: z.number().int().min(10).max(10_080).optional(),
    /**
     * E.164 number for best-effort SMS fallback from the Android app. An empty
     * string clears the saved number. The value is encrypted before storage.
     */
    fallbackSmsNumber: z
      .string()
      .trim()
      .max(20)
      .refine(
        (value) => value === "" || /^\+[1-9]\d{6,14}$/.test(value),
        "Use an international number in E.164 format, for example +447700900123.",
      )
      .optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.trackingProfile !== undefined ||
      value.offlineAlertMinutes !== undefined ||
      value.fallbackSmsNumber !== undefined,
    { message: "No changes supplied." },
  );

export const commandSchema = z
  .object({
    type: z.enum(COMMAND_TYPES),
    message: z.string().trim().min(1).max(200).optional(),
  })
  .refine((value) => value.type !== "MESSAGE" || Boolean(value.message), {
    message: "A message is required for MESSAGE commands.",
    path: ["message"],
  });

export const commandAckSchema = z.object({
  commandId: uuid,
  status: z.enum(["completed", "failed", "unsupported"]),
  result: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Photos are downscaled on-device and sent as base64 JPEG. The route cap keeps
 * a single upload below 1.5 MB of decoded image data.
 */
export const photoUploadSchema = z.object({
  commandId: uuid,
  capturedAt: z.string().datetime({ offset: true }),
  mimeType: z.literal("image/jpeg"),
  dataBase64: z
    .string()
    .min(400)
    .max(2_000_000)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Photo data must be base64."),
  width: z.number().int().min(1).max(5_000),
  height: z.number().int().min(1).max(5_000),
});

export const geofenceCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  centerLat: z.number().finite().min(-90).max(90),
  centerLon: z.number().finite().min(-180).max(180),
  radiusM: z.number().int().min(50).max(50_000),
  notifyOnEnter: z.boolean().default(true),
  notifyOnExit: z.boolean().default(true),
});

export const geofenceUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  centerLat: z.number().finite().min(-90).max(90).optional(),
  centerLon: z.number().finite().min(-180).max(180).optional(),
  radiusM: z.number().int().min(50).max(50_000).optional(),
  notifyOnEnter: z.boolean().optional(),
  notifyOnExit: z.boolean().optional(),
});

export const testEmailSchema = z.object({
  to: email.optional(),
});

export const locationQuerySchema = z.object({
  range: z.enum(["1h", "24h", "7d", "30d"]).default("24h"),
  limit: z.coerce.number().int().min(1).max(2500).default(1500),
});

export const liveLocationsQuerySchema = z.object({
  range: z.enum(["1h", "24h", "7d", "30d"]).default("24h"),
  since: z.string().datetime({ offset: true }).optional(),
});

const pkceChallenge = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, "Invalid PKCE challenge.");

const pkceVerifier = z
  .string()
  .regex(/^[A-Za-z0-9\-._~]{43,128}$/, "Invalid PKCE verifier.");

const pkceState = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16,128}$/, "Invalid link state.");

export const mobileLinkApproveSchema = z.object({
  deviceId: uuid,
  challenge: pkceChallenge,
  state: pkceState,
});

export const mobileExchangeSchema = z.object({
  code: z.string().min(20).max(200),
  verifier: pkceVerifier,
  state: pkceState,
});

export const mobileRefreshSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});

export const mobileLogoutSchema = z.object({
  refreshToken: z.string().min(20).max(200).optional(),
});

/**
 * MFA reset is a recovery action, not a password reset. The explicit literal
 * makes an accidental POST from a future client fail closed.
 */
export const mfaResetSchema = z.object({
  password: z.string().min(1).max(256),
  confirm: z.literal("RESET"),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type LocationPointInput = z.infer<typeof locationPointSchema>;
