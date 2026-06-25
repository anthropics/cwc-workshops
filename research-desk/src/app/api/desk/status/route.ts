// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { handle } from "@/app/api/api-route";
import {
  consoleUrl,
  isHelloProvisioned,
  isProvisioned,
  loadConfig,
  loadWatchlist,
  sessionUrl,
  type ConsoleResourceKind,
} from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ResourceLink {
  label: string;
  id: string;
  url: string;
}

export async function GET() {
  return handle("desk.status", async () => {
    const config = loadConfig();

    const link = (label: string, kind: ConsoleResourceKind, id: string): ResourceLink | null =>
      id ? { label, id, url: consoleUrl(kind, id) } : null;
    const resources: ResourceLink[] = [
      link("Environment", "environments", config.environment_id),
      link("Skill — edgartools manual", "skills", config.skill_id),
      link("Agent — financials extractor", "agents", config.financials_agent_id),
      link("Agent — risk analyst", "agents", config.risk_agent_id),
      link("Agent — filing analyst (coordinator)", "agents", config.analyst_agent_id),
      link("Agent — head of research", "agents", config.head_agent_id),
      link("Memory store — desk-memory", "memory-stores", config.memory_store_id),
      link("Head of research conversation", "sessions", config.head_session_id),
      link("Deployment — weekly memo", "deployments", config.deployment_id),
    ].filter((resource): resource is ResourceLink => resource !== null);

    return {
      provisioned: isProvisioned(config),
      hello_provisioned: isHelloProvisioned(config),
      config,
      resources,
      head_session_url: config.head_session_id ? sessionUrl(config.head_session_id) : null,
      watchlist: loadWatchlist(),
      credential_present: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
      edgar_identity_present: Boolean(process.env.EDGAR_IDENTITY || config.edgar_identity),
    };
  });
}
