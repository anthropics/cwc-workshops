<!-- Copyright 2026 Anthropic PBC -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# The Research Desk — SEC agents workshop

Workshop sample code. Not maintained and not accepting contributions.

A hands-on workshop for [Claude Managed Agents](https://www.anthropic.com/engineering/managed-agents): build an equity research desk that reads SEC filings with [`edgartools`](https://github.com/dgunning/edgartools), behind a self-hosted web console. You chat with a **head of research**; it staffs the desk by dispatching one **filing analyst per ticker** through a **custom tool** that the app's own server fulfils (the fan-out keeps running with your laptop lid closed), each analyst delegates to **sub-agent specialists**, is graded by an **outcome rubric**, and writes what it learned into a shared **memory store** the desk keeps forever. A scheduled deployment turns it into a standing weekly memo.

The point of the exercise is the fan-out/fan-in shape of long-running agent systems — many sessions, one durable body of knowledge — orchestrated by a long-lived server that holds the credential. Next.js + TypeScript; the only Python in the system is `edgartools`, which runs inside the agents' sandbox.

**The full guided walkthrough is [WORKSHOP.md](WORKSHOP.md).** It's build-it-yourself: `main` leaves the chat round-trip (send a message, stream the reply), the agent definitions, the memory mount, the outcome kickoff, and the dispatch handler as numbered `TODO(workshop-N)` stubs that the acts walk you through filling in; the finished versions of the stubbed files live in [`solutions/`](./solutions). Open this directory in Claude Code and the bundled `/workshop` skill acts as a coach — `/workshop act 1`, `/workshop next` — making or guiding each change and explaining it as it goes.

## What's in the box

| Piece | What it is |
|---|---|
| The web console (`src/`) | Desk chat, live dispatch progress, scorecards table + CSV, memory browser, deployments, setup |
| The orchestrator (`src/lib/orchestrator.ts`) | Watches the head session server-side and answers its `dispatch_analysts` tool calls by fanning out analyst sessions |
| `prompts/` | System prompts for the head, analyst, and specialists; the analysis task + rubric; the weekly memo task |
| `skills/edgartools/` | A custom Skill teaching the agents the `edgartools` API — uploaded via the Skills API at provision time |
| `watchlists/semis.txt` | The default semiconductor watchlist |
| `desk.json`, `outputs/` (gitignored) | Provisioned resource ids, downloaded scorecards |

## Quickstart

Requirements: Node.js 22+, an Anthropic API key with Managed Agents access.

```bash
npm install
cp .env.example .env.local        # set ANTHROPIC_API_KEY and EDGAR_IDENTITY
npm run dev                       # http://localhost:3100
```

Then in the app: **Setup → Provision the desk** (one time), **Scorecards → Analyze NVDA** to watch a single analyst closely, and **Desk** to talk to the head of research:

> Sweep NVDA, AMD and MU and rank them by margin durability. Where is inventory piling up?

The head reads the desk memory, dispatches analysts where it needs fresh work, the server fans them out (progress appears inline; every session links to the Console), and the ranked report comes back in the same conversation — which persists across visits.

For a long-lived deployment, build the container: `docker build -t research-desk . && docker run --env-file .env -p 3100:3100 -v desk-data:/srv/research-desk/data research-desk`. This app is intentionally **not** aimed at serverless hosting: the orchestrator is a long-lived in-process watcher.

## How each platform feature is used

| Feature | Where |
|---|---|
| Sessions, fan-out | one analyst session per ticker, bounded concurrency, run by the server (`src/lib/analysis.ts`) |
| Custom tools + `requires_action` | the head's `dispatch_analysts` tool, fulfilled by the server-side orchestrator |
| Sub-agents (multiagent) | each analyst coordinates a financials extractor and a risk analyst |
| Outcomes | every analysis runs as `user.define_outcome` against `prompts/analyze_rubric.md` |
| Memory stores | `/companies/<TICKER>/…` notes + `/memos/…`, shared by every session, persistent across runs |
| Skills API | `skills/edgartools/SKILL.md`, uploaded at provision time and attached to the analyst agents |
| Environments | cloud container with `edgartools` preinstalled and networking limited to SEC + package hosts |
| Session outputs | each analyst writes `scorecard.json`; the server downloads, validates, and tabulates them |
| Deployments (research preview) | the weekly desk memo (Deployments tab) |

## Credentials

The server resolves its credential from `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` (`sk-ant-oat0…` bearer tokens), Workload Identity Federation environment variables, or an Anthropic CLI profile — the browser never handles a key. `EDGAR_IDENTITY` is not a secret; it's the contact string the SEC requires on automated requests, and it's baked into the agents' instructions at provision time.
