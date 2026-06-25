// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

/** Types and small helpers shared by the browser components. */

export interface DeskStatus {
  provisioned: boolean;
  hello_provisioned: boolean;
  config: Record<string, string>;
  resources: Array<{ label: string; id: string; url: string }>;
  head_session_url: string | null;
  watchlist: string[];
  credential_present: boolean;
  edgar_identity_present: boolean;
}

export interface SessionEvent {
  id?: string;
  type?: string;
  name?: string;
  input?: unknown;
  content?: Array<{ type?: string; text?: string }>;
  stop_reason?: { type?: string };
  result?: string;
  error?: { type?: string };
}

export interface AnalysisRecordView {
  ticker: string;
  sessionId: string;
  url: string;
  status: "running" | "succeeded" | "failed";
  outcome: string;
  scorecard: Record<string, unknown> | null;
  problems: string[];
  error: string;
}

export interface DispatchView {
  id: string;
  tickers: string[];
  focus: string;
  status: "running" | "completed" | "failed";
  records: AnalysisRecordView[];
  startedAt: number;
  finishedAt: number | null;
  error: string;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status}: ${body.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

export function eventText(content: SessionEvent["content"]): string {
  return (content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n");
}

/** Consume an SSE response via fetch + reader, calling onEvent per parsed event. */
export async function consumeStream(
  path: string,
  onEvent: (event: SessionEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(path, { signal });
  if (!response.ok || !response.body) throw new Error(`stream failed: ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index: number;
    while ((index = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("");
      if (!data) continue;
      try {
        onEvent(JSON.parse(data) as SessionEvent);
      } catch {
        // ignore malformed frames
      }
    }
  }
}
