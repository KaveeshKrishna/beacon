type LogMetadata = Record<string, unknown>;

function emit(
  level: "info" | "warn" | "error",
  scope: string,
  message: string,
  metadata?: LogMetadata,
) {
  const payload = {
    level,
    scope,
    message,
    timestamp: new Date().toISOString(),
    ...(metadata ? { metadata } : {}),
  };
  if (process.env.NODE_ENV === "production") {
    const line = JSON.stringify(payload);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  } else {
    const suffix = metadata ? ` ${JSON.stringify(metadata)}` : "";
    const line = `[${level}] ${scope} — ${message}${suffix}`;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }
}

export const logger = {
  info: (scope: string, message: string, metadata?: LogMetadata) =>
    emit("info", scope, message, metadata),
  warn: (scope: string, message: string, metadata?: LogMetadata) =>
    emit("warn", scope, message, metadata),
  error: (
    scope: string,
    message: string,
    error?: unknown,
    metadata?: LogMetadata,
  ) =>
    emit("error", scope, message, {
      ...metadata,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : error
            ? String(error)
            : undefined,
    }),
};
