// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { handle, rejectCrossSite } from "@/app/api/api-route";
import { provisionDesk, provisionHello } from "@/lib/provision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** scope: "hello" creates the environment + the bare head agent (Act 1); "desk" staffs the full desk (Act 2). */
export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  return handle("desk.provision", async () => {
    const body = (await request.json().catch(() => ({}))) as { prefix?: string; scope?: string };
    const prefix = body.prefix?.trim() || "research-desk";
    return body.scope === "hello" ? provisionHello(prefix) : provisionDesk(prefix);
  });
}
