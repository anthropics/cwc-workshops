# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0
"""
Everything pre-supplied for the workshop: model choices, prompts, tool
schemas, the local data those tools read, and the side-chat UI. You don't
edit this file — agent.py imports from it.

The things worth changing live elsewhere (ask Claude Code to change them):
  prompts/        what the commander and the investigators are told
  skills/         the runbook and the postmortem builder
  memory-seed/    what the team already knows
"""
import importlib
import inspect
import json
import os
import re
import time
from html import escape
from pathlib import Path

import streamlit as st
from dotenv import load_dotenv

import state

HERE = Path(__file__).parent
load_dotenv(HERE / ".env")

DATA = HERE / "data"
SKILLS = HERE / "skills"
MEMORY_SEED = HERE / "memory-seed"
PROMPTS = HERE / "prompts"

MANAGED_AGENTS_BETA = "managed-agents-2026-04-01"

# Each agent has its own model. Both default to Opus 5.5; set
# SRE_INVESTIGATOR_MODEL=claude-haiku-5-5 in .env for faster, cheaper threads.
COMMANDER_MODEL = os.environ.get("SRE_COMMANDER_MODEL", "claude-opus-5-5")
INVESTIGATOR_MODEL = os.environ.get("SRE_INVESTIGATOR_MODEL", "claude-opus-5-5")

COMMANDER_SYSTEM = (PROMPTS / "commander.md").read_text()
INVESTIGATOR_SYSTEM = (PROMPTS / "investigator.md").read_text()

TOOLS = [
    {"type": "agent_toolset_20260401", "default_config": {"enabled": True}},
    {"type": "custom", "name": "list_incidents",
     "description": "List open alerts in the workshop's fixed April 22, 2026 incident snapshot. "
                    "Returns incident IDs, services, signals and firing times from the exercise. "
                    "This does not query live production or incidents outside the snapshot.",
     "input_schema": {"type": "object", "properties": {}}},
    {"type": "custom", "name": "get_metrics",
     "description": "Read a per-minute time series from the workshop's fixed April 22, 2026 "
                    "incident hour. Returns timestamp/value readings, not live monitoring data. "
                    "Use exact service and metric IDs. Available pairs: checkout: p99_latency_ms, "
                    "error_rate, db_pool_utilization. cart: p99_latency_ms, error_rate, "
                    "db_pool_utilization. auth: p99_latency_ms, error_rate. inventory: "
                    "p99_latency_ms, error_rate, cache_hit_rate. db-primary: queries_per_sec, "
                    "cpu_utilization. db-inventory: queries_per_sec, cpu_utilization. "
                    'For a catalog request, use {"service": "", "metric": ""}. Any unsupported '
                    "pair returns the catalog instead of readings. Data outside the incident hour is unavailable.",
     "input_schema": {"type": "object",
                      "properties": {"service": {"type": "string"}, "metric": {"type": "string"}},
                      "required": ["service", "metric"]}},
    {"type": "custom", "name": "get_recent_deploys",
     "description": "List recorded deployments across services in the workshop's fixed six-hour "
                    "view for April 22, 2026. Returns deployment times and seven-character commit "
                    "prefixes. This does not query current production or future schedules.",
     "input_schema": {"type": "object", "properties": {}}},
    {"type": "custom", "name": "get_diff",
     "description": "Read a saved workshop code diff using a known commit prefix or full SHA. "
                    "The first seven characters select the saved patch. get_recent_deploys "
                    "provides the prefixes. An unknown prefix returns a no-diff result. "
                    "This does not look up arbitrary repositories.",
     "input_schema": {"type": "object", "properties": {"commit": {"type": "string"}},
                      "required": ["commit"]}},
]

incidents = json.loads((DATA / "incidents.json").read_text())
metrics = json.loads((DATA / "metrics.json").read_text())
deploys = (DATA / "deploys.json").read_text()
diffs = {path.stem: path.read_text() for path in sorted((DATA / "diffs").glob("*.diff"))}

# ── session outputs ───────────────────────────────────────────────────────
OUTPUT_TYPES = (".pdf", ".png")
MAX_OUTPUT_BYTES = 20 * 1024 * 1024


def safe_filename(name: str) -> str:
    """Filenames come from the agent's container: keep a plain basename only."""
    base = re.split(r"[\\/]", name or "")[-1]
    base = re.sub(r"[^A-Za-z0-9._-]", "_", base)
    return "" if base in ("", ".", "..") else base


