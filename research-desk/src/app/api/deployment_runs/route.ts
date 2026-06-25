// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { handle, queryParams } from "@/app/api/api-route";
import { listDeploymentRuns } from "@/lib/preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle("deployment_runs.list", () => listDeploymentRuns(queryParams(request)));
}
