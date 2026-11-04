<!-- Copyright 2026 Anthropic PBC -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# cwc-workshops

Workshop materials. Not maintained and not accepting contributions.

Materials from Anthropic-run **Code with Claude** workshops.

## Workshops

- [`rightmodel/`](./rightmodel) — *Picking the Right Model*: use a Claude Code SKILL to audit an LLM eval suite and sweep it across models and inference parameters (extended thinking, effort) to find the best quality-per-dollar and quality-per-second configuration.
- [`agent-decomposition/`](./agent-decomposition) — *Compose Multi-Agent Systems with Skills and MCP*: decompose a 400-line-prompt inventory agent into skills + code execution + callable_agents on Claude Managed Agents, with evals to verify each step.
- [`how-we-claude-code/`](./how-we-claude-code) — *How We Claude Code*: a three-phase walkthrough of an AI-assisted product workflow — interview to spec, four divergent design explorations as static HTML, and a Vite + React app whose components emit a machine-readable DOM contract so an agent (or CI) can verify them at runtime.
- [`ship-your-first-managed-agent/`](./ship-your-first-managed-agent) — *Ship Your First Managed Agent*: a Streamlit on-call dashboard with three pages open and an offline SRE Agent panel. Claude Code fills in `agent.py` one part at a time while you make the judgment calls: one agent with a runbook Skill and custom tools, then multiagent (an incident commander with an investigator thread per page), memory stores (team history plus the agent's own notebook), and file output (a postmortem PDF you download). Built to run with a whole room on one API key.
- [`agent-battle/`](./agent-battle) — *Agent Battle*: a 45-minute competition to configure a Claude Managed Agent — system prompt, skills, MCP servers, model — that drives a local game bot over MCP. Most diamonds wins, fewest tokens breaks ties; a fast `--eval` decision-probe loop lets you test config changes in ~30s before committing to a 5-minute run.
- [`agents-that-remember/`](./agents-that-remember) — *Agents That Remember*: start with a Managed Agent that's visibly amnesiac across sessions, then layer in memory primitives one at a time — a memory store for cross-session persistence, then the Dreaming Service to consolidate past transcripts — going "goldfish to colleague" in 45 minutes.
- [`eval-driven-agent-development/`](./eval-driven-agent-development) — *Eval-Driven Agent Development*: iterate a PPTX-generating Managed Agent through six variants (naive → visual → typography → palette → density → QA-loop), scoring each against a 10-task suite with a two-layer grader (programmatic `.pptx` XML metrics + LLM-as-judge on rendered slides) so every prompt change is measured, not vibed.
- [`production-ready-agent/`](./production-ready-agent) — *Deal Desk*: a chat-first UI over a multi-agent M&A research team on Claude Managed Agents — a coordinator delegates to four parallel research sub-agents, reads prior-deal lessons from a memory store, reaches Linear via MCP, and emits a graded investment thesis while the UI streams every event and gated tool call.
- [`research-desk/`](./research-desk) — *The Research Desk*: build an SEC-filings research desk on Claude Managed Agents behind a self-hosted Next.js console — say hello to a bare agent you wire up yourself, then promote that same agent (versioned update) into a head of research that dispatches one analyst session per ticker through a custom tool your server fulfils, with sub-agent specialists, an edgartools Skill, outcome-graded scorecards, a shared memory store, and a weekly memo deployment.
- [`building-blocks/`](./building-blocks) — *Building Blocks*: six short Python programs, one per Claude developer platform feature, against the plain Messages API: code execution with the Files API, programmatic tool calling, tool search, the advisor tool, effort, and the memory tool with context editing. Each file has one line to change and run again, so you can follow along on a laptop.

## License

Apache License 2.0. See [LICENSE](./LICENSE).
