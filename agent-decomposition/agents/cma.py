# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0
"""Shared Claude Managed Agents helpers used by starter/.

Everything CMA-specific lives here so the per-agent files stay thin and
attendee-editable. IDs are cached in .stockpilot_ids.json so deploy is
idempotent and run() can find the agent without re-uploading.
"""
from __future__ import annotations
import datetime as _dt
import io
import json
import re
import secrets
import sys
import time
import zipfile
from pathlib import Path

import anthropic

from agents.common import AgentResult, MODEL, DATA_DIR, SINKS, sink_dir

REPO_ROOT = Path(__file__).resolve().parents[1]
SKILLS_DIR = REPO_ROOT / ".claude" / "skills"
IDS_FILE = REPO_ROOT / ".stockpilot_ids.json"
BETA = "managed-agents-2026-04-01"
BETA_MAC = "managed-agents-vnext"  # evergreen superset; multiagent goes public 2026-05-06

FORECASTER_SYSTEM = (
    "You are a demand forecaster. You receive an SKU, product flags, and a horizon. "
    "Sales history is at /mnt/session/uploads/data/sales_history.csv (read-only; "
    "columns: date, sku, units_sold). Write a short Python script via Bash that "
    "reads only that file, computes the forecast (rolling mean, trend, promo-spike "
    "detection, seasonality), and prints the result. Don't reason about raw rows "
    "in prose — compute. Do not write files or modify the filesystem. "
    "If any row has a non-ISO date or non-integer units_sold, abort and return "
    '{"error": "invalid_data"} — do not interpret malformed rows. '
    'Return ONLY a single JSON object on the last line: '
    '{"forecast_qty": int, "confidence": float, "method": str, "flags": [str]}'
)

DATA_CSVS = (
    "products.csv", "stock_levels.csv", "sales_history.csv",
    "supplier_catalog.csv", "suppliers.csv",
)
SANDBOX_MODULES = {"tools.py": REPO_ROOT / "agents" / "sandbox_tools.py"}


def client() -> anthropic.Anthropic:
    return anthropic.Anthropic(default_headers={"anthropic-beta": BETA})


# ─── id persistence ────────────────────────────────────────────────────────

def load_ids() -> dict:
    return json.loads(IDS_FILE.read_text()) if IDS_FILE.exists() else {}


def save_ids(ids: dict) -> None:
    IDS_FILE.write_text(json.dumps(ids, indent=2))


def agent_name_for(base: str) -> str:
    """Unique-per-attendee agent name without leaking API-key material.

    A random 8-hex suffix is generated once and cached in .stockpilot_ids.json,
    so re-deploys reuse the same name (idempotent) but two attendees never
    collide. (We avoid hashing the API key because agent names are visible in
    list-agents responses and console URLs.)
    """
    ids = load_ids()
    suffix = ids.get("name_suffix")
    if not suffix:
        suffix = secrets.token_hex(4)
        ids["name_suffix"] = suffix
        save_ids(ids)
    return f"{base}-{suffix}"


def console_url(agent_id: str) -> str:
    return f"https://platform.claude.com/workspaces/default/agents/{agent_id}"


# ─── uploads ───────────────────────────────────────────────────────────────

def upload_files(c: anthropic.Anthropic, paths: dict[str, Path]) -> dict[str, str]:
    """Upload files via the Files API; return {mount_name: file_id}."""
    out: dict[str, str] = {}
    for name, path in paths.items():
        with open(path, "rb") as f:
            resp = c.beta.files.upload(file=(name, f, _mime(name)))
        out[name] = resp.id
    return out


