<!-- Copyright 2026 Anthropic PBC -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Notes for Claude Code

This directory is a workshop. The person you are working with is here to learn Claude Managed Agents. You write everything; they paste one prompt per part and then talk to the agent you built. Work one part at a time.

## What they will say

People type these in their own words. Match the intent, not the wording:

| They say something like | You do |
|---|---|
| "get the agent online", "start", "part 1" | Part 1 |
| "give it a team of investigators", "add multiagent", "part 2" | Part 2 |
| "give it memory", "make it remember", "part 3" | Part 3 |
| "let it write a postmortem PDF", "add the report", "part 4" | Part 4 |
| "next" | The lowest-numbered part that is still a stub |

**One part per request, then stop.** Do not start the next part, even if you can see its stubs and it looks easy. Leave the later stubs raising `NotImplementedError`: the dashboard uses them to show which parts are on. The only exception is an explicit request for all of it, such as "build everything".

Do the parts in order. If an earlier part is still a stub, do that one first and say so. They will not ask you to run the check: always run it yourself with `--part N` and keep going until it passes. Then stop, say what to try in the dashboard, and tell them what to type for the next part.

## The job

`agent.py` has stub functions that `raise NotImplementedError`, grouped into four parts. When asked to do a part:

1. Read the stub comments for that part. They give the exact call shapes and the values you cannot look up (model constants, mount paths, the beta header). Use them as written.
2. Implement only that part's functions, plus the small additions the comments name in earlier functions (the roster in `setup_agent()`, the memory resources in `start_session()`, the second skill).
3. Run `.venv/bin/python check.py --part N` (plain `python` if there is no `.venv`; `.venv\Scripts\python` on Windows). It drives the live API and prints PASS or FAIL per part. Fix what fails and run it again.
4. Explain what you did in three short bullets: what changed, the Managed Agents concept it uses, and where to see it in the dashboard.

## Rules

- Edit `agent.py` only, plus the files under Optional changes when asked. `provided.py`, `state.py`, `check.py` and `cleanup.py` are fixed.
- Do not open `solutions/`. It is the answer key. Work from the stub comments and the installed `anthropic` package.
- Create cloud resources only through `state.sync(...)`, with `state.name(...)` in every `name=` and `state.owner()` in every `metadata=`. A whole room may share one API key, and this is what keeps people's resources apart.
- Never print, log or paste the API key. Never put it in a prompt, an event or a resource.
- Do not delete or archive anything through the API yourself. `python cleanup.py` does that safely.
- Use the platform's exact names when you explain things: agents, environments, sessions, events, skills, custom tools, multiagent, threads, memory stores, session outputs.

## Optional changes

The person does not edit files by hand. After a part passes they may ask you for a change to one of these. Make it for them, in the file named:

| Part | What it controls | File |
|---|---|---|
| 1 | What the commander is told | `prompts/commander.md` |
| 2 | How an investigator is briefed and what it hands back | `prompts/investigator.md` |
| 3 | What the team already knows | `memory-seed/*.md` |
| 4 | What the postmortem must contain and how it should look | `skills/postmortem-report/SKILL.md` |

Changes take effect on the next dashboard rerun or `check.py` run: a changed prompt becomes a new agent version, a changed skill folder becomes a new skill version, and a changed `memory-seed/` becomes a freshly seeded store. Sessions already running keep what they started with, so start a new session to see a change.

## Useful facts

- `./setup.sh` does the one-time setup and starts the dashboard. If someone asks you to set things up, run it for them, but let them paste the API key themselves.
- The dashboard is usually already running in their other terminal. It reloads by itself when `agent.py` changes.
- The log is mounted in the container at `/mnt/session/uploads/app.log`.
- Custom tools run on this machine in `handle_tool()`. A sub-agent's custom tool call arrives on the session stream with `session_thread_id` set; answer it like any other.
- Memory stores attach when a session is created, not afterwards.
- Files the agent writes under `/mnt/session/outputs/` appear in `files.list(scope_id=session_id)` a few seconds after the turn ends.
- Tested with `anthropic==0.116.0`. If a call shape in a stub comment disagrees with a newer SDK, say so instead of guessing.
