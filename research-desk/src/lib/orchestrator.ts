// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

/**
 * The desk orchestrator — the server-side half of the dispatch loop.
 *
 * The head-of-research agent has one custom tool, dispatch_analysts. When it
 * calls the tool its session goes idle at requires_action and the platform
 * waits for a client to answer. Because this app runs as a long-lived server,
 * that client is the server itself: a watcher holds the head session's event
 * stream, fans out one analyst session per ticker when a dispatch arrives,
 * and posts the validated scorecards back as the user.custom_tool_result.
 * Sweeps therefore keep running even if every browser tab is closed.
 *
 * The orchestrator is a module-level singleton (same pattern as a connection
 * pool): in-memory dispatch state powers the UI's progress panel.
 */

import type Anthropic from "@anthropic-ai/sdk";

import { analyzeMany, compileDispatchResult, makeRecords, MEMORY_MOUNT_INSTRUCTIONS, type AnalysisRecord } from "./analysis";
import { getClient } from "./anthropic";
import { DEFAULT_CONCURRENCY, loadConfig, saveConfig, sessionUrl, type DeskConfig } from "./config";
import { logEvent } from "./logger";
import { textOf, type SessionEventLike } from "./sessions";

export interface DispatchState {
  id: string;
  toolUseId: string;
  tickers: string[];
  focus: string;
  status: "running" | "completed" | "failed";
  records: AnalysisRecord[];
  startedAt: number;
  finishedAt: number | null;
  error: string;
}

class DeskOrchestrator {
  private watching = false;
  private handledToolUseIds = new Set<string>();
  readonly dispatches = new Map<string, DispatchState>();

  /** The head conversation is durable: reuse the saved session when it is still alive. */
  async ensureHeadSession(): Promise<string> {
    const client = getClient();
    const cfg = loadConfig();
    if (!cfg.head_agent_id || !cfg.environment_id) {
      throw new Error("no agent to talk to yet — open the Setup tab and create your agent first");
    }

    if (cfg.head_session_id) {
      try {
        const existing = await client.beta.sessions.retrieve(cfg.head_session_id);
        if ((existing as { status?: string }).status !== "terminated") {
          this.ensureWatching(cfg.head_session_id);
          return cfg.head_session_id;
        }
      } catch {
        // fall through and create a fresh session
      }
    }

    // Before the desk is staffed (Act 1) there is no memory store yet — the
    // session is created without resources; once it exists, every new head
    // conversation mounts the desk memory.
    const memoryResources = cfg.memory_store_id
      ? [
          {
            type: "memory_store",
            memory_store_id: cfg.memory_store_id,
            access: "read_write",
            instructions: MEMORY_MOUNT_INSTRUCTIONS,
          },
        ]
      : [];
    const session = await client.beta.sessions.create({
      agent: cfg.head_agent_id,
      environment_id: cfg.environment_id,
      title: "Research desk — head of research",
      metadata: { kind: "head" },
      resources: memoryResources,
    } as never);
    cfg.head_session_id = session.id;
    saveConfig(cfg);
    logEvent("info", "head_session_created", { session_id: session.id, url: sessionUrl(session.id) });
    this.ensureWatching(session.id);
    return session.id;
  }

  /** Start (once) the long-lived watcher that answers dispatch_analysts calls. */
  ensureWatching(headSessionId: string): void {
    if (this.watching) return;
    this.watching = true;
    void this.watchLoop(headSessionId);
  }

  private async watchLoop(headSessionId: string): Promise<void> {
    const client = getClient();
    // If the server restarted mid-dispatch, the head may already be waiting on
    // an unanswered tool call — catch up from history before streaming.
    await this.handleBacklog(client, headSessionId).catch((error) =>
      logEvent("warning", "dispatch_backlog_check_failed", { error: String(error) }),
    );

    for (;;) {
      try {
        const stream = (await client.beta.sessions.events.stream(headSessionId)) as AsyncIterable<SessionEventLike>;
        logEvent("info", "head_watcher_connected", { session_id: headSessionId });
        for await (const event of stream) {
          if (event.type === "agent.custom_tool_use" && event.name === "dispatch_analysts") {
            await this.handleDispatch(client, headSessionId, event);
          } else if (event.type === "session.status_terminated") {
            logEvent("warning", "head_session_terminated", { session_id: headSessionId });
            this.watching = false;
            return;
          }
        }
      } catch (error) {
        logEvent("warning", "head_watcher_error", { error: String(error) });
      }
      // The stream ended (idle timeout, network blip) — reconnect after a pause.
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const current = loadConfig().head_session_id;
      if (current !== headSessionId) {
        this.watching = false;
        return; // a new head session replaced this one; its own watcher takes over
      }
    }
  }