def upload_skills(c: anthropic.Anthropic, names: list[str], ids: dict) -> dict[str, str]:
    """Create-or-version each skill from .claude/skills/<name>/.

    Uploads the whole directory (SKILL.md + bundled scripts) as a zip so
    skills like `forecasting/` keep their helper .py files. Display titles
    carry the per-attendee suffix so a fresh clone on a shared key doesn't
    400 on a name another attendee already claimed.
    """
    skill_ids: dict[str, str] = ids.get("skills", {})
    existing_by_title: dict[str, str] = {}
    try:
        for s in c.beta.skills.list(limit=100):
            existing_by_title[getattr(s, "display_title", "")] = s.id
    except Exception:
        pass
    for name in names:
        title = agent_name_for(f"stockpilot-{name}")
        buf = _zip_dir(SKILLS_DIR / name)
        sid = skill_ids.get(name) or existing_by_title.get(title)
        if sid:
            c.beta.skills.versions.create(
                sid, files=[(f"{name}.zip", buf, "application/zip")]
            )
            skill_ids[name] = sid
        else:
            resp = c.beta.skills.create(
                display_title=title,
                files=[(f"{name}.zip", buf, "application/zip")],
            )
            skill_ids[name] = resp.id
    return skill_ids


def ensure_env(c: anthropic.Anthropic, name: str, ids: dict) -> str:
    if ids.get("environment_id"):
        return ids["environment_id"]
    env = c.beta.environments.create(
        name=name,
        config={"type": "cloud", "networking": {"type": "unrestricted"}},
    )
    return env.id


def ensure_agent(c: anthropic.Anthropic, config: dict, ids: dict, slot: str) -> str:
    """Create or update a CMA agent by name. `slot` is e.g. 'starter'."""
    existing = ids.get("agents", {}).get(slot)
    if not existing:
        for a in c.beta.agents.list(limit=100):
            if a.name == config["name"]:
                existing = a.id
                break
    if existing:
        current = c.beta.agents.retrieve(existing)
        version = getattr(current, "version", None) or (
            getattr(current, "versions", [1]) or [1]
        )[-1]
        c.beta.agents.update(existing, version=version, **config)
        return existing
    return c.beta.agents.create(**config).id


def session_resources(ids: dict) -> list[dict]:
    files = {**ids.get("data_files", {}), **ids.get("modules", {})}
    return [
        {"type": "file", "file_id": fid, "mount_path": f"data/{name}"}
        if name.endswith((".csv", ".jsonl"))
        else {"type": "file", "file_id": fid, "mount_path": name}
        for name, fid in files.items()
    ]


# ─── deploy + run ──────────────────────────────────────────────────────────

ALL_SKILLS = [
    "reorder-policy", "supplier-selection", "forecasting",
    "notify-templates", "weekly-report",
]


def deploy(slot: str, config_builder) -> dict:
    """Upload everything and create/update the `slot` agent. Prints summary."""
    c = client()
    ids = load_ids()
    if "name_suffix" not in ids:
        ids["name_suffix"] = secrets.token_hex(4)
        save_ids(ids)

    ids["skills"] = upload_skills(c, ALL_SKILLS, ids)
    ids["data_files"] = upload_files(c, {n: DATA_DIR / n for n in DATA_CSVS})
    ids["modules"] = upload_files(c, SANDBOX_MODULES)
    env_name = agent_name_for("stockpilot-env")
    ids["environment_id"] = ensure_env(c, env_name, ids)

    config = config_builder(ids["skills"])
    wants_forecaster = bool(config.pop("wants_forecaster", False))
    ids.setdefault("agents", {})[slot] = ensure_agent(c, config, ids, slot)
    aid = ids["agents"][slot]

    forecaster_line = ""
    if wants_forecaster:
        f_name, f_id, f_version = _ensure_forecaster(c, ids)
        ids["forecaster_id"] = f_id
        attached = _attach_callable_agents(aid, [(f_id, f_version)], config)
        suffix = "· attached via callable_agents" if attached else "· (callable_agents preview unavailable; skill uses inline fallback)"
        forecaster_line = f"✓ forecaster: {f_name}  ({f_id})  {suffix}\n"

    save_ids(ids)

    print(f"✓ uploaded {len(ids['data_files'])} data files, {len(ids['skills'])} skills, "
          f"{len(ids['modules'])} tool module")
    print(f"✓ agent: {config['name']}  ({aid})")
    if forecaster_line:
        print(forecaster_line, end="")
    print(f"✓ environment: {env_name}  ({ids['environment_id']})")
    print(f"→ {console_url(aid)}")
    return ids


