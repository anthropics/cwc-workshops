// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

/**
 * Scorecard schema and validation.
 *
 * Every analyst session produces one scorecard. The reduce step (the
 * head-of-research synthesis) and the scorecards table/CSV depend on a
 * consistent shape, so the orchestrator validates each one against this
 * template before using it: known fields only, capped list lengths, and
 * clear problems reported for anything missing or mistyped.
 */

export const GUIDANCE_TONES = ["positive", "neutral", "cautious", "none"] as const;
export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;

const MAX_SHORT_TEXT = 300;
const MAX_LIST_ITEMS = 5;

export interface Scorecard {
  ticker: string;
  company_name: string;
  filing_form: string;
  fiscal_period: string;
  filing_date: string;
  revenue_usd_m: number;
  revenue_yoy_pct: number;
  gross_margin_pct: number;
  operating_margin_pct: number;
  guidance_tone: string;
  top_risks: string[];
  risk_factor_changes: string[];
  red_flags: string[];
  one_line_thesis: string;
  confidence: string;
  memory_note_path: string;
  embedded_instructions_flag: boolean;
  net_cash_usd_m?: number;
  inventory_yoy_pct?: number;
  rnd_pct_of_revenue?: number;
  data_caveats?: string;
}

type FieldKind = "string" | "number" | "boolean" | "list";

export const REQUIRED_FIELDS: Record<string, FieldKind> = {
  ticker: "string",
  company_name: "string",
  filing_form: "string",
  fiscal_period: "string",
  filing_date: "string",
  revenue_usd_m: "number",
  revenue_yoy_pct: "number",
  gross_margin_pct: "number",
  operating_margin_pct: "number",
  guidance_tone: "string",
  top_risks: "list",
  risk_factor_changes: "list",
  red_flags: "list",
  one_line_thesis: "string",
  confidence: "string",
  memory_note_path: "string",
  embedded_instructions_flag: "boolean",
};

export const OPTIONAL_FIELDS: Record<string, FieldKind> = {
  net_cash_usd_m: "number",
  inventory_yoy_pct: "number",
  rnd_pct_of_revenue: "number",
  data_caveats: "string",
};

export function validateScorecard(payload: unknown): { scorecard: Scorecard | null; problems: string[] } {
  const problems: string[] = [];
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { scorecard: null, problems: ["scorecard is not a JSON object"] };
  }
  const source = payload as Record<string, unknown>;
  const clean: Record<string, unknown> = {};

  for (const [field, kind] of Object.entries({ ...REQUIRED_FIELDS, ...OPTIONAL_FIELDS })) {
    if (!(field in source)) {
      if (field in REQUIRED_FIELDS) problems.push(`missing field: ${field}`);
      continue;
    }
    const value = source[field];
    if (kind === "list") {
      if (!Array.isArray(value)) {
        problems.push(`${field} is not a list`);
        continue;
      }
      clean[field] = value.slice(0, MAX_LIST_ITEMS).map((item) => String(item).slice(0, MAX_SHORT_TEXT));
    } else if (kind === "boolean") {
      if (typeof value !== "boolean") {
        problems.push(`${field} is not a boolean`);
        continue;
      }
      clean[field] = value;
    } else if (kind === "string") {
      if (typeof value !== "string") {
        problems.push(`${field} is not a string`);
        continue;
      }
      clean[field] = value.slice(0, MAX_SHORT_TEXT);
    } else {
      if (typeof value !== "number" || Number.isNaN(value)) {
        problems.push(`${field} is not numeric`);
        continue;
      }
      clean[field] = value;
    }
  }

  if (!GUIDANCE_TONES.includes(clean.guidance_tone as (typeof GUIDANCE_TONES)[number])) {
    problems.push(`guidance_tone must be one of ${GUIDANCE_TONES.join(", ")}`);
  }
  if (!CONFIDENCE_LEVELS.includes(clean.confidence as (typeof CONFIDENCE_LEVELS)[number])) {
    problems.push(`confidence must be one of ${CONFIDENCE_LEVELS.join(", ")}`);
  }

  const missingRequired = Object.keys(REQUIRED_FIELDS).filter((field) => !(field in clean));
  if (missingRequired.length > 0) return { scorecard: null, problems };
  return { scorecard: clean as unknown as Scorecard, problems };
}

/** CSV cell rendering: flatten lists and neutralize spreadsheet formula prefixes in text. */
export function csvCell(value: unknown): string | number | boolean {
  let cell: unknown = value;
  if (Array.isArray(cell)) cell = cell.join(" | ");
  if (typeof cell === "string" && /^[=+\-@\t\r]/.test(cell)) return `'${cell}`;
  if (typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean") return cell;
  return cell === undefined || cell === null ? "" : String(cell);
}

export function scorecardsToCsv(scorecards: Scorecard[]): string {
  const columns = Object.keys(REQUIRED_FIELDS);
  const escape = (value: string | number | boolean): string => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const rows = scorecards.map((scorecard) =>
    columns.map((column) => escape(csvCell((scorecard as unknown as Record<string, unknown>)[column]))).join(","),
  );
  return [columns.join(","), ...rows].join("\n") + "\n";
}
