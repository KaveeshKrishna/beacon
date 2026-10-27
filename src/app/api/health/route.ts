import { sql } from "drizzle-orm";

import { db } from "@/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db().execute(sql`select 1`);
    return NextResponse.json(
      {
        status: "ok",
        service: "beacon",
        time: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "degraded", service: "beacon" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
