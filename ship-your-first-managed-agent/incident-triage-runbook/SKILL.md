---
name: incident-triage-runbook
description: The SRE team's runbook for triaging production latency and error-rate incidents. Use this whenever investigating an incident, a latency spike, elevated error rates, or when asked "what caused X" about a production service.
---

# Incident triage

If you change the order below, say why in #sre.

## Order of operations

1. Pull deploys for the last 6h. Don't open the log first.
2. Line the deploy timestamps up against `p99_latency_ms` / `error_rate` for the paged service. State the gap ("deploy 14:31, p99 moves 14:33").
3. If a deploy lines up: pull the diff, read it. Check for the stuff in the next section.
4. Then grep the log to confirm. Don't grep to fish.
5. No deploy lines up → check `db_pool_utilization` across checkout/cart/auth/inventory, then upstream deps.

## Things that have burned us

In rough order of how often:

- per-row query where there used to be a batch
- cache decorator removed "temporarily"
- new query, no index
- blocking call in an async handler
- retry loop with no backoff

## Write-up

One line at the bottom:

> **Root cause:** `<sha>` — one sentence on the mechanism.

If it wasn't a deploy, put the component or upstream dep where the sha goes (`db-primary`, `stripe-api`, whatever). Still one sentence.

Everything above that line is evidence. Keep it short; the long version goes in the postmortem doc.
