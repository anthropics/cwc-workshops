// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { csvCell, scorecardsToCsv, validateScorecard, type Scorecard } from "../src/lib/scorecard";

const GOOD: Record<string, unknown> = {
  ticker: "NVDA",
  company_name: "NVIDIA",
  filing_form: "10-K",
  fiscal_period: "FY2026",
  filing_date: "2026-02-20",
  revenue_usd_m: 130000,
  revenue_yoy_pct: 110.5,
  gross_margin_pct: 75.2,
  operating_margin_pct: 62.1,
  guidance_tone: "positive",
  top_risks: ["supply concentration", "export controls"],
  risk_factor_changes: ["new export-control language"],
  red_flags: [],
  one_line_thesis: "Data-center demand still outrunning supply.",
  confidence: "high",
  memory_note_path: "/companies/NVDA/FY2026-10K.md",
  embedded_instructions_flag: false,
};

describe("validateScorecard", () => {
  it("accepts a complete scorecard", () => {
    const { scorecard, problems } = validateScorecard(GOOD);
    expect(problems).toEqual([]);
    expect(scorecard?.ticker).toBe("NVDA");
  });

  it("rejects a scorecard missing required fields", () => {
    const { scorecard, problems } = validateScorecard({ ticker: "NVDA" });
    expect(scorecard).toBeNull();
    expect(problems.length).toBeGreaterThan(0);
  });

  it("rejects bad enums and types", () => {
    const { problems } = validateScorecard({ ...GOOD, guidance_tone: "amazing", revenue_usd_m: "lots" });
    expect(problems.join(" ")).toContain("guidance_tone");
    expect(problems.join(" ")).toContain("revenue_usd_m");
  });

  it("caps list lengths", () => {
    const { scorecard } = validateScorecard({ ...GOOD, top_risks: ["a", "b", "c", "d", "e", "f", "g"] });
    expect(scorecard?.top_risks.length).toBeLessThanOrEqual(5);
  });
});

describe("csv output", () => {
  it("neutralizes formula prefixes in text cells", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(12.5)).toBe(12.5);
    expect(csvCell(["a", "b"])).toBe("a | b");
  });

  it("renders a header plus one row per scorecard", () => {
    const { scorecard } = validateScorecard(GOOD);
    const csv = scorecardsToCsv([scorecard as Scorecard]);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("ticker");
    expect(lines[1]).toContain("NVDA");
  });
});
