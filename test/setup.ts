(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.APP_URL = "http://localhost:3000";
process.env.DATABASE_URL =
  "postgresql://beacon:password@localhost:5432/beacon_test";
process.env.AUTH_SECRET = "test-auth-secret-that-is-long-enough-for-validation";
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.CRON_SECRET = "test-cron-secret-that-is-long-enough";
process.env.EMAIL_PROVIDER_PRIORITY = "relay_first";
process.env.ALLOW_SIGNUPS = "true";
process.env.ENABLE_HIBP = "false";
process.env.EMAIL_DEV_LOG = "true";
process.env.EMAIL_FROM = "Beacon <no-reply@beacon.test>";
process.env.RELAY_API_BASE_URL = "https://relay.example.test";
process.env.RELAY_API_KEY = "relay-test-key";
process.env.RESEND_API_KEY = "";
process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT =
  "https://tiles.openfreemap.org/styles/positron";
process.env.NEXT_PUBLIC_MAP_STYLE_DARK =
  "https://tiles.openfreemap.org/styles/dark";
