# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0
"""
The SRE Agent. The only Python file Claude Code fills in for you.

    Part 1  one agent            functions 1-8   the panel comes online
    Part 2  multiagent           setup_investigator() + a roster on the commander
    Part 3  memory stores        setup_memory() + two more session resources
    Part 4  file output          download_outputs() + one more skill

Each function is one Managed Agents concept. `python check.py` tells you which
parts work. Everything else (prompts, tool schemas, UI) is in provided.py.

Two helpers from state.py keep a shared API key tidy:
    state.name("env")   -> "sre-<your-handle>-env"       use for every name=
    state.owner()       -> {"workshop": ..., "owner": ...} use for every metadata=
    state.sync(key, config, create, update)
        runs create() the first time and saves the ID in .sre-state.json,
        returns the saved ID while `config` is unchanged,
        runs update(saved_id) when `config` changes.
        create/update return the API object (anything with an .id).
"""
import json

import anthropic
from anthropic.lib import files_from_dir

import state
from provided import (
    COMMANDER_MODEL, COMMANDER_SYSTEM, DATA, INVESTIGATOR_MODEL, INVESTIGATOR_SYSTEM,
    MANAGED_AGENTS_BETA, MEMORY_SEED, SKILLS, TOOLS,
    deploys, diffs, incidents, metrics, wanted_output,
)

client = anthropic.Anthropic()


# ══ PART 1 · one agent ════════════════════════════════════════════════════

# ── 1. Environment ────────────────────────────────────────────────────────
# Where the agent's container runs. Create once, reuse forever.
#   config = {"type": "cloud", "networking": {"type": "unrestricted"}}
#   state.sync("environment", config,
#       create=lambda: client.beta.environments.create(name=state.name("env"), config=config, metadata=state.owner()),
#       update=lambda env_id: client.beta.environments.update(env_id, config=config))
def setup_environment() -> str:
    config = {"type": "cloud", "networking": {"type": "unrestricted"}}
    return state.sync(
        "environment", config,
        create=lambda: client.beta.environments.create(
            name=state.name("env"), config=config, metadata=state.owner()),
        update=lambda env_id: client.beta.environments.update(env_id, config=config),
    )

# ── 2. Upload the log ─────────────────────────────────────────────────────
# Push data/app.log to the Files API so sessions can mount it.
#   client.beta.files.upload(file=<open binary file>)   -> object with .id
#   state.sync("log", {"bytes": <file size>}, create=...)
def upload_log() -> str:
    path = DATA / "app.log"
    def create():
        with open(path, "rb") as f:
            return client.beta.files.upload(file=f)
    return state.sync("log", {"bytes": path.stat().st_size}, create=create)


# ── 3. Skills ─────────────────────────────────────────────────────────────
# A skill is a folder (SKILL.md plus optional scripts) the agent loads on demand.
# Upload SKILLS / folder once; publish a new version when the folder changes.
#   create: client.beta.skills.create(display_title=f"{folder} ({state.handle()})", files=files_from_dir(path))
#   update: client.beta.skills.versions.create(skill_id, files=files_from_dir(path))
#   state.sync(f"skill:{folder}", state.dir_fingerprint(path), create, update)
# Return the reference an agent uses: {"type": "custom", "skill_id": ..., "version": "latest"}
def setup_skill(folder: str) -> dict:
    path = SKILLS / folder
    skill_id = state.sync(
        f"skill:{folder}", state.dir_fingerprint(path),
        create=lambda: client.beta.skills.create(
            display_title=f"{folder} ({state.handle()})", files=files_from_dir(path)),
        update=lambda sid: client.beta.skills.versions.create(sid, files=files_from_dir(path)),
    )
    return {"type": "custom", "skill_id": skill_id, "version": "latest"}


# ── 4. Agent ──────────────────────────────────────────────────────────────
# What the agent IS: model, system prompt, tools, skills. Versioned: create it
# once, and a changed config becomes a new version of the same agent.
#   config = dict(name=state.name("commander"), model=COMMANDER_MODEL, system=COMMANDER_SYSTEM,
#                 tools=TOOLS, skills=[setup_skill("incident-triage-runbook")], metadata=state.owner())
#   create: client.beta.agents.create(**config)
#   update: client.beta.agents.update(agent_id, version=client.beta.agents.retrieve(agent_id).version, **config)
#   state.sync("agent", config, create, update)
#
# Part 2 adds to config:
#   multiagent={"type": "coordinator",
#               "agents": [{"type": "agent", "id": setup_investigator(),
#                           "version": state.version("investigator")}]}
#   (call setup_investigator() before reading state.version("investigator"))
# Part 4 adds setup_skill("postmortem-report") to skills.
def setup_agent() -> str:
    config = dict(
        name=state.name("commander"), model=COMMANDER_MODEL, system=COMMANDER_SYSTEM,
        tools=TOOLS, skills=[setup_skill("incident-triage-runbook")], metadata=state.owner(),
    )
    return state.sync(
        "agent", config,
        create=lambda: client.beta.agents.create(**config),
        update=lambda agent_id: client.beta.agents.update(
            agent_id, version=client.beta.agents.retrieve(agent_id).version, **config),
    )


# ── 5. Session ────────────────────────────────────────────────────────────
# One running conversation: agent + environment + mounted resources.
#   client.beta.sessions.create(agent=agent_id, environment_id=env_id, metadata=state.owner(),
#       resources=[{"type": "file", "file_id": log_file_id, "mount_path": "app.log"}])
# The file lands at /mnt/session/uploads/app.log.
# Part 3 adds the two memory resources: resources=[{...file...}, *setup_memory()]
def start_session(agent_id: str, env_id: str, log_file_id: str) -> str:
    session = client.beta.sessions.create(
        agent=agent_id, environment_id=env_id, metadata=state.owner(),
        resources=[{"type": "file", "file_id": log_file_id, "mount_path": "app.log"}],
    )
    return session.id


