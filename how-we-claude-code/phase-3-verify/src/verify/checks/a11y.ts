// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

/**
 * A11y checks — a deliberately small, dependency-free set of accessibility
 * predicates, registered as GLOBAL checks so they run against every unit
 * without any component or spec opting in.
 *
 * This is the whole "pluggable verifier" story, minus the plugin machinery:
 * a new KIND of check is just a `Check` with a different `tag`, registered
 * globally. Swap this file for an axe-core wrapper and nothing else changes.
 */

import type { Check } from "../core/types";
import { registerGlobalCheck } from "../core/registry";

const TAG = "a11y";

/** Buttons must have accessible names. */
export const buttonsNamed: Check = registerGlobalCheck({
  id: "a11y:buttons-named",
  tag: TAG,
  description: "all buttons have accessible names",
  check: ({ root }) => {
    const buttons = Array.from(
      root.querySelectorAll<HTMLElement>("button, [role=button]")
    );
    const unnamed = buttons.filter((b) => !accessibleName(b));
    return (
      unnamed.length === 0 ||
      `${unnamed.length}/${buttons.length} button(s) lack accessible names: ` +
        unnamed.map((b) => b.outerHTML.slice(0, 60)).join(" | ")
    );
  },
});

/** Inputs must have labels (aria-label, aria-labelledby, or <label for>). */
export const inputsLabeled: Check = registerGlobalCheck({
  id: "a11y:inputs-labeled",
  tag: TAG,
  description: "all inputs are labeled",
  check: ({ root }) => {
    const inputs = Array.from(
      root.querySelectorAll<HTMLInputElement>(
        "input:not([type=hidden]), textarea, select"
      )
    );
    const unlabeled = inputs.filter((i) => !inputLabel(i, root));
    return (
      unlabeled.length === 0 ||
      `${unlabeled.length}/${inputs.length} input(s) are unlabeled: ` +
        unlabeled.map((i) => i.outerHTML.slice(0, 60)).join(" | ")
    );
  },
});

/** Images must have alt text. */
export const imagesHaveAlt: Check = registerGlobalCheck({
  id: "a11y:images-have-alt",
  tag: TAG,
  description: "all images have alt text",
  check: ({ root }) => {
    const imgs = Array.from(root.querySelectorAll<HTMLImageElement>("img"));
    const noAlt = imgs.filter((i) => !i.hasAttribute("alt"));
    return noAlt.length === 0 || `${noAlt.length}/${imgs.length} image(s) missing alt`;
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

function inputLabel(el: HTMLInputElement, root: HTMLElement): boolean {
  if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby"))
    return true;
  if (el.id && root.querySelector(`label[for="${CSS.escape(el.id)}"]`))
    return true;
  if (el.closest("label")) return true;
  return false;
}
