const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route parameters reach Postgres as UUIDs; reject malformed values early. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
