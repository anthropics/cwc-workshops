# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0
# 4 · Advisor tool: a fast, cheap executor (Haiku) that can phone a frontier model (Opus) mid-turn, server-side, in one request.
import anthropic

EXECUTOR = "claude-haiku-5-5"    # CHANGE ME: try "claude-sonnet-5-5". The executor has to sit at or below the advisor.

client = anthropic.Anthropic()

EVIDENCE = """Saturday 22:14, Golden Gate Park. Outside Lands lets out ~22:45 (est. 9,000 ride requests in 40 min).
- 14 robotaxis stopped in-lane at Fell St & Masonic Ave since 22:00, all on map release 2026.08.08-2 (pushed 17:58), trigger no_drivable_successor.
- 0 such stops in the prior 7 days. Vehicles on 2026.08.07-1 pass the same junction fine.
- Remote-assistance queue: 31 waiting, median pickup 6m10s (SLA 90s). 2 field vans free, 20 min out.
- Levers I hold: geofence (instant, reroutes everyone ~4 min longer), staged map rollback (12-15 min, needs Mapping on-call ack),
  RA queue priority rules, activate curb staging zones, wake 40 reserve vehicles at the Toland depot (25 min to the park)."""

resp = client.beta.messages.create(
    model=EXECUTOR,                                                         # the executor: fast and cheap, does the legwork
    max_tokens=4000,
    betas=["advisor-tool-2026-03-01"],
    tools=[{"type": "advisor_20260301", "name": "advisor",
            "model": "claude-opus-5-5", "max_uses": 1, "max_tokens": 1500}],  # the advisor: consulted, never in charge
    system="You are the shift lead's deputy at a robotaxi operator. Before committing to a plan with public-safety or regulatory "
           "consequences, consult the advisor once with the specific trade-off you're unsure about. Then decide.",
    messages=[{"role": "user", "content": EVIDENCE + "\n\nGive me the order of operations for the next 30 minutes, with times. Short."}],
)

for b in resp.content:
    if b.type == "server_tool_use" and b.name == "advisor":
        print("── executor consults opus (the advisor reads the whole conversation, so the call carries no arguments) ──\n")
    elif b.type == "advisor_tool_result":
        print(f"── opus answers: {b.content.type} ──")                      # on 5.5 advisors this comes back encrypted
        print(getattr(b.content, "text", None) or "encrypted: only the executor can read it. Pass the block back unchanged on later turns.\n")
    elif b.type == "text" and b.text.strip():
        print(f"── executor decides ──\n{b.text}")

print("\nbilled per model:")
for step in getattr(resp.usage, "iterations", None) or []:
    print(f"  {getattr(step, 'model', None) or resp.model}: {step.input_tokens:,} in / {step.output_tokens:,} out")
