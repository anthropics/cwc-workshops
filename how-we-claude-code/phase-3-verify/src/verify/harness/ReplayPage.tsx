// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

/**
 * Replay mode: /verify/replay
 *
 * Visibly cycles through every registered unit × fixture, mounting each one
 * on the stage, running verifiers, showing the verdict, then advancing. One
 * URL, no navigation flicker — a single recording target for an external
 * screen recorder (Playwright `page.video`, OBS, getDisplayMedia, etc).
 *
 * Query params:
 *   ?dwell=1500   ms to hold on each fixture after its result lands (default 1500)
 *   ?chrome=0     hide the controls/progress bar (clean recording)
 *   ?auto=0       start paused
 *
 * Keyboard: Space = pause/resume · → = skip · Esc = stop & summarize
 *
 * Exposes window.__verify_replay = { playing, idx, total, done, results } so
 * an external recorder can poll for start/stop cues.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Link, useSearchParams } from "react-router-dom";
import { allUnits } from "../core/registry";
import { runFixture } from "../core/runner";
import type { Fixture, VerifiableUnit, VerifyResult } from "../core/types";
import { VerdictBadge, CheckIcon } from "./Badge";
import { makeVisibleActContext } from "./visibleAct";
import {
  createClipRecorder,
  downloadAll,
  downloadClip,
  fmtBytes,
  type Clip,
  type ClipRecorder,
  type RecorderState,
} from "./recorder";

interface Step {
  unit: VerifiableUnit<unknown>;
  fixture: Fixture<unknown>;
}

interface ReplayState {
  playing: boolean;
  idx: number;
  total: number;
  done: boolean;
  results: VerifyResult[];
}

declare global {
  interface Window {
    __verify_replay?: ReplayState;
  }
}

export function ReplayPage() {
  const [params] = useSearchParams();
  const dwell = clampInt(params.get("dwell"), 1500, 200, 30_000);
  const preActMs = clampInt(params.get("pre"), 350, 0, 5_000);
  const keystrokeMs = clampInt(params.get("key"), 60, 0, 500);
  const chromeless = params.get("chrome") === "0";
  const autoStart = params.get("auto") !== "0";

  const steps = useMemo<Step[]>(
    () =>
      allUnits().flatMap((unit) =>
        unit.fixtures.map((fixture) => ({ unit, fixture }))
      ),
    []
  );

  const [idx, setIdx] = useState(0);
  const [runId, setRunId] = useState(0);
  const [playing, setPlaying] = useState(autoStart);
  const [done, setDone] = useState(false);
  const [results, setResults] = useState<VerifyResult[]>([]);
  const [current, setCurrent] = useState<VerifyResult | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [recState, setRecState] = useState<RecorderState>("idle");
  const [clips, setClips] = useState<Clip[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<ClipRecorder | null>(null);
  if (!recorderRef.current) {
    recorderRef.current = createClipRecorder({
      onState: (s) => setRecState(s),
      onClip: (c) => setClips((cs) => [...cs, c]),
    });
  }
  // Disarm on unmount so the share bar goes away if you navigate off.
  useEffect(() => () => recorderRef.current?.disarm(), []);

  const mountRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<{ root: Root; container: HTMLElement } | null>(null);
  const advanceTimer = useRef<number | null>(null);
  // Live refs so async closures see fresh state.
  const playingRef = useRef(playing);
  const idxRef = useRef(idx);
  playingRef.current = playing;
  idxRef.current = idx;

  // Publish state for external recorders.
  useEffect(() => {
    window.__verify_replay = {
      playing,
      idx,
      total: steps.length,
      done,
      results,
    };
    return () => {
      window.__verify_replay = undefined;
    };
  }, [playing, idx, done, results, steps.length]);

  // Mount + verify the current step. All inner-root lifecycle (create, render,
  // unmount) is deferred to a task so it never runs while the *outer* React
  // tree is mid-commit — otherwise React defers the inner unmount, we'd race
  // it, and removeChild would throw.
  useEffect(() => {
    if (done || steps.length === 0) return;
    const step = steps[idx];
    if (!step || !mountRef.current) return;
    let cancelled = false;
    setCurrent(null);
    const host = mountRef.current;

    (async () => {
      await task(); // escape the outer commit phase
      if (cancelled) return;

      // Per-test recording: close out the previous clip, open a new one named
      // for this unit×fixture. No-ops if the recorder isn't armed.
      const rec = recorderRef.current;
      if (rec?.armed) {
        await rec.stopClip();
        rec.startClip(`${step.unit.id}__${step.fixture.id}`);
      }

      // Fresh child container per step — the inner root owns it completely.
      const container = document.createElement("div");
      host.appendChild(container);
      const root = createRoot(container);
      const inner = { root, container };
      innerRef.current = inner;
      root.render(step.unit.render(step.fixture.props));
      await raf();
      if (cancelled) return disposeInner(inner);

      if (step.fixture.act) {
        // Let the viewer see the initial mount before driving it.
        if (preActMs > 0) {
          setAction("…");
          await sleep(preActMs);
          if (cancelled) return disposeInner(inner);
        }
        try {
          await step.fixture.act(
            makeVisibleActContext(container, {
              keystrokeMs,
              onAction: setAction,
              isCancelled: () => cancelled,
            })
          );
        } catch {
          /* act threw — leave whatever's mounted; verifiers will report it. */
        }
        setAction(null);
        await raf();
        if (cancelled) return disposeInner(inner);
        // Brief beat so the post-act state is visible before the verdict lands.
        await sleep(200);
        if (cancelled) return disposeInner(inner);
      }

      const res = await runFixture(step.unit, step.fixture, {
        container,
        alreadyMounted: true,
      });
      if (cancelled) return disposeInner(inner);

      setCurrent(res);
      setResults((r) => [...r, res]);
      if (playingRef.current) {
        advanceTimer.current = window.setTimeout(advance, dwell);
      }
    })();

    return () => {
      cancelled = true;
      if (advanceTimer.current) {
        clearTimeout(advanceTimer.current);
        advanceTimer.current = null;
      }
      // Defer unmount so it runs after the outer commit completes.
      const inner = innerRef.current;
      innerRef.current = null;
      if (inner) queueMicrotask(() => disposeInner(inner));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, done, runId]);

  // Keyboard controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        advance();
      } else if (e.key === "Escape") {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function advance() {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    const next = idxRef.current + 1;
    if (next >= steps.length) {
      finish();
    } else {
      setIdx(next);
    }
  }

  /** Jump to a specific step. Pauses (so it mounts, verifies, and holds). */
  function jumpTo(i: number) {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    setPlaying(false);
    setDone(false);
    setCurrent(null);
    setAction(null);
    setIdx(i);
    setRunId((n) => n + 1);
  }

  /** Start sequential playback from a specific step. */
  function playFrom(i: number) {
    jumpTo(i);
    setPlaying(true);
  }

  function togglePlay() {
    setPlaying((p) => {
      const np = !p;
      if (!np && advanceTimer.current) {
        clearTimeout(advanceTimer.current);
        advanceTimer.current = null;
      }
      if (np && current && !advanceTimer.current && !done) {
        advanceTimer.current = window.setTimeout(advance, dwell);
      }
      return np;
    });
  }

  function finish() {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setPlaying(false);
    setDone(true);
    // Finalize the last clip and release the capture.
    void recorderRef.current?.stopClip().then(() => recorderRef.current?.disarm());
  }

  async function toggleRecord() {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.armed) {
      // Stop: finalize current clip, release capture, halt playback.
      await rec.stopClip();
      rec.disarm();
      setPlaying(false);
      return;
    }
    // Arm: pause while the share prompt is up, crop to the stage, then
    // (re)start the replay from the top so every fixture gets a clip.
    setPlaying(false);
    // If we're on the summary screen the stage isn't mounted — restart first
    // so stageRef becomes valid, then arm.
    if (!stageRef.current) {
      restart();
      setPlaying(false);
      await task();
    }
    if (!stageRef.current) return;
    const ok = await rec.arm(stageRef.current);
    if (!ok) return;
    setClips([]);
    // Always restart from the top so every fixture gets a clip — even if we
    // were already at idx 0 (runId bump forces the effect to re-fire).
    restart();
  }

  function restart() {
    setResults([]);
    setCurrent(null);
    setAction(null);
    setIdx(0);
    setDone(false);
    setPlaying(true);
    setRunId((n) => n + 1);
  }

  /* ---------------------- render ---------------------- */

  if (steps.length === 0) {
    return (
      <div className="verify-page replay" data-verify-page="replay">
        <p>No units registered.</p>
        <Link to="/verify">← dashboard</Link>
      </div>
    );
  }

  const step = steps[idx];
  const progress = done ? 1 : (idx + (current ? 1 : 0.5)) / steps.length;
  const summary = summarize(results);

  return (
    <div
      className="verify-page replay"
      data-verify-page="replay"
      data-verify-replay-idx={idx}
      data-verify-replay-total={steps.length}
      data-verify-replay-playing={playing}
      data-verify-replay-done={done}
    >
      {!chromeless && (
        <header className="replay-header">
          <Link to="/verify">← dashboard</Link>
          <h1>
            Replay{" "}
            <span className="replay-counter">
              {done ? steps.length : idx + 1} / {steps.length}
            </span>
          </h1>
          <div className="replay-controls">
            {!done && (
              <>
                <button onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
                  {playing ? "❚❚ Pause" : "▶ Play"}
                </button>
                <button onClick={advance} aria-label="Skip">
                  ⏭ Skip
                </button>
                <button onClick={finish} aria-label="Stop">
                  ⏹ Stop
                </button>
              </>
            )}
            {done && <button onClick={restart}>↻ Replay again</button>}
            <button
              onClick={toggleRecord}
              className={`record-btn ${
                recState === "recording" || recState === "armed" ? "rec" : ""
              }`}
              aria-label={
                recState === "recording" || recState === "armed"
                  ? "Stop recording"
                  : "Record per-test clips"
              }
              disabled={recState === "prompting"}
              data-verify-action="record"
            >
              {recState === "recording" || recState === "armed"
                ? `⏺ Recording (${clips.length} clip${clips.length === 1 ? "" : "s"}) — stop`
                : recState === "prompting"
                  ? "⏺ Pick this tab…"
                  : "⏺ Record clips"}
            </button>
            {(recState === "recording" || recState === "armed") && (
              <span className="sub">
                {recorderRef.current?.cropped
                  ? "stage-cropped"
                  : "full-tab (crop unsupported)"}
              </span>
            )}
            <span className="replay-dwell sub">dwell {dwell}ms</span>
          </div>
          <div className="replay-progress">
            <div
              className="replay-progress-bar"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <div className="replay-tally">
            <span className="s-pass">✅ {summary.pass}</span>
            <span className="s-fail">❌ {summary.fail}</span>
            <span className="s-blocked">⛔ {summary.blocked}</span>
          </div>
        </header>
      )}

      <div className="replay-body">
        {!chromeless && (
          <StepList
            steps={steps}
            idx={idx}
            done={done}
            results={results}
            onJump={jumpTo}
            onPlayFrom={playFrom}
          />
        )}

        <div className="replay-main">
          {!done && (
            <div
              className={`app-frame ${current ? `verdict-${current.verdict.toLowerCase()}` : ""}`}
              ref={stageRef}
              data-verify-stage="true"
            >
              <div className="app-frame-titlebar">
                <span className="tl-dot r" />
                <span className="tl-dot y" />
                <span className="tl-dot g" />
                <span className="app-frame-title">
                  <span className="kind">{step.unit.kind}</span>
                  <strong>{step.unit.title}</strong>
                  <span className="dim"> / {step.fixture.id}</span>
                  {step.fixture.probe && <span className="probe-chip">🔍 probe</span>}
                </span>
              </div>

              <div className="app-frame-desc">{step.fixture.description}</div>

              <div className="app-frame-body">
                <span className="app-frame-body-label">rendered component</span>
                <div
                  className="verify-mount"
                  ref={mountRef}
                  data-verify-mount="true"
                />
                <div
                  className={`replay-action ${action ? "on" : ""}`}
                  data-verify-action-caption={action ?? ""}
                >
                  {action ?? ""}
                </div>
              </div>

              <FrameStatus result={current} />
            </div>
          )}

          {done && (
            <ReplaySummary results={results} steps={steps} clips={clips} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------- subcomponents ---------------------- */

function StepList({
  steps,
  idx,
  done,
  results,
  onJump,
  onPlayFrom,
}: {
  steps: Step[];
  idx: number;
  done: boolean;
  results: VerifyResult[];
  onJump: (i: number) => void;
  onPlayFrom: (i: number) => void;
}) {
  const verdictFor = (s: Step) =>
    results.find(
      (r) => r.unitId === s.unit.id && r.fixtureId === s.fixture.id
    )?.verdict;

  // Group by unit so the list reads cleanly.
  const groups: Array<{ unit: Step["unit"]; rows: Array<{ i: number; s: Step }> }> = [];
  steps.forEach((s, i) => {
    const last = groups[groups.length - 1];
    if (last && last.unit.id === s.unit.id) last.rows.push({ i, s });
    else groups.push({ unit: s.unit, rows: [{ i, s }] });
  });

  return (
    <aside className="step-list" aria-label="All fixtures">
      {groups.map((g) => (
        <div key={g.unit.id} className="step-group">
          <div className="step-group-head">
            <span className="kind">{g.unit.kind}</span>
            <strong>{g.unit.title}</strong>
          </div>
          {g.rows.map(({ i, s }) => {
            const v = verdictFor(s);
            const active = !done && i === idx;
            return (
              <div
                key={s.fixture.id}
                className={`step-row ${active ? "active" : ""} ${v ? `v-${v.toLowerCase()}` : ""}`}
                data-verify-step={`${s.unit.id}::${s.fixture.id}`}
              >
                <button
                  className="step-jump"
                  onClick={() => onJump(i)}
                  title={`Run only ${s.unit.id}/${s.fixture.id}`}
                  aria-label={`Run only ${s.unit.id}/${s.fixture.id}`}
                >
                  <span className="step-status">
                    {v === "PASS"
                      ? "✅"
                      : v === "FAIL"
                        ? "❌"
                        : v === "BLOCKED"
                          ? "⛔"
                          : active
                            ? "▸"
                            : "○"}
                  </span>
                  <span className="step-name">
                    {s.fixture.probe && "🔍 "}
                    {s.fixture.id}
                  </span>
                </button>
                <button
                  className="step-play"
                  onClick={() => onPlayFrom(i)}
                  title="Play from here"
                  aria-label={`Play from ${s.unit.id}/${s.fixture.id}`}
                >
                  ▶
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </aside>
  );
}

/** Status bar at the bottom of the app-frame: verdict + check summary, with
 *  failed/warn checks listed inline. Renders a "running…" placeholder until
 *  the result lands so the frame doesn't jump. */
function FrameStatus({ result }: { result: VerifyResult | null }) {
  if (!result) {
    return (
      <div className="app-frame-status running">
        <span className="spinner" /> <span className="sub">running checks…</span>
      </div>
    );
  }
  const fails = result.checks.filter((c) => c.status === "fail");
  const warns = result.checks.filter((c) => c.status === "warn");
  const counts = {
    ok: result.checks.filter((c) => c.status === "ok").length,
    probe: result.checks.filter((c) => c.status === "probe").length,
    warn: warns.length,
    fail: fails.length,
  };
  return (
    <div
      className={`app-frame-status v-${result.verdict.toLowerCase()}`}
      data-verdict={result.verdict}
    >
      <div className="status-line">
        <VerdictBadge verdict={result.verdict} />
        <span className="status-counts">
          {counts.ok > 0 && <span>✅ {counts.ok}</span>}
          {counts.probe > 0 && <span>🔍 {counts.probe}</span>}
          {counts.warn > 0 && <span>⚠️ {counts.warn}</span>}
          {counts.fail > 0 && <span>❌ {counts.fail}</span>}
        </span>
        <span className="sub status-meta">
          {result.checks.length} checks · {result.durationMs}ms
        </span>
      </div>
      {result.blockedReason && (
        <p className="status-detail blocked">⛔ {result.blockedReason}</p>
      )}
      {(fails.length > 0 || warns.length > 0) && (
        <ul className="status-issues">
          {fails.map((c, i) => (
            <li key={`f${i}`}>
              <CheckIcon status="fail" /> <code>[{c.tag}]</code> {c.label}
              {c.detail && <span className="check-detail"> — {c.detail}</span>}
            </li>
          ))}
          {fails.length === 0 &&
            warns.map((c, i) => (
              <li key={`w${i}`}>
                <CheckIcon status="warn" /> <code>[{c.tag}]</code> {c.label}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

function ReplaySummary({
  results,
  steps,
  clips,
}: {
  results: VerifyResult[];
  steps: Step[];
  clips: Clip[];
}) {
  const s = summarize(results);
  const clipFor = (r: VerifyResult) =>
    clips.find((c) => c.name === `${r.unitId}__${r.fixtureId}`);
  const totalBytes = clips.reduce((a, c) => a + c.bytes, 0);
  return (
    <section className="replay-summary" data-verify-replay-summary={JSON.stringify(s)}>
      <h2>Summary</h2>
      <p className="replay-summary-line">
        <span className="s-pass">✅ {s.pass}</span>{" "}
        <span className="s-fail">❌ {s.fail}</span>{" "}
        <span className="s-blocked">⛔ {s.blocked}</span>{" "}
        <span className="sub">/ {results.length} of {steps.length}</span>
      </p>
      {clips.length > 0 && (
        <div className="clips-bar">
          <button onClick={() => downloadAll(clips)} aria-label="Download all clips">
            ⬇ Download all ({clips.length} × .webm, {fmtBytes(totalBytes)})
          </button>
          <span className="sub">
            One clip per fixture, cropped to the stage.
          </span>
        </div>
      )}
      <table className="fixture-table">
        <thead>
          <tr>
            <th>Unit</th>
            <th>Fixture</th>
            <th>Verdict</th>
            <th>ms</th>
            {clips.length > 0 && <th>Clip</th>}
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const clip = clipFor(r);
            return (
              <tr key={`${r.unitId}::${r.fixtureId}`}>
                <td><code>{r.unitId}</code></td>
                <td><code>{r.fixtureId}</code></td>
                <td><VerdictBadge verdict={r.verdict} /></td>
                <td className="sub">{r.durationMs}</td>
                {clips.length > 0 && (
                  <td>
                    {clip ? (
                      <a
                        href={clip.url}
                        download={`${clip.name}.webm`}
                        onClick={(e) => {
                          e.preventDefault();
                          downloadClip(clip);
                        }}
                      >
                        ⬇ {fmtBytes(clip.bytes)} · {(clip.durationMs / 1000).toFixed(1)}s
                      </a>
                    ) : (
                      <span className="sub">—</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/* ---------------------- helpers ---------------------- */

function summarize(results: VerifyResult[]) {
  return {
    pass: results.filter((r) => r.verdict === "PASS").length,
    fail: results.filter((r) => r.verdict === "FAIL").length,
    blocked: results.filter((r) => r.verdict === "BLOCKED").length,
  };
}

function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number
) {
  const n = raw ? parseInt(raw, 10) : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function raf() {
  return new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r()))
  );
}

/** Escape the current React commit phase entirely. */
function task() {
  return new Promise<void>((r) => setTimeout(r, 0));
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/** Unmount an inner root and remove its container from the host. Caller must
 *  ensure this runs outside the outer React commit (defer via task/microtask). */
function disposeInner(inner: { root: Root; container: HTMLElement }) {
  try {
    inner.root.unmount();
  } catch {
    /* already unmounted */
  }
  inner.container.remove();
}
