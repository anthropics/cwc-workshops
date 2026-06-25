// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

/**
 * The map step: one analyst session per ticker, run as a graded outcome,
 * fanned out with bounded concurrency. Runs entirely in the server.
 */

import { join } from "node:path";

import type Anthropic from "@anthropic-ai/sdk";

import { DEFAULT_CONCURRENCY, OUTPUTS_DIR, edgarIdentity, loadConfig, sessionUrl, type DeskConfig } from "./config";
import { logEvent } from "./logger";
import { loadPrompt } from "./prompts";
import { validateScorecard, type Scorecard } from "./scorecard";
import { defineOutcome, downloadOutputs, drainUntilIdle } from "./sessions";

export const MEMORY_MOUNT_INSTRUCTIONS =
  "The desk's shared research memory. Before analyzing a company, read your prior notes for it under " +
  "/companies/<TICKER>/ if any exist. After analyzing, write or update one note per filing at " +
  "/companies/<TICKER>/<fiscal-period>-<form>.md using the note template from your instructions.";

// Tickers come from user input and from the head agent's tool calls, and they
// become directory names under outputs/ — accept only plausible symbols.
export const TICKER_PATTERN = /^[A-Z][A-Z0-9.-]{0,9}$/;

export interface AnalysisRecord {
  ticker: string;
  sessionId: string;
  url: string;
  status: "running" | "succeeded" | "failed";
  outcome: string;
  scorecard: Scorecard | null;
  problems: string[];
  error: string;
  startedAt: number;
  finishedAt: number | null;
}

function newRecord(ticker: string): AnalysisRecord {
  return {
    ticker: ticker.toUpperCase(),
    sessionId: "",
    url: "",
    status: "running",
    outcome: "",
    scorecard: null,
    problems: [],
    error: "",
    startedAt: Date.now(),
    finishedAt: null,
  };
}

/**
 * Create one analyst session for a ticker, run the scorecard outcome to
 * completion, download and validate its scorecard. Mutates and returns the
 * record so callers can expose live progress.
 */
export async function analyzeTicker(
  client: Anthropic,
  cfg: DeskConfig,
  ticker: string,
  focus = "",
  record: AnalysisRecord = newRecord(ticker),
): Promise<AnalysisRecord> {
  try {
    if (!TICKER_PATTERN.test(record.ticker)) {
      throw new Error(`invalid ticker format: ${record.ticker}`);
    }
    // Memory isn't a separate API the agent calls — it's a resource the session
    // is born with, mounted as a filesystem.
    const session = await client.beta.sessions.create({
      agent: cfg.analyst_agent_id,
      environment_id: cfg.environment_id,
      title: `Filing analysis: ${record.ticker}`,
      metadata: { ticker: record.ticker, kind: "analysis" },
      resources: [
        {
          type: "memory_store",
          memory_store_id: cfg.memory_store_id,
          access: "read_write",
          instructions: MEMORY_MOUNT_INSTRUCTIONS,
        },
      ],
    } as never);
    record.sessionId = session.id;
    record.url = sessionUrl(session.id);
    logEvent("info", "analysis_started", { ticker: record.ticker, session_id: session.id });

    const description = loadPrompt("analyze_task.md", {
      ticker: record.ticker,
      focus: focus || "general fundamentals and risk",
      edgar_identity: edgarIdentity(),
    });
    const rubric = loadPrompt("analyze_rubric.md", { ticker: record.ticker });

    const result = await drainUntilIdle(client, session.id, {
      kickoff: () => defineOutcome(client, session.id, description, rubric),
    });
    record.outcome = result.outcomeResult || result.status;

    let outputs = await downloadOutputs(client, session.id, join(OUTPUTS_DIR, record.ticker));
    if (outputs.length === 0) {
      // Output indexing can lag the idle event by a couple of seconds.
      await new Promise((resolve) => setTimeout(resolve, 3000));
      outputs = await downloadOutputs(client, session.id, join(OUTPUTS_DIR, record.ticker));
    }

    const scorecardFile = outputs.find((file) => file.filename === "scorecard.json");
    if (!scorecardFile) {
      record.problems.push("no scorecard.json in session outputs");
      record.status = "failed";
      return record;
    }

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(scorecardFile.bytes.toString("utf-8"));
    } catch {
      record.problems.push("scorecard.json is not valid JSON");
    }
    const { scorecard, problems } = validateScorecard(parsed);
    record.problems.push(...problems);
    record.scorecard = scorecard;
    record.status = scorecard ? "succeeded" : "failed";
    return record;
  } catch (error) {
    record.error = error instanceof Error ? error.message : String(error);
    record.status = "failed";
    logEvent("error", "analysis_failed", { ticker: record.ticker, error: record.error });
    return record;
  } finally {
    record.finishedAt = Date.now();
  }
}

/** Fan out analyst sessions with bounded concurrency. */
export async function analyzeMany(
  client: Anthropic,
  cfg: DeskConfig,
  tickers: string[],
  options: {
    focus?: string;
    concurrency?: number;
    records?: AnalysisRecord[];
    onProgress?: (record: AnalysisRecord) => void;
  } = {},
): Promise<AnalysisRecord[]> {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const records = options.records ?? tickers.map((ticker) => newRecord(ticker));

  // The fan-out: sessions are cheap to run in parallel — the ceiling is ours
  // to set. A simple worker pool over a shared index keeps at most
  // `concurrency` analyses in flight.
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, records.length) }, async () => {
    while (nextIndex < records.length) {
      const record = records[nextIndex++];
      await analyzeTicker(client, cfg, record.ticker, options.focus ?? "", record);
      options.onProgress?.(record);
    }
  });
  await Promise.all(workers);
  return records;
}

/** The payload returned to the head-of-research agent as the custom-tool result. */
export function compileDispatchResult(records: AnalysisRecord[]): string {
  return JSON.stringify(
    {
      scorecards: records.filter((record) => record.scorecard).map((record) => record.scorecard),
      failures: records
        .filter((record) => !record.scorecard)
        .map((record) => ({
          ticker: record.ticker,
          error: record.error || record.problems.join("; ") || "no scorecard produced",
        })),
      memory_note_paths: records
        .map((record) => record.scorecard?.memory_note_path ?? "")
        .filter(Boolean),
    },
    null,
    2,
  );
}

export function makeRecords(tickers: string[]): AnalysisRecord[] {
  return tickers.map((ticker) => newRecord(ticker));
}

export function loadDeskConfigOrThrow(): DeskConfig {
  const cfg = loadConfig();
  if (!cfg.analyst_agent_id || !cfg.environment_id || !cfg.memory_store_id || !cfg.head_agent_id) {
    throw new Error("the desk is not provisioned yet — open the Setup tab and provision it first");
  }
  return cfg;
}
