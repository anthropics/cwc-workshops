// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { handle, queryParams } from "@/app/api/api-route";
import { listMemories, listVersions, showMemory } from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle("desk.memory", async () => {
    const params = queryParams(request);
    if (params.path) return { memory: await showMemory(params.path) };
    if (params.versions === "1") return { data: await listVersions() };
    return { data: await listMemories(params.prefix || "/") };
  });
}
