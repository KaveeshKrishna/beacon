export class ApiClientError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(
    message: string,
    options: { code: string; status: number; details?: unknown },
  ) {
    super(message);
    this.name = "ApiClientError";
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
  }
}

type Envelope<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: { code: string; message: string; details?: unknown };
    };

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (method !== "GET" && method !== "HEAD" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers,
    cache: "no-store",
  });

  let payload: Envelope<T> | null = null;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    // Non-JSON responses are treated as a generic failure below.
  }

  if (!payload) {
    throw new ApiClientError(
      response.ok
        ? "The server returned an unexpected response."
        : "The request failed. Try again.",
      { code: "invalid_response", status: response.status },
    );
  }

  if (!payload.ok) {
    throw new ApiClientError(payload.error.message, {
      code: payload.error.code,
      status: response.status,
      details: payload.error.details,
    });
  }

  return payload.data;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Try again.";
}
