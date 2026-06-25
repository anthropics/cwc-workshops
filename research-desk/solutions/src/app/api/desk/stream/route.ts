// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { getClient } from "@/lib/anthropic";
import { logEvent } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The browser keeps this open while a desk session is on screen.
export const maxDuration = 3600;

/** Proxy a session's live event stream to the browser as SSE. */
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id") ?? "";
  if (!sessionId) {
    return new Response(JSON.stringify({ error: "session_id is required" }), { status: 400 });
  }

  const client = getClient();
  let upstream: AsyncIterable<unknown>;
  try {
    upstream = (await client.beta.sessions.events.stream(sessionId)) as AsyncIterable<unknown>;
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 502 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of upstream) {
          if (request.signal.aborted) break;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
      } catch (error) {
        if (!request.signal.aborted) {
          logEvent("warning", "stream_proxy_error", { session_id: sessionId, error: String(error) });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
