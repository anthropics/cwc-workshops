<!-- Copyright 2026 Anthropic PBC -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Ship Your First Managed Agent

> **Workshop sample.** Not maintained and not accepting contributions.

> **It's 2am. Three pages fire inside half an hour.**
> Inventory is slow. Checkout is slower. Cart is throwing errors.
> Three services, one on-call, and no idea yet whether this is one problem or three.
>
> This workshop builds the agent team that works it out and hands you the postmortem.

A working on-call dashboard for a fictional e-commerce stack. Metrics, Logs and Deploys run out of the box from mock data. There is an **SRE Agent** panel on every page, and it is offline. Bringing it online is the workshop.

Each check and each question to the agent takes one to three minutes, because `check.py` runs the real agent against the live API.

You do it in four parts on [Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview). Claude Code writes all of it. You paste one prompt per part, then talk to the agent you just built. There is nothing to type by hand.

| Part | You add | What you see |
|---|---|---|
| 1 | One agent with a runbook skill and custom tools | It finds the root cause of one page |
| 2 | Multiagent: an incident commander and an investigator per page | Three threads working in parallel |
| 3 | Memory stores: team history and the agent's own notebook | It recognises patterns and follows team conventions |
| 4 | File output: a postmortem PDF | A download button in the dashboard |

## Setup

