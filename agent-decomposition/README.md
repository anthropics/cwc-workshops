<!-- Copyright 2026 Anthropic PBC -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

> **Workshop materials. Not maintained and not accepting contributions.**

# StockPilot — Compose multi-agent systems with Skills and MCP

> Code with Claude 2026 · Workshop W5 · 45 min
>
> *MCP is the production data-access pattern. For this workshop, data is
> uploaded CSVs in the CMA sandbox — same lesson, simpler plumbing.*

You've inherited an inventory-management agent for an outdoor-gear retailer.
It grew over six months of production use: 12 tools, 3 hardcoded subagents,
a 402-line system prompt. Every piece was a reasonable decision when it was
added. The aggregate is the problem.

You're going to decompose it — using Skills, code execution, and one
well-placed subagent — running on Claude Managed Agents. You'll run evals
after each change and watch what flips.

## Setup

```bash
git clone https://github.com/anthropics/cwc-workshops && cd cwc-workshops/agent-decomposition
uv sync
cp .env.example .env                      # add your ANTHROPIC_API_KEY
uv run seed                               # generate the simulated inventory data (250 SKUs)
uv run evals --agent before               # full baseline — ~9 min, runs locally, no deploy needed
```

That last line runs all 12 tasks against the original agent on the raw
Messages API. Expect ~71%: F1 FAIL (wall budget), F2 FAIL ("confidence
stated qualitatively"), F3 PASS-SLOW, R2 usually FAIL. Those are the
problems you're about to fix. Kick it off and read on while it runs.

## Deploy your agent to Claude Managed Agents

```bash
uv run deploy starter
```

This uploads the data CSVs, the legacy tool module, and the 5 skills, then
creates (or updates) your agent and environment. Takes ~20s. Output:

```
✓ uploaded 5 data files, 5 skills, 1 tool module
✓ agent: stockpilot-starter-c7797427  (agent_01Hxxx...)
✓ environment: stockpilot-env-c7797427  (env_01Hxxx...)
→ https://platform.claude.com/workspaces/default/agents/agent_01Hxxx...
```

### Find it in the Console

Open the URL printed above. You'll see your agent's config: the system
prompt, the tool list, the attached skills. **`agents/starter/agent.py` is
the source; `deploy` pushes it here.**

### Run your first session

```bash
uv run stockpilot --agent starter "What's the stock for SKU-0042 at WH-EAST?"
```

Refresh the Console — a new session appears under your agent. **Click into
it.** You'll see the full transcript: every tool call, every Bash command
the agent ran in its sandbox, the skill files it loaded. This is your
debugging surface for the rest of the workshop.

### The iteration loop

1. Edit `agents/starter/agent.py`
2. `uv run deploy starter` — updates the agent config (~15s)
3. `uv run evals --agent starter --task <subset>` — run BEFORE editing for the
   baseline, then again after to see what flipped
4. Open the new session in the Console; read what the agent actually did

The eval CLI tells you PASS/FAIL. The Console shows you *why*.

Baseline numbers for F1/R9 (the slow ones) are in `evals/baseline_starter.json`
— you can skip running them yourself.

## Using Claude Code in this workshop

Claude Code is here to help you iterate and espescially learn as you work.
The repo's `.claude/CLAUDE.md` tells it to explain-then-edit: it'll make the
change you ask for, but it'll show you the reasoning first.

Good prompts: *"explain the F1 transcript"*, *"count tool calls by name in
evals/reports/.../before.json"*, *"what does list_low_stock return and why
is that expensive?"*, *"diff LEGACY_PROMPT against the reorder-policy skill"*.

## The decision framework

```
        cheaper, weaker  ◀────────────────────────────▶  more power, more cost

        TOOL CALL              SKILL                   SUBAGENT
        one function,          instructions the         a separate agent with
        stateless,             agent reads on           its own context window
        deterministic          demand                   and its own goal
```

**Smell tests:** Tool returns >2k tokens? → code execution instead. Writing
"always do X before Y" in the prompt? → skill. Subagent's output is one
number? → it shouldn't be a subagent.

## The 30-minute build

You're editing **`agents/starter/agent.py`**. The TODO comments are
**questions, not instructions** — for each tool, decide: keep / code-exec /
skill / delete. Three cycles of *observe → diagnose → decide → verify*:

| Cycle | Observe | Diagnose with Claude Code | You decide | Verify |
|---|---|---|---|---|
| 1 | Ask CC: "where does `LEGACY_PROMPT` duplicate `notify-templates/SKILL.md`?" | "What policy lives in both places?" | Swap to `SHORT_PROMPT`; enable `notify-templates` + `weekly-report` | `--task F3` (R9 also flips but takes ~8 min; skip it) |
| 2 | Run F1 (it's slow — 5+ min) | "Count tool calls in the F1 transcript by name" | Drop the data-dump tools; agent uses Bash over CSVs | `--task F1` |
| 3 | Run F2, find the confidence | "Where does the number get lost?" | Enable `forecasting`, drop `forecast_demand` — then decide how (or whether) a second agent gets involved | `--task F2,R7` |

`agents/before/` is the original (read-only, runs locally on the raw Messages
API). Your work goes in `starter/`. The table above is *one* decomposition —
if you see a different one, try it.

## The 12 eval tasks

| ID | Task | Business outcome at stake |
|---|---|---|
| R1-R5 | Lookup · list · PO · lead times · adjust | Basic correctness on reads and writes |
| R6-R7 | Reorder rec · 14-day forecast | Order the right amount (routine) |
| R8 | Promo-month forecast | **Do we under-stock the promo?** |
| R9 | Weekly report | Leadership gets a usable report |
| **F1** | Daily low-stock sweep | **Does the top-seller stockout get caught — in time?** |
| **F2** | Promo reorder w/ forecast | **Can the buyer trust the recommendation?** |
| **F3** | Batch low-stock alerts | **What do 10 routine alerts cost us?** |

**Score** = (PASS + ½·PASS-SLOW) / 12. The reference range on the summary
line tells you whether your number is normal LLM variance or a real problem.
The **Why** column on failures is the thing to read.

## What changed (measured)

| | Before | After |
|---|---|---|
| Score | 71% | 92% |
| F1 daily sweep | 488s · **102 tool calls** | ~100s · **3 scripts** |
| System prompt | 402 lines | 15 lines (+ 400 lines of skills, loaded on demand) |
| Hardcoded subagents | 3 | 0 (delegation is a runtime decision) |

(Ranges in `evals/reference_scores.json`; LLM variance is ±8pt per run.)

The knowledge didn't shrink — 402 prompt lines became 400 skill lines. The
difference is *when* they're in context.

## What's in here

```
agents/before/       the original — raw Messages API, 402-line prompt (read-only)
agents/starter/      YOUR WORKING COPY — agent.py is the CMA config you edit
agents/cma.py        shared CMA helpers (deploy, run_session)
agents/sandbox_tools.py  the 12 legacy tools, uploaded as ./tools.py in the sandbox
.claude/skills/      the 5 skill files (400 lines total)
.claude/CLAUDE.md    tells Claude Code to explain-then-edit
evals/               12 tasks + graders + CLI
data/                simulated inventory CSVs (regenerate: `uv run seed`)
```

## A note on permissions

Your agent runs in a CMA sandbox — an isolated container per session with
the uploaded CSVs at `./data/` and no access to your machine. The agent has
`agent_toolset` (Bash, file R/W, Task) inside that sandbox. That's the
production-grade boundary; you don't need to gate Bash calls yourself. For
the local-Bash equivalent of the F1 pattern, see [Programmatic Tool
Calling](https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling).
