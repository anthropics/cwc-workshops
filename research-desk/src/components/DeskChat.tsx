"use client";

// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import DispatchPanel from "@/components/DispatchPanel";
import { api, consumeStream, eventText, type DispatchView, type SessionEvent } from "@/lib/client-types";

interface TimelineEntry {
  key: string;
  kind: "user" | "agent" | "tool" | "status";
  tag?: string;
  text: string;
}

function toEntry(event: SessionEvent, index: number): TimelineEntry | null {
  const type = event.type ?? "";
  const key = event.id ?? `local-${index}-${type}`;
  if (type === "user.message") return { key, kind: "user", tag: "you", text: eventText(event.content) };
  if (type === "agent.message") return { key, kind: "agent", tag: "head of research", text: eventText(event.content) };
  if (type === "agent.custom_tool_use") {
    return { key, kind: "tool", text: `→ ${event.name ?? "tool"} ${JSON.stringify(event.input ?? {}).slice(0, 200)}` };
  }
  if (type === "user.custom_tool_result") return { key, kind: "tool", text: "← scorecards returned to the head" };
  if (type === "agent.tool_use" || type === "agent.mcp_tool_use") {
    return { key, kind: "tool", text: `→ ${event.name ?? "tool"}` };
  }
  if (type.startsWith("session.status")) {
    return { key, kind: "status", text: type.replace("session.status_", "desk: ") };
  }
  if (type === "session.error") return { key, kind: "status", text: `error: ${event.error?.type ?? "unknown"}` };
  return null;
}

export default function DeskChat({ provisioned }: { provisioned: boolean }) {
  const [sessionId, setSessionId] = useState("");
  const [connecting, setConnecting] = useState(true);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [dispatches, setDispatches] = useState<DispatchView[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const seenIds = useRef(new Set<string>());
  const timelineRef = useRef<HTMLDivElement>(null);

  const appendEvent = useCallback((event: SessionEvent, index: number) => {
    if (event.id && seenIds.current.has(event.id)) return;
    if (event.id) seenIds.current.add(event.id);
    const entry = toEntry(event, index);
    if (entry) setEntries((previous) => [...previous, entry]);
  }, []);

  // Connect to the head session: load history in one batch, then follow the live stream.
  useEffect(() => {
    if (!provisioned) return;
    const controller = new AbortController();
    const start = async () => {
      try {
        const { session_id } = await api<{ session_id: string }>("/api/desk/chat");
        setSessionId(session_id);
        const history = await api<{ data: SessionEvent[] }>(`/api/desk/events?session_id=${session_id}`);
        const initial: TimelineEntry[] = [];
        (history.data ?? []).forEach((event, index) => {
          if (event.id) {
            if (seenIds.current.has(event.id)) return;
            seenIds.current.add(event.id);
          }
          const entry = toEntry(event, index);
          if (entry) initial.push(entry);
        });
        setEntries(initial);
        setConnecting(false);
        await consumeStream(
          `/api/desk/stream?session_id=${session_id}`,
          (event) => appendEvent(event, seenIds.current.size),
          controller.signal,
        );
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError(err instanceof Error ? err.message : String(err));
          setConnecting(false);
        }
      }
    };
    void start();
    return () => controller.abort();
  }, [provisioned, appendEvent]);

  // Poll dispatch progress while the chat is open.
  useEffect(() => {
    if (!provisioned) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await api<{ data: DispatchView[] }>("/api/desk/dispatches");
        setDispatches(data ?? []);
      } catch {
        // transient polling errors are fine
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [provisioned]);

  useEffect(() => {
    const node = timelineRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [entries]);

  const send = async () => {
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      await api("/api/desk/chat", { method: "POST", body: JSON.stringify({ text }) });
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  if (!provisioned) {
    return <div className="empty">The desk isn&apos;t provisioned yet — open the Setup tab first.</div>;
  }

  const activeDispatches = dispatches.filter((dispatch) => dispatch.status === "running");

  return (
    <section>
      <div className="row spread">
        <h2>Desk</h2>
        {sessionId && <span className="id-chip">{sessionId}</span>}
      </div>
      <p className="muted">
        Ask the head of research for what you need — e.g. &quot;Sweep NVDA, AMD and MU and rank them by margin
        durability.&quot; When it needs fresh work it dispatches analysts; the fan-out runs on this server and keeps
        going even if you close this tab.
      </p>

      {error && <div className="error-note">{error}</div>}

      <DispatchPanel dispatches={activeDispatches.length > 0 ? activeDispatches : dispatches.slice(0, 1)} />

      <div className="timeline" ref={timelineRef}>
        {connecting && <div className="empty">Connecting to the head of research…</div>}
        {!connecting && entries.length === 0 && (
          <div className="empty">No conversation yet — ask the desk something below.</div>
        )}
        {entries.map((entry) => (
          <div key={entry.key} className={`event ${entry.kind}`}>
            {entry.tag && <span className="tag">{entry.tag}</span>}
            {entry.kind === "agent" ? (
              <div className="markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.text}</ReactMarkdown>
              </div>
            ) : (
              entry.text
            )}
          </div>
        ))}
      </div>

      <div className="composer row">
        <textarea
          rows={2}
          placeholder="Ask the head of research… (Enter to send, Shift+Enter for a new line)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button onClick={() => void send()} disabled={sending || !message.trim()}>
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
      <p className="hint">
        <kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line · the conversation and the desk&apos;s
        memory persist across visits.
      </p>
    </section>
  );
}
