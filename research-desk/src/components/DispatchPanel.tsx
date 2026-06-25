"use client";

// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import type { DispatchView } from "@/lib/client-types";

export default function DispatchPanel({ dispatches }: { dispatches: DispatchView[] }) {
  if (dispatches.length === 0) return null;
  return (
    <div>
      {dispatches.map((dispatch) => (
        <div key={dispatch.id} className="dispatch">
          <div className="row spread">
            <strong>
              {dispatch.tickers.length} analyst{dispatch.tickers.length === 1 ? "" : "s"} dispatched
              {dispatch.focus ? ` — ${dispatch.focus}` : ""}
            </strong>
            <span className={`pill ${dispatch.status}`}>{dispatch.status}</span>
          </div>
          <div className="grid">
            {dispatch.records.map((record) => (
              <div key={record.ticker} className="ticker">
                <span>{record.ticker}</span>
                {record.url ? (
                  <a href={record.url} target="_blank" rel="noreferrer" className={`pill ${record.status}`}>
                    {record.status === "running" ? "running" : record.outcome || record.status}
                  </a>
                ) : (
                  <span className={`pill ${record.status}`}>{record.status}</span>
                )}
              </div>
            ))}
          </div>
          {dispatch.error && <div className="error-note">{dispatch.error}</div>}
        </div>
      ))}
    </div>
  );
}
