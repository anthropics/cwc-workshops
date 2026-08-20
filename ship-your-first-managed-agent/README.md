<!-- Copyright 2026 Anthropic PBC -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Incident-2277

> **Workshop sample.** Not maintained and not accepting contributions.

> **It's 2am. PagerDuty fires: checkout p99 latency is 10× baseline.**
> You know the drill — open the dashboard, grep logs, scroll deploys, guess,
> check, repeat. Forty minutes later you find it: someone shipped an N+1 query.
>
> This workshop builds the agent that does that forty minutes for you.

A working incident dashboard for a fictional e-commerce stack. The Metrics,
Logs, and Deploys pages run out of the box from mock data. There's an
**SRE Agent** chat panel on the side of every page — and it's offline.
Bringing it online is the workshop: seven small functions in one file, each a
single [Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview)
API call.

When you're done, you ask it *"what caused the latency spike?"* and watch it
grep a 70k-line log inside its own cloud sandbox, call your local tools to
pull metrics and deploys, correlate the timestamps, fetch the offending diff,
and name the commit.

## Setup

You need Python **3.10+** and an [Anthropic API key](https://console.anthropic.com/settings/keys).

```bash
git clone https://github.com/anthropic-experimental/cwc-workshops
cd cwc-workshops/ship-your-first-managed-agent

python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

pip install -r requirements.txt
cp .env.example .env               # then put your ANTHROPIC_API_KEY in .env

python data/generate_log.py        # writes data/app.log (70k lines, not in git)
streamlit run app.py
```

The dashboard opens at `localhost:8501`. Click around — Metrics, Logs,
Deploys all work. The SRE Agent panel on the right says
*"agent offline — implement `setup_agent()` in `agent.py`"*.

## What you build

Open **`agent.py`**. Seven functions, all `raise NotImplementedError`. Fill them
in and the panel comes online one step at a time.

| # | Function | API call | Lines |
|---|---|---|---|
| 1 | `setup_agent()` | `client.beta.skills.create` + `agents.create` | 7 |
| 2 | `setup_environment()` | `client.beta.environments.create` | 4 |
| 3 | `upload_log()` | `client.beta.files.upload` | 2 |
| 4 | `start_session()` | `client.beta.sessions.create` | 5 |
| 5 | `stream_reply()` | `client.beta.sessions.events.stream` + `.send` | 12 |
| 6 | `handle_tool()` | runs locally — reads `data/*.json` | 7 |
| 7 | `delete_session()` | `client.beta.sessions.delete` | 1 |

That's ~38 lines total. Everything else — the system prompt, tool schemas,
the runbook skill, the chat UI, the session picker — is provided.

Stuck? `agent_complete.py` has the finished versions.

## The incident

`data/` ships a real-feeling outage: at **14:31:18 UTC** commit `a3f9c21`
deploys to the checkout service, replacing a batched query with a per-row
loop. Within minutes p99 latency climbs from 65 ms to 3,600 ms, the DB
connection pool saturates, and 20% of checkouts start failing.

The evidence is spread across:

- `app.log` — 70,000 lines of JSON logs the agent has to grep in its sandbox
- `metrics.json` / `deploys.json` / `diff.txt` — what `get_metrics`,
  `get_recent_deploys`, and `get_diff` return when the agent calls them
  (these handlers run on **your** machine, not the cloud — that's the point)

The agent has to correlate all four to name the root cause. It does.

## What this teaches

- **Agent → Environment → Session → Events** — the four Managed Agents
  resources, in the order the
  [quickstart](https://platform.claude.com/docs/en/managed-agents/quickstart)
  introduces them
- **Skills** — `incident-triage-runbook/SKILL.md` packages this team's runbook;
  uploaded and attached inside `setup_agent()` so every session follows the
  same conventions
- **Sandboxed code execution** — the agent writes and runs Python in a
  managed container you never provision
- **Custom tools** — the agent in the cloud calls functions on your laptop
  over the event stream; swap the mock JSON for a Datadog client and it's
  production
- **Stateful sessions** — the dropdown above the chat lists every past
  session via `sessions.list()`; pick one and the conversation reloads from
  `events.list()`. No database, no local state.

## Repo layout

```
agent.py            ← the only file you edit
agent_complete.py   ← reference implementation
provided.py         ← system prompt, tool schemas, chat UI, session picker
e2e.py              ← headless test of the full path

app.py              ← incident overview
pages/              ← Metrics, Logs, Deploys
incident-triage-runbook/  ← the team's runbook skill (SKILL.md)
data/               ← log + metrics + deploys + diff fixtures
ui.py, assets/      ← styling
```

## License

MIT
