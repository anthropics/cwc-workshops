"use client";

// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";

import { api, type DeskStatus } from "@/lib/client-types";

export default function SetupPanel({ status, onProvisioned }: { status: DeskStatus; onProvisioned: () => void }) {
  const [busy, setBusy] = useState<"" | "hello" | "desk">("");
  const [error, setError] = useState("");
  const [steps, setSteps] = useState<Array<{ step: string; id: string }>>([]);

  const envReady = status.credential_present && status.edgar_identity_present;

  const provision = async (scope: "hello" | "desk") => {
    setBusy(scope);
    setError("");
    try {
      const result = await api<{ steps: Array<{ step: string; id: string }> }>("/api/desk/provision", {
        method: "POST",
        body: JSON.stringify({ scope }),
      });
      setSteps(result.steps ?? []);
      onProvisioned();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  };

  const resources = status.resources ?? [];

  return (
    <section>
      <h2>Setup</h2>
      <p className="muted">
        Everything the desk is made of — agents, an environment, a skill, a memory store — is a persistent, versioned
        object in your workspace. The server holds the credential; nothing is entered in the browser.
      </p>

      <div className="list">
        <div className="card">
          <div>Server credential (ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN)</div>
          <span className={`pill ${status.credential_present ? "succeeded" : "failed"}`}>
            {status.credential_present ? "present" : "missing"}
          </span>
        </div>
        <div className="card">
          <div>
            EDGAR identity (EDGAR_IDENTITY) <span className="hint">the SEC requires a contact identity</span>
          </div>
          <span className={`pill ${status.edgar_identity_present ? "succeeded" : "failed"}`}>
            {status.edgar_identity_present ? "present" : "missing"}
          </span>
        </div>
        <div className="card">
          <div>
            1 — Your agent <span className="hint">the head of research, prompt only — enough to say hello</span>
          </div>
          {status.hello_provisioned ? (
            <span className="pill succeeded">created</span>
          ) : (
            <button onClick={() => void provision("hello")} disabled={busy !== "" || !envReady}>
              {busy === "hello" ? "Creating…" : "Create your agent"}
            </button>
          )}
        </div>
        <div className="card">
          <div>
            2 — The desk <span className="hint">skill, specialists, analyst, memory store — and your agent gets its dispatch tool</span>
          </div>
          {status.provisioned ? (
            <span className="pill succeeded">staffed</span>
          ) : (
            <button
              onClick={() => void provision("desk")}
              disabled={busy !== "" || !envReady || !status.hello_provisioned}
            >
              {busy === "desk" ? "Staffing… (about a minute)" : "Staff the desk"}
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-note">{error}</div>}

      {steps.length > 0 && (
        <div className="list">
          {steps.map((step) => (
            <div key={step.id + step.step} className="card">
              <div>{step.step}</div>
              <span className="id-chip">{step.id}</span>
            </div>
          ))}
        </div>
      )}

      {resources.length > 0 && (
        <>
          <h3>Provisioned resources</h3>
          <p className="muted">Every piece of the desk is a real, persistent object in your workspace — open them in the Console.</p>
          <div className="list">
            {resources.map((resource) => (
              <div key={resource.id + resource.label} className="card">
                <div>
                  <div>{resource.label}</div>
                  <div className="meta">{resource.id}</div>
                </div>
                <a href={resource.url} target="_blank" rel="noreferrer">
                  <button className="secondary">Open in Console ↗</button>
                </a>
              </div>
            ))}
          </div>
        </>
      )}

      <h3>Watchlist</h3>
      <p className="muted">{status.watchlist.join(" · ")}</p>
    </section>
  );
}
