// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import type { VerifyResult } from "../core/types";
import { CheckIcon, VerdictBadge } from "./Badge";

export function Report({ result }: { result: VerifyResult }) {
  return (
    <section className="report" data-verify-report={result.verdict}>
      <header className="report-header">
        <VerdictBadge verdict={result.verdict} />
        <span className="report-id">
          {result.unitId} / {result.fixtureId}
        </span>
        <span className="report-meta">{result.durationMs}ms</span>
      </header>

      {result.blockedReason && (
        <p className="report-blocked">⛔ {result.blockedReason}</p>
      )}

      <ol className="report-checks">
        {result.checks.map((c, i) => (
          <li key={i} className={`check check-${c.status}`}>
            <CheckIcon status={c.status} />
            <span className="check-verifier">[{c.tag}]</span>
            <span className="check-label">{c.label}</span>
            {c.detail && <span className="check-detail">— {c.detail}</span>}
          </li>
        ))}
      </ol>

      {Object.keys(result.domSnapshot).length > 0 && (
        <details className="report-snapshot">
          <summary>DOM contract snapshot</summary>
          <pre>{JSON.stringify(result.domSnapshot, null, 2)}</pre>
        </details>
      )}
    </section>
  );
}