def _ensure_forecaster(c: anthropic.Anthropic, ids: dict) -> tuple[str, str, int]:
    name = agent_name_for("stockpilot-forecaster")
    cfg = {
        "name": name,
        "model": MODEL,
        "system": FORECASTER_SYSTEM,
        # Forecaster computes over the CSV via Bash (its own context window holds
        # the history so the main agent's doesn't have to). bash+read only — no
        # write, edit, or web. Runs in the same isolated CMA sandbox.
        "tools": [{
            "type": "agent_toolset_20260401",
            "default_config": {"enabled": False},
            "configs": [
                {"name": "bash", "enabled": True},
                {"name": "read", "enabled": True},
            ],
        }],
    }
    fid = ensure_agent(c, cfg, ids, "forecaster")
    ids.setdefault("agents", {})["forecaster"] = fid
    f = c.beta.agents.retrieve(fid)
    version = getattr(f, "version", None) or (getattr(f, "versions", [1]) or [1])[-1]
    return name, fid, version


WORKER_SYSTEM = (
    "You are a focused subagent. The coordinator delegates one self-contained "
    "task per session. Data CSVs (if needed) live under /mnt/session/uploads/data/. "
    "Compute via Bash; do not write files or modify the filesystem. "
    "Return only what the task asks for. If a structured result is requested, "
    "end with a single JSON object on the last line."
)

# Custom tool definition attendees can add to their agent config (option b).
# The `system` prompt is intentionally NOT a tool input — the worker's system
# is fixed server-side (see WORKER_SYSTEM) so an injected instruction in
# upstream data can't redefine the subagent's role.
SPAWN_SUBAGENT_TOOL: dict = {
    "type": "custom",
    "name": "spawn_subagent",
    "description": (
        "Delegate a self-contained task to a fresh subagent with its own context "
        "window. Use when the work needs large data in context (e.g. 90d sales "
        "history) so it doesn't crowd yours, or for parallel independent subtasks. "
        "Returns the subagent's final text. Ask for JSON if you need to parse it."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "prompt": {"type": "string", "description": "The task for the subagent."},
            "expects_json": {
                "type": "boolean",
                "description": "If true, the subagent is reminded to end with a JSON line.",
            },
        },
        "required": ["prompt"],
    },
}


def _ensure_worker(c: anthropic.Anthropic, ids: dict) -> str:
    name = agent_name_for("stockpilot-worker")
    cfg = {
        "name": name,
        "model": MODEL,
        "system": WORKER_SYSTEM,
        # ⚠️  Generic bash-capable worker driven by a free-text prompt is the
        # most flexible AND most exposed of the three subagent options. Safe
        # in this workshop because: data is synthetic (seed.py), CMA sandbox
        # is per-session/ephemeral with no egress, and no write/edit/web tools.
        # In production, prefer option (a) callable_agents with task-specific
        # system prompts, or replace free-text `prompt` with a structured
        # {task_type, params} schema mapped to fixed templates server-side.
        "tools": [{
            "type": "agent_toolset_20260401",
            "default_config": {"enabled": False},
            "configs": [
                {"name": "bash", "enabled": True},
                {"name": "read", "enabled": True},
            ],
        }],
    }
    wid = ensure_agent(c, cfg, ids, "worker")
    ids.setdefault("agents", {})["worker"] = wid
    return wid


