# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0
# 2 · Programmatic tool calling: Claude writes ONE loop that calls your tool 40 times; only its print() reaches the context.
import anthropic, json, random

FROM_CODE = True    # CHANGE ME: set to False and Claude calls the tool directly, so all 40 results land in the context

client = anthropic.Anthropic()
random.seed(22)

# your side: a "vehicle gateway" with 40 cars, each on a planned route of street segments
STREETS = ["Fell St", "Oak St", "Hayes St", "Geary Blvd", "Lincoln Way", "Fulton St"]
CROSSES = ["Masonic Ave", "Divisadero St", "Stanyan St", "Baker St", "Clayton St"]
ROUTES = {f"SX-{n}": [{"street": random.choice(STREETS), "to_cross": random.choice(CROSSES), "eta_min": i * 3 + random.randint(0, 2)}
                      for i in range(5)] for n in range(101, 141)}

def vehicle_route_get(vehicle_id):                      # an ordinary function on your laptop; the API never sees ROUTES
    return json.dumps({"vehicle_id": vehicle_id, "segments": ROUTES.get(vehicle_id, [])})

route_tool = {"name": "vehicle_route_get",
              "description": "Planned route for one vehicle: ordered street segments {street, to_cross, eta_min}.",
              "input_schema": {"type": "object", "properties": {"vehicle_id": {"type": "string"}}, "required": ["vehicle_id"]}}
if FROM_CODE:
    route_tool["allowed_callers"] = ["code_execution_20260120"]   # the whole feature: this tool may be called FROM the sandbox's Python
TOOLS = [{"type": "code_execution_20260521", "name": "code_execution"}, route_tool]
TASK = (f"Vehicles in service: {', '.join(ROUTES)}. I'm about to fence off Fell St at Masonic Ave. Which vehicles have a "
        "planned segment on Fell St ending at Masonic Ave, and when do they get there? Check every route; give me a table sorted by ETA.")

messages, container, requests, calls = [{"role": "user", "content": TASK}], None, 0, 0
while True:
    resp = client.messages.create(model="claude-sonnet-5-5", max_tokens=8000, tools=TOOLS, messages=messages,
                                  **({"container": container} if container else {}))
    requests += 1
    container = resp.container.id if resp.container else container        # same sandbox every turn
    messages.append({"role": "assistant", "content": resp.content})
    for b in resp.content:
        if b.type == "server_tool_use":
            print(f">>> the model wrote:\n{b.input.get('code') or b.input.get('command')}\n")
        elif b.type == "text" and b.text.strip():
            print(b.text)
    if resp.stop_reason == "pause_turn":                                  # sandbox still running: just call again
        continue
    uses = [b for b in resp.content if b.type == "tool_use"]              # with FROM_CODE these arrive from the running code, many at once
    if not uses:
        break
    calls += len(uses)
    messages.append({"role": "user", "content": [
        {"type": "tool_result", "tool_use_id": u.id, "content": vehicle_route_get(**u.input)} for u in uses]})

print(f"\n{calls} tool calls served from this machine across {requests} API requests · "
      f"the last request carried {resp.usage.input_tokens:,} input tokens")
