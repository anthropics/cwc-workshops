// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { handle, rejectCrossSite } from "@/app/api/api-route";
import { analyzeMany, loadDeskConfigOrThrow, makeRecords } from "@/lib/analysis";
import { getClient } from "@/lib/anthropic";
import { logEvent } from "@/lib/logger";
import { orchestrator, type DispatchState } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Analyze tickers directly, without involving the head of research — used by
 * Act 2 (one company, observed closely) and the Scorecards tab. Starts the
 * work server-side and returns immediately; progress is visible via
 * /api/desk/dispatches.
 */
export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  return handle("desk.analyze", async () => {
    const body = (await request.json().catch(() => ({}))) as { tickers?: unknown; focus?: string };
    const tickers = Array.isArray(body.tickers)
      ? body.tickers.map((ticker) => String(ticker).toUpperCase().trim()).filter(Boolean)
      : [];
    if (tickers.length === 0) return { error: "tickers is required" };

    const cfg = loadDeskConfigOrThrow();
    const dispatch: DispatchState = {
      id: `manual-${Date.now()}`,
      toolUseId: "",
      tickers,
      focus: body.focus ?? "",
      status: "running",
      records: makeRecords(tickers),
      startedAt: Date.now(),
      finishedAt: null,
      error: "",
    };
    orchestrator.dispatches.set(dispatch.id, dispatch);

    void analyzeMany(getClient(), cfg, tickers, { focus: body.focus ?? "", records: dispatch.records })
      .then(() => {
        dispatch.status = dispatch.records.every((record) => record.status === "succeeded") ? "completed" : "completed";
        dispatch.finishedAt = Date.now();
      })
      .catch((error) => {
        dispatch.status = "failed";
        dispatch.error = String(error);
        dispatch.finishedAt = Date.now();
        logEvent("error", "manual_analysis_failed", { error: dispatch.error });
      });

    return { dispatch_id: dispatch.id, tickers };
  });
}
