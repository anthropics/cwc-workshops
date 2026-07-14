// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

/**
 * Core types for the verification framework.
 *
 * Design principles:
 *  - Verification is runtime observation at the SURFACE (rendered DOM), not
 *    static analysis or unit tests.
 *  - There are exactly TWO nouns: a `VerifiableUnit` (something renderable in
 *    isolation) and a `Check` (a predicate over the mounted DOM). Everything
 *    else — a11y, contract, behaviour — is just a Check with a `tag`.
 *  - Verdicts follow the PASS / FAIL / BLOCKED / SKIP taxonomy. BLOCKED means
 *    "couldn't observe" (e.g. the unit emitted no machine-readable contract),
 *    which is distinct from FAIL ("observed and wrong").
 *  - Every verifiable unit declares FIXTURES: named, reproducible states.
 *    Fixtures marked `probe: true` are off-happy-path stress cases (🔍).
 *  - Prop *shape* is TypeScript's job (compile time). Checks observe the
 *    rendered surface at runtime — that's the only thing that ships.
 */

import type { ReactElement } from "react";

/* -------------------------------------------------------------------------- */
/* Verdicts & check results                                                   */
/* -------------------------------------------------------------------------- */

export type Verdict = "PASS" | "FAIL" | "BLOCKED" | "SKIP";

/**
 * One observation the runner recorded. Statuses follow a four-way taxonomy:
 *  ok    (✅) — confirmed
 *  fail  (❌) — observed and wrong
 *  warn  (⚠️) — concerning, didn't fail outright
 *  probe (🔍) — off-happy-path stress case that held
 */
export type CheckStatus = "ok" | "fail" | "warn" | "probe";

export interface CheckResult {
  /** The id of the check that produced this. */
  check: string;
  /** Reporting bucket: "behavior" | "contract" | "a11y" | … */
  tag: string;
  status: CheckStatus;
  /** Short label — what was checked. */
  label: string;
  /** Optional longer detail, e.g. the actual vs expected values. */
  detail?: string;
  /** Optional raw evidence (serializable). Captured output IS the evidence. */
  evidence?: unknown;
}

/** The result of running all checks against one unit × fixture. */
export interface VerifyResult {
  unitId: string;
  fixtureId: string;
  verdict: Verdict;
  checks: CheckResult[];
  /** Machine-readable snapshot of the DOM contract at time of run. */
  domSnapshot: Record<string, string>;
  /** Wall-clock timing for the run, ms. */
  durationMs: number;
  /** If BLOCKED, why we couldn't observe. */
  blockedReason?: string;
  timestamp: string;
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A Fixture is a named, reproducible rendering configuration.
 * `probe: true` marks an adversarial / edge-case fixture — the 🔍 steps.
 * A spec with zero probe fixtures has only replayed the happy path.
 */
export interface Fixture<P = unknown> {
  id: string;
  /** One-line human description of the scenario. */
  description: string;
  /** Props to mount the unit with. */
  props: P;
  /** Mark as an off-happy-path / stress fixture. */
  probe?: boolean;
  /**
   * Optional imperative actions to run after mount, before verification.
   * Lets a fixture express "render, then click X, then verify."
   * Receives the root element and a small driver with helpers.
   */
  act?: (ctx: ActContext) => void | Promise<void>;
}

export interface ActContext {
  /** The root DOM element the unit is mounted into. */
  root: HTMLElement;
  /** Click an element matching a selector inside the root. Throws if missing.
   *  May be async (visible driver animates a highlight) — always await. */
  click: (selector: string) => void | Promise<void>;
  /** Type into an input matching a selector. Throws if missing.
   *  May be async (visible driver types char-by-char) — always await. */
  type: (selector: string, text: string) => void | Promise<void>;
  /** Wait n ms — for transitions / async state to settle. */
  wait: (ms: number) => Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* Checks — the one and only kind of assertion                                */
/* -------------------------------------------------------------------------- */

/** What a Check predicate sees: the mounted DOM + the fixture's props. */
export interface CheckContext<P = unknown> {
  root: HTMLElement;
  props: P;
  fixture: Fixture<P>;
  /** Convenience: read the DOM contract (`data-verify-*` attrs) as a map. */
  contract: Record<string, string>;
}

/**
 * A Check is a named predicate over the mounted unit. It returns:
 *   - `true`   → the check holds (✅, or 🔍 on a probe fixture)
 *   - `false`  → violated, no explanation
 *   - a string → violated, with a human-readable reason
 *
 * A Check can be declared on a unit (component-specific behaviour) or
 * registered as a GLOBAL check (cross-cutting: a11y, perf, …) that runs
 * against every unit. Same shape either way — that's the whole point.
 */
export interface Check<P = unknown> {
  id: string;
  description: string;
  /** Reporting bucket. Defaults to "behavior" for unit checks. */
  tag?: string;
  check: (ctx: CheckContext<P>) => boolean | string;
  /** Optionally restrict to specific fixtures. Default: all. */
  onlyFixtures?: string[];
}

/* -------------------------------------------------------------------------- */
/* Verifiable unit                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A VerifiableUnit is the unit of modularity. It can be a single component
 * or a whole feature slice. It declares:
 *  - how to render itself in isolation (render + fixtures)
 *  - what must always be true when rendered (checks)
 *
 * Global checks (a11y, …) additionally run against every unit — see
 * `registerGlobalCheck`.
 */
export interface VerifiableUnit<P = unknown> {
  id: string;
  title: string;
  description: string;
  /** "component" for a leaf, "feature" for a slice with its own state. */
  kind: "component" | "feature";
  /** Render the unit in isolation for a given fixture. */
  render: (props: P) => ReactElement;
  fixtures: Fixture<P>[];
  /** Component-specific predicates over the mounted DOM. */
  checks: Check<P>[];
}

/* -------------------------------------------------------------------------- */
/* The global agent handle: window.__verify                                   */
/* -------------------------------------------------------------------------- */

export interface VerifyManifestEntry {
  unitId: string;
  title: string;
  kind: "component" | "feature";
  fixtures: Array<{ id: string; description: string; probe: boolean }>;
  /** Every check that will run against this unit (global + unit-local). */
  checks: Array<{ id: string; description: string; tag: string }>;
  /** Deep-link to the isolated mount. */
  route: (fixtureId: string) => string;
}

/**
 * The agent-facing handle. Exposed on `window.__verify`. An AI agent (or
 * Playwright) can:
 *   - `window.__verify.manifest()` → discover every unit × fixture
 *   - navigate to `/verify/:unit/:fixture` → isolated mount
 *   - `window.__verify.current()` → structured VerifyResult for what's mounted
 *   - `window.__verify.runAll()` → run the full matrix headlessly
 */
export interface VerifyHandle {
  manifest: () => VerifyManifestEntry[];
  /** Result for whatever unit/fixture is currently mounted (null if none). */
  current: () => VerifyResult | null;
  /** Run every unit × fixture and return the full matrix. */
  runAll: () => Promise<VerifyResult[]>;
  /** Version of the verify protocol — lets agents know what to expect. */
  version: string;
}

declare global {
  interface Window {
    __verify?: VerifyHandle;
  }
}
