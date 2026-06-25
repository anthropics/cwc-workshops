<!-- Copyright 2026 Anthropic PBC -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Solutions

Finished versions of the files the workshop leaves as `TODO(workshop-N)` stubs, at the same paths they have in the app:

| TODOs | File |
|---|---|
| 1, 7 | `src/lib/orchestrator.ts` — the `user.message` send and the dispatch handler |
| 2 | `src/app/api/desk/stream/route.ts` — the SSE event-stream proxy |
| 3, 4 | `src/lib/provision.ts` — the analyst coordinator and the `dispatch_analysts` tool |
| 5 | `src/lib/analysis.ts` — the memory-store mount on analyst sessions |
| 6 | `src/lib/sessions.ts` — the `user.define_outcome` kickoff |

Stuck on a stub? Compare with the matching file here, or copy it over the one in the app. (These copies are excluded from the app's build — they're reference material, not code the server runs.)
