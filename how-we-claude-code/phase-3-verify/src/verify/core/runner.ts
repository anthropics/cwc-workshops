// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

/**
 * The runner: mount a unit × fixture, run every applicable check (global +
 * unit-local), compute a verdict, return a structured VerifyResult.
 *
 * Verdict rules:
 *  - SKIP    if the unit declares zero fixtures — nothing to observe.
 *  - BLOCKED if we couldn't mount, or the unit emitted NO `data-verify-*`
 *            contract (the surface isn't machine-readable → can't observe).
 *  - FAIL    if any check failed.
 *  - PASS    otherwise (warn and probe don't fail the run).
 *
 * "When in doubt, FAIL." Exceptions thrown by a check become a "fail" result
 * with the error as evidence — we do not swallow.
 */

import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type {
  ActContext,
  Check,
  CheckResult,
  Fixture,
  VerifiableUnit,
  Verdict,
  VerifyResult,
} from "./types";
import { readContract } from "./contract";
import { checksFor } from "./registry";

export interface RunOptions {
  /** Mount into this element instead of an off-screen container. Lets the
   *  harness verify the *visible* mount, not a hidden clone. */
  container?: HTMLElement;
  /** Already-mounted: skip mounting, just read + verify `container`. */
  alreadyMounted?: boolean;
}

export async function runFixture<P>(
  unit: VerifiableUnit<P>,
  fixture: Fixture<P>,
  opts: RunOptions = {}
): Promise<VerifyResult> {
  const started = performance.now();
  const base = {
    unitId: unit.id,
    fixtureId: fixture.id,
    timestamp: new Date().toISOString(),
  };

  let container = opts.container ?? null;
  let ownRoot: Root | null = null;
  let ownContainer: HTMLElement | null = null;

  try {
    if (!opts.alreadyMounted) {
      if (!container) {
        ownContainer = document.createElement("div");
        ownContainer.setAttribute("data-verify-sandbox", "true");
        // Off-screen but in the DOM so layout/a11y queries work.
        ownContainer.style.position = "fixed";
        ownContainer.style.left = "-10000px";
        ownContainer.style.top = "0";
        ownContainer.style.width = "800px";
        document.body.appendChild(ownContainer);
        container = ownContainer;
      }
      ownRoot = createRoot(container);
      flushSync(() => {
        ownRoot!.render(unit.render(fixture.props));
      });
      // Let effects run.
      await tick();
      if (fixture.act) {
        await fixture.act(makeActContext(container));
        await tick();
      }
    }

    if (!container) {
      return {
        ...base,
        verdict: "BLOCKED",
        checks: [],
        domSnapshot: {},
        durationMs: ms(started),
        blockedReason: "No container to observe.",
      };
    }

    const contract = readContract(container);

    // The DOM is the surface. If nothing emitted a data-verify-* contract,
    // an agent has nothing reliable to read — that's BLOCKED (couldn't
    // observe), deliberately distinct from FAIL (observed and wrong).
    if (Object.keys(contract).length === 0) {
      return {
        ...base,
        verdict: "BLOCKED",
        checks: [],
        domSnapshot: {},
        durationMs: ms(started),
        blockedReason:
          "No data-verify-* contract emitted — the surface is not machine-readable.",
      };
    }

    const results: CheckResult[] = [];
    for (const c of checksFor(unit)) {
      if (c.onlyFixtures && !c.onlyFixtures.includes(fixture.id)) continue;
      results.push(runCheck(c, fixture, container, contract));
    }

    return {
      ...base,
      verdict: verdictOf(results),
      checks: results,
      domSnapshot: contract,
      durationMs: ms(started),
    };
  } catch (err) {
    return {
      ...base,
      verdict: "BLOCKED",
      checks: [],
      domSnapshot: {},
      durationMs: ms(started),
      blockedReason: `Mount failed: ${String(err)}`,
    };
  } finally {
    if (ownRoot) ownRoot.unmount();
    if (ownContainer) ownContainer.remove();
  }
}

/** Run one check and normalise its boolean|string outcome into a result. */
function runCheck(
  c: Check<any>,
  fixture: Fixture<any>,
  root: HTMLElement,
  contract: Record<string, string>
): CheckResult {
  const tag = c.tag ?? "behavior";
  let outcome: boolean | string;
  try {
    outcome = c.check({ root, props: fixture.props, fixture, contract });
  } catch (err) {
    return {
      check: c.id,
      tag,
      status: "fail",
      label: c.description,
      detail: `Check "${c.id}" threw: ${String(err)}`,
      evidence: err instanceof Error ? err.stack : err,
    };
  }
  if (outcome === true) {
    return {
      check: c.id,
      tag,
      status: fixture.probe ? "probe" : "ok",
      label: c.description,
    };
  }
  return {
    check: c.id,
    tag,
    status: "fail",
    label: c.description,
    detail:
      typeof outcome === "string"
        ? outcome
        : `Check "${c.id}" returned false.`,
  };
}

export async function runUnit<P>(
  unit: VerifiableUnit<P>
): Promise<VerifyResult[]> {
  if (unit.fixtures.length === 0) {
    return [
      {
        unitId: unit.id,
        fixtureId: "(none)",
        verdict: "SKIP",
        checks: [],
        domSnapshot: {},
        durationMs: 0,
        blockedReason: "Unit declares no fixtures — nothing to observe.",
        timestamp: new Date().toISOString(),
      },
    ];
  }
  const out: VerifyResult[] = [];
  for (const f of unit.fixtures) {
    out.push(await runFixture(unit, f));
  }
  return out;
}

export function verdictOf(checks: CheckResult[]): Verdict {
  if (checks.some((c) => c.status === "fail")) return "FAIL";
  return "PASS";
}

/* ----------------------------- helpers ----------------------------- */

function ms(since: number) {
  return Math.round(performance.now() - since);
}

function tick() {
  return new Promise<void>((r) => setTimeout(r, 0));
}

export function makeActContext(root: HTMLElement): ActContext {
  return {
    root,
    click(selector) {
      const el = root.querySelector<HTMLElement>(selector);
      if (!el) throw new Error(`act.click: no element matching "${selector}"`);
      el.click();
    },
    type(selector, text) {
      const el = root.querySelector<HTMLInputElement>(selector);
      if (!el) throw new Error(`act.type: no element matching "${selector}"`);
      // React 18: set via native setter so React's onChange fires.
      const proto = Object.getPrototypeOf(el);
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      setter?.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    wait(msAmt) {
      return new Promise((r) => setTimeout(r, msAmt));
    },
  };
}
