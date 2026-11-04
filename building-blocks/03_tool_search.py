# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0
# 3 · Tool search: ship 60 tools, load a handful. Claude searches your catalog and only the hits enter the context.
import anthropic

TASK = ("2026-08-08 22:30. Two cars (SX-118, SX-131) were involved in tonight's Fell & Masonic incident. "
        "Preserve their telemetry for the regulator for 30 days, incident INC-0822.")   # CHANGE ME: ask for something that needs two services

client = anthropic.Anthropic()

# a sprawling admin catalog, the kind every ops org accretes (12 services × 5 verbs = 60 tools)
SERVICES = {"geofence": "no-serve polygons on the live map", "vehicle": "one robotaxi", "ra_queue": "the remote-assistance queue",
            "map_release": "map tile releases and staged rollbacks", "evidence_hold": "legal/evidence preservation of vehicle telemetry",
            "staging_zone": "curb space reserved for pickup surges", "shift": "ops staff shifts", "rider_credit": "rider refunds and credits",
            "permit_report": "regulator (CPUC/DMV) filings", "charger": "depot chargers", "firmware": "vehicle firmware rollouts",
            "weather_hold": "service holds for fog/wind"}
VERBS = {"list": "List", "get": "Get one", "create": "Create", "update": "Update", "cancel": "Cancel"}
CATALOG = [{"name": f"{svc}_{verb}",
            "description": f"{label} {svc.replace('_', ' ')} record(s): {desc}. Args: id (record id), vehicle_ids, reason (free text, "
                           f"lands in the audit log), until (ISO 8601 or relative like +30d). Requires ops-admin scope; every call is audited.",
            "input_schema": {"type": "object", "properties": {"id": {"type": "string"}, "vehicle_ids": {"type": "array", "items": {"type": "string"}},
                                                            "reason": {"type": "string"}, "until": {"type": "string"}}},
            "defer_loading": True}                                            # described to the API, NOT put in the model's context
           for svc, desc in SERVICES.items() for verb, label in VERBS.items()]

resp = client.messages.create(
    model="claude-sonnet-5-5",
    max_tokens=2000,
    tools=[{"type": "tool_search_tool_bm25_20251119", "name": "tool_search_tool_bm25"}] + CATALOG,
    messages=[{"role": "user", "content": TASK}],
)

for b in resp.content:
    if b.type == "server_tool_use":
        print(f"search  → {b.input}")                                         # Claude querying YOUR catalog
    elif b.type == "tool_search_tool_result":
        print("loaded  →", [r.tool_name for r in b.content.tool_references])  # only these definitions entered the context
    elif b.type == "tool_use":
        print(f"call    → {b.name}({b.input})")
    elif b.type == "text" and b.text.strip():
        print("text    →", b.text.strip()[:200])

everything = client.messages.count_tokens(model="claude-sonnet-5-5", messages=[{"role": "user", "content": "hi"}],
                                          tools=[{k: v for k, v in t.items() if k != "defer_loading"} for t in CATALOG])
print(f"\nall 60 tools loaded up front: {everything.input_tokens:,} prompt tokens · this request: {resp.usage.input_tokens:,}")