You need Python **3.10+**, [Claude Code](https://claude.com/claude-code) and an Anthropic API key. In a workshop, the organiser gives you the key.

```bash
git clone https://github.com/anthropics/cwc-workshops
cd cwc-workshops/ship-your-first-managed-agent
./setup.sh
```

`setup.sh` creates a virtualenv, installs the packages, asks for your API key, generates the log and starts the dashboard. On Windows, or to do it by hand:

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # then put the ANTHROPIC_API_KEY in .env
python data/generate_log.py        # writes data/app.log (74k lines, not in git)
streamlit run app.py
```

The dashboard opens at `localhost:8501`. Click around: Metrics, Logs and Deploys all work. The SRE Agent panel says *"agent offline"*.

Now open a second terminal in this directory and run `claude`.

## Part 1: one agent (10 min)

Type into Claude Code, in your own words if you like:

```
get the agent online
```

Claude fills in eight functions: an **environment**, the uploaded log, a **skill**, the **agent**, a **session**, the **event** stream loop, the **custom tool** handlers and session delete.

When the check passes, reload the dashboard, click **+** for a new session and ask:

> What caused the checkout latency spike?

Watch the tool calls. `sandbox` calls run in the agent's cloud container. `local` calls run on your laptop, in `handle_tool()`.

**Optional, also a prompt for Claude Code:**

```
make the commander end every answer with a one-line status for an exec
```

Then start a new session and ask again. The agent ID stays the same; you just published version 2.

## Part 2: multiagent (15 min)

One agent can work one page. Three pages at once need a team.

```
give it a team of investigators
```

Claude adds a second agent, the investigator, and puts it on the commander's roster. Start a new session and say:

> Three pages are open. Run the incident.

The commander opens one **thread** per page. Each thread is an investigator with its own context and its own model setting, sharing one container. Their custom tool calls arrive on the same stream as the commander's. When they report back, the commander compares root causes.

Before moving on, start one more session and give it the same three pages. It starts from zero and does all the work again. Sessions share nothing with each other yet. Part 3 fixes that.

**Optional, also a prompt for Claude Code:**

```
have each investigator rate its confidence from 1 to 5
```

Then start a new session and ask again.

## Part 3: memory stores (12 min)

Every session so far started from nothing. The team knows things: which services share a database, what the noisy log lines are, what happened last time.

```
give it memory
```

Claude creates two **memory stores** and mounts both into the session:

- **team history**, read-only, seeded from `memory-seed/`
- **the agent's notebook**, read-write, empty to start

Start a new session (memory attaches when a session is created) and run the incident again. Then open the **Memory** page: the notebook now has notes the agent wrote, with a version history showing which session wrote them.

Now start one more session and give it the same three pages. This time the commander starts from its own notes. Sometimes it answers straight from them in under a minute; sometimes it sends the investigators back out to re-check what the notes say.

**Optional, also a prompt for Claude Code:**

```
teach the team memory a new convention: every postmortem ends with a line on customer impact
```

Then start a new session and ask again. The agent follows the new convention.

## Part 4: file output (10 min)

```
let it write a postmortem PDF
```

Claude attaches a second skill, `postmortem-report`, and implements the download. The skill only says what a postmortem must contain. The agent writes and runs its own code in the sandbox to build the PDF, with charts it computes from the log. Ask:

> Write the postmortem PDF.

Anything the agent writes under `/mnt/session/outputs/` comes back through the Files API. A download button appears under the chat.

**Optional, also a prompt for Claude Code:**

```
make the postmortem open with a one-page exec summary
```

Then start a new session and ask again. Nobody touches layout code: the agent rewrites its own. Editing the folder publishes a new version of the skill.

## The incidents (spoilers)

<details>
<summary>What actually happened</summary>

| Page | Fired | Root cause |
|---|---|---|
| INC-2276 inventory p99 latency | 14:16:05 | Deploy `c81d4e7` at 14:12:40 removed the cache on a heavy SKU lookup |
| INC-2277 checkout p99 latency | 14:36:07 | Deploy `a3f9c21` at 14:31:18 turned one batched query into an N+1 |
| INC-2278 cart error rate | 14:43:30 | No cart change. Checkout's N+1 saturated `db-primary`, which cart shares |

Three pages, two root causes. The evidence is spread across:

- `app.log`: 74,000 lines of JSON logs the agents grep in their sandbox
- `metrics.json`, `deploys.json`, `diffs/`: what the custom tools return. These handlers run on your machine, not in the cloud.

There is also a decoy: auth errors at 14:15 that fix themselves.

</details>

## Sharing one API key

A workshop room usually shares one key, so everything this app creates is kept apart by name:

- The first run gives you a handle such as `ada-4f2c`, saved in `.sre-state.json`. Set `SRE_HANDLE` in `.env` to choose your own.
- Every agent, environment, skill and memory store has your handle in its name. Where the API accepts metadata, it is tagged with your handle too.
- Resource IDs are saved in `.sre-state.json` and reused, so restarting the app creates nothing new.
- `python cleanup.py` removes only the resources in your own state file. Try `--dry-run` first.

A shared key is still a shared key. Anyone holding it can read or delete anything it can reach. Organisers: create the key in a workspace used only for the workshop, set a spend limit, and delete the key afterwards.

Every agent runs on `claude-opus-5-5`. Each agent has its own model, so you can change the commander and the investigators separately in `.env` with `SRE_COMMANDER_MODEL` and `SRE_INVESTIGATOR_MODEL`. `claude-haiku-5-5` investigators are faster and cheaper, which helps when a room shares one key's rate limit.

## What this teaches

- **Agents, environments, sessions, events**: the four core Managed Agents resources
- **Skills**: a folder of instructions the agent loads on demand, published as versions
- **Custom tools**: the agent in the cloud calls functions on your laptop over the event stream
- **Multiagent**: a coordinator with a roster of agents, each running as a thread
- **Memory stores**: persistent folders mounted into the session, read-only or read-write
- **Sandbox and session outputs**: the agent writes and runs code in its container, and the files it produces are downloaded through the Files API

## Repo layout

```
agent.py            the stubs Claude Code fills in
check.py            headless check of each part against the live API
cleanup.py          removes your cloud resources
setup.sh            one command: virtualenv, packages, key, log, dashboard
CLAUDE.md           instructions Claude Code reads
AGENTS.md           the same instructions, for other coding agents

prompts/            what the commander and investigators are told
skills/             incident-triage-runbook, postmortem-report
memory-seed/        what the team already knows

provided.py         prompts, tool schemas, chat UI
state.py            your handle and saved resource IDs
solutions/agent.py  reference implementation
app.py, pages/      the dashboard
data/               log, metrics, deploys and diff fixtures
ui.py, assets/      styling
```

Tested with `anthropic==0.116.0` and `streamlit==1.46.1`, which `requirements.txt` pins.

## License

Apache 2.0. See [`LICENSE`](../LICENSE).
