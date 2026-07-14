// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

/**
 * The matrix test: run every registered unit × fixture through every
 * applicable verifier and assert the verdicts.
 *
 * This is the SAME code path an AI agent hits via `window.__verify.runAll()`
 * and that the dashboard's "Run all" button uses. One source of truth,
 * three consumers: CI, dashboard, agent.
 *
 * Fixtures flagged `probe: true` that are DESIGNED to fail (like
 * TodoStats/inconsistent-counts) are asserted to FAIL — proving the
 * framework catches lies (the counts shown on screen don't add up), not just
 * confirms truths.
 */

import { describe, expect, it } from "vitest";
import "./checks";
import "./specs";
import { allUnits } from "./core/registry";
import { runUnit } from "./core/runner";

/** Fixtures that are intentionally broken and MUST fail. */
const EXPECTED_FAIL = new Set(["TodoStats::inconsistent-counts"]);

describe("verification matrix", () => {
  const units = allUnits();

  it("has units registered", () => {
    expect(units.length).toBeGreaterThan(0);
  });

  for (const unit of units) {
    describe(unit.id, () => {
      it("has at least one probe fixture", () => {
        // CC rule: "a Steps list that's all ✅ and no 🔍 is a happy-path replay."
        expect(
          unit.fixtures.some((f) => f.probe),
          `Unit "${unit.id}" has no probe fixtures — only the happy path is covered.`
        ).toBe(true);
      });

      for (const fixture of unit.fixtures) {
        const key = `${unit.id}::${fixture.id}`;
        const shouldFail = EXPECTED_FAIL.has(key);
        it(`${fixture.probe ? "🔍 " : ""}${fixture.id} → ${shouldFail ? "FAIL (by design)" : "PASS"}`, async () => {
          const results = await runUnit(unit);
          const r = results.find((x) => x.fixtureId === fixture.id);
          expect(r, `no result for ${key}`).toBeDefined();
          if (shouldFail) {
            expect(
              r!.verdict,
              `Expected FAIL but got ${r!.verdict}:\n${JSON.stringify(r!.checks, null, 2)}`
            ).toBe("FAIL");
          } else {
            expect(
              r!.verdict,
              `Expected PASS but got ${r!.verdict}:\n${JSON.stringify(
                r!.checks.filter((c) => c.status === "fail"),
                null,
                2
              )}\nblocked: ${r!.blockedReason ?? "—"}`
            ).toBe("PASS");
          }
        });
      }
    });
  }
});