def wanted_output(file) -> bool:
    """True for files worth offering as a download (type and size checked)."""
    name = safe_filename(getattr(file, "filename", ""))
    size = getattr(file, "size_bytes", 0) or 0
    return bool(name) and name.lower().endswith(OUTPUT_TYPES) and size <= MAX_OUTPUT_BYTES


def load_agent():
    """Your agent.py. Set SRE_AGENT_MODULE=solutions.agent to run the reference."""
    return importlib.import_module(os.environ.get("SRE_AGENT_MODULE", "agent"))


def implemented(fn) -> bool:
    """A stub is a function whose body still raises NotImplementedError."""
    try:
        return "raise NotImplementedError" not in inspect.getsource(fn)
    except (OSError, TypeError):
        return True


# ── side-chat UI ──────────────────────────────────────────────────────────
PART_ONE = ("setup_environment", "upload_log", "setup_skill", "setup_agent",
            "start_session", "stream_reply", "handle_tool", "delete_session")


def next_step(agent) -> str | None:
    """What to type into Claude Code next, or None when all four parts are on."""
    if not all(implemented(getattr(agent, fn)) for fn in PART_ONE):
        return "get the agent online"
    if not implemented(agent.setup_investigator):
        return "give it a team of investigators"
    if not implemented(agent.setup_memory):
        return "give it memory"
    if not implemented(agent.download_outputs):
        return "let it write a postmortem PDF"
    return None


def _offline(fn: str):
    st.markdown(
        '<div class="offline"><div class="offline-state"><span class="dot-off"></span>AGENT OFFLINE</div>'
        '<div class="offline-hint">Three pages are open and nobody is on it yet.<br>'
        'In Claude Code, type <span class="kbd">get the agent online</span></div></div>',
        unsafe_allow_html=True)
    st.chat_input("the agent is offline…", disabled=True, key=f"off_{fn}")


def _text(content) -> str:
    if not content:
        return ""
    return "".join(getattr(b, "text", "") for b in content if getattr(b, "type", None) == "text")


