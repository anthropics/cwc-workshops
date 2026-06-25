// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { handle, queryParams, rejectCrossSite } from "@/app/api/api-route";
import { createMemoDeployment, listDeployments } from "@/lib/preview";
import { loadConfig, saveConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DeploymentLike {
  id?: string;
  name?: string;
}

/** Only the desk's own deployments — a workspace can have plenty of unrelated ones. */
export async function GET(request: Request) {
  return handle("deployments.list", async () => {
    const cfg = loadConfig();
    const response = (await listDeployments(queryParams(request))) as { data?: DeploymentLike[] };
    const data = (response.data ?? []).filter(
      (deployment) =>
        deployment.id === cfg.deployment_id || (deployment.name ?? "").startsWith("research-desk"),
    );
    return { ...response, data };
  });
}

/** Create the weekly desk-memo deployment (research-preview surface). */
export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  return handle("deployments.create", async () => {
    const body = (await request.json().catch(() => ({}))) as { cron?: string };
    const deployment = (await createMemoDeployment(body.cron?.trim() || undefined)) as { id?: string };
    if (deployment.id) {
      const cfg = loadConfig();
      cfg.deployment_id = deployment.id;
      saveConfig(cfg);
    }
    return deployment;
  });
}
