# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0
# 5 · Effort: one dial that trades depth for latency and spend. Same model, same prompt, run at each level.
import anthropic, time

LEVELS = ("low", "high")    # CHANGE ME: try ("medium", "xhigh"). The levels are low, medium, high, xhigh, max.

client = anthropic.Anthropic()

PROMPT = """It is Saturday 22:14. My deputy drafted this plan. List every factual or arithmetic error in it, one line each, then stop.

FACTS: 14 cars stopped at Fell & Masonic since 22:00, all on map 2026.08.08-2 (pushed 17:58). Outside Lands lets out 22:45.
Geofence is instant and adds ~4 min to trips. Staged rollback takes 12-15 min after Mapping acks; Mapping's ack SLA is 5 min.
2 field vans at the depot, 20 min from the park; clearing a car takes a van 3 min. 40 reserve cars at Toland, 25 min away.
RA queue: 31 waiting, 6 operators on shift, ~2 min per assist.

PLAN:
1. 22:14 geofence Fell/Masonic. Trips get ~4 min longer; acceptable.
2. 22:14 page Mapping. With a 5-min ack and 12-15 min rollout, rollback is live by 22:26 at the latest.
3. 22:15 dispatch both vans (arrive 22:35). Two vans clearing 14 cars at 3 min each are done by 22:50.
4. 22:15 wake the Toland reserves so 40 cars are staged at the park by 22:35, ten minutes before let-out.
5. RA: 6 operators × 2 min clears the 31-deep queue in about 6 minutes, so the queue is empty by 22:21.
6. Net: every stopped car is cleared and reserves are staged before the 22:45 let-out. No rider impact expected."""

for effort in LEVELS:
    t0 = time.time()
    resp = client.messages.create(
        model="claude-sonnet-5-5",
        max_tokens=16000,
        output_config={"effort": effort},
        messages=[{"role": "user", "content": PROMPT}],
    )
    answer = "".join(b.text for b in resp.content if b.type == "text").strip()
    print(f"── effort={effort}: {time.time() - t0:.0f}s · {resp.usage.output_tokens:,} output tokens, thinking included ──\n{answer}\n")

# The same idea for a whole agent loop: give Claude a token budget for the *task* and it paces itself across turns (beta):
#   client.beta.messages.create(model="claude-sonnet-5-5", betas=["task-budgets-2026-03-13"], tools=[...], messages=[...],
#       max_tokens=8000, output_config={"effort": "high", "task_budget": {"type": "tokens", "total": 24_000}})