def _short(text: str, limit: int = 90) -> str:
    text = " ".join(str(text).split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _incident_in(text: str) -> str:
    match = re.search(r"INC-\d+", text or "")
    return match.group(0) if match else ""


@st.cache_data(ttl=20)
def _list_sessions(agent_id: str):
    page = load_agent().client.beta.sessions.list(agent_id=agent_id, limit=15, order="desc")
    items = sorted(page.data, key=lambda s: s.created_at, reverse=True)
    return [(s.id, f"{s.created_at:%H:%M:%S} · {s.status} · {s.id[-6:]}") for s in items]


def _load_history(session_id: str):
    """Replay a session's conversation from the server-side event log."""
    hist: list[tuple[str, str]] = []

    def say(line: str):
        if hist and hist[-1][0] == "assistant":
            hist[-1] = ("assistant", hist[-1][1] + line)
        else:
            hist.append(("assistant", line.lstrip()))

    events = load_agent().client.beta.sessions.events.list(session_id, order="asc", limit=500)
    for ev in events.data:
        if ev.type == "user.message":
            hist.append(("user", _text(ev.content)))
        elif ev.type == "agent.message":
            say("\n\n" + _text(ev.content))
        elif ev.type in ("agent.tool_use", "agent.custom_tool_use"):
            if getattr(ev, "session_thread_id", None):
                continue  # a sub-agent's call: too many to list here
            scope = "sandbox" if ev.type == "agent.tool_use" else "local"
            say(f"\n\n`{scope} · {ev.name}`")
        elif ev.type == "agent.thread_message_received":
            say(f"\n\n`thread · {_incident_in(_text(ev.content)) or 'agent'} reported`")
    st.session_state.setdefault("lanes", {})[session_id] = _lanes_from_events(events.data)
    return hist


def _thread_rows(session_id: str) -> list[dict]:
    """One row per thread in the session: who ran, on which model, for how long."""
    rows = []
    try:
        threads = load_agent().client.beta.sessions.threads.list(session_id)
    except Exception:
        return rows
    for thread in threads:
        snapshot = getattr(thread, "agent", None)
        model = getattr(snapshot, "model", "")
        usage, stats = getattr(thread, "usage", None), getattr(thread, "stats", None)
        rows.append({
            "thread": "primary" if not getattr(thread, "parent_thread_id", None) else thread.id[-6:],
            "agent": getattr(snapshot, "name", "") or "",
            "model": getattr(model, "id", model) or "",
            "status": getattr(thread, "status", ""),
            "active s": round(getattr(stats, "active_seconds", 0) or 0),
            "out tokens": getattr(usage, "output_tokens", 0) or 0,
        })
    return rows


def _thread_sandbox_calls(session_id: str, thread_id: str) -> int:
    """How many sandbox tool calls a finished sub-agent made, from its own event log."""
    try:
        events = load_agent().client.beta.sessions.threads.events.list(thread_id, session_id=session_id, limit=200)
    except Exception:
        return 0
    return sum(1 for e in events.data if e.type == "agent.tool_use")


def _fetch_outputs(agent, session_id: str, expect: bool = False) -> list[tuple[str, bytes]]:
    """Files the agent wrote to /mnt/session/outputs/. Indexing lags a few seconds."""
    if not implemented(agent.download_outputs):
        return []
    for attempt in range(5 if expect else 1):
        files = [(safe_filename(name), data) for name, data in agent.download_outputs(session_id)]
        files = [(name, data) for name, data in files if name]
        if files or not expect:
            return files
        time.sleep(2)
    return []


def _render_outputs(slot, session_id: str):
    files = st.session_state.get("outputs", {}).get(session_id, [])
    with slot:
        for name, data in files:
            mime = "application/pdf" if name.lower().endswith(".pdf") else "application/octet-stream"
            st.download_button(f"{name} · {max(1, len(data) // 1024)} KB", data, file_name=name, mime=mime,
                               icon=":material/download:", key=f"dl_{session_id}_{name}", type="primary",
                               use_container_width=True)


def _render_threads(slot, session_id: str):
    rows = st.session_state.get("threads", {}).get(session_id, [])
    if len(rows) > 1:
        with slot.expander(f"threads · {len(rows)} · agent, model, time, tokens"):
            st.dataframe(rows, hide_index=True, use_container_width=True)


# ── thread cards ──────────────────────────────────────────────────────────
_INCIDENTS = {inc["id"]: inc for inc in incidents}


def _new_lane(agent_name: str = "agent") -> dict:
    return {"name": agent_name, "incident": "", "calls": [], "report": "", "started": time.time(),
            "seconds": 0, "sandbox": 0, "done": False}


def _call_chip(name: str, args) -> tuple[str, str]:
    """A custom tool call as (kind, short label) for a chip."""
    args = args if isinstance(args, dict) else {}
    if name == "get_metrics":
        service, metric = str(args.get("service", "")), str(args.get("metric", ""))
        if metric not in metrics.get(service, {}):
            return "", ""  # a probe for the list of valid names: not worth a chip
        short = {"p99_latency_ms": "p99", "error_rate": "errors", "db_pool_utilization": "db pool",
                 "queries_per_sec": "qps", "cpu_utilization": "cpu", "cache_hit_rate": "cache hits"}
        return "metric", f"{service} {short.get(metric, metric)}"
    if name == "get_diff":
        return "diff", f"diff {str(args.get('commit', ''))[:7]}"
    if name == "get_recent_deploys":
        return "deploy", "deploys"
    if name == "list_incidents":
        return "deploy", "pages"
    return "metric", name


def _root_cause(report: str) -> str:
    """The investigator's one-line verdict, pulled out of its report."""
    plain = re.sub(r"[*`>#]", "", report or "")
    match = re.search(r"root cause\s*:?\s*(.+)", plain, flags=re.IGNORECASE)
    line = (match.group(1) if match else plain).strip().splitlines()[0] if plain.strip() else ""
    line = re.sub(r"^(is|was)\s+", "", line.strip(" :-—"))
    return _short(line[:1].upper() + line[1:], 170)


def _lane_html(lane: dict) -> str:
    inc = _INCIDENTS.get(lane["incident"], {})
    seconds = lane["seconds"] or int(time.time() - lane["started"])
    chips, seen = [], set()
    for kind, label in lane["calls"]:
        if label and label not in seen:
            seen.add(label)
            chips.append(f'<span class="chip {kind}">{escape(label)}</span>')
    if len(chips) > 9:
        chips = chips[:9] + [f'<span class="chip more">+{len(chips) - 9} more</span>']
    if lane["done"]:
        status = f'<span class="lane-state done">✓ reported · {seconds}s</span>'
        work = f'{len(lane["calls"])} lookups'
        if lane["sandbox"]:
            work += f' · {lane["sandbox"]} sandbox calls'
        body = (f'<div class="lane-result"><span class="k">ROOT CAUSE</span>{escape(_root_cause(lane["report"]))}</div>'
                f'<div class="lane-foot">{work}</div>')
    else:
        status = f'<span class="lane-state"><span class="dot"></span>investigating · {seconds}s</span>'
        body = '<div class="lane-foot">working in its own context, in the shared sandbox</div>'
    return (
        f'<div class="lane {escape(inc.get("severity", ""))} {"done" if lane["done"] else "running"}">'
        f'<div class="lane-head"><span class="lane-id">{escape(lane["incident"] or "thread")}</span>'
        f'<span class="lane-svc">{escape(inc.get("service", lane["name"]))}</span></div>{status}'
        f'<div class="chips">{"".join(chips) or "<span class=lane-foot>briefed, starting…</span>"}</div>'
        f'{body}</div>'
    )


def _render_lanes(area, lanes: list[dict], wide: bool):
    """The threads from the last multiagent turn, side by side when there is room."""
    if not lanes:
        return
    area.markdown(f'<div class="lanes-title">{len(lanes)} INVESTIGATOR THREADS · ran in parallel</div>',
                  unsafe_allow_html=True)
    cols = area.columns(min(3, len(lanes))) if wide else [area] * len(lanes)
    for i, lane in enumerate(lanes):
        cols[i % len(cols)].markdown(_lane_html(lane), unsafe_allow_html=True)
    with area.expander("full investigator reports"):
        for lane in lanes:
            st.markdown(f"**{lane['incident'] or lane['name']}**\n\n{lane['report'] or '_no report yet_'}")


def _lanes_from_events(events) -> list[dict]:
    """Rebuild the thread cards for a past session from its event log."""
    lanes: dict[str, dict] = {}
    for ev in events:
        if ev.type == "session.thread_created":
            lanes[ev.session_thread_id] = _new_lane(ev.agent_name)
            lanes[ev.session_thread_id]["started"] = ev.processed_at.timestamp()
        elif ev.type == "agent.thread_message_sent" and ev.to_session_thread_id in lanes:
            lane = lanes[ev.to_session_thread_id]
            lane["incident"] = lane["incident"] or _incident_in(_text(ev.content))
        elif ev.type == "agent.custom_tool_use" and getattr(ev, "session_thread_id", None) in lanes:
            lanes[ev.session_thread_id]["calls"].append(_call_chip(ev.name, ev.input))
        elif ev.type == "agent.thread_message_received" and ev.from_session_thread_id in lanes:
            lane = lanes[ev.from_session_thread_id]
            lane["report"], lane["done"] = _text(ev.content), True
            lane["incident"] = lane["incident"] or _incident_in(lane["report"])
            lane["seconds"] = max(1, int(ev.processed_at.timestamp() - lane["started"]))
    return list(lanes.values())


def _stream_turn(agent, session_id: str, prompt: str, lane_area, wide: bool) -> tuple[str, bool, list[dict]]:
    """Render one agent turn as it streams. Returns (text, wrote_outputs, lanes)."""
    text_ph = st.empty()
    buf, parts = "", []
    tool_boxes: dict[str, object] = {}
    lanes: dict[str, dict] = {}
    wrote_outputs = False
    lane_area.empty()
    lane_box = lane_area.container()
    cols: list = []

    def lane_for(thread_id, agent_name="agent"):
        if thread_id not in lanes:
            if not cols:
                lane_box.markdown('<div class="lanes-title">INVESTIGATOR THREADS · working in parallel</div>',
                                  unsafe_allow_html=True)
                cols.extend(lane_box.columns(3) if wide else [lane_box])
            lane = _new_lane(agent_name)
            lane["slot"] = cols[len(lanes) % len(cols)].empty()
            lanes[thread_id] = lane
        return lanes[thread_id]

    def redraw(lane=None):
        for one in ([lane] if lane else lanes.values()):
            one["slot"].markdown(_lane_html(one), unsafe_allow_html=True)

    for ev in agent.stream_reply(session_id, prompt):
        kind = ev.type
        if kind == "agent.message":
            buf += _text(ev.content)
            text_ph.markdown(buf)
        elif kind in ("agent.tool_use", "agent.custom_tool_use"):
            scope = "sandbox" if kind == "agent.tool_use" else "local"
            args = json.dumps(ev.input)
            wrote_outputs = wrote_outputs or "/mnt/session/outputs" in args
            thread_id = getattr(ev, "session_thread_id", None)
            if thread_id:  # a sub-agent's call, cross-posted to the session stream
                lane_for(thread_id)["calls"].append(_call_chip(ev.name, ev.input))
                redraw()  # every card, so the timers tick together
            else:
                box = st.status(f"{scope} · {ev.name}", state="running")
                box.caption("args")
                box.code(args if args != "{}" else "(none)", language="json")
                tool_boxes[ev.id] = box
        elif kind in ("agent.tool_result", "user.custom_tool_result"):
            ref = getattr(ev, "tool_use_id", None) or getattr(ev, "custom_tool_use_id", None)
            box = tool_boxes.pop(ref, None)
            if box:
                box.caption("result")
                box.code(_text(ev.content)[:1500] or "(empty)", language="text")
                box.update(state="complete")
        elif kind == "session.thread_created":
            redraw(lane_for(ev.session_thread_id, ev.agent_name))
        elif kind == "agent.thread_message_sent":
            lane = lane_for(ev.to_session_thread_id, getattr(ev, "to_agent_name", None) or "agent")
            lane["incident"] = lane["incident"] or _incident_in(_text(ev.content))
            redraw(lane)
        elif kind == "agent.thread_message_received":
            lane = lane_for(ev.from_session_thread_id, getattr(ev, "from_agent_name", None) or "agent")
            lane["report"], lane["done"] = _text(ev.content), True
            lane["incident"] = lane["incident"] or _incident_in(lane["report"])
            lane["seconds"] = max(1, int(time.time() - lane["started"]))
            lane["sandbox"] = _thread_sandbox_calls(session_id, ev.from_session_thread_id)
            redraw()
        elif kind == "span.model_request_start":
            if buf:
                parts.append(buf)
            text_ph, buf = st.empty(), ""
        elif kind == "session.error":
            st.warning(getattr(getattr(ev, "error", None), "message", "session error"))
        elif kind == "session.status_terminated":
            st.warning("session terminated")
            break
        elif kind == "session.status_idle" and ev.stop_reason.type != "requires_action":
            if ev.stop_reason.type != "end_turn":
                st.warning(f"stopped: {ev.stop_reason.type}")
            break

    for box in tool_boxes.values():
        box.update(state="complete")
    if buf:
        parts.append(buf)
    finished = [{k: v for k, v in lane.items() if k != "slot"} for lane in lanes.values()]
    return "\n\n".join(parts), wrote_outputs, finished


def chat_panel(wide: bool = False):
    """The agent panel. `wide` is the roomy layout used on the Overview page."""
    import anthropic

    agent = load_agent()
    parts = [("multiagent", agent.setup_investigator), ("memory stores", agent.setup_memory),
             ("file output", agent.download_outputs)]
    pills = " &nbsp; ".join(
        f'<span class="pill {"ok" if implemented(fn) else "off"}">{label} {"on" if implemented(fn) else "off"}</span>'
        for label, fn in parts)
    todo = next_step(agent)
    online = all(implemented(getattr(agent, fn)) for fn in PART_ONE)
    hint = (f'<div class="next-step">NEXT · in Claude Code, type <span class="kbd">{todo}</span></div>' if todo and online
            else "" if todo else '<div class="next-step done">ALL FOUR PARTS ARE ON</div>')
    st.markdown(f'<div class="agent-head"><span class="agent-title">SRE AGENT</span> &nbsp; {pills}</div>{hint}',
                unsafe_allow_html=True)

    ids = {}
    for fn in ("setup_environment", "upload_log", "setup_agent"):
        try:
            ids[fn] = getattr(agent, fn)()
        except NotImplementedError:
            return _offline(fn)
        except anthropic.APIError as exc:
            st.error(f"`{fn}()` failed: {getattr(exc, 'message', exc)}")
            return
    env_id, log_id, agent_id = ids["setup_environment"], ids["upload_log"], ids["setup_agent"]

    # ── session picker: sessions are stateful + persisted server-side.
    # Never auto-create — resume the newest existing one, or show an empty state.
    listed = _list_sessions(agent_id)
    if "sid" not in st.session_state and listed:
        st.session_state.sid = listed[0][0]
        st.session_state.hist = _load_history(st.session_state.sid)
    sid = st.session_state.get("sid")
    for key in ("outputs", "threads", "lanes"):
        st.session_state.setdefault(key, {})

    labels = dict(listed)
    ids_listed = [s for s, _ in listed]
    if sid and sid not in labels:
        ids_listed.insert(0, sid)
        labels[sid] = "just now · current"

    def _on_pick():
        chosen = st.session_state.session_picker
        st.session_state.sid = chosen
        st.session_state.hist = _load_history(chosen)

    if sid:
        st.session_state.session_picker = sid

    pick_col, new_col, del_col = st.columns([8, 1, 1] if wide else [6, 1, 1])
    pick_col.selectbox(
        "session", ids_listed, format_func=lambda v: labels.get(v, v), disabled=not ids_listed,
        label_visibility="collapsed", key="session_picker", on_change=_on_pick,
    )
    if new_col.button("", icon=":material/add:", help="new session", use_container_width=True):
        try:
            st.session_state.sid = agent.start_session(agent_id, env_id, log_id)
        except NotImplementedError:
            st.toast("implement `start_session()` in `agent.py`")
        except anthropic.APIError as exc:
            st.error(f"`start_session()` failed: {getattr(exc, 'message', exc)}")
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
        except anthropic.APIError as exc:
            st.error(f"`delete_session()` failed: {getattr(exc, 'message', exc)}")
        else:
            _list_sessions.clear()
            del st.session_state["sid"]
            st.rerun()

    with st.expander(f"resources · you are `{state.handle()}`"):
        st.caption(f"agent · `{agent_id}`  \nenv · `{env_id}`  \nlog file · `{log_id}`  \nsession · `{sid or '—'}`")
        st.caption("Persisted in the cloud, not this browser. Every resource you create carries your tag.")

    if not sid:
        st.caption("no sessions — click **+** to start one")
        st.chat_input("ask…", disabled=True, key="off_nosession")
        return

    if sid not in st.session_state.outputs:
        try:
            st.session_state.outputs[sid] = _fetch_outputs(agent, sid)
        except anthropic.APIError:
            st.session_state.outputs[sid] = []
    if sid not in st.session_state.threads:
        st.session_state.threads[sid] = _thread_rows(sid)

    # Commander on top, the investigator threads it started underneath.
    downloads = st.container()
    chat = st.container(height=330 if wide else 400, border=False)
    input_slot = st.container()
    lane_area = st.empty()
    with chat:
        for role, text in st.session_state.hist:
            with st.chat_message(role):
                st.markdown(text)
        if not st.session_state.hist:
            ask = ("*Three pages are open. Run the incident.*" if implemented(agent.setup_investigator)
                   else "*What caused the checkout latency spike?*")
            more = " Then: *Write the postmortem PDF.*" if implemented(agent.download_outputs) else ""
            st.caption(f"New session. Try: {ask}{more}")

    if q := input_slot.chat_input("ask the agent…"):
        st.session_state.hist.append(("user", q))
        with chat:
            with st.chat_message("user"):
                st.markdown(q)
            with st.chat_message("assistant"):
                try:
                    reply, wrote_outputs, lanes = _stream_turn(agent, sid, q, lane_area, wide)
                except NotImplementedError:
                    st.warning("implement `stream_reply()` / `handle_tool()` in `agent.py`")
                    return
                except anthropic.APIError as exc:
                    st.error(f"`stream_reply()` failed: {getattr(exc, 'message', exc)}")
                    return
        st.session_state.hist.append(("assistant", reply))
        if lanes:
            st.session_state.lanes[sid] = lanes
        st.session_state.threads[sid] = _thread_rows(sid)
        try:
            st.session_state.outputs[sid] = _fetch_outputs(agent, sid, expect=wrote_outputs)
        except anthropic.APIError as exc:
            st.warning(f"`download_outputs()` failed: {getattr(exc, 'message', exc)}")
        st.rerun()

    _render_outputs(downloads, sid)
    _render_lanes(lane_area.container(), st.session_state.lanes.get(sid, []), wide)
    _render_threads(st.container(), sid)
