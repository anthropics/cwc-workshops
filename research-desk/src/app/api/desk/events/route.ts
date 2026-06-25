// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { handle, queryParams } from "@/app/api/api-route";
import { getClient } from "@/lib/anthropic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Event history for any desk session (the head conversation, an analyst run, a
 * memo run). This is a single-operator console: the person in the browser is
 * the holder of the server's credential, so reads are intentionally not scoped
 * to orchestrator-created sessions (deployment runs and Console-created
 * sessions are legitimate things to inspect here).
 */
export async function GET(request: Request) {
  return handle("desk.events", async () => {
    const params = queryParams(request);
    const sessionId = params.session_id;
    if (!sessionId) return { error: "session_id is required" };
    const page = await getClient().beta.sessions.events.list(sessionId, { limit: Number(params.limit ?? 200) } as never);
    return { data: (page as { data?: unknown[] }).data ?? [] };
  });
}
