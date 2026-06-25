// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

/** Structured one-line JSON logs to stdout (visible in `next dev` / docker logs). */

const SENSITIVE_KEYS = new Set(["x-api-key", "api_key", "apikey", "authorization", "authorization_token"]);

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        SENSITIVE_KEYS.has(key.toLowerCase()) ? "<redacted>" : scrub(val),
      ]),
    );
  }
  return value;
}

export function logEvent(level: "info" | "warning" | "error", event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: Date.now() / 1000, level, event, ...(scrub(fields) as Record<string, unknown>) });
  if (level === "error") console.error(line);
  else console.log(line);
}
