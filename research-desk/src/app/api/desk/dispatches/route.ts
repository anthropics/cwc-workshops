// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { handle } from "@/app/api/api-route";
import { orchestrator } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live progress of dispatch fan-outs (and single-ticker analyses), powering the progress panel. */
export async function GET() {
  return handle("desk.dispatches", async () => ({ data: orchestrator.listDispatches() }));
}
