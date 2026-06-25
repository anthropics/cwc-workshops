// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

/**
 * Provisioning of the desk's Anthropic resources, run from the Setup tab.
 *
 * Two stages, matching the workshop:
 *   - provisionHello (Act 1): the environment plus the head-of-research agent
 *     with nothing but a system prompt — just enough to say hello to.
 *   - provisionDesk (Act 2): the edgartools skill, the two specialists, the
 *     analyst coordinator, and the memory store — and the SAME head agent is
 *     updated in place (a new version) to gain its full prompt and the
 *     dispatch_analysts custom tool.
 *
 * Everything is persistent and versioned; ids are written to desk.json.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { getClient, restAuthHeaders, SKILLS_BETA } from "./anthropic";
import { MODEL, SKILL_DIR, edgarIdentity, loadConfig, saveConfig, type DeskConfig } from "./config";
import { logEvent } from "./logger";
import { loadPrompt } from "./prompts";

const ALLOWED_HOSTS = [
  // SEC EDGAR
  "www.sec.gov",
  "efts.sec.gov",
  "data.sec.gov",
  // package installs at session start
  "pypi.org",
  "files.pythonhosted.org",
];

// TODO(workshop-4): define the head of research's custom tool.
//
// A custom tool is a contract, not code: the platform never executes it — when
// the head calls it, the session goes idle with requires_action and THIS
// SERVER (Act 5, the orchestrator) supplies the result. Replace `null` with an
// object of exactly this shape:
//
//   {
//     type: "custom",
//     name: "dispatch_analysts",
//     description: "<tell the head WHEN to use it: fresh, validated scorecards for tickers the desk has no
//                    current notes on in memory; each analyst also writes a research note to the shared
//                    memory; not for companies whose notes already answer the question>",
//     input_schema: {
//       type: "object",
//       properties: {
//         tickers: { type: "array", items: { type: "string" }, description: "Tickers to analyze, one analyst per ticker" },
//         focus: { type: "string", description: "Optional angle for the analysts to emphasize" },
//       },
//       required: ["tickers"],
//     },
//   }
const DISPATCH_TOOL: Record<string, unknown> | null = null;

const AGENT_TOOLSET = {
  type: "agent_toolset_20260401",
  default_config: { enabled: true, permission_policy: { type: "always_allow" } },
  configs: [
    { name: "web_fetch", enabled: false },
    { name: "web_search", enabled: false },
  ],
};

/**
 * Upload skills/edgartools as a custom Skill via the Skills API (multipart).
 * Returns { skillId, version }.
 */
async function uploadSkill(displayTitle: string): Promise<{ skillId: string; version: string }> {
  const baseUrl = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";
  const form = new FormData();
  form.set("display_title", displayTitle);

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  for (const filePath of walk(SKILL_DIR)) {
    // The Skills API requires the upload folder to match the `name` in SKILL.md.
    const relativePath = `edgartools-sec-data/${relative(SKILL_DIR, filePath).replaceAll("\\", "/")}`;
    form.append("files[]", new Blob([readFileSync(filePath)]), relativePath);
  }

  const response = await fetch(`${baseUrl}/v1/skills`, {
    method: "POST",
    headers: { ...restAuthHeaders(SKILLS_BETA), "anthropic-version": "2023-06-01" },
    body: form,
  });
  const body = (await response.json().catch(() => ({}))) as { id?: string; latest_version?: string | number };
  if (!response.ok) {
    throw new Error(`skill upload failed (${response.status}): ${JSON.stringify(body).slice(0, 400)}`);
  }
  return { skillId: body.id ?? "", version: String(body.latest_version ?? "latest") };
}

export interface ProvisionStep {
  step: string;
  id: string;
}

// Used by the workshop stubs below: fails at runtime, satisfies the type checker.
function todoStub(message: string): { id: string } {
  throw new Error(message);
}

/**
 * Act 1: just enough desk to say hello to — the environment and the head of
 * research with a plain system prompt. The same agent is upgraded in
 * provisionDesk; its id never changes.
 */
export async function provisionHello(agentPrefix = "research-desk"): Promise<{ config: DeskConfig; steps: ProvisionStep[] }> {
  const client = getClient();
  const cfg = loadConfig();
  const steps: ProvisionStep[] = [];

  if (!cfg.environment_id) {
    const environment = await client.beta.environments.create({
      name: `${agentPrefix}-env`,
      config: {
        type: "cloud",
        networking: {
          type: "limited",
          allowed_hosts: ALLOWED_HOSTS,
          allow_package_managers: true,
          allow_mcp_servers: false,
        },
        packages: { type: "packages", pip: ["edgartools", "pandas"] },
      },
    } as never);
    cfg.environment_id = environment.id;
  }
  steps.push({ step: "environment", id: cfg.environment_id });

  if (!cfg.head_agent_id) {
    const head = await client.beta.agents.create({
      name: `${agentPrefix}-head-of-research`,
      model: MODEL,
      system: loadPrompt("head_hello_system.md"),
      tools: [AGENT_TOOLSET],
    } as never);
    cfg.head_agent_id = head.id;
  }
  steps.push({ step: "head of research (version 1 — prompt only)", id: cfg.head_agent_id });

  saveConfig(cfg);
  logEvent("info", "desk_hello_provisioned", { steps });
  return { config: cfg, steps };
}

