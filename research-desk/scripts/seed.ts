// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

/**
 * Presenter seed: run one or two analyst sessions ahead of the workshop so the
 * Scorecards table, the desk memory, and a finished session in the Console all
 * have something to show before the first live run.
 *
 *   npm run seed                       # analyzes NVDA
 *   npm run seed -- NVDA AMD           # analyzes several tickers (sequentially)
 *   npm run seed -- NVDA AMD --reset   # …then restores the workshop stubs and
 *                                      # blanks the head conversation, ready to present
 *
 * --reset is the "night before" mode: after seeding it clears head_session_id
 * in desk.json (so the live chat starts a fresh conversation in front of the room) and
 * restores this directory from git (`git checkout HEAD -- .` plus `git clean -fd src`)
 * — DISCARDING any uncommitted code changes — while desk.json and outputs/
 * survive because they are gitignored.
 *
 * Presenter tooling — intentionally self-contained (it does not call the
 * library code the workshop TODOs stub out), so it works on a fresh checkout
 * before any TODO is filled in. It needs a provisioned desk (desk.json) and
 * the same env vars the server uses; .env.local is read automatically.
 * Scorecards land in outputs/<TICKER>/scorecard.json, which the Scorecards tab
 * also reads, so seeded rows survive server restarts.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Load .env.local the same way `next dev` would, before importing the libs.
const envFile = join(process.cwd(), ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

const MEMORY_INSTRUCTIONS =
  "The desk's shared research memory. Before analyzing a company, read your prior notes for it under " +
  "/companies/<TICKER>/ if any exist. After analyzing, write or update one note per filing at " +
  "/companies/<TICKER>/<fiscal-period>-<form>.md using the note template from your instructions.";

async function main(): Promise<void> {
  const { getClient, MANAGED_AGENTS_BETA } = await import("../src/lib/anthropic");
  const { DESK_FILE, OUTPUTS_DIR, edgarIdentity, loadConfig, saveConfig, sessionUrl } = await import("../src/lib/config");
  const { loadPrompt } = await import("../src/lib/prompts");
  const { validateScorecard } = await import("../src/lib/scorecard");

  const cfg = loadConfig();
  if (!cfg.analyst_agent_id || !cfg.environment_id || !cfg.memory_store_id) {
    throw new Error("the desk is not provisioned yet — provision it first (Setup tab), then seed");
  }
  const client = getClient();
  const args = process.argv.slice(2);
  const reset = args.includes("--reset");
  const tickers = args.filter((arg) => !arg.startsWith("--")).map((ticker) => ticker.toUpperCase());
  if (tickers.length === 0) tickers.push("NVDA");

  // One analyst session per ticker, all in flight at once — each takes several
  // minutes, so seeding two or three tickers costs the same wall clock as one.
  const seedTicker = async (ticker: string): Promise<string> => {
    const session = await client.beta.sessions.create({
      agent: cfg.analyst_agent_id,
      environment_id: cfg.environment_id,
      title: `Filing analysis: ${ticker}`,
      metadata: { ticker, kind: "analysis" },
      resources: [
        {
          type: "memory_store",
          memory_store_id: cfg.memory_store_id,
          access: "read_write",
          instructions: MEMORY_INSTRUCTIONS,
        },
      ],
    } as never);
    console.log(`  ${ticker.padEnd(6)} session started — ${sessionUrl(session.id)}`);

    const stream = (await client.beta.sessions.events.stream(session.id)) as AsyncIterable<{
      type?: string;
      result?: string;
      stop_reason?: { type?: string };
    }>;
    await client.beta.sessions.events.send(session.id, {
      events: [
        {
          type: "user.define_outcome",
          description: loadPrompt("analyze_task.md", {
            ticker,
            focus: "general fundamentals and risk",
            edgar_identity: edgarIdentity(),
          }),
          rubric: { type: "text", content: loadPrompt("analyze_rubric.md", { ticker }) },
          max_iterations: 2,
        },
      ],
    });

    let outcome = "";
    for await (const event of stream) {
      if (event.type === "span.outcome_evaluation_end") outcome = event.result ?? "";
      if (event.type === "session.status_terminated") break;
      if (event.type === "session.status_idle" && event.stop_reason?.type !== "requires_action") break;
    }

    const page = await client.beta.files.list({ scope_id: session.id, betas: [MANAGED_AGENTS_BETA] } as never);
    const files = (page as { data?: Array<{ id: string; filename: string }> }).data ?? [];
    const scorecardFile = files.find((file) => file.filename.endsWith("scorecard.json"));
    if (!scorecardFile) {
      process.exitCode = 1;
      return `${ticker.padEnd(6)} FAILED (${outcome || "idle"}) — the session produced no scorecard.json`;
    }
    const response = await client.beta.files.download(scorecardFile.id);
    const bytes = Buffer.from(await response.arrayBuffer());
    const { scorecard, problems } = validateScorecard(JSON.parse(bytes.toString("utf-8")));
    const destDir = join(OUTPUTS_DIR, ticker);
    mkdirSync(destDir, { recursive: true });
    writeFileSync(join(destDir, "scorecard.json"), bytes);
    if (!scorecard) {
      process.exitCode = 1;
      return `${ticker.padEnd(6)} saved but failed validation: ${problems.join("; ")}`;
    }
    return `${ticker.padEnd(6)} ${outcome || "idle"} — outputs/${ticker}/scorecard.json — ${scorecard.one_line_thesis}`;
  };

  console.log(`\nSeeding ${tickers.join(", ")} in parallel — this takes several minutes…`);
  const summaries = await Promise.all(
    tickers.map((ticker) =>
      seedTicker(ticker).catch((error) => {
        process.exitCode = 1;
        return `${ticker.padEnd(6)} FAILED — ${error instanceof Error ? error.message : String(error)}`;
      }),
    ),
  );
  console.log("");
  for (const summary of summaries) console.log(`  ${summary}`);
  console.log("\nDone. The Scorecards tab shows these rows, and the memory notes are in the Memory tab.");

  if (!reset) {
    console.log("Presenting? Re-run with --reset to restore the workshop stubs and start a fresh head conversation.");
    return;
  }

  // Presenter mode: leave the repo ready to walk through from the stubs.
  console.log("\n--reset: starting a fresh head conversation and restoring the workshop stubs…");
  const freshConfig = loadConfig();
  freshConfig.head_session_id = ""; // Act 4 will open a new conversation; the memory store keeps everything seeded
  saveConfig(freshConfig);
  console.log(`  head_session_id cleared in ${DESK_FILE}`);

  // The /workshop coach tracks acts in this gitignored file — start the walkthrough from zero.
  const progressFile = join(process.cwd(), ".workshop-progress.json");
  if (existsSync(progressFile)) {
    rmSync(progressFile);
    console.log("  .workshop-progress.json removed");
  }

  // Scoped to this workshop directory: restore tracked files from HEAD and remove
  // untracked files under src/ — other workshops in the repo are untouched.
  // desk.json and outputs/ are gitignored, so they survive; uncommitted code changes do not.
  const gitSteps: string[][] = [
    ["checkout", "HEAD", "--", "."],
    ["clean", "-fd", "src"],
  ];
  for (const gitArgs of gitSteps) {
    console.log(`  $ git ${gitArgs.join(" ")}`);
    execFileSync("git", gitArgs, { stdio: "inherit" });
  }
  console.log("\nReady to present: stubs restored, desk provisioned, scorecards seeded. Restart `npm run dev`.");
}

void main();
