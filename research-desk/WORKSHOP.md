<!-- Copyright 2026 Anthropic PBC -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Workshop: staff a research desk with agents

**AI.Engineer World's Fair · Claude Managed Agents — the financial edition**

In the coding workshop, one agent got a standing job on a repository. Here you build the other shape of long-running agent system: a **desk** — many agents doing parallel work, pooling what they learn into shared memory, coordinated by an agent you simply talk to — behind a web console whose server does the orchestrating.

By the end you will have: a head-of-research you can ask portfolio questions, a pool of filing analysts it dispatches on demand, a memory store that accumulates the desk's knowledge across runs, and a weekly memo that writes itself.

This workshop is build-it-yourself: the interesting parts are left as numbered `TODO(workshop-N)` stubs right here, and each act starts by filling in the stubs that act needs, then running it. Each stub's comment spells out the exact shape to write. If you get truly stuck, the finished versions of the stubbed files live in [`solutions/`](./solutions) — compare with or copy over the matching file. Following along in Claude Code? Type `/workshop` — the bundled coach makes or guides each change and explains it.

## What you need

| Requirement | Notes |
|---|---|
| Anthropic API key with Managed Agents access | [Claude Console](https://platform.claude.com) → Settings → API keys |
| Node.js 22+ | `node --version` |
| An email address for the SEC | EDGAR requires a contact identity on automated requests — any real address works |

```bash
git clone https://github.com/anthropics/cwc-workshops.git
cd cwc-workshops/research-desk
npm install
cp .env.example .env.local     # fill in ANTHROPIC_API_KEY and EDGAR_IDENTITY
npm run dev                    # http://localhost:3100
```

The six acts, and the stubs each one needs:

| Act | Name | TODOs |
|---|---|---|
| 1 | Say hello | 1 — send the `user.message` event (`src/lib/orchestrator.ts`); 2 — connect the event stream (`src/app/api/desk/stream/route.ts`) |
| 2 | Staff the desk | 3 — the analyst's coordinator roster + skill; 4 — the head's `dispatch_analysts` tool (both in `src/lib/provision.ts`) |
| 3 | One company, done properly | 5 — the memory mount (`src/lib/analysis.ts`); 6 — the `define_outcome` kickoff (`src/lib/sessions.ts`) |
| 4 | The desk's training manual | — (edit the skill, publish a version) |
| 5 | Talk to the head of research | 7 — answer the dispatch tool call (`src/lib/orchestrator.ts`) |
| 6 | The standing desk | — |

| TODO | What you implement | What it teaches |
|---|---|---|
| 1 | Send a `user.message` event to the head's session | A conversation is an event log; messages are events you append |
| 2 | Open the session's event stream and forward it to the browser | You read a session by streaming its events |
| 3 | The analyst agent: multiagent coordinator roster + attached skill | Sub-agents are agents; the coordinator just lists them |
| 4 | The head's `dispatch_analysts` custom tool definition | Custom tools are a name + JSON schema; your server does the work |
| 5 | Attach the shared memory store when creating an analyst session | Memory is a mounted resource with instructions, not magic |
| 6 | The `user.define_outcome` kickoff event | Outcomes: describe done + a rubric, let the platform grade |
| 7 | Answer `agent.custom_tool_use` with a `user.custom_tool_result` | `requires_action`: the platform waits on *your server* |

(The bounded fan-out in `analyzeMany` ships already implemented — it's plumbing the Scorecards tab needs from Act 3 onward; read it when you get to Act 5.)

---

## Act 1 — Say hello (15 min)

Before the desk exists, get one agent talking to you — the same agent that will run the desk all day.

Open the app → **Setup**. Confirm the credential and EDGAR identity show as present, then click **Create your agent**. That makes two things: an **Environment** (a managed cloud container template with `edgartools` preinstalled and networking limited to SEC and package hosts) and the **head of research** — an Agent that, for now, is nothing but a system prompt (`prompts/head_hello_system.md`). Open it in the Console; that same agent id is the one you'll keep upgrading for the rest of the workshop.

Now make the chat work. Two stubs:

- **TODO(workshop-1)** (`src/lib/orchestrator.ts`, `sendToHead`) — sending a chat message is appending one `user.message` event to the head's session.
- **TODO(workshop-2)** (`src/app/api/desk/stream/route.ts`) — reading the conversation is streaming the session's events: open `client.beta.sessions.events.stream(...)` and forward each event to the browser as an SSE frame.

Restart `npm run dev`, open **Desk**, and say hello. The reply streams in from a session that lives at Anthropic, not in your browser — close the tab, reopen it, and the conversation is still there. That durable event log is the whole workshop in miniature.

## Act 2 — Staff the desk (15 min)

Two stubs to fill before the desk can be staffed — both in `src/lib/provision.ts`:

- **TODO(workshop-3)** — the filing analyst. Give it the multiagent coordinator roster (the two specialists plus `{ type: "self" }`) and attach the edgartools skill. This is all a "sub-agent" is: another agent, listed on its coordinator.
- **TODO(workshop-4)** — the head's `dispatch_analysts` custom tool: a name, a description that tells the head *when* to use it, and a JSON schema (`tickers`, optional `focus`). No implementation goes here — the server becomes the implementation in Act 5.

Then back to **Setup** and click **Staff the desk**. What happens, and why it's split this way:

- A **Skill** (`skills/edgartools/SKILL.md`): the desk's manual for pulling SEC data, uploaded once via the Skills API and attached to the analyst agents — they load it on demand instead of rediscovering the API every session.
- Three more **Agents**: two specialists (financials extractor, risk analyst) and a **filing analyst** that coordinates them.
- A **Memory store** (`desk-memory`): the desk's long-term knowledge, mounted into every session as a filesystem.
- And your Act 1 agent gets **updated, not replaced**: agents are versioned, so the head of research you said hello to gains its full prompt and the dispatch tool as a new version of the same agent.

Everything is persistent and versioned; `desk.json` only records the ids. The Setup tab links every resource to the [Console](https://platform.claude.com) — open the head of research and look at its new version. (The head conversation restarts here so the next one can mount the new memory store — resources attach when a session is created.)

## Act 3 — One company, done properly (20 min)

Two more stubs, then run it:

- **TODO(workshop-5)** (`src/lib/analysis.ts`) — attach the desk memory when creating the analyst session: a `memory_store` resource with `read_write` access and mount instructions. Memory isn't a separate API the agent calls; it's a filesystem the session is born with.
- **TODO(workshop-6)** (`src/lib/sessions.ts`) — the kickoff: a `user.define_outcome` event carrying the task description, the rubric text, and `max_iterations`. This replaces "send a message and hope" with "declare what done looks like and let the grader hold the line."

Open **Scorecards**, type `NVDA`, and click **Analyze**. While it runs, open the session link in the progress card and look for three things in the Console: the specialists appearing as **threads**, the **outcome** kickoff and the grader's `span.outcome_evaluation_*` events, and the agent writing `scorecard.json` plus a memory note. When it finishes, the validated scorecard appears in the table, and **Memory** shows the note under `/companies/NVDA/`.

Run the same ticker again and read the session's first events: the analyst finds its own previous note and updates it instead of starting over. That's the memory store doing its job.

## Act 4 — The desk's training manual (10 min)

Open `skills/edgartools/SKILL.md`. This is a custom Skill: instructions the agents load on demand, versioned and shared by every analyst. Improve it — add a pattern you care about (segment revenue, insider Form 4s, a sharper year-over-year diff recipe) — then publish a new version:

```bash
# The upload folder name must match the `name` in SKILL.md (edgartools-sec-data).
curl -sS -X POST "https://api.anthropic.com/v1/skills/$(jq -r .skill_id desk.json)/versions" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: skills-2025-10-02" \
  -F "files[]=@skills/edgartools/SKILL.md;filename=edgartools-sec-data/SKILL.md"
```

Agents reference the skill at `version: "latest"`, so the next analyst session picks the change up automatically.

## Act 5 — Talk to the head of research (30 min)

The last stub closes the loop:

- **TODO(workshop-7)** (`src/lib/orchestrator.ts`) — when the head's stream delivers `agent.custom_tool_use` for `dispatch_analysts`, run the analysts and send the compiled scorecards back as a `user.custom_tool_result` (matched by the tool-use event's id). Until your server sends it, the head's session sits idle at `requires_action` — the platform is literally waiting on this code. (It's the same watcher pattern as your Act 1 stream TODO, just on the server's own connection.)

While you're in there, read `analyzeMany` in `src/lib/analysis.ts` — the bounded fan-out the dispatch uses. It's already implemented (the Scorecards tab has been using it since Act 3): a small worker pool over `analyzeTicker`, with the concurrency ceiling yours to set.

Restart `npm run dev` (the orchestrator is a long-lived in-process watcher) and open **Desk**. Ask a real question over a small set of tickers:

> Look at NVDA, AMD and MU — rank them by margin durability and tell me where inventory is building.

Watch the order of events: the head reads the desk memory; it calls the custom tool and its session goes idle at `requires_action`; the dispatch panel appears as your server fans out one analyst session per ticker (every card links to a live session); the validated scorecards go back as the tool result; the head writes the ranked report in the same conversation. Ask a memory-only follow-up and notice no dispatch happens. Close the tab, reopen it — the conversation is still there, because none of it ever lived in the browser.

## Act 6 — The standing desk (10 min)

Open **Deployments → Create weekly memo** (a research-preview surface — if it errors, the request lives in `src/lib/preview.ts`), then **Run now**. The memo run checks the watchlist for filings newer than the desk's notes, refreshes memory for anything new, and writes a weekly memo to `/memos/` — read it in **Memory**, and look at **History** there: every note written by every analyst across every run. The desk gets smarter every week without anyone summoning it.

(Scheduled runs have no orchestrator answering custom tools, which is exactly why the memo agent works directly from memory and EDGAR rather than dispatching.)

---

## Presenter notes

Running this in front of a room? A little prep makes the slow parts invisible:

1. **The night before:** create your agent and staff the desk from the Setup tab (the seed script works with the stubs unfilled, so a fresh clone is fine), then

   ```bash
   npm run seed -- NVDA AMD --reset
   ```

   This analyzes the tickers (a finished session in the Console, rows in Scorecards, notes in Memory), clears `head_session_id` so the live chat starts a fresh conversation in front of the room, clears the coach's progress file, and restores the workshop stubs (`git checkout HEAD -- .` and `git clean -fd src`, scoped to this directory — uncommitted code changes here are discarded; `desk.json` and `outputs/` survive because they're gitignored). Restart `npm run dev` afterwards and bookmark one seeded session's Console URL.
2. **Act 1 live:** fill TODOs 1–2 (the message event and the stream) with the room, typecheck, restart, say hello — but **don't click Create your agent again**; it already exists from your prep, which is exactly the point of durable resources. **Act 2 live:** fill TODOs 3–4, then **don't click Staff the desk again** either — open the head of research in the Console and show its versions instead. (Re-running either button works, but it creates duplicate resources and a fresh memory store, which orphans the seeded notes.)
3. **Act 3 live:** analyze a ticker you *didn't* seed (MU, AVGO…). While it cooks, walk the seeded session in the Console — the sub-agent threads, the grader events — and the seeded scorecard row and memory note in the app; the new row appearing is the payoff.
4. **Act 5 live:** three tickers is the sweet spot (~10 minutes of fan-out), and because the desk memory already holds the seeded notes you also get the beat where the head reads memory first and only dispatches what it doesn't know. **Act 6:** the deployment from your prep still points at the same resources — just hit Run now rather than creating a second one.

## If something goes wrong

| Symptom | Likely cause / fix |
|---|---|
| Setup shows the credential or EDGAR identity as missing | They're read from the server's environment — set them in `.env.local` and restart `npm run dev`. |
| Provisioning fails at the skill step | The upload folder name must match the `name` in the SKILL.md frontmatter (`edgartools-sec-data`), and the frontmatter needs a lowercase hyphenated `name` plus a non-empty `description`. |
| Saying hello does nothing | TODOs 1–2: the message event isn't being sent or the stream isn't connected — the dev-server log will show the TODO error; restart `npm run dev` after filling them. |
| An analyst session fails immediately | Usually EDGAR identity (the SEC rejects anonymous requests) or networking — open the session's first error event via its Console link. |
| A scorecard is missing from the table | Its session produced no valid `scorecard.json`; the dispatch card shows the failure and the session link shows what the analyst actually did. |
| The head never responds after dispatching | The orchestrator answers tool calls — make sure TODO(workshop-7) is implemented and the dev server stayed up; restarting the server re-checks for unanswered dispatches. |
| Deployments return 4xx | Research-preview surface; check the request shape in `src/lib/preview.ts` against the current docs. |
| Rate limits during a big sweep | Lower `DESK_CONCURRENCY` (default 4) and sweep fewer tickers live; the full watchlist is the take-home version. |

## Where to go from here

- Outcomes with file-based rubrics for richer grading (e.g. grade the memo against a checklist the PM maintains).
- More tools for the head — or MCP servers with vault credentials for your own internal data.
- Self-hosted environments if filings analysis must run inside your network.
- Webhooks instead of the in-process watcher for production-grade dispatch handling.
- The architecture story behind all of it: [Scaling Managed Agents](https://www.anthropic.com/engineering/managed-agents).
