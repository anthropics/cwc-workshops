// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { handle, rejectCrossSite } from "@/app/api/api-route";
import { orchestrator } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Send a message to the head of research (creating the durable head session if needed). */
export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  return handle("desk.chat.send", async () => {
    const body = (await request.json().catch(() => ({}))) as { text?: string };
    const text = (body.text ?? "").trim();
    if (!text) return { error: "empty message" };
    const sessionId = await orchestrator.sendToHead(text);
    return { session_id: sessionId };
  });
}

/** The head session id (and watcher), without sending anything. */
export async function GET() {
  return handle("desk.chat.session", async () => {
    const sessionId = await orchestrator.ensureHeadSession();
    return { session_id: sessionId };
  });
}
