"use client";

// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/client-types";

interface DeploymentSummary {
  id: string;
  name?: string;
  status?: string;
}

interface DeploymentRun {
  id: string;
  deployment_id?: string;
  session_id?: string | null;
  created_at?: string;
  trigger_context?: { type?: string };
  error?: unknown;
}

export default function DeploymentsPanel({ provisioned }: { provisioned: boolean }) {
  const [deployments, setDeployments] = useState<DeploymentSummary[]>([]);
  const [runs, setRuns] = useState<DeploymentRun[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const deploymentData = await api<{ data?: DeploymentSummary[] }>("/api/deployments?limit=25");
      const ours = deploymentData.data ?? [];
      setDeployments(ours);
      const runData = await api<{ data?: DeploymentRun[] }>("/api/deployment_runs?limit=50");
      // The runs listing is workspace-wide; keep only runs of the desk's deployments.
      const ourIds = new Set(ours.map((deployment) => deployment.id));
      setRuns((runData.data ?? []).filter((run) => run.deployment_id && ourIds.has(run.deployment_id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    if (provisioned) void load();
  }, [provisioned, load]);

  const createMemo = async () => {
    setBusy("create");
    setError("");
    try {
      await api("/api/deployments", { method: "POST", body: JSON.stringify({}) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  };

  const runNow = async (deploymentId: string) => {
    setBusy(deploymentId);
    setError("");
    try {
      await api(`/api/deployments/${deploymentId}/run`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  };

  if (!provisioned) {
    return <div className="empty">The desk isn&apos;t provisioned yet — open the Setup tab first.</div>;
  }

  return (
    <section>
      <div className="row spread">
        <h2>Deployments</h2>
        <div className="row">
          <button className="secondary" onClick={() => void load()}>
            Refresh
          </button>
          <button onClick={() => void createMemo()} disabled={busy === "create"}>
            {busy === "create" ? "Creating…" : "Create weekly memo"}
          </button>
        </div>
      </div>
      <p className="muted">
        The standing desk: a scheduled run that checks the watchlist for new filings, refreshes the desk memory, and
        writes a weekly memo. Deployments are a research-preview surface.
      </p>

      {error && <div className="error-note">{error}</div>}

      <div className="list">
        {deployments.length === 0 && <div className="empty">No deployments yet — create the weekly memo above.</div>}
        {deployments.map((deployment) => (
          <div key={deployment.id} className="card">
            <div>
              <div>{deployment.name ?? deployment.id}</div>
              <div className="meta">{deployment.id}</div>
            </div>
            <div className="row">
              <span className="pill">{deployment.status ?? ""}</span>
              <button onClick={() => void runNow(deployment.id)} disabled={busy === deployment.id}>
                {busy === deployment.id ? "Starting…" : "Run now"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <h3>Recent runs</h3>
      <div className="list">
        {runs.length === 0 && <div className="empty">No runs yet.</div>}
        {runs.map((run) => (
          <div key={run.id} className="card">
            <div>
              <div>{run.id}</div>
              <div className="meta">
                {run.deployment_id} · {run.trigger_context?.type ?? ""} · {run.created_at ?? ""}
              </div>
            </div>
            <span className={`pill ${run.error ? "failed" : "completed"}`}>{run.error ? "failed" : "ok"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