/**
 * Act 2: staff the desk. Creates the skill, the specialists, the analyst
 * coordinator, and the memory store, then UPDATES the existing head-of-research
 * agent (a new version of the same agent) with its full prompt and the
 * dispatch_analysts custom tool.
 */
export async function provisionDesk(agentPrefix = "research-desk"): Promise<{ config: DeskConfig; steps: ProvisionStep[] }> {
  const client = getClient();
  const cfg = loadConfig();
  cfg.edgar_identity = edgarIdentity();
  const steps: ProvisionStep[] = [];

  if (!cfg.environment_id || !cfg.head_agent_id) {
    throw new Error("create your agent first (Setup → Say hello) — staffing the desk upgrades that same agent");
  }

  const skill = await uploadSkill("edgartools — SEC EDGAR data access");
  cfg.skill_id = skill.skillId;
  cfg.skill_version = skill.version;
  steps.push({ step: "skill", id: skill.skillId });

  const skillsRef = [{ type: "custom", skill_id: cfg.skill_id, version: "latest" }];

  const financials = await client.beta.agents.create({
    name: `${agentPrefix}-financials-extractor`,
    model: MODEL,
    system: loadPrompt("financials_specialist_system.md", { edgar_identity: cfg.edgar_identity }),
    tools: [AGENT_TOOLSET],
    skills: skillsRef,
  } as never);
  cfg.financials_agent_id = financials.id;
  steps.push({ step: "financials specialist", id: financials.id });

  const risk = await client.beta.agents.create({
    name: `${agentPrefix}-risk-analyst`,
    model: MODEL,
    system: loadPrompt("risk_specialist_system.md", { edgar_identity: cfg.edgar_identity }),
    tools: [AGENT_TOOLSET],
    skills: skillsRef,
  } as never);
  cfg.risk_agent_id = risk.id;
  steps.push({ step: "risk specialist", id: risk.id });

  // TODO(workshop-3): create the filing analyst as a multiagent coordinator.
  //
  // A "sub-agent" is just another agent listed on its coordinator's roster.
  // Replace the stub with `await client.beta.agents.create({ ... } as never)`,
  // passing exactly:
  //   name: `${agentPrefix}-filing-analyst`,
  //   model: MODEL,
  //   system: loadPrompt("analyst_system.md", { edgar_identity: cfg.edgar_identity }),
  //   tools: [AGENT_TOOLSET],
  //   skills: skillsRef,                     // the edgartools manual uploaded above
  //   multiagent: {
  //     type: "coordinator",
  //     agents: [
  //       { type: "agent", id: financials.id },
  //       { type: "agent", id: risk.id },
  //       { type: "self" },
  //     ],
  //   },
  const analyst = todoStub("TODO(workshop-3): create the filing-analyst coordinator agent in src/lib/provision.ts");
  cfg.analyst_agent_id = analyst.id;
  steps.push({ step: "filing analyst (coordinator)", id: analyst.id });

  const memoryStore = await client.beta.memoryStores.create({
    name: "desk-memory",
    description:
      "The research desk's accumulated knowledge: one note per company per filing under /companies/<TICKER>/, " +
      "plus desk-level memos under /memos/. Read before re-analyzing a company; notes persist across sessions.",
  } as never);
  cfg.memory_store_id = memoryStore.id;
  steps.push({ step: "memory store", id: memoryStore.id });

  // The SAME agent you said hello to gets promoted: agents are versioned, and
  // updates require the current version (optimistic concurrency).
  if (DISPATCH_TOOL === null) {
    throw new Error("TODO(workshop-4): define DISPATCH_TOOL at the top of src/lib/provision.ts");
  }
  const currentHead = (await client.beta.agents.retrieve(cfg.head_agent_id)) as { version?: number };
  const headUpdate = await client.beta.agents.update(cfg.head_agent_id, {
    version: currentHead.version ?? 1,
    system: loadPrompt("head_system.md"),
    tools: [AGENT_TOOLSET, DISPATCH_TOOL],
  } as never);
  steps.push({ step: "head of research (updated — full prompt + dispatch tool)", id: (headUpdate as { id?: string }).id ?? cfg.head_agent_id });

  cfg.head_session_id = ""; // the next conversation starts fresh so it can mount the new memory store
  saveConfig(cfg);
  logEvent("info", "desk_provisioned", { steps });
  return { config: cfg, steps };
}
