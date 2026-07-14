// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

/**
 * Central registries for units and global checks.
 *
 * Specs live in `src/verify/specs/` and register a unit here. Cross-cutting
 * checks (a11y, …) live in `src/verify/checks/` and register themselves as
 * GLOBAL checks — they run against every unit. Unit-local checks are declared
 * inline on the unit. The harness discovers everything through this registry —
 * no magic globs, no build-time codegen.
 */

import type { Check, VerifiableUnit, VerifyManifestEntry } from "./types";

const units = new Map<string, VerifiableUnit<any>>();
const globalChecks = new Map<string, Check<any>>();

export function registerUnit<P>(unit: VerifiableUnit<P>): VerifiableUnit<P> {
  if (units.has(unit.id)) {
    // Hot-reload friendly: replace rather than throw.
    units.delete(unit.id);
  }
  units.set(unit.id, unit);
  return unit;
}

/** Register a cross-cutting check that runs against EVERY unit. */
export function registerGlobalCheck<P>(check: Check<P>): Check<P> {
  if (globalChecks.has(check.id)) globalChecks.delete(check.id);
  globalChecks.set(check.id, check);
  return check;
}

export function getUnit(id: string): VerifiableUnit<any> | undefined {
  return units.get(id);
}

export function allUnits(): VerifiableUnit<any>[] {
  return Array.from(units.values());
}

export function allGlobalChecks(): Check<any>[] {
  return Array.from(globalChecks.values());
}

/** The full ordered list of checks that apply to a unit: global first (so
 *  cross-cutting failures surface up top), then the unit's own checks. */
export function checksFor(unit: VerifiableUnit<any>): Check<any>[] {
  return [...allGlobalChecks(), ...unit.checks];
}

export function buildManifest(): VerifyManifestEntry[] {
  return allUnits().map((u) => ({
    unitId: u.id,
    title: u.title,
    kind: u.kind,
    fixtures: u.fixtures.map((f) => ({
      id: f.id,
      description: f.description,
      probe: Boolean(f.probe),
    })),
    checks: checksFor(u).map((c) => ({
      id: c.id,
      description: c.description,
      tag: c.tag ?? "behavior",
    })),
    route: (fixtureId: string) =>
      `/verify/${encodeURIComponent(u.id)}/${encodeURIComponent(fixtureId)}`,
  }));
}
