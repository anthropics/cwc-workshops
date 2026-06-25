// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

/**
 * Session helpers shared by the orchestrator and the API routes.
 *
 * The patterns the workshop teaches live here:
 *   - stream-first: open the event stream before sending the kickoff
 *   - outcomes: kick work off with user.define_outcome + a rubric
 *   - the idle gate: a session is only done when it goes idle for a reason
 *     other than requires_action (or terminates)
 *   - outputs: download files the agent wrote to /mnt/session/outputs/
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type Anthropic from "@anthropic-ai/sdk";

import { MANAGED_AGENTS_BETA } from "./anthropic";
import { OUTPUTS_DIR, sessionUrl } from "./config";

export interface SessionEventLike {
  id?: string;
  type?: string;
  name?: string;
  input?: unknown;
  content?: Array<{ type?: string; text?: string }>;
  stop_reason?: { type?: string };
  result?: string;
  iteration?: number;
  explanation?: string;
  error?: { type?: string };
}

export interface SessionRunResult {
  sessionId: string;
  status: string;
  outcomeResult: string;
  outcomeExplanation: string;
  finalMessage: string;
  url: string;
}

export function textOf(event: SessionEventLike): string {
  return (event.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .filter(Boolean)
    .join("\n");
}

export async function sendUserMessage(client: Anthropic, sessionId: string, text: string): Promise<void> {
  await client.beta.sessions.events.send(sessionId, {
    events: [{ type: "user.message", content: [{ type: "text", text }] }],
  });
}

export async function defineOutcome(
  client: Anthropic,
  sessionId: string,
  description: string,
  rubric: string,
  maxIterations = 2,
): Promise<void> {
  // TODO(workshop-6): kick the session off with an outcome instead of a plain message.
  //
  // An outcome means: describe what "done" looks like, attach a rubric, and the
  // platform's grader iterates the agent until the rubric is satisfied (or
  // max_iterations is hit). The description IS the task — no separate
  // user.message. Send exactly ONE event via
  // `await client.beta.sessions.events.send(sessionId, { events: [...] })`:
  //   {
  //     type: "user.define_outcome",
  //     description,
  //     rubric: { type: "text", content: rubric },
  //     max_iterations: maxIterations,
  //   }
  void client;
  void sessionId;
  void description;
  void rubric;
  void maxIterations;
  throw new Error("TODO(workshop-6): send the user.define_outcome event in defineOutcome");
}

/**
 * Open the stream, optionally run the kickoff, and consume events until the
 * session is terminal: terminated, or idle with a stop reason other than
 * requires_action. Pending client-side actions are the caller's job — handle
 * them in onEvent and the loop keeps going.
 */
export async function drainUntilIdle(
  client: Anthropic,
  sessionId: string,
  options: {
    kickoff?: () => Promise<void>;
    onEvent?: (event: SessionEventLike) => void | Promise<void>;
  } = {},
): Promise<SessionRunResult> {
  const result: SessionRunResult = {
    sessionId,
    status: "",
    outcomeResult: "",
    outcomeExplanation: "",
    finalMessage: "",
    url: sessionUrl(sessionId),
  };

  const stream = (await client.beta.sessions.events.stream(sessionId)) as AsyncIterable<SessionEventLike>;
  if (options.kickoff) await options.kickoff();

  for await (const event of stream) {
    if (options.onEvent) await options.onEvent(event);
    const type = event.type ?? "";

    if (type === "agent.message") {
      const text = textOf(event);
      if (text.trim()) result.finalMessage = text;
    } else if (type === "span.outcome_evaluation_end") {
      result.outcomeResult = event.result ?? "";
      result.outcomeExplanation = (event.explanation ?? "").slice(0, 2000);
    } else if (type === "session.status_terminated") {
      result.status = "terminated";
      break;
    } else if (type === "session.status_idle") {
      if (event.stop_reason?.type !== "requires_action") {
        result.status = "idle";
        break;
      }
    }
  }

  return result;
}

/** Download files the agent wrote to /mnt/session/outputs/ for this session. */
export async function downloadOutputs(
  client: Anthropic,
  sessionId: string,
  destDir: string,
): Promise<{ filename: string; path: string; bytes: Buffer }[]> {
  const page = await client.beta.files.list({ scope_id: sessionId, betas: [MANAGED_AGENTS_BETA] } as never);
  const files = (page as { data?: Array<{ id: string; filename: string }> }).data ?? [];
  const saved: { filename: string; path: string; bytes: Buffer }[] = [];
  if (files.length > 0) mkdirSync(destDir, { recursive: true });
  for (const file of files) {
    const response = await client.beta.files.download(file.id);
    const bytes = Buffer.from(await response.arrayBuffer());
    // Filenames come from the session container; keep only a safe basename.
    const rawName = file.filename.split(/[\\/]/).pop() ?? "";
    const baseName = rawName.replace(/[^A-Za-z0-9._-]/g, "_");
    if (!baseName || baseName === "." || baseName === "..") continue;
    const path = join(destDir, baseName);
    writeFileSync(path, bytes);
    saved.push({ filename: baseName, path, bytes });
  }
  return saved;
}

export const OUTPUTS_ROOT = OUTPUTS_DIR;
