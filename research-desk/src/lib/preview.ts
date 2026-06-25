// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

/**
 * Deployments are a research-preview surface and not yet covered by the SDK,
 * so these calls go straight to the REST API with the server credential.
 * Verify the paths, shapes, and beta header against the current Managed
 * Agents docs before relying on them.
 */

import { MANAGED_AGENTS_BETA, restAuthHeaders } from "./anthropic";
import { edgarIdentity, loadConfig, loadWatchlist } from "./config";
import { loadPrompt } from "./prompts";
import { MEMORY_MOUNT_INSTRUCTIONS } from "./analysis";

const BASE_URL = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";
const PREVIEW_BETA = process.env.MANAGED_AGENTS_PREVIEW_BETA ?? MANAGED_AGENTS_BETA;

export class UpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`upstream API error (${status})`);
  }
}

async function previewRequest(
  method: "GET" | "POST",
  path: string,
  options: { query?: Record<string, string>; body?: unknown } = {},
): Promise<unknown> {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
  const response = await fetch(url, {
    method,
    headers: {
      ...restAuthHeaders(PREVIEW_BETA),
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new UpstreamError(response.status, body);
  return body;
}

export function listDeployments(query: Record<string, string> = {}): Promise<unknown> {
  return previewRequest("GET", "/v1/deployments", { query });
}

export function listDeploymentRuns(query: Record<string, string> = {}): Promise<unknown> {
  return previewRequest("GET", "/v1/deployment_runs", { query });
}

export function runDeployment(deploymentId: string): Promise<unknown> {
  return previewRequest("POST", `/v1/deployments/${encodeURIComponent(deploymentId)}/run`, { body: {} });
}

/** Create the weekly desk-memo deployment from the provisioned resources. */
export async function createMemoDeployment(cron = "0 13 * * 1"): Promise<unknown> {
  const cfg = loadConfig();
  if (!cfg.analyst_agent_id || !cfg.environment_id || !cfg.memory_store_id) {
    throw new Error("the desk is not provisioned yet — open the Setup tab first");
  }
  const prompt = loadPrompt("memo_task.md", {
    watchlist: loadWatchlist().join(", "),
    edgar_identity: edgarIdentity(),
  });
  return previewRequest("POST", "/v1/deployments", {
    body: {
      name: "research-desk-weekly-memo",
      agent: cfg.analyst_agent_id,
      environment_id: cfg.environment_id,
      schedule: { type: "cron", expression: cron, timezone: "UTC" },
      resources: [
        {
          type: "memory_store",
          memory_store_id: cfg.memory_store_id,
          access: "read_write",
          instructions: MEMORY_MOUNT_INSTRUCTIONS,
        },
      ],
      initial_events: [{ type: "user.message", content: [{ type: "text", text: prompt }] }],
    },
  });
}
