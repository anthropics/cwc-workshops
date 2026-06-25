// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

/**
 * The server-held Anthropic client.
 *
 * The Research Desk runs as a long-lived server that orchestrates work on its
 * own — fan-outs keep running with the browser closed — so the credential
 * lives in the server's environment rather than in the browser:
 * ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN (sk-ant-oat0… bearer tokens), or
 * Workload Identity Federation variables, all resolved by the SDK.
 */

import Anthropic from "@anthropic-ai/sdk";

const OAUTH_TOKEN_PREFIX = "sk-ant-oat0";

export function isOAuthToken(credential: string): boolean {
  return credential.startsWith(OAUTH_TOKEN_PREFIX);
}

let cached: Anthropic | null = null;

export function getClient(): Anthropic {
  if (cached) return cached;
  const baseURL = process.env.ANTHROPIC_BASE_URL;
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN ?? "";

  if (authToken || isOAuthToken(apiKey)) {
    cached = new Anthropic({ apiKey: null, authToken: authToken || apiKey, baseURL });
  } else if (apiKey) {
    cached = new Anthropic({ apiKey, baseURL });
  } else {
    // No explicit credential: let the SDK resolve WIF env vars or a CLI profile.
    cached = new Anthropic({ baseURL });
  }
  return cached;
}

/** Raw credential headers for the research-preview REST calls (deployments, skills upload). */
export function restAuthHeaders(extraBeta: string): Record<string, string> {
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN ?? "";
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  const credential = authToken || apiKey;
  if (!credential) {
    throw new Error("set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN on the server for this operation");
  }
  if (isOAuthToken(credential)) {
    return { authorization: `Bearer ${credential}`, "anthropic-beta": `oauth-2025-04-20,${extraBeta}` };
  }
  return { "x-api-key": credential, "anthropic-beta": extraBeta };
}

export const MANAGED_AGENTS_BETA = "managed-agents-2026-04-01";
export const SKILLS_BETA = "skills-2025-10-02";
