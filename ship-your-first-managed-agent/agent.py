# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0
"""
The SRE Agent. Seven functions, each a single Managed Agents concept.
Fill them in during the workshop. Everything else is in provided.py.
"""
import json
import uuid

import anthropic
import streamlit as st
from anthropic.lib import files_from_dir

from provided import DATA, SYSTEM, TOOLS, metrics, deploys, diff

client = anthropic.Anthropic()


# ── 1. Agent ──────────────────────────────────────────────────────────────
# What the agent IS: model, system prompt, tools, skills. Create once, reuse forever.
# Hint: client.beta.skills.create(display_title=..., files=files_from_dir(...))
#       then client.beta.agents.create(..., skills=[...]). display_title must be
#       unique per org — suffix it with uuid like setup_environment() does.
@st.cache_resource
def setup_agent() -> str:
    raise NotImplementedError


# ── 2. Environment ────────────────────────────────────────────────────────
# Where the agent's container runs. Create once, reuse forever.
# Hint: client.beta.environments.create(name=..., config={"type": "cloud", ...})
@st.cache_resource
def setup_environment() -> str:
    raise NotImplementedError


# ── 3. Upload the log ─────────────────────────────────────────────────────
# Push data/app.log to the Files API so sessions can mount it.
# Hint: client.beta.files.upload(file=open(...))
@st.cache_resource
def upload_log() -> str:
    raise NotImplementedError


# ── 4. Session ────────────────────────────────────────────────────────────
# Bind agent + environment, mount the log under /mnt/session/uploads/.
# Hint: client.beta.sessions.create(agent=agent_id, environment_id=..., resources=[...])
def start_session(agent_id: str, env_id: str, log_file_id: str) -> str:
    raise NotImplementedError


# ── 5. Stream loop ────────────────────────────────────────────────────────
# Open the event stream, send the user's message, yield events. When you see
# agent.custom_tool_use, call handle_tool() and post the result back.
# Hint: with client.beta.sessions.events.stream(session_id) as s: ...events.send(...)
def stream_reply(session_id: str, user_text: str):
    raise NotImplementedError


# ── 6. Local tool handlers ────────────────────────────────────────────────
# When the cloud agent calls get_metrics / get_recent_deploys / get_diff,
# answer from `metrics` / `deploys` / `diff` (already loaded from data/).
def handle_tool(name: str, args: dict) -> str:
    raise NotImplementedError


# ── 7. Delete session ─────────────────────────────────────────────────────
# Sessions are real cloud resources — clean them up.
# Hint: client.beta.sessions.delete(session_id)
def delete_session(session_id: str) -> None:
    raise NotImplementedError
