"use client";

// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";

import DispatchPanel from "@/components/DispatchPanel";
import { api, type DispatchView } from "@/lib/client-types";

type Scorecard = Record<string, unknown>;

const COLUMNS: Array<{ key: string; label: string; numeric?: boolean }> = [
  { key: "ticker", label: "Ticker" },
  { key: "filing_form", label: "Filing" },
  { key: "fiscal_period", label: "Period" },
  { key: "revenue_usd_m", label: "Revenue ($M)", numeric: true },
  { key: "revenue_yoy_pct", label: "YoY %", numeric: true },
  { key: "gross_margin_pct", label: "GM %", numeric: true },
  { key: "operating_margin_pct", label: "OM %", numeric: true },
  { key: "guidance_tone", label: "Guidance" },
  { key: "confidence", label: "Confidence" },
  { key: "one_line_thesis", label: "Thesis" },
];

export default function ScorecardsPanel({ provisioned }: { provisioned: boolean }) {
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [dispatches, setDispatches] = useState<DispatchView[]>([]);
  const [tickers, setTickers] = useState("NVDA");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [cards, runs] = await Promise.all([
        api<{ data: Scorecard[] }>("/api/desk/scorecards"),
        api<{ data: DispatchView[] }>("/api/desk/dispatches"),
      ]);
      setScorecards(cards.data ?? []);
      setDispatches(runs.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    if (!provisioned) return;
    void load();
    const interval = setInterval(() => void load(), 5000);
    return () => clearInterval(interval);
  }, [provisioned, load]);

  const analyze = async () => {
    const list = tickers
      .split(/[\s,]+/)
      .map((ticker) => ticker.trim().toUpperCase())
      .filter(Boolean);
    if (list.length === 0 || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/desk/analyze", { method: "POST", body: JSON.stringify({ tickers: list }) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!provisioned) {
    return <div className="empty">The desk isn&apos;t provisioned yet — open the Setup tab first.</div>;
  }

  return (
    <section>
      <div className="row spread">
        <h2>Scorecards</h2>
        <a href="/api/desk/scorecards?format=csv">
          <button className="secondary" disabled={scorecards.length === 0}>
            Download CSV
          </button>
        </a>
      </div>

      <div className="row wrap">
        <input
          placeholder="Tickers, e.g. NVDA or NVDA, AMD, MU"
          value={tickers}
          onChange={(e) => setTickers(e.target.value)}
          style={{ minWidth: "18rem" }}
        />
        <button onClick={() => void analyze()} disabled={busy}>
          {busy ? "Dispatching…" : "Analyze"}
        </button>
        <span className="hint">Runs analyst sessions directly (no head involved) — each is graded by the scorecard rubric.</span>
      </div>

      {error && <div className="error-note">{error}</div>}

      <DispatchPanel dispatches={dispatches.filter((dispatch) => dispatch.status === "running")} />

      {scorecards.length === 0 ? (
        <div className="empty">No scorecards yet — analyze a ticker above, or ask the Desk to sweep the watchlist.</div>
      ) : (
        <div style={{ overflowX: "auto", marginTop: "1rem" }}>
          <table>
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scorecards.map((scorecard) => (
                <tr key={String(scorecard.ticker)}>
                  {COLUMNS.map((column) => (
                    <td key={column.key} className={column.numeric ? "num" : undefined}>
                      {String(scorecard[column.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