def _handle_spawn_subagent(c: anthropic.Anthropic, ids: dict, args: dict) -> str:
    """Create a fresh worker session for one task and return its final text."""
    try:
        wid = ids.get("agents", {}).get("worker") or _ensure_worker(c, ids)
        save_ids(ids)
        # Strip control chars + cap length. System prompt is fixed server-side
        # so injected directives land in user role; CMA sandbox is the boundary.
        prompt = _CTRL_RE.sub(" ", str(args.get("prompt") or ""))[:8000]
        if args.get("expects_json"):
            prompt += "\n\nEnd with a single JSON object on the last line."
        sess = c.beta.sessions.create(
            agent=wid,
            environment_id=ids["environment_id"],
            title=f"subagent: {prompt[:40]}",
            resources=session_resources(ids),
        )
        c.beta.sessions.events.send(
            sess.id,
            events=[{"type": "user.message", "content": [{"type": "text", "text": prompt}]}],
        )
        out = ""
        deadline = time.time() + 300
        with c.beta.sessions.events.stream(sess.id) as stream:
            for ev in stream:
                et = getattr(ev, "type", None)
                if et == "agent.message":
                    for b in getattr(ev, "content", []) or []:
                        if getattr(b, "type", "") == "text":
                            out = getattr(b, "text", "") or out
                elif et in ("session.status_idle", "session.completed"):
                    break
                if time.time() > deadline:
                    break
        return out or "(subagent returned no text)"
    except Exception as e:  # noqa: BLE001
        return f"spawn_subagent error: {type(e).__name__}: {e}"


def _attach_callable_agents(agent_id: str, callable_specs: list[tuple[str, int]],
                            base_config: dict) -> bool:
    """Update `agent_id` to declare `callable_agents` (Multiagent sessions).

    Shape per platform.claude.com/docs/en/managed-agents/multi-agent:
        callable_agents: [{"type": "agent", "id": ..., "version": ...}]
    Uses the vnext beta header so this works pre-5/6 launch. Best-effort:
    if the key isn't enabled, log and continue — skills have an inline fallback.
    """
    c_mac = anthropic.Anthropic(default_headers={"anthropic-beta": f"{BETA},{BETA_MAC}"})
    callable_agents = [{"type": "agent", "id": cid, "version": ver}
                       for cid, ver in callable_specs]
    try:
        current = c_mac.beta.agents.retrieve(agent_id)
        version = getattr(current, "version", None) or (
            getattr(current, "versions", [1]) or [1]
        )[-1]
        c_mac.beta.agents.update(
            agent_id, version=version, **base_config,
            extra_body={"callable_agents": callable_agents},
        )
        return True
    except Exception as e:  # noqa: BLE001
        print(f"  (callable_agents not attached — {type(e).__name__}: {str(e)[:80]})",
              file=sys.stderr)
        return False


_OVERLOAD_MARKERS = ("overloaded", "529", "503", "rate limit")
_CTRL_RE = re.compile(r"[\x00-\x1f\x7f]")


def _label(prompt: str) -> str:
    return _CTRL_RE.sub(" ", prompt[:24])


def _is_overload(msg: str | None) -> bool:
    return bool(msg) and any(m in msg.lower() for m in _OVERLOAD_MARKERS)


def run_session(slot: str, prompt: str, max_turns: int = 15) -> AgentResult:
    """Create a CMA session for the deployed `slot` agent and stream until idle.

    Retries up to 3× with exponential backoff (5s/15s/30s) on infra overload,
    re-creating the session from scratch each attempt. Token usage is read via
    `sessions.retrieve()` post-hoc (the stream-based capture is best-effort).
    """
    ids = load_ids()
    agent_id = ids.get("agents", {}).get(slot)
    if not agent_id or not ids.get("environment_id"):
        return AgentResult(
            final_text="",
            error=f"agent '{slot}' not deployed — run `uv run deploy {slot}` first",
        )

    c = client()
    label = _label(prompt)
    backoff = [5, 15, 30]
    last_err: str | None = None

    for attempt in range(len(backoff) + 1):
        result = _run_session_once(c, agent_id, ids, prompt, label, max_turns)
        if not _is_overload(result.error):
            if attempt:
                result.error = result.error or None
            break
        last_err = result.error
        if attempt >= len(backoff):
            result.error = f"infra: {last_err} (retried {attempt}×)"
            break
        wait = backoff[attempt]
        print(f"  ↻ [{label}…] infra overload — retry {attempt+1}/{len(backoff)} in {wait}s",
              file=sys.stderr, flush=True)
        time.sleep(wait)

    return result


