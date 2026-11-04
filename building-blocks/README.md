<!-- Copyright 2026 Anthropic PBC -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Building blocks: a code-along

Workshop materials. Not maintained and not accepting contributions.

Six short programs, one per Claude developer platform feature, in the order we cover them in the session. Each one is a single
Python file against the plain Messages API. There's no framework and nothing to set up beyond the SDK.

The rhythm is the same every time:

1. Run the file.
2. Read what it printed, using "Watch for" below.
3. Change the one line marked `CHANGE ME` near the top.
4. Run it again.

All six share a story so the prompts aren't toys. Sutro is a made-up robotaxi company in San Francisco, and on a Saturday night
fourteen of its cars stop in-lane at Fell & Masonic just before a festival lets out. You don't need the story to use the code. Swap
in your own data and the shape holds.

## Setup (once)

```bash
git clone https://github.com/anthropics/cwc-workshops
cd cwc-workshops/building-blocks
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export ANTHROPIC_API_KEY=<your workshop key>
python check.py
```

You need Python 3.10 or newer. `check.py` should print three lines starting with `ok`, and if something is wrong it tells you what
to do. Falling behind is fine: every step stands alone, so skip to the next file whenever you like.

## 1. Code execution + Files API

```bash
python 01_code_execution.py
```

Uploads a week of stop events as a CSV, mounts it in Anthropic's sandbox and asks a question in English. Claude writes the
analysis, Anthropic runs it, and you get the output and a short answer. The file never passes through the prompt.

**Watch for:** the code Claude wrote (`>>>`), then what it printed, then the `container` id on the last line.

**Change:** `QUESTION`. Ask something else about the same file.

Code execution is generally available. The Files API is in beta (`files-api-2025-04-14`).
[Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool)

## 2. Programmatic tool calling

```bash
python 02_programmatic_tools.py
```

One of *your* tools is marked `allowed_callers`, so instead of forty trips through the model, Claude writes one piece of Python
that calls `vehicle_route_get` forty times from the sandbox. The calls still reach your process as ordinary `tool_use` blocks, many
at once. Only what the script prints goes back to the model.

**Watch for:** the code it wrote, and the tool-call and request counts on the last line.

**Change:** set `FROM_CODE = False`. Same answer, but now all forty results land in the context. Compare the last line.

Generally available. It needs a code execution tool of version `20260120` or later in the same request.
[Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling)

## 3. Tool search

```bash
python 03_tool_search.py
```

Sixty admin tools, every one marked `defer_loading: True`, plus the tool search tool. Claude starts with none of the sixty in its
context. It searches your catalog, the hits load, and it calls the right one.

**Watch for:** `search →` (Claude querying your catalog), `loaded →` (the only definitions that entered the context), `call →`, and
the token comparison on the last line.

**Change:** `TASK`. Ask for something that needs two different services and watch what it loads.

Generally available, for catalogs up to 10,000 tools.
[Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)

## 4. Advisor tool

```bash
python 04_advisor.py
```

Haiku 5.5 is the model on the request. It has one server tool, `advisor`, backed by Opus 5.5. At the judgment call it consults Opus
mid-turn, in the same request, then writes the plan itself.

**Watch for:** the advice comes back as `advisor_redacted_result`. On the 5.5 models it's encrypted: only the executor can read it, and
your code passes the block back unchanged. The last lines show what each model billed.

**Change:** `EXECUTOR`. Try `claude-sonnet-5-5`. The executor has to sit at or below the advisor.

In beta (`advisor-tool-2026-03-01`).
[Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool)

## 5. Effort

```bash
python 05_effort.py
```

One prompt with five planted mistakes, one model, run at `low` and again at `high`. Effort is the dial to reach for before you reach
for a different model.

**Watch for:** the seconds and output tokens on each header line, and whether `low` missed anything on your run.

**Change:** `LEVELS`. Try `("medium", "xhigh")`.

Generally available. The comment at the bottom of the file shows task budgets, the same idea for a whole agent loop (beta,
`task-budgets-2026-03-13`). [Docs](https://platform.claude.com/docs/en/build-with-claude/effort)

## 6. Memory tool + context editing

```bash
python 06_memory.py
```

The memory tool is client-side: Claude asks to `view` and `create` files under `/memories`, and your code decides where those land.
Session 1 is the Saturday debrief. Session 2 is a week later in a brand-new conversation, and it reads what session 1 wrote. The same
request turns on context editing, which drops old tool results server-side once a conversation gets long.

**Watch for:** the `memory.` lines in session 2, then look in `./sutro_memories/`. The API kept none of it.

**Change:** `NEXT_WEEK`. Ask what it remembers from last Saturday.

The memory tool is generally available. Context editing is in beta (`context-management-2025-06-27`).
[Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)

## If something doesn't run

- `authentication_error`: the key isn't exported in this shell.
- `check.py` says your SDK is too old: `pip install -U anthropic`.
- Rate limited on shared wifi: wait ten seconds and run it again.
- `06_memory.py` wipes and recreates `./sutro_memories/` on every run. That's on purpose.

## Where to go next

Everything here sits on the same API. These are worth twenty minutes each, and the
[tool use docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview) are the place to start:

- Search results as content blocks, with citations back
- Structured outputs
- Agent Skills in the API
- MCP connector
- Prompt caching
- Message Batches
- Claude Agent SDK
