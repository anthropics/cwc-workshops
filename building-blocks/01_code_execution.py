# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0
# 1 · Code execution + Files API: hand Claude the raw log and a sandbox instead of another aggregate endpoint.
import anthropic, random

QUESTION = ("It's Saturday 22:14. Attached: 7 days of fleet stop events. What is abnormal tonight versus baseline, "
            "since when, and what do the affected stops have in common? Three sentences.")   # CHANGE ME: ask it anything about the file

client = anthropic.Anthropic()
random.seed(8)

# seven days of robotaxi "minimal-risk stop" events; tonight something clusters at one junction on the new map
rows = ["ts,vehicle,street,cross_street,map_version,trigger"]
for day in range(2, 9):
    for _ in range(40):
        rows.append(f"2026-08-0{day}T{random.randint(6, 21):02d}:{random.randint(0, 59):02d},SX-{random.randint(100, 420)},"
                    f"{random.choice(['Geary Blvd', 'Mission St', 'Fell St', 'Lincoln Way', '19th Ave'])},"
                    f"{random.choice(['Masonic Ave', 'Divisadero St', '7th Ave', 'Stanyan St'])},2026.08.0{min(day, 7)}-1,"
                    f"{random.choice(['double_parked', 'ped_in_lane', 'sensor_degraded'])}")
for m in range(14):
    rows.append(f"2026-08-08T22:{m:02d},SX-{300 + m},Fell St,Masonic Ave,2026.08.08-2,no_drivable_successor")

log = client.beta.files.upload(file=("stops_7d.csv", "\n".join(rows).encode(), "text/csv"))

resp = client.beta.messages.create(
    model="claude-sonnet-5-5",
    max_tokens=8000,
    betas=["files-api-2025-04-14"],                                       # code execution is GA; the Files API is the beta
    tools=[{"type": "code_execution_20260521", "name": "code_execution"}],
    messages=[{"role": "user", "content": [
        {"type": "text", "text": QUESTION},
        {"type": "container_upload", "file_id": log.id},                  # mounted into the sandbox, not pasted into context
    ]}],
)

for block in resp.content:
    if block.type == "server_tool_use":                                   # the code Claude wrote; Anthropic ran it
        print(f"\n>>> {block.name}\n{block.input.get('code') or block.input.get('command') or block.input}")
    elif block.type.endswith("code_execution_tool_result"):               # what that code printed
        print(getattr(block.content, "stdout", "") or block.content)
    elif block.type == "text":
        print("\n" + block.text)
print(f"\ncontainer {resp.container.id} · in {resp.usage.input_tokens:,} / out {resp.usage.output_tokens:,} tokens")
