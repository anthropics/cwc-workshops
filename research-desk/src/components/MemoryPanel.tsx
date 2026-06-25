"use client";

// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/client-types";

interface MemoryEntry {
  type: string;
  path: string;
  size?: number;
}

interface MemoryVersion {
  id: string;
  operation: string;
  path: string;
  created_at: string;
}

export default function MemoryPanel({ provisioned }: { provisioned: boolean }) {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [versions, setVersions] = useState<MemoryVersion[]>([]);
  const [selected, setSelected] = useState<{ path: string; content: string } | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const list = await api<{ data: MemoryEntry[] }>("/api/desk/memory?prefix=/");
      setEntries(list.data ?? []);
      const history = await api<{ data: MemoryVersion[] }>("/api/desk/memory?versions=1");
      setVersions(history.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    if (provisioned) void load();
  }, [provisioned, load]);

  const open = async (path: string) => {
    try {
      const { memory } = await api<{ memory: { path: string; content: string } | null }>(
        `/api/desk/memory?path=${encodeURIComponent(path)}`,
      );
      setSelected(memory);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (!provisioned) {
    return <div className="empty">The desk isn&apos;t provisioned yet — open the Setup tab first.</div>;
  }

  return (
    <section>
      <div className="row spread">
        <h2>Desk memory</h2>
        <div className="row">
          <button className="secondary" onClick={() => setShowVersions((value) => !value)}>
            {showVersions ? "Notes" : "History"}
          </button>
          <button className="secondary" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </div>
      <p className="muted">
        Everything the desk has learned, as files: one note per company per filing, plus desk memos. Notes persist
        across sessions and runs — that&apos;s what makes the desk compound.
      </p>

      {error && <div className="error-note">{error}</div>}

      {!showVersions && (
        <div className="list">
          {entries.length === 0 && <div className="empty">No notes yet — analyze a company and come back.</div>}
          {entries.map((entry) => (
            <div
              key={entry.path}
              className={`card ${entry.type === "memory" ? "clickable" : ""}`}
              onClick={() => entry.type === "memory" && void open(entry.path)}
            >
              <div>
                <div>{entry.path}</div>
                {entry.size !== undefined && <div className="meta">{entry.size} bytes</div>}
              </div>
              <span className="pill">{entry.type === "memory" ? "note" : "folder"}</span>
            </div>
          ))}
        </div>
      )}

      {showVersions && (
        <div style={{ overflowX: "auto", marginTop: "1rem" }}>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Operation</th>
                <th>Path</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.id}>
                  <td>{version.created_at}</td>
                  <td>{version.operation}</td>
                  <td>{version.path}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <>
          <h3>{selected.path}</h3>
          <pre className="note">{selected.content || "(empty)"}</pre>
        </>
      )}
    </section>
  );
}
