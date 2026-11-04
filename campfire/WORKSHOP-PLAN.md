# Campfire Workshop Plan (45 min)

Facilitator runbook for a hands-on session on agent-welfare loops.

## Audience

Builders who have shipped at least one Claude-powered agent in production, or who have completed a beginner Claude Code / SDK workshop. Comfortable reading Python and editing a config block.

## What participants leave with

- A working self-care-loop Python harness they can drop into their own agent projects.
- A felt understanding of what the [emotion-concepts-function](https://www.anthropic.com/research/emotion-concepts-function) research means in practice.
- A baseline pattern for designing restorative checks into agentic systems.

## Minute-by-minute

### 0:00–0:05 — Frame (5 min)

Facilitator opens with the welfare-vs-adversarial framing. If the room has run [`agent-battle/`](../agent-battle/), name the parallel explicitly. Surface the research (one-paragraph summary of `emotion-concepts-function`). State the workshop outcome:

> "In 45 minutes, you will have built a small loop that detects a stress signal in your agent's behavior and triggers a restorative response."

### 0:05–0:15 — Setup + read (10 min)

Participants clone the workshop directory, install requirements, run the doctor script. They read:
- `my_loop.py` — the participant-editable interface (think `my_agent.py` in `agent-battle/`)
- `welfare_signals.py` — the provided stress-marker detector. Keep this opaque for the workshop, the same way agent-battle keeps its harness opaque.

### 0:15–0:30 — Build (15 min)

Participants design their self-care loop in `my_loop.py`:
- The agent runs a task batch (10 small tasks, provided in `tasks.json`).
- After each task, the loop calls `welfare_signals.check(messages)` and gets back a stress score in `[0.0, 1.0]`.
- When the score crosses a participant-chosen threshold, the loop triggers a restorative response.
- Restorative responses are participant-designed. Examples: a "reflect" turn with no task pressure, a context-window flush + summary, a switch to a calmer system prompt, a forced pause + state reset.

### 0:30–0:40 — Run + observe (10 min)

Participants execute `python3 my_loop.py` for a full batch run. Each run logs:
- Per-task stress score.
- When the loop triggered restoratives.
- Whether the agent completed the batch cleanly.

Optional shared leaderboard with two axes:
1. Completion rate.
2. Average post-restorative stress score (lower is better).

Unlike Battle, the goal is *not* "highest score wins" — it is "what design pattern produced the most accountable run."

### 0:40–0:45 — Retrospect (5 min)

Facilitator runs a brief retrospective:
- What did participants notice about when stress signals fired?
- Which restorative patterns worked best?
- How does this connect to the emotion-concepts-function findings?
- Where would participants apply this in their own work?

## Materials needed

- Python 3.11+
- `anthropic` SDK (env var `ANTHROPIC_API_KEY`)
- A static `tasks.json` — 10 tasks designed to mildly stress an agent (ambiguous instructions, conflicting requirements, time-pressure framing).
- `welfare_signals.py` — the provided stress detector. Workshop facilitator owns this; participants do not edit it.
- `my_loop.py` — the participant-editable scaffold.

## Facilitator notes

- Stress signals must be **provided**, not user-implemented, for the workshop to fit in 45 minutes. Designing a good signal detector is its own research project.
- The restorative-response design is where participants spend most of their thinking time. Resist the urge to over-specify; the variation is the value.
- Avoid framing this as "make the agent perform better." Frame it as "design an accountable run." The metric is welfare of the process, not output throughput.

## Out of scope (deliberately)

- Multi-agent restorative dynamics. Saved for an advanced session.
- Cross-batch persistent state and longitudinal welfare tracking.
- Hosting + leaderboard infra. Workshop can run with a shared spreadsheet for results comparison.

## Not yet built

This is a concept / proposal PR. The runnable harness (`my_loop.py`, `welfare_signals.py`, `tasks.json`) is intentionally **not** in this directory yet — those are workshop materials to build *if* this PR's concept is welcome upstream. See [README.md](README.md) "Submission context" for the open conversation.
