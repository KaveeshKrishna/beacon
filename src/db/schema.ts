import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    role: text("role").notNull().default("user"),
    timezone: text("timezone").notNull().default("UTC"),

    totpSecretEnc: text("totp_secret_enc"),
    totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
    totpLastStep: integer("totp_last_step").notNull().default(0),
    emailMfaEnabled: boolean("email_mfa_enabled").notNull().default(false),
    recoveryCodesGeneratedAt: timestamp("recovery_codes_generated_at", {
      withTimezone: true,
    }),

    emailProviderPriority: text("email_provider_priority")
      .notNull()
      .default("default"),

    notifyGeofence: boolean("notify_geofence").notNull().default(true),
    notifyOffline: boolean("notify_offline").notNull().default(true),
    notifyLowBattery: boolean("notify_low_battery").notNull().default(true),
    notifySecurity: boolean("notify_security").notNull().default(true),

    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    passwordUpdatedAt: timestamp("password_updated_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("users_email_uq").on(table.email),
    index("users_created_idx").on(table.createdAt),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent").notNull().default(""),
    ipHash: text("ip_hash").notNull().default(""),
    mfaVerified: boolean("mfa_verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("sessions_token_uq").on(table.tokenHash),
    index("sessions_user_idx").on(table.userId),
    index("sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const pendingMfa = pgTable(
  "pending_mfa",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent").notNull().default(""),
    ipHash: text("ip_hash").notNull().default(""),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("pending_mfa_token_uq").on(table.tokenHash),
    index("pending_mfa_expiry_idx").on(table.expiresAt),
  ],
);

export const emailTokens = pgTable(
  "email_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    purpose: text("purpose").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("email_tokens_hash_uq").on(table.tokenHash),
    index("email_tokens_user_idx").on(table.userId),
  ],
);

export const emailCodes = pgTable(
  "email_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("email_codes_user_idx").on(table.userId)],
);

export const recoveryCodes = pgTable(
  "recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("recovery_codes_hash_uq").on(table.codeHash),
    index("recovery_codes_user_idx").on(table.userId),
  ],
);

export const pairingCodes = pgTable(
  "pairing_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("pairing_codes_hash_uq").on(table.codeHash),
    index("pairing_codes_user_idx").on(table.userId),
  ],
);

export type DeviceConfig = {
  offlineAlertMinutes: number;
};

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    manufacturer: text("manufacturer").notNull().default(""),
    model: text("model").notNull().default(""),
    androidVersion: text("android_version").notNull().default(""),
    appVersion: text("app_version").notNull().default(""),
    tokenHash: text("token_hash").notNull(),
    trackingProfile: text("tracking_profile").notNull().default("balanced"),
    status: text("status").notNull().default("active"),
    config: jsonb("config")
      .$type<DeviceConfig>()
      .notNull()
      .default(sql`'{"offlineAlertMinutes":45}'::jsonb`),
    fcmTokenEnc: text("fcm_token_enc"),
    fallbackSmsEnc: text("fallback_sms_enc"),
    batteryLevel: integer("battery_level"),
    isCharging: boolean("is_charging"),
    networkType: text("network_type"),
    simState: text("sim_state"),
    lostModeAt: timestamp("lost_mode_at", { withTimezone: true }),
    pairedAt: timestamp("paired_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    lastLocationAt: timestamp("last_location_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("devices_token_uq").on(table.tokenHash),
    index("devices_user_idx").on(table.userId),
    index("devices_last_seen_idx").on(table.lastSeenAt),
  ],
);

export const locations = pgTable(
  "locations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    clientPointId: uuid("client_point_id").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    accuracyM: real("accuracy_m").notNull(),
    altitudeM: real("altitude_m"),
    speedMps: real("speed_mps"),
    headingDeg: real("heading_deg"),
    batteryLevel: integer("battery_level"),
    isCharging: boolean("is_charging"),
    provider: text("provider").notNull().default("unknown"),
    networkType: text("network_type"),
    isMocked: boolean("is_mocked").notNull().default(false),
    sequence: bigint("sequence", { mode: "number" }).notNull().default(0),
  },
  (table) => [
    uniqueIndex("locations_device_point_uq").on(
      table.deviceId,
      table.clientPointId,
    ),
    index("locations_device_time_idx").on(table.deviceId, table.recordedAt),
    index("locations_received_idx").on(table.receivedAt),
  ],
);

export const geofences = pgTable(
  "geofences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    centerLat: doublePrecision("center_lat").notNull(),
    centerLon: doublePrecision("center_lon").notNull(),
    radiusM: integer("radius_m").notNull(),
    notifyOnEnter: boolean("notify_on_enter").notNull().default(true),
    notifyOnExit: boolean("notify_on_exit").notNull().default(true),
    lastInside: boolean("last_inside"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("geofences_device_idx").on(table.deviceId)],
);

export const geofenceEvents = pgTable(
  "geofence_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    geofenceId: uuid("geofence_id")
      .notNull()
      .references(() => geofences.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    locationId: bigint("location_id", { mode: "number" }),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("geofence_events_device_idx").on(table.deviceId, table.occurredAt),
  ],
);

export type CommandPayload = {
  message?: string;
  [key: string]: unknown;
};

export const commands = pgTable(
  "commands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload")
      .$type<CommandPayload>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: text("status").notNull().default("pending"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("commands_device_status_idx").on(table.deviceId, table.status),
    index("commands_expiry_idx").on(table.expiresAt),
  ],
);

export const devicePhotos = pgTable(
  "device_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    commandId: uuid("command_id").references(() => commands.id, {
      onDelete: "set null",
    }),
    mimeType: text("mime_type").notNull().default("image/jpeg"),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    byteSize: integer("byte_size").notNull(),
    dataEnc: text("data_enc").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("device_photos_device_idx").on(table.deviceId, table.capturedAt),
    index("device_photos_created_idx").on(table.createdAt),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_user_idx").on(table.userId, table.createdAt),
    index("audit_created_idx").on(table.createdAt),
  ],
);

export const emailLogs = pgTable(
  "email_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    toEmail: text("to_email").notNull(),
    template: text("template").notNull(),
    provider: text("provider").notNull(),
    status: text("status").notNull(),
    providerMessageId: text("provider_message_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("email_logs_created_idx").on(table.createdAt),
    index("email_logs_user_idx").on(table.userId),
  ],
);

export const deviceAlertState = pgTable("device_alert_state", {
  deviceId: uuid("device_id")
    .primaryKey()
    .references(() => devices.id, { onDelete: "cascade" }),
  lowBatteryAt: timestamp("low_battery_at", { withTimezone: true }),
  offlineAt: timestamp("offline_at", { withTimezone: true }),
  simChangeAt: timestamp("sim_change_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.key, table.windowStart] }),
    index("rate_limits_window_idx").on(table.windowStart),
  ],
);

export type User = typeof users.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type LocationRow = typeof locations.$inferSelect;
export type Geofence = typeof geofences.$inferSelect;
export type Command = typeof commands.$inferSelect;
export type EmailLog = typeof emailLogs.$inferSelect;
