// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { NextResponse } from "next/server";

import { handle, queryParams } from "@/app/api/api-route";
import { OUTPUTS_DIR } from "@/lib/config";
import { orchestrator } from "@/lib/orchestrator";
import { scorecardsToCsv, validateScorecard, type Scorecard } from "@/lib/scorecard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Scorecards persisted to outputs/<TICKER>/scorecard.json — survives server restarts and powers presenter seeding. */
function scorecardsFromDisk(): Map<string, Scorecard> {
  const byTicker = new Map<string, Scorecard>();
  if (!existsSync(OUTPUTS_DIR)) return byTicker;
  for (const entry of readdirSync(OUTPUTS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(OUTPUTS_DIR, entry.name, "scorecard.json");
    if (!existsSync(path)) continue;
    try {
      const { scorecard } = validateScorecard(JSON.parse(readFileSync(path, "utf-8")));
      if (scorecard) byTicker.set(scorecard.ticker, scorecard);
    } catch {
      // unreadable scorecards just don't appear
    }
  }
  return byTicker;
}

function collectScorecards(): Scorecard[] {
  const byTicker = scorecardsFromDisk();
  // In-memory results from this server's runs win over older files on disk.
  for (const dispatch of [...orchestrator.listDispatches()].reverse()) {
    for (const record of dispatch.records) {
      if (record.scorecard) byTicker.set(record.ticker, record.scorecard);
    }
  }
  return [...byTicker.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export async function GET(request: Request) {
  const params = queryParams(request);
  if (params.format === "csv") {
    return new NextResponse(scorecardsToCsv(collectScorecards()), {
      headers: {
        "content-type": "text/csv",
        "content-disposition": "attachment; filename=scorecards.csv",
      },
    });
  }
  return handle("desk.scorecards", async () => ({ data: collectScorecards() }));
}
