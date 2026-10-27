import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { getEnv } from "@/lib/env";
import * as schema from "@/db/schema";

let instance: ReturnType<typeof createDb> | null = null;

function createDb() {
  const sql = neon(getEnv().DATABASE_URL);
  return drizzle(sql, { schema });
}

/**
 * Lazily constructs the database client so that `next build` can run without
 * a live database connection. Queries still fail loudly if the URL is wrong.
 */
export function db() {
  if (!instance) instance = createDb();
  return instance;
}

export type Db = ReturnType<typeof db>;
export { schema };
