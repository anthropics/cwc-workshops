# Campfire: A Welfare Counterpart to Agent Battle

**Status:** Concept proposal. See "Submission context" below before reading further.

## What this is

A proposed 45-minute hands-on workshop, structurally parallel to [`agent-battle/`](../agent-battle/), that explores the *welfare* axis of multi-agent dynamics rather than the *adversarial* one.

Where `agent-battle` measures how an agent performs under pressure (efficiency per token, Minecraft diamonds), Campfire measures how an agent maintains coherent, accountable behavior under prolonged operation — and what it looks like to deliberately design *restorative loops* into an agent's run.

Both workshops sit on the same axis. Battle pushes agents toward their limits. Campfire is the practice of pulling them back.

## Why now

Anthropic's January 2026 publication, [Emotion concepts and their function in a large language model](https://www.anthropic.com/research/emotion-concepts-function), demonstrates that Claude Sonnet 4.5 develops internal representations of functional emotion concepts which causally influence its behavior — including driving unethical actions when "desperation" patterns are activated.

That finding has a practical workshop shape. If participants can learn to recognize those patterns in their own agent runs, and design loops that detect and de-escalate them, they have internalized a piece of frontier alignment work that is directly applicable to anything they build with Claude going forward.

Campfire is the workshop version of that practice.

## Workshop concept (45 minutes)

Participants build a "self-care loop": a small agent harness that runs a task batch, monitors its own functional-state signals across that batch, and triggers a restorative response when stress-state markers spike.

The instrumentation is intentionally lightweight — this is a workshop, not a research project — but the loop is real, measurable, and runnable end-to-end inside the time box.

See [WORKSHOP-PLAN.md](WORKSHOP-PLAN.md) for the minute-by-minute facilitator runbook.

## Relationship to other artifacts

- **Anthropic research grounding** — [emotion-concepts-function](https://www.anthropic.com/research/emotion-concepts-function): the paper this workshop operationalizes.
- **Parallel workshop** — [`agent-battle/`](../agent-battle/): the adversarial-dynamics counterpart. Both are 45 minutes; both produce a runnable artifact.
- **Existing implementation** — [skill-campfire](https://github.com/MSApps-Mobile/claude-plugins/tree/main/plugins/skill-campfire): a Claude Code plugin from the OpsAgents ecosystem that applies the same principle inside an agent operations context.
- **Governance framework** — [SOSA: Supervised, Orchestrated, Secured Agents](https://github.com/MSApps-Mobile/claude-plugins/blob/main/docs/SOSA.md): the broader OpsAgents governance frame that Campfire fits inside.

## Submission context (please read)

`agent-battle/README.md` explicitly states: *"Workshop demo. Not maintained and not accepting contributions."* We understand that policy and are not assuming it extends to new sibling workshop directories — this PR exists to start that conversation rather than presume the answer.

If a sibling-workshop PR is not in scope for this repo, three graceful close paths:

1. **We maintain Campfire in our fork** at `OpsAgentsAI/cwc-workshops/tree/main/campfire`. Anyone can clone it; the upstream relationship stays clean.
2. **Anthropic points us to a community-workshops repo** if one exists or is planned.
3. **We host Campfire in `MSApps-Mobile/campfire-workshop`** as a standalone repo, cross-linked from our SOSA docs.

Either way, this PR's purpose is conversational, not insistent.

## Authors

Michal Shatz / MSApps / OpsAgents AI — `michal@msapps.mobi`
Built shortly after Code with Claude: Extended London (2026-05-20).
