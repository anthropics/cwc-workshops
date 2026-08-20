# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0
"""Headless verification of agent_complete.py's API path. No Streamlit."""
import json
import sys
import time
import uuid
from pathlib import Path

import anthropic
from anthropic.lib import files_from_dir
from dotenv import load_dotenv

load_dotenv()
HERE = Path(__file__).parent
DATA = HERE / "data"
client = anthropic.Anthropic()

SYSTEM = (
    "You are the SRE Agent, an SRE/data-analyst agent. Analyze "
    "/mnt/session/uploads/app.log (large — use grep/python), pull metrics and deploys "
    "via your tools, inspect suspicious diffs, and state the root cause plainly."
)
TOOLS = [
    {"type": "agent_toolset_20260401", "default_config": {"enabled": True}},
    {"type": "custom", "name": "get_metrics",
     "description": "Timeseries for service+metric.",
     "input_schema": {"type": "object",
                      "properties": {"service": {"type": "string"}, "metric": {"type": "string"}},
                      "required": ["service", "metric"]}},
    {"type": "custom", "name": "get_recent_deploys", "description": "Deploys last 6h.",
     "input_schema": {"type": "object", "properties": {}}},
    {"type": "custom", "name": "get_diff", "description": "Diff for a commit.",
     "input_schema": {"type": "object", "properties": {"commit": {"type": "string"}},
                      "required": ["commit"]}},
]

metrics = json.loads((DATA / "metrics.json").read_text())
deploys = (DATA / "deploys.json").read_text()
diff = (DATA / "diff.txt").read_text()


def handle(name, args):
    if name == "get_metrics":
        return json.dumps(metrics.get(args["service"], {}).get(args["metric"]) or {"error": "not found"})
    if name == "get_recent_deploys":
        return deploys
    if name == "get_diff":
        return diff if args["commit"][:7] in diff else "no diff"
    return "unknown"


# 1. Agent (upload runbook skill, then attach it)
skill = client.beta.skills.create(
    display_title=f"Incident Triage Runbook {uuid.uuid4().hex[:6]}",
    files=files_from_dir(HERE / "incident-triage-runbook"),
)
agent = client.beta.agents.create(
    name="SRE Agent", model="claude-opus-4-8", system=SYSTEM, tools=TOOLS,
    skills=[{"type": "custom", "skill_id": skill.id, "version": "latest"}],
)
# 2. Environment
env = client.beta.environments.create(
    name=f"sre-agent-e2e-{uuid.uuid4().hex[:6]}",
    config={"type": "cloud", "networking": {"type": "unrestricted"}},
)
# 3. Upload log
with open(DATA / "app.log", "rb") as f:
    log = client.beta.files.upload(file=f)
# 4. Session (agent passed as bare id string)
session = client.beta.sessions.create(
    agent=agent.id,
    environment_id=env.id,
    resources=[{"type": "file", "file_id": log.id, "mount_path": "app.log"}],
)
print(f"skill={skill.id} agent={agent.id} env={env.id} session={session.id}")

transcript = []
deadline = time.monotonic() + 600
with client.beta.sessions.events.stream(session.id) as stream:
    client.beta.sessions.events.send(
        session.id,
        events=[{"type": "user.message",
                 "content": [{"type": "text",
                              "text": "checkout p99 spiked ~14:32 UTC. Find the root cause."}]}],
    )
    for ev in stream:
        if time.monotonic() > deadline:
            print("!! timeout"); break
        if ev.type == "agent.message":
            for b in ev.content:
                transcript.append(b.text); print(b.text, end="", flush=True)
        elif ev.type == "agent.tool_use":
            print(f"\n[sandbox · {ev.name}]")
        elif ev.type == "agent.custom_tool_use":
            r = handle(ev.name, ev.input)
            print(f"\n[local · {ev.name}] -> {r[:100]}")
            client.beta.sessions.events.send(
                session.id,
                events=[{"type": "user.custom_tool_result", "custom_tool_use_id": ev.id,
                         "content": [{"type": "text", "text": r}]}],
            )
        elif ev.type == "session.status_idle" and ev.stop_reason.type == "end_turn":
            print("\n-- end_turn --"); break

full = "".join(transcript).lower()
ok = ("n+1" in full or "n + 1" in full) and "a3f9c21" in full
print("\nverdict:", "PASS" if ok else "INCONCLUSIVE")
sys.exit(0 if ok else 1)
