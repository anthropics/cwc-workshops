// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

/**
 * A11y verifier — a deliberately small, dependency-free set of accessibility
 * checks. Not a replacement for axe-core; exists to show that a new KIND of
 * verification can be plugged in without touching any component.
 */

import type { Check, Verifier } from "../core/types";
import { registerVerifier } from "../core/registry";

export const a11yVerifier: Verifier = registerVerifier({
  id: "a11y",
  description: "Basic accessibility checks (labels, roles, alt text).",
  run({ root, fixture }) {
    const checks: Check[] = [];
    const base = fixture.probe ? "probe" : "ok";

    // Buttons must have accessible names.
    const buttons = root.querySelectorAll<HTMLElement>(
      "button, [role=button]"
    );
    const unnamed = Array.from(buttons).filter((b) => !accessibleName(b));
    if (buttons.length > 0) {
      checks.push(
        unnamed.length === 0
          ? {
              verifier: "a11y",
              status: base,
              label: `All ${buttons.length} button(s) have accessible names`,
            }
          : {
              verifier: "a11y",
              status: "fail",
              label: `${unnamed.length}/${buttons.length} button(s) lack accessible names`,
              detail: unnamed.map((b) => b.outerHTML.slice(0, 80)).join(" | "),
            }
      );
    }

    // Inputs must have labels (aria-label, aria-labelledby, or <label for>).
    const inputs = root.querySelectorAll<HTMLInputElement>(
      "input:not([type=hidden]), textarea, select"
    );
    const unlabeled = Array.from(inputs).filter((i) => !inputLabel(i, root));
    if (inputs.length > 0) {
      checks.push(
        unlabeled.length === 0
          ? {
              verifier: "a11y",
              status: base,
              label: `All ${inputs.length} input(s) are labeled`,
            }
          : {
              verifier: "a11y",
              status: "fail",
              label: `${unlabeled.length}/${inputs.length} input(s) are unlabeled`,
              detail: unlabeled.map((i) => i.outerHTML.slice(0, 80)).join(" | "),
            }
      );
    }

    // Images must have alt.
    const imgs = root.querySelectorAll<HTMLImageElement>("img");
    const noAlt = Array.from(imgs).filter((i) => !i.hasAttribute("alt"));
    if (imgs.length > 0) {
      checks.push(
        noAlt.length === 0
          ? { verifier: "a11y", status: base, label: "All images have alt" }
          : {
              verifier: "a11y",
              status: "fail",
              label: `${noAlt.length}/${imgs.length} image(s) missing alt`,
            }
      );
    }

    if (checks.length === 0) {
      checks.push({
        verifier: "a11y",
        status: base,
        label: "No interactive elements to check",
      });
    }
    return checks;
  },
});

function accessibleName(el: HTMLElement): string {
  return (
    el.getAttribute("aria-label") ||
    el.getAttribute("aria-labelledby") ||
    el.getAttribute("title") ||
    el.textContent?.trim() ||
    ""
  );
}

/**
 * Escape a value for use inside a *quoted* attribute selector.
 *
 * `CSS.escape` serialises an identifier, which is what you need for an
 * unquoted selector. Inside quotes the value is a string, so only `"` and `\`
 * have to be escaped -- and `CSS` is a browser global that jsdom does not
 * provide, so calling it here makes the verifier throw under a jsdom-based
 * test runner.
 */
function forQuotedAttr(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

function inputLabel(el: HTMLInputElement, root: HTMLElement): boolean {
  if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby"))
    return true;
  if (el.closest("label")) return true;
  if (el.id && root.querySelector(`label[for="${forQuotedAttr(el.id)}"]`))
    return true;
  return false;
}
