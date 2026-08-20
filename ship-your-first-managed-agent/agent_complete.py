# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0
"""Reference implementation of agent.py — the seven filled-in functions."""

import json
import uuid

import anthropic
import streamlit as st
from anthropic.lib import files_from_dir

from provided import DATA, SYSTEM, TOOLS, deploys, diff, metrics

client = anthropic.Anthropic()


# ── 1. Agent ──────────────────────────────────────────────────────────────
@st.cache_resource
def setup_agent() -> str:
    # display_title must be unique per organization, so suffix it the same way
    # setup_environment() does — a second run, or a second person on the same
    # workspace, otherwise fails with "Skill cannot reuse an existing display_title".
    skill = client.beta.skills.create(
        display_title=f"Incident Triage Runbook {uuid.uuid4().hex[:6]}",
        files=files_from_dir("incident-triage-runbook"),
    )
    agent = client.beta.agents.create(
        name="SRE Agent",
        model="claude-opus-4-8",
        system=SYSTEM,
        tools=TOOLS,
        skills=[{"type": "custom", "skill_id": skill.id, "version": "latest"}],
    )
    return agent.id


# ── 2. Environment ────────────────────────────────────────────────────────
@st.cache_resource
def setup_environment() -> str:
    env = client.beta.environments.create(
        name=f"sre-agent-{uuid.uuid4().hex[:6]}",
        config={"type": "cloud", "networking": {"type": "unrestricted"}},
    )
    return env.id


# ── 3. Upload the log ─────────────────────────────────────────────────────
@st.cache_resource
def upload_log() -> str:
    with open(DATA / "app.log", "rb") as f:
        return client.beta.files.upload(file=f).id


# ── 4. Session ────────────────────────────────────────────────────────────
def start_session(agent_id: str, env_id: str, log_file_id: str) -> str:
    session = client.beta.sessions.create(
        agent=agent_id,
        environment_id=env_id,
        resources=[{"type": "file", "file_id": log_file_id, "mount_path": "app.log"}],
    )
    return session.id


# ── 5. Stream loop ────────────────────────────────────────────────────────
def stream_reply(session_id: str, user_text: str):
    with client.beta.sessions.events.stream(session_id) as stream:
        client.beta.sessions.events.send(
            session_id,
            events=[
                {
                    "type": "user.message",
                    "content": [{"type": "text", "text": user_text}],
                }
            ],
        )
        for ev in stream:
            if ev.type == "agent.custom_tool_use":
                result = handle_tool(ev.name, ev.input)
                client.beta.sessions.events.send(
                    session_id,
                    events=[
                        {
                            "type": "user.custom_tool_result",
                            "custom_tool_use_id": ev.id,
                            "content": [{"type": "text", "text": result}],
                        }
                    ],
                )
            yield ev


# ── 6. Local tool handlers ────────────────────────────────────────────────
def handle_tool(name: str, args: dict) -> str:
    if name == "get_metrics":
        return json.dumps(
            metrics.get(args["service"], {}).get(args["metric"])
            or {"error": "not found"}
        )
    if name == "get_recent_deploys":
        return deploys
    if name == "get_diff":
        return diff if args["commit"][:7] in diff else "no diff for that commit"
    return f"unknown tool {name}"


# ── 7. Delete session ─────────────────────────────────────────────────────
def delete_session(session_id: str) -> None:
    client.beta.sessions.delete(session_id)
