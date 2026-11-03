import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Temporary release bridge: production was deployed before 0004 was applied.
// This runs only for a Vercel production build and only while the marker file
// exists. It is removed immediately after the schema is migrated.
if (process.env.VERCEL_ENV !== "production") {
  console.log("Skipping production migration: not a Vercel production build.");
  process.exit(0);
}
if (!existsSync("MIGRATE_0004")) {
  console.log("Skipping production migration: marker file is absent.");
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set; cannot apply migrations.");
  process.exit(1);
}

console.log("Applying pending database migrations for production...");
const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["drizzle-kit", "migrate"],
  { stdio: "inherit", env: process.env },
);
process.exit(result.status ?? 1);
