# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0
"""
Everything pre-supplied for the workshop: the agent's system prompt, tool
schemas, the local data those tools read, and the side-chat UI. You don't
edit this file — agent.py imports from it.
"""
import json
from pathlib import Path

import streamlit as st

DATA = Path("data")

SYSTEM = """\
You are the SRE Agent — an SRE/data-analyst agent embedded in an incident
dashboard. The application log is mounted at /mnt/session/uploads/app.log (large; use
grep/python to analyze it, don't read it whole). You have local tools that
query the same data the dashboard shows. Correlate evidence and state findings
plainly and concisely.
"""

TOOLS = [
    {"type": "agent_toolset_20260401", "default_config": {"enabled": True}},
    {"type": "custom", "name": "get_metrics",
     "description": "Timeseries for a service+metric over the incident window.",
     "input_schema": {"type": "object",
                      "properties": {"service": {"type": "string"}, "metric": {"type": "string"}},
                      "required": ["service", "metric"]}},
    {"type": "custom", "name": "get_recent_deploys", "description": "Deploys in the last 6h.",
     "input_schema": {"type": "object", "properties": {}}},
    {"type": "custom", "name": "get_diff", "description": "Unified diff for a commit SHA.",
     "input_schema": {"type": "object", "properties": {"commit": {"type": "string"}},
                      "required": ["commit"]}},
]

metrics = json.loads((DATA / "metrics.json").read_text())
deploys = (DATA / "deploys.json").read_text()
diff = (DATA / "diff.txt").read_text()


# ── side-chat UI ──────────────────────────────────────────────────────────
def _offline(fn: str):
    st.caption(f"agent offline — implement `{fn}()` in `agent.py`")
    st.chat_input("ask…", disabled=True, key=f"off_{fn}")


@st.cache_data
def _agent_skills(agent_id: str) -> list[str]:
    import agent
    a = agent.client.beta.agents.retrieve(agent_id)
    return [s.skill_id for s in (a.skills or [])]


@st.cache_data(ttl=20)
def _list_sessions(agent_id: str):
    import agent
    page = agent.client.beta.sessions.list(agent_id=agent_id, limit=15, order="desc")
    items = sorted(page.data, key=lambda s: s.created_at, reverse=True)
    return [
        (s.id, f"{s.created_at:%H:%M:%S} · {s.status} · {s.id[-6:]}", s.created_at)
        for s in items
    ]


def _load_history(session_id: str):
    """Replay a session's conversation from the server-side event log."""
    import agent
    hist: list[tuple[str, str]] = []
    for ev in agent.client.beta.sessions.events.list(session_id, order="asc", limit=500).data:
        if ev.type == "user.message":
            hist.append(("user", _text(ev.content)))
        elif ev.type == "agent.message":
            txt = _text(ev.content)
            if hist and hist[-1][0] == "assistant":
                hist[-1] = ("assistant", hist[-1][1] + txt)
            else:
                hist.append(("assistant", txt))
        elif ev.type in ("agent.tool_use", "agent.custom_tool_use"):
            scope = "sandbox" if ev.type == "agent.tool_use" else "local"
            line = f"\n\n`{scope} · {ev.name}`"
            if hist and hist[-1][0] == "assistant":
                hist[-1] = ("assistant", hist[-1][1] + line)
            else:
                hist.append(("assistant", line))
    return hist


def _text(content) -> str:
    if not content:
        return ""
    return "".join(getattr(b, "text", "") for b in content if getattr(b, "type", None) == "text")


