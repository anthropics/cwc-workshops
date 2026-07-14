// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

/**
 * The verification dashboard: /verify
 *
 * Lists every registered unit × fixture, with deep-links to isolated mounts.
 * "Run all" executes the full matrix headlessly (off-screen mounts) and
 * renders a verdict grid — the human view of what `window.__verify.runAll()`
 * returns to an agent.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { allGlobalChecks, allUnits, buildManifest } from "../core/registry";
import { runUnit } from "../core/runner";
import type { VerifyResult } from "../core/types";
import { VerdictBadge } from "./Badge";

export function Dashboard() {
  const units = allUnits();
  const globalChecks = allGlobalChecks();
  const [results, setResults] = useState<Map<string, VerifyResult> | null>(
    null
  );
  const [running, setRunning] = useState(false);

  const runAll = async () => {
    setRunning(true);
    const map = new Map<string, VerifyResult>();
    for (const unit of units) {
      const rs = await runUnit(unit);
      for (const r of rs) map.set(`${r.unitId}::${r.fixtureId}`, r);
    }
    setResults(map);
    setRunning(false);
    // Also expose as a global so agents can grab the last run.
    (window as unknown as { __verify_lastRun?: VerifyResult[] }).__verify_lastRun =
      Array.from(map.values());
  };

  const summary = results
    ? {
        pass: [...results.values()].filter((r) => r.verdict === "PASS").length,
        fail: [...results.values()].filter((r) => r.verdict === "FAIL").length,
        blocked: [...results.values()].filter((r) => r.verdict === "BLOCKED")
          .length,
        total: results.size,
      }
    : null;

  return (
    <div className="verify-page dashboard" data-verify-page="dashboard">
      <header className="dash-header">
        <h1>Verification Dashboard</h1>
        <p className="dash-sub">
          {units.length} unit(s) · {globalChecks.length} global check(s) · {" "}
          {units.reduce((a, u) => a + u.fixtures.length, 0)} fixture(s)
        </p>
        <p className="dash-hint">
          Agent handle: <code>window.__verify</code> — try{" "}
          <code>__verify.manifest()</code> or <code>await __verify.runAll()</code>{" "}
          in the console.
        </p>
        <div className="dash-actions">
          <button onClick={runAll} disabled={running} data-verify-action="run-all">
            {running ? "Running…" : "Run all"}
          </button>
          <Link to="/verify/replay" className="replay-link" data-verify-action="replay">
            ▶ Replay all
          </Link>
          <Link to="/">← back to app</Link>
        </div>
        {summary && (
          <div
            className="dash-summary"
            data-verify-summary={JSON.stringify(summary)}
          >
            <span className="s-pass">✅ {summary.pass}</span>
            <span className="s-fail">❌ {summary.fail}</span>
            <span className="s-blocked">⛔ {summary.blocked}</span>
            <span>/ {summary.total}</span>
          </div>
        )}
      </header>

      <section className="dash-verifiers">
        <h2>Global checks</h2>
        <p className="unit-desc">
          Cross-cutting checks that run against every unit — no component or
          spec opts in.
        </p>
        <ul>
          {globalChecks.map((c) => (
            <li key={c.id}>
              <code>{c.id}</code> — {c.description}
            </li>
          ))}
        </ul>
      </section>

      {units.map((unit) => (
        <section key={unit.id} className="dash-unit" data-verify-unit={unit.id}>
          <h2>
            {unit.title} <span className="kind">{unit.kind}</span>
          </h2>
          <p className="unit-desc">{unit.description}</p>
          <table className="fixture-table">
            <thead>
              <tr>
                <th>Fixture</th>
                <th>Description</th>
                <th>Verdict</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {unit.fixtures.map((f) => {
                const r = results?.get(`${unit.id}::${f.id}`);
                return (
                  <tr key={f.id} data-verify-row={`${unit.id}::${f.id}`}>
                    <td>
                      <code>
                        {f.probe && "🔍 "}
                        {f.id}
                      </code>
                    </td>
                    <td className="fixture-desc-cell">{f.description}</td>
                    <td>
                      {r ? (
                        <VerdictBadge verdict={r.verdict} />
                      ) : (
                        <span className="not-run">—</span>
                      )}
                    </td>
                    <td>
                      <Link to={`/verify/${unit.id}/${f.id}`}>open →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <details className="unit-invariants">
            <summary>{unit.checks.length} check(s)</summary>
            <ul>
              {unit.checks.map((c) => (
                <li key={c.id}>
                  <code>{c.id}</code> — {c.description}
                  {c.onlyFixtures && (
                    <em> (only: {c.onlyFixtures.join(", ")})</em>
                  )}
                </li>
              ))}
            </ul>
          </details>
        </section>
      ))}

      <details className="dash-manifest">
        <summary>Raw manifest (what an agent sees)</summary>
        <pre>
          {JSON.stringify(
            buildManifest().map((m) => ({
              ...m,
              route: `/verify/${m.unitId}/:fixtureId`,
            })),
            null,
            2
          )}
        </pre>
      </details>
    </div>
  );
}