def _run_session_once(c: anthropic.Anthropic, agent_id: str, ids: dict,
                      prompt: str, label: str, max_turns: int) -> AgentResult:
    try:
        session = c.beta.sessions.create(
            agent=agent_id,
            environment_id=ids["environment_id"],
            title=f"eval: {prompt[:60]}",
            resources=session_resources(ids),
        )
        print(f"  → [{label}…] session {session.id} · {console_url(agent_id)}/sessions/{session.id}",
              file=sys.stderr, flush=True)
        c.beta.sessions.events.send(
            session.id,
            events=[{
                "type": "user.message",
                "content": [{"type": "text", "text": prompt}],
            }],
        )
    except Exception as e:  # noqa: BLE001
        return AgentResult(final_text="", error=f"session create failed: {e}")

    transcript: list[dict] = [{"role": "user", "content": prompt}]
    final_text = ""
    turns = tokens_in = tokens_out = 0
    error: str | None = None
    t0 = time.time()
    deadline = t0 + 600
    last_heartbeat = t0

    try:
        with c.beta.sessions.events.stream(session.id) as stream:
            for ev in stream:
                etype = getattr(ev, "type", None)
                if etype == "agent.message":
                    turns += 1
                    content = getattr(ev, "content", []) or []
                    transcript.append({"role": "assistant", "content": _serialize(content)})
                    text = "".join(
                        getattr(b, "text", "") for b in content
                        if getattr(b, "type", "") == "text"
                    )
                    if text:
                        final_text = text
                    u = getattr(ev, "usage", None)
                    if u:
                        tokens_in += getattr(u, "input_tokens", 0) or 0
                        tokens_out += getattr(u, "output_tokens", 0) or 0
                elif etype == "agent.tool_use":
                    transcript.append({"role": "tool_use", "content": _serialize(ev)})
                    if getattr(ev, "name", "") == "spawn_subagent":
                        result_text = _handle_spawn_subagent(
                            c, ids, getattr(ev, "input", None) or {}
                        )
                        try:
                            c.beta.sessions.events.send(
                                session.id,
                                events=[{
                                    "type": "tool_result",
                                    "tool_use_id": getattr(ev, "id", ""),
                                    "content": [{"type": "text", "text": result_text}],
                                }],
                            )
                        except Exception as e:  # noqa: BLE001
                            error = f"spawn_subagent tool_result send failed: {e}"
                elif etype in ("session.usage", "agent.usage", "usage"):
                    u = getattr(ev, "usage", None) or ev
                    tokens_in = getattr(u, "input_tokens", tokens_in) or tokens_in
                    tokens_out = getattr(u, "output_tokens", tokens_out) or tokens_out
                elif etype in ("session.status_idle", "session.completed"):
                    break
                elif etype == "session.error":
                    err = getattr(ev, "error", None) or getattr(ev, "data", None) or ev
                    msg = getattr(err, "message", None) or getattr(err, "detail", None)
                    error = str(msg) if msg else json.dumps(_serialize(err))[:300]
                now = time.time()
                if now - last_heartbeat >= 30:
                    print(f"  · [{label}…] {turns}tn {now - t0:.0f}s", file=sys.stderr, flush=True)
                    last_heartbeat = now
                if now > deadline or turns >= max_turns:
                    break
    except Exception as e:  # noqa: BLE001
        error = f"stream error: {e}"

    # Authoritative usage: post-hoc retrieve. Retry once if it reads 0.
    for i in range(2):
        try:
            s = c.beta.sessions.retrieve(session.id)
            u = getattr(s, "usage", None)
            if u:
                ti = getattr(u, "input_tokens", 0) or 0
                to = getattr(u, "output_tokens", 0) or 0
                if ti or to:
                    tokens_in, tokens_out = ti, to
                    break
        except Exception:
            pass
        if i == 0 and turns > 0 and not (tokens_in or tokens_out):
            time.sleep(2)
    if turns > 0 and not (tokens_in or tokens_out):
        tokens_in = tokens_out = -1  # sentinel: usage unavailable

    _sync_sinks(c, session.id, ids)
    return AgentResult(
        final_text=final_text, turns=turns,
        tokens_in=tokens_in, tokens_out=tokens_out,
        transcript=transcript, error=error,
    )


