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
5. If no deploy lines up, look for an upstream cause. Compare `db_pool_utilization` for checkout and cart. Where relevant, compare `queries_per_sec` and `cpu_utilization` for `db-primary` and `db-inventory`. The fixture has no pool series for auth or inventory and no metric series for `idp.internal`. For auth, use its latency and error series and the application log. For inventory, also check `cache_hit_rate`. Find what moved first.

Ask `get_metrics` for a name that doesn't exist and it lists the ones that do.

## Things that have burned us

In rough order of how often:

- per-row query where there used to be a batch
- cache decorator removed "temporarily"
- new query, no index
- blocking call in an async handler
- retry loop with no backoff

## Write-up

One line at the bottom of your reply:

> **Root cause:** `<sha>` — one sentence on the mechanism.

If it wasn't a deploy, put the component or upstream dep where the sha goes (`db-primary`, `stripe-api`, whatever). Still one sentence.

Everything above that line is evidence. Keep it short; the long version goes in the postmortem doc.

If you were handed an incident id, also save the structured version to `/workspace/findings/<INCIDENT_ID>.json` so the postmortem can be built from it:

```json
{
  "incident_id": "INC-0000",
  "service": "checkout",
  "title": "one line, what users saw",
  "root_cause": {"ref": "<sha or component>", "summary": "one sentence on the mechanism"},
  "timeline": [{"time": "14:31:18", "event": "what happened"}],
  "evidence": ["one fact per line, with the number or timestamp that proves it"],
  "ruled_out": ["what you checked that turned out not to be the cause, and why"],
  "impact": {"metric": "p99_latency_ms", "baseline": 65, "peak": 3640, "unit": "ms"},
  "fix": "the immediate remediation",
  "caused_by_incident": null
}
```

Set `caused_by_incident` to another page's id when your service is a victim of it.
