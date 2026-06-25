// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

/**
 * Server-side configuration: created resource ids (desk.json) and paths.
 *
 * The desk's Anthropic resources (agents, environment, skill, memory store)
 * are created once from the Setup tab and referenced by id afterwards — they
 * are persistent, versioned objects, not per-run state. desk.json holds those
 * ids plus the EDGAR identity; it contains no secrets.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const REPO_ROOT = process.cwd();
export const DATA_DIR = process.env.DESK_DATA_DIR ?? REPO_ROOT;
export const DESK_FILE = join(DATA_DIR, "desk.json");
export const OUTPUTS_DIR = join(DATA_DIR, "outputs");
export const PROMPTS_DIR = join(REPO_ROOT, "prompts");
export const SKILL_DIR = join(REPO_ROOT, "skills", "edgartools");
export const DEFAULT_WATCHLIST = join(REPO_ROOT, "watchlists", "semis.txt");

export const MODEL = "claude-opus-4-8";
export const DEFAULT_CONCURRENCY = Number(process.env.DESK_CONCURRENCY ?? 4);

export interface DeskConfig {
  edgar_identity: string;
  environment_id: string;
  memory_store_id: string;
  skill_id: string;
  skill_version: string;
  financials_agent_id: string;
  risk_agent_id: string;
  analyst_agent_id: string;
  head_agent_id: string;
  head_session_id: string;
  deployment_id: string;
}

const EMPTY: DeskConfig = {
  edgar_identity: "",
  environment_id: "",
  memory_store_id: "",
  skill_id: "",
  skill_version: "",
  financials_agent_id: "",
  risk_agent_id: "",
  analyst_agent_id: "",
  head_agent_id: "",
  head_session_id: "",
  deployment_id: "",
};

export function loadConfig(): DeskConfig {
  if (!existsSync(DESK_FILE)) return { ...EMPTY };
  try {
    const data = JSON.parse(readFileSync(DESK_FILE, "utf-8")) as Partial<DeskConfig>;
    return { ...EMPTY, ...data };
  } catch {
    return { ...EMPTY };
  }
}

export function saveConfig(config: DeskConfig): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DESK_FILE, JSON.stringify(config, null, 2) + "\n");
}

export function isProvisioned(config: DeskConfig): boolean {
  return Boolean(
    config.environment_id && config.memory_store_id && config.analyst_agent_id && config.head_agent_id,
  );
}

/** Act 1 state: there is an agent to chat with, but the desk isn't staffed yet. */
export function isHelloProvisioned(config: DeskConfig): boolean {
  return Boolean(config.environment_id && config.head_agent_id);
}

export function edgarIdentity(): string {
  const identity = (process.env.EDGAR_IDENTITY ?? "").trim() || loadConfig().edgar_identity;
  if (!identity) {
    throw new Error(
      'EDGAR_IDENTITY is not set — the SEC requires a contact identity ("Your Name you@example.com") on automated requests',
    );
  }
  return identity;
}

export function loadWatchlist(path?: string): string[] {
  const watchlistPath = path ?? DEFAULT_WATCHLIST;
  if (!existsSync(watchlistPath)) throw new Error(`watchlist not found: ${watchlistPath}`);
  return readFileSync(watchlistPath, "utf-8")
    .split("\n")
    .map((line) => line.trim().toUpperCase())
    .filter((line) => line && !line.startsWith("#"));
}

// Console deep links. Resources live under a workspace; set
// ANTHROPIC_WORKSPACE_SLUG if your key belongs to a workspace other than "default".
export const WORKSPACE_SLUG = (process.env.ANTHROPIC_WORKSPACE_SLUG ?? "default").trim() || "default";

export type ConsoleResourceKind =
  | "sessions"
  | "agents"
  | "environments"
  | "memory-stores"
  | "skills"
  | "deployments";

export function consoleUrl(kind: ConsoleResourceKind, id: string): string {
  return `https://platform.claude.com/workspaces/${WORKSPACE_SLUG}/${kind}/${id}`;
}

export function sessionUrl(sessionId: string): string {
  return consoleUrl("sessions", sessionId);
}