# ── 6. Stream loop ────────────────────────────────────────────────────────
# Open the stream FIRST, then send the user's message, then yield every event.
#   with client.beta.sessions.events.stream(session_id) as stream:
#       client.beta.sessions.events.send(session_id, events=[
#           {"type": "user.message", "content": [{"type": "text", "text": user_text}]}])
#       for ev in stream: yield ev ...
# When ev.type == "agent.custom_tool_use", run handle_tool(ev.name, ev.input) and send back
#   {"type": "user.custom_tool_result", "custom_tool_use_id": ev.id,
#    "content": [{"type": "text", "text": result}]}
# (Sub-agent tool calls arrive on this same stream in Part 2; answer them the same way.)
# Stop when ev.type == "session.status_terminated", or when it is "session.status_idle"
# and ev.stop_reason.type != "requires_action" ("requires_action" means it is waiting on you).
def stream_reply(session_id: str, user_text: str):
    with client.beta.sessions.events.stream(session_id) as stream:
        client.beta.sessions.events.send(session_id, events=[
            {"type": "user.message", "content": [{"type": "text", "text": user_text}]}])
        for ev in stream:
            yield ev
            if ev.type == "agent.custom_tool_use":
                result = handle_tool(ev.name, ev.input)
                client.beta.sessions.events.send(session_id, events=[
                    {"type": "user.custom_tool_result", "custom_tool_use_id": ev.id,
                     "content": [{"type": "text", "text": result}]}])
            elif ev.type == "session.status_terminated":
                break
            elif ev.type == "session.status_idle" and ev.stop_reason.type != "requires_action":
                break


# ── 7. Local tool handlers ────────────────────────────────────────────────
# These run on YOUR machine when the cloud agent calls a custom tool. Return a string.
#   list_incidents      -> json.dumps(incidents)
#   get_metrics         -> json.dumps(metrics[service][metric]); for an unknown name,
#                          return the valid ones: {service: list(names) for each service}
#   get_recent_deploys  -> deploys
#   get_diff            -> diffs[commit[:7]], or a "no diff on file" message
def handle_tool(name: str, args: dict) -> str:
    if name == "list_incidents":
        return json.dumps(incidents)
    if name == "get_metrics":
        try:
            return json.dumps(metrics[args["service"]][args["metric"]])
        except KeyError:
            return json.dumps({service: list(names) for service, names in metrics.items()})
    if name == "get_recent_deploys":
        return deploys
    if name == "get_diff":
        return diffs.get(str(args.get("commit", ""))[:7], f"no diff on file for {args.get('commit')}")
    return f"unknown tool: {name}"


# ── 8. Delete session ─────────────────────────────────────────────────────
# Sessions are real cloud resources: client.beta.sessions.delete(session_id)
def delete_session(session_id: str) -> None:
    client.beta.sessions.delete(session_id)


# ══ PART 2 · multiagent ═══════════════════════════════════════════════════
# A second agent the commander can hand a page to. Same shape as setup_agent():
#   state.sync key "investigator", name=state.name("investigator"),
#   model=INVESTIGATOR_MODEL, system=INVESTIGATOR_SYSTEM, tools=TOOLS,
#   skills=[setup_skill("incident-triage-runbook")], metadata=state.owner()
# A sub-agent only has the tools in its own config, so it needs TOOLS too.
# Then add the roster to setup_agent() (see the note there).
def setup_investigator() -> str:
    raise NotImplementedError


# ══ PART 3 · memory stores ════════════════════════════════════════════════
# Two stores, mounted into the container as folders under /mnt/memory/.
#   team history  read_only   seeded from every .md under MEMORY_SEED
#   notebook      read_write  starts empty; the agent writes its own notes
#
#   store = client.beta.memory_stores.create(name=state.name("team-history"),
#                                            description="...", metadata=state.owner())
#   client.beta.memory_stores.memories.create(store.id, path="/service-map.md", content="...")
#       path = "/" + the file's path relative to MEMORY_SEED
#   state.sync("memory:team-history", state.dir_fingerprint(MEMORY_SEED), create=...)
#   state.sync("memory:notebook", "v1", create=...)
#
# Return two session resources, then add them in start_session():
#   {"type": "memory_store", "memory_store_id": ..., "access": "read_only" | "read_write",
#    "instructions": "what this store is for and when to read or write it"}
# The description and instructions are written for the model. They are the
# only thing that tells the agent what each store is for. A starting point:
#   team history: "Team knowledge. Read service-map.md and known-noise.md before you
#                  investigate, check incidents/ for anything like this one, and follow
#                  postmortem-conventions.md in anything you write up."
#   notebook:     "Your own notebook. Check it first for incidents you have already worked.
#                  When an investigation concludes, save a short note at
#                  /incidents/<date>-<INCIDENT_ID>.md: root cause, how you proved it, the fix."
# If the notebook instructions never say to write, the agent never will.
def setup_memory() -> list[dict]:
    raise NotImplementedError


# ══ PART 4 · file output ══════════════════════════════════════════════════
# Whatever the agent writes under /mnt/session/outputs/ can be listed and
# downloaded through the Files API, scoped to the session.
#   files = client.beta.files.list(scope_id=session_id, betas=[MANAGED_AGENTS_BETA])
#   client.beta.files.download(f.id).read()   -> bytes
# Return [(f.filename, bytes), ...] for every f where wanted_output(f) is true.
# Then add setup_skill("postmortem-report") to the commander's skills.
def download_outputs(session_id: str) -> list[tuple[str, bytes]]:
    raise NotImplementedError
