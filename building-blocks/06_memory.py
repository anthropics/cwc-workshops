# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0
# 6 · Memory tool + context editing: what the agent learned tonight is on YOUR disk, and next Saturday's fresh session reads it first.
import anthropic
from anthropic.tools import BetaLocalFilesystemMemoryTool                # SDK helper; subclass BetaAbstractMemoryTool for S3 or Postgres

NEXT_WEEK = ("2026-08-15 17:20. I'm covering tonight, wasn't here last week. Mapping wants to publish 2026.08.15-1 at 18:00 (one validator "
             "warning they plan to ack). Portola Festival lets out around 22:00. Anything I should push back on?")   # CHANGE ME: ask what it remembers

client = anthropic.Anthropic()
memory = BetaLocalFilesystemMemoryTool(base_path="./sutro_memories")     # Claude issues view/create/str_replace; this runs them locally
memory.clear_all_memory()

def session(task):
    messages = [{"role": "user", "content": task}]
    while True:
        resp = client.beta.messages.create(
            model="claude-sonnet-5-5", max_tokens=4000, messages=messages,
            tools=[memory.to_dict()],                                    # {"type": "memory_20250818", "name": "memory"}
            betas=["context-management-2025-06-27"],
            context_management={"edits": [{"type": "clear_tool_uses_20250919",                # long night? the API drops old tool
                                           "trigger": {"type": "input_tokens", "value": 30_000},  # results server-side, but
                                           "keep": {"type": "tool_uses", "value": 3},             # never the memory ops
                                           "exclude_tools": ["memory"]}]},
            system="You run overnight fleet operations for a robotaxi company. Dates matter; today is in the user's message.")
        messages.append({"role": "assistant", "content": resp.content})
        for b in resp.content:
            if b.type == "tool_use":
                print(f"  memory.{b.input['command']}({b.input.get('path', '')})")
            elif b.type == "text" and b.text.strip():
                print(b.text.strip(), "\n")
        if resp.stop_reason != "tool_use":
            return
        messages.append({"role": "user", "content": [{"type": "tool_result", "tool_use_id": b.id, "content": memory.call(b.input)}
                                                     for b in resp.content if b.type == "tool_use"]})

print("── session 1 · Saturday 2026-08-08, 23:50 ──")
session("2026-08-08 23:50. Debrief: map release 2026.08.08-2 (pushed 17:58, one validator warning acked as non-blocking) removed the "
        "drivable successor for a lane at Fell & Masonic; 14 cars stopped in-lane from 22:00 right before Outside Lands egress. "
        "Geofence at 22:16 stopped the pile-up, rollback to 2026.08.07-1 landed 22:31, reserves from Toland arrived 22:41 and we "
        "cleared the surge by 23:20. Record what a future shift lead needs to know. Be specific about what to check before a "
        "Saturday-evening map push.")

print("── session 2 · a week later, brand-new conversation, empty context ──")
session(NEXT_WEEK)
