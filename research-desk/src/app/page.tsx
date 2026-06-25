"use client";

// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";

import DeskChat from "@/components/DeskChat";
import DeploymentsPanel from "@/components/DeploymentsPanel";
import MemoryPanel from "@/components/MemoryPanel";
import ScorecardsPanel from "@/components/ScorecardsPanel";
import SetupPanel from "@/components/SetupPanel";
import { api, type DeskStatus } from "@/lib/client-types";

type View = "desk" | "scorecards" | "memory" | "deployments" | "setup";

const TABS: Array<{ id: View; label: string }> = [
  { id: "desk", label: "Desk" },
  { id: "scorecards", label: "Scorecards" },
  { id: "memory", label: "Memory" },
  { id: "deployments", label: "Deployments" },
  { id: "setup", label: "Setup" },
];

export default function Home() {
  const [view, setView] = useState<View>("desk");
  const [status, setStatus] = useState<DeskStatus | null>(null);
  const [error, setError] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      const data = await api<DeskStatus>("/api/desk/status");
      setStatus(data);
      if (!data.hello_provisioned) setView("setup");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const provisioned = status?.provisioned ?? false;
  // Chat only needs an agent to exist (Act 1); the other tabs need the staffed desk.
  const chatReady = (status?.hello_provisioned ?? false) || provisioned;

  return (
    <>
      <header>
        <h1>The Research Desk</h1>
        <nav className="row">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`nav-btn ${view === tab.id ? "active" : ""}`}
              onClick={() => setView(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {error && <div className="error-note">{error}</div>}
        {!status && !error && <div className="empty">Waking the desk up…</div>}
        {status && view === "desk" && <DeskChat provisioned={chatReady} />}
        {status && view === "scorecards" && <ScorecardsPanel provisioned={provisioned} />}
        {status && view === "memory" && <MemoryPanel provisioned={provisioned} />}
        {status && view === "deployments" && <DeploymentsPanel provisioned={provisioned} />}
        {status && view === "setup" && <SetupPanel status={status} onProvisioned={() => void loadStatus()} />}
      </main>

      <footer>
        <span className="muted">The Research Desk — a workshop for Claude Managed Agents.</span>
      </footer>
    </>
  );
}