# ─── internals ─────────────────────────────────────────────────────────────

def _sync_sinks(c: anthropic.Anthropic, session_id: str, ids: dict) -> None:
    """Pull sink JSONLs from the session sandbox into local data/.runs/<run_id>/.

    The CMA beta has no file-download endpoint for agent-written outputs, so
    we ask the session itself to cat the sink files and parse the reply. This
    runs after the eval's metrics (turns/tokens/final_text) are captured, so
    it doesn't pollute results.
    """
    from agents.common import current_run_id
    out_dir = sink_dir(current_run_id())
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = (
        'for f in /mnt/user/sinks/*.jsonl /mnt/session/outputs/sinks/*.jsonl ./sinks/*.jsonl; '
        'do [ -f "$f" ] && echo "===SINK $(basename $f)===" && cat "$f"; done; echo "===END==="'
    )
    try:
        c.beta.sessions.events.send(
            session_id,
            events=[{"type": "user.message", "content": [{"type": "text",
                     "text": f"Run exactly this bash command and return only its stdout, nothing else:\n```\n{cmd}\n```"}]}],
        )
        text = ""
        deadline = time.time() + 60
        with c.beta.sessions.events.stream(session_id) as stream:
            for ev in stream:
                if getattr(ev, "type", "") == "agent.message":
                    for b in getattr(ev, "content", []) or []:
                        if getattr(b, "type", "") == "text":
                            text += getattr(b, "text", "")
                if getattr(ev, "type", "") in ("session.status_idle", "session.completed") or time.time() > deadline:
                    break
    except Exception:
        return
    cur = None
    buf: dict[str, list[str]] = {n: [] for n in SINKS}
    for line in text.splitlines():
        if line.startswith("===SINK "):
            cur = line.removeprefix("===SINK ").removesuffix("===").strip()
        elif line.startswith("===END"):
            cur = None
        elif cur in buf and line.strip():
            buf[cur].append(line)
    for name, lines in buf.items():
        if lines:
            (out_dir / name).write_text("\n".join(lines) + "\n")


def _zip_dir(d: Path) -> io.BytesIO:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for p in d.rglob("*"):
            if p.is_file():
                z.write(p, Path(d.name) / p.relative_to(d))
    buf.seek(0)
    return buf


def _mime(name: str) -> str:
    if name.endswith(".csv"):
        return "text/csv"
    if name.endswith(".jsonl"):
        return "application/x-ndjson"
    if name.endswith(".py"):
        return "text/x-python"
    return "application/octet-stream"


def _serialize(obj):
    if obj is None or isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, (_dt.date, _dt.datetime)):
        return obj.isoformat()
    if isinstance(obj, (list, tuple)):
        return [_serialize(o) for o in obj]
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items() if not k.startswith("_")}
    if hasattr(obj, "model_dump"):
        return _serialize(obj.model_dump())
    if hasattr(obj, "__dict__"):
        return {k: _serialize(v) for k, v in obj.__dict__.items() if not k.startswith("_")}
    return repr(obj)