  private async handleBacklog(client: Anthropic, headSessionId: string): Promise<void> {
    const page = await client.beta.sessions.events.list(headSessionId, { limit: 200 } as never);
    const events = ((page as { data?: SessionEventLike[] }).data ?? []) as SessionEventLike[];
    const answered = new Set(
      events
        .filter((event) => event.type === "user.custom_tool_result")
        .map((event) => (event as unknown as { custom_tool_use_id?: string }).custom_tool_use_id ?? ""),
    );
    for (const event of events) {
      if (event.type === "agent.custom_tool_use" && event.name === "dispatch_analysts" && event.id && !answered.has(event.id)) {
        logEvent("info", "dispatch_backlog_found", { tool_use_id: event.id });
        await this.handleDispatch(client, headSessionId, event);
      }
    }
  }

  private async handleDispatch(client: Anthropic, headSessionId: string, event: SessionEventLike): Promise<void> {
    const toolUseId = event.id ?? "";
    if (!toolUseId || this.handledToolUseIds.has(toolUseId)) return;
    this.handledToolUseIds.add(toolUseId);

    const input = (event.input ?? {}) as { tickers?: unknown; focus?: unknown };
    const tickers = Array.isArray(input.tickers)
      ? input.tickers.map((ticker) => String(ticker).toUpperCase()).filter(Boolean)
      : [];
    const focus = typeof input.focus === "string" ? input.focus : "";

    const dispatch: DispatchState = {
      id: toolUseId,
      toolUseId,
      tickers,
      focus,
      status: "running",
      records: makeRecords(tickers),
      startedAt: Date.now(),
      finishedAt: null,
      error: "",
    };
    this.dispatches.set(dispatch.id, dispatch);
    logEvent("info", "dispatch_started", { tool_use_id: toolUseId, tickers });

    // TODO(workshop-7): the head just called its custom tool, and its session is
    // now idle at requires_action — the platform is waiting on THIS SERVER to answer.
    //
    //   1. Run the fan-out and compile the result payload (a JSON string):
    //        const cfg: DeskConfig = loadConfig();
    //        await analyzeMany(client, cfg, tickers, { focus, concurrency: DEFAULT_CONCURRENCY, records: dispatch.records });
    //        const resultPayload = compileDispatchResult(dispatch.records);
    //      Handle tickers.length === 0 and exceptions by building a failure payload
    //      instead (JSON with a `failures` array), and keep dispatch.status /
    //      dispatch.error / dispatch.finishedAt truthful so the UI's progress
    //      panel stays honest.
    //   2. Send the answer back so the head can resume — the id ties the result
    //      to this exact tool call:
    //        await client.beta.sessions.events.send(headSessionId, {
    //          events: [
    //            {
    //              type: "user.custom_tool_result",
    //              custom_tool_use_id: toolUseId,
    //              content: [{ type: "text", text: resultPayload }],
    //            },
    //          ],
    //        } as never);
    void analyzeMany;
    void compileDispatchResult;
    void loadConfig;
    void DEFAULT_CONCURRENCY;
    void focus;
    dispatch.status = "failed";
    dispatch.error = "TODO(workshop-7): answer dispatch_analysts with a user.custom_tool_result";
    dispatch.finishedAt = Date.now();
    logEvent("error", "dispatch_unhandled", { tool_use_id: toolUseId, error: dispatch.error });
    throw new Error(dispatch.error);
  }

  /** Send a user message to the head, making sure the session and watcher exist. */
  async sendToHead(text: string): Promise<string> {
    const client = getClient();
    const sessionId = await this.ensureHeadSession();
    // TODO(workshop-1): a chat message is one event appended to the session's log.
    //
    // Send it with:
    //   await client.beta.sessions.events.send(sessionId, {
    //     events: [{ type: "user.message", content: [{ type: "text", text }] }],
    //   });
    void client;
    void text;
    throw new Error("TODO(workshop-1): send the user.message event in sendToHead (src/lib/orchestrator.ts)");
    return sessionId;
  }

  listDispatches(): DispatchState[] {
    return [...this.dispatches.values()].sort((a, b) => b.startedAt - a.startedAt);
  }

  /** Live agent.message text helper used by API routes that snapshot events. */
  textOf = textOf;
}

const globalForDesk = globalThis as unknown as { __deskOrchestrator?: DeskOrchestrator };
export const orchestrator: DeskOrchestrator = globalForDesk.__deskOrchestrator ?? new DeskOrchestrator();
globalForDesk.__deskOrchestrator = orchestrator;
