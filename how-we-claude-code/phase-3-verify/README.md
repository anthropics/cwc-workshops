<!-- Copyright 2026 Anthropic PBC -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Verifiable React

A small Vite + React todo app built around one idea: **every piece of the app
should be trivially verifiable by an AI agent at runtime**, not just by a human
reading code or a test suite running offline.

The design is built on a simple principle: verification is *runtime observation
at the surface* — you run the thing, drive it, read what it actually shows.
Type-checking and prop shape are the compiler's job; a verifier's job is to
confirm the real artifact behaves. This app bakes that philosophy into its
architecture.

```
bun install
bun run dev          # app on http://localhost:5199
                     # dashboard on http://localhost:5199/verify
bun run verify       # run the full verification matrix headlessly (vitest + jsdom)
bun run typecheck
```

## Two nouns, one runner

The whole framework is **two concepts**:

- a **`VerifiableUnit`** — something renderable in isolation, with named
  `fixtures` (reproducible states) and `checks`;
- a **`Check`** — a predicate over the *mounted DOM* that returns `true`
  (holds) or a string (the reason it failed).

That's it. There is no separate "verifier" plugin type, no schema layer, no
invariant type — a check is a check. A check tagged `a11y` or `contract` reads
differently in the report but runs through the identical code path.

### 1. The DOM is the machine-readable surface

Every component emits `data-verify-*` attributes describing its state:

```html
<section data-verify-unit="TodoApp" data-verify-total="3"
         data-verify-done="1" data-verify-active="2" data-verify-filter="all">
```

Checks and agents read **the DOM contract**, not React internals. That keeps
the surface stable across refactors — you can rewrite the internals freely as
long as the contract holds. See `src/verify/core/contract.ts` and the
`verifyAttrs()` helper.

If a unit emits *no* contract at all, the runner returns **BLOCKED** (couldn't
observe) — deliberately distinct from FAIL (observed and wrong).

### 2. Units declare fixtures + checks

Each component/feature registers a **VerifiableUnit** (`src/verify/specs/`):

- **fixtures** — named, reproducible render configurations (with optional
  imperative `act()` steps to drive interaction);
- **checks** — predicates that must hold over the mounted DOM.

Prop *shape* is checked by TypeScript at compile time — the framework doesn't
re-validate hand-authored fixture props at runtime. Runtime checks observe the
rendered surface, which is the only thing that ships.

Fixtures marked `probe: true` are adversarial edge cases. A unit with zero
probe fixtures has only replayed the happy path (`matrix.test.ts` enforces
at least one).

### 3. Isolated render targets: `/verify/:unit/:fixture`

Every unit × fixture gets a deep-linkable route that mounts *only that unit* in
known state, with no app shell. Append `?chrome=0` for a clean screenshot. An
agent (or Playwright) navigates here, observes, reads the result.

### 4. Global checks (cross-cutting, no opt-in)

Some checks aren't about one component — a11y, perf budgets, i18n. Those are
registered as **global checks** (`src/verify/checks/`) and run against *every*
unit automatically. Adding a new *kind* of verification is: write a `Check`,
`registerGlobalCheck()` it, done. No component or spec changes.

```ts
registerGlobalCheck({
  id: "a11y:buttons-named",
  tag: "a11y",
  description: "all buttons have accessible names",
  check: ({ root }) => /* … */,
});
```

### 5. `window.__verify` — the agent handle

A structured, versioned API for machine consumers:

```js
__verify.manifest()       // every unit × fixture × check
__verify.current()        // structured result for what's mounted
await __verify.runAll()   // run the full matrix, return results
```

The dashboard at `/verify` is just a human rendering of the same data. Agent and
human see the same truth.

### 6. One verdict taxonomy, three consumers

`PASS | FAIL | BLOCKED | SKIP`, check statuses as `ok ✅ | fail ❌ | warn ⚠️ | probe 🔍`.
The same `runFixture()` code path is called by:

- the **dashboard** ("Run all" button → verdict grid)
- the **agent** (`window.__verify.runAll()`)
- **CI** (`bun run verify` → vitest matrix)

`BLOCKED` (couldn't observe) is deliberately distinct from `FAIL` (observed and
wrong). When in doubt, the runner fails — a false PASS ships bugs, a false FAIL
costs one more look.

## File layout

```
src/
  features/todos/          the actual app (emits data-verify-* contracts)
  verify/
    core/
      types.ts             VerifiableUnit, Fixture, Check, Verdict
      contract.ts          data-verify-* helpers
      registry.ts          unit registry + global-check registry + manifest
      runner.ts            mount → act → run checks → verdict
    checks/                global (cross-cutting) checks: a11y
    specs/                 one .verify.ts per unit (fixtures + checks)
    harness/
      handle.ts            window.__verify
      Dashboard.tsx        /verify
      UnitPage.tsx         /verify/:unit/:fixture
      Report.tsx           structured result rendering
    matrix.test.ts         the CI path: run every unit×fixture, assert verdicts
```

## Try it with an agent

1. `bun run dev`
2. Tell an AI agent (or Playwright): "Open `/verify`, run
   `window.__verify.manifest()`, pick a unit, navigate to its route, and
   confirm `window.__verify.current().verdict === 'PASS'`."
3. Break something — e.g. remove `data-verify-total` from `TodoApp.tsx` — and
   watch the `counts-add-up` check fail with a precise diagnosis, in the
   dashboard AND in `bun run verify` AND at `window.__verify`. Remove the whole
   contract and the verdict becomes `BLOCKED`, not `FAIL`.

## Things deliberately demonstrated

- `TodoStats/inconsistent-counts` is a **probe that is DESIGNED to fail** — the
  counts shown on the surface don't add up (10 ≠ 3 + 4), and the
  `counts-shown-add-up` check catches it by *reading the rendered contract*. It
  proves the framework catches lies at the surface, not just confirms truths.
- `todos.feature/whitespace-submit` drives the real form with whitespace and
  asserts the count didn't change — a behavioral probe at the feature surface.
- Every unit is required (by `matrix.test.ts`) to have at least one probe
  fixture — you can't ship a unit that only tests the happy path.
