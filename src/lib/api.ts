import "server-only";

import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";

import { logger } from "@/lib/logger";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  headers?: HeadersInit;

  constructor(
    status: number,
    code: string,
    message: string,
    options?: { details?: unknown; headers?: HeadersInit },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = options?.details;
    this.headers = options?.headers;
  }
}

const NO_STORE = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} satisfies HeadersInit;

export function ok<T>(data: T, init?: { status?: number; headers?: HeadersInit }) {
  return NextResponse.json(
    { ok: true, data },
    {
      status: init?.status ?? 200,
      headers: { ...NO_STORE, ...(init?.headers ?? {}) },
    },
  );
}

export function fail(
  status: number,
  code: string,
  message: string,
  options?: { details?: unknown; headers?: HeadersInit },
) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        ...(options?.details !== undefined
          ? { details: options.details }
          : {}),
      },
    },
    {
      status,
      headers: { ...NO_STORE, ...(options?.headers ?? {}) },
    },
  );
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return fail(error.status, error.code, error.message, {
      details: error.details,
      headers: error.headers,
    });
  }
  if (error instanceof ZodError) {
    return fail(422, "validation_error", "The request could not be validated.", {
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  logger.error("api", "Unhandled route error", error);
  return fail(500, "internal_error", "Something went wrong. Please try again.");
}

export async function parseJson<T>(
  request: Request,
  schema: ZodSchema<T>,
  options: { maxBytes?: number } = {},
): Promise<T> {
  const maxBytes = options.maxBytes ?? 64 * 1024;
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) {
    throw new ApiError(413, "payload_too_large", "Request body is too large.");
  }

  // Read with a hard cap. `request.text()` would buffer an unbounded chunked
  // body before the size check could run.
  const reader = request.body?.getReader();
  let text = "";
  if (reader) {
    const decoder = new TextDecoder();
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new ApiError(
            413,
            "payload_too_large",
            "Request body is too large.",
          );
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      reader.releaseLock();
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
  }
  return schema.parse(parsed);
}

export function assertMethod(
  request: Request,
  allowed: string[],
): void {
  if (!allowed.includes(request.method)) {
    throw new ApiError(405, "method_not_allowed", "Method not allowed.", {
      headers: { Allow: allowed.join(", ") },
    });
  }
}

export function assertContentType(request: Request): void {
  const header = request.headers.get("content-type") ?? "";
  const mediaType = header.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new ApiError(
      415,
      "unsupported_media_type",
      "Content-Type must be application/json.",
    );
  }
}