def chat_panel():
    import agent  # lazy import to avoid circular dependency

    st.markdown("##### SRE AGENT")

    try:
        agent_id = agent.setup_agent()
    except NotImplementedError:
        return _offline("setup_agent")
    st.caption(f"agent · `{agent_id}`")
    for sk in _agent_skills(agent_id):
        st.caption(f"skill · `{sk}`")

    try:
        env_id = agent.setup_environment()
    except NotImplementedError:
        return _offline("setup_environment")
    st.caption(f"env · `{env_id}`")

    try:
        log_id = agent.upload_log()
    except NotImplementedError:
        return _offline("upload_log")
    st.caption(f"log file · `{log_id}`")

    # ── session picker: sessions are stateful + persisted server-side.
    # Never auto-create — resume the newest existing one, or show an empty state.
    if "sid" not in st.session_state:
        listed = _list_sessions(agent_id)
        if listed:
            st.session_state.sid = listed[0][0]
            st.session_state.hist = _load_history(st.session_state.sid)
    sid = st.session_state.get("sid")

    listed = _list_sessions(agent_id)
    labels = {s: l for s, l, _ in listed}
    ids = [s for s, _, _ in listed]
    if sid and sid not in labels:
        ids.insert(0, sid)
        labels[sid] = "just now · current"

    def _on_pick():
        chosen = st.session_state.session_picker
        st.session_state.sid = chosen
        st.session_state.hist = _load_history(chosen)

    if sid:
        st.session_state.session_picker = sid

    pick_col, new_col, del_col = st.columns([6, 1, 1])
    pick_col.selectbox(
        "session", ids, format_func=lambda v: labels.get(v, v), disabled=not ids,
        label_visibility="collapsed", key="session_picker", on_change=_on_pick,
    )
    if new_col.button("", icon=":material/add:", help="new session", use_container_width=True):
        try:
            st.session_state.sid = agent.start_session(agent_id, env_id, log_id)
        except NotImplementedError:
            st.toast("implement `start_session()` in `agent.py`")
        else:
            st.session_state.hist = []
            _list_sessions.clear()
            st.rerun()
    if del_col.button("", icon=":material/delete:", help="delete session",
                      use_container_width=True, disabled=not sid):
        try:
            agent.delete_session(st.session_state.sid)
        except NotImplementedError:
            st.toast("implement `delete_session()` in `agent.py`")
        else:
            _list_sessions.clear()
            del st.session_state["sid"]
            st.rerun()

    if not sid:
        st.caption("no sessions — click **+** to start one")
        st.chat_input("ask…", disabled=True, key="off_nosession")
        return

    st.caption(f"`{sid}` — persisted in the cloud, not this browser")

    chat = st.container(height=400, border=False)
    with chat:
        for role, text in st.session_state.hist:
            with st.chat_message(role):
                st.markdown(text)

    if q := st.chat_input("ask the agent…"):
        st.session_state.hist.append(("user", q))
        with chat:
            with st.chat_message("user"):
                st.markdown(q)
            with st.chat_message("assistant"):
                text_ph = st.empty()
                buf = ""
                tool_boxes: dict[str, object] = {}
                try:
                    for ev in agent.stream_reply(st.session_state.sid, q):
                        if ev.type == "agent.message":
                            buf += "".join(b.text for b in ev.content)
                            text_ph.markdown(buf)
                        elif ev.type in ("agent.tool_use", "agent.custom_tool_use"):
                            scope = "sandbox" if ev.type == "agent.tool_use" else "local"
                            box = st.status(f"{scope} · {ev.name}", state="running")
                            args = json.dumps(ev.input)
                            box.caption("args")
                            box.code(args if args != "{}" else "(none)", language="json")
                            tool_boxes[ev.id] = box
                        elif ev.type == "agent.tool_result":
                            box = tool_boxes.pop(ev.tool_use_id, None)
                            if box:
                                box.caption("result")
                                box.code(_text(ev.content)[:1500] or "(empty)", language="text")
                                box.update(state="complete")
                        elif ev.type == "user.custom_tool_result":
                            box = tool_boxes.pop(ev.custom_tool_use_id, None)
                            if box:
                                box.caption("result")
                                box.code(_text(ev.content)[:1500] or "(empty)", language="text")
                                box.update(state="complete")
                        elif ev.type == "span.model_request_start":
                            text_ph = st.empty(); buf = ""
                        elif ev.type == "session.status_idle" and ev.stop_reason.type == "end_turn":
                            for b in tool_boxes.values():
                                b.update(state="complete")
                            break
                except NotImplementedError:
                    st.warning("implement `stream_reply()` / `handle_tool()` in `agent.py`")
                    return
        st.session_state.hist.append(("assistant", buf))
