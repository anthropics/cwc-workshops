# Agents that remember — Memory stores and Dreaming

> Code with Claude 2026 · Workshop W3 · 45 min
>
> **Sample code. Not maintained and not accepting contributions.**

**Arc:** Problem (amnesiac agent) → CMA Memory (live store) → Dreaming
(consolidate past transcripts). "Goldfish to colleague in 45 minutes."

Your agent forgot what you told it thirty seconds ago. We start with a
Managed Agent that's visibly amnesiac across sessions, then layer in memory
primitives one at a time: a **memory store** for cross-session persistence,
and the **Dreaming Service** so it improves from its own transcripts. You'll
leave knowing exactly which lever to reach for when your own agent forgets.

---

## 0. Setup

1. Clone, add your API key.

```bash
git clone <this-repo>
cd cwc-workshops/agents-that-remember
cp .env.example .env          # open .env and add your ANTHROPIC_API_KEY
```

2. Wait for your organization to be added to the research preview.
> IMPORTANT: You must be opted into the research preview for the below step.

3. Run the bootstrap script.

```bash
./scripts/bootstrap.sh
source .bootstrap-vars        # sets PATH, AGENT, ENV, HIST1/2/3
```

The script downloads the preview `ant` CLI to `./ant`, then creates (or
reuses) an **agent**, an **environment**, and three seeded **historical
sessions** in your workspace. It writes the IDs to `.bootstrap-vars` — load
them.

4. Open **https://platform.claude.com/** (Console) alongside your terminal —
you'll use both throughout.

> Idempotent: re-running the script skips the CLI download if `./ant` exists
> and reuses agent/env by name; only new history sessions are added. If the
> script fails, the underlying commands are in
> [`scripts/bootstrap.sh`](scripts/bootstrap.sh) — run them one at a time.

---

## 1. Problem — the amnesiac baseline

**What this shows:** without a memory store, each session is a silo. Something
told in one session is gone in the next.

### 1a. Session A — tell the agent something new

#### Via CLI

```bash
SES_A=$(ant beta:sessions create --agent "$AGENT" --environment-id "$ENV" \
  --title "Write test (no memory)" --format json | jq -r .id)

# Terminal 2 — live-tail the agent's responses (SSE stream of events)
ant beta:sessions:events stream --session-id "$SES_A" --max-items -1 --format pretty

# Terminal 1 — tell it what you attended
ant beta:sessions:events send --session-id "$SES_A" \
  --event '{"type":"user.message","content":[{"type":"text","text":"I attended the CMA talk yesterday at noon — I learned that multi-agent orchestration, outcomes, memory are launching, and dreaming is launching to research preview. I took notes and uploaded them to https://example.com/notes/cma."}]}'
```

#### Via Console

1. Navigate to https://platform.claude.com/workspaces/\<workspace\>/sessions
2. Create a session using the agent and env the script created:
- Title: Write test (no memory)
- Agent: cwc-agent
- Env: cwc-env
3. Tell it information about your CwC experience. For example: "I attended the CMA talk yesterday at noon — I learned that multi-agent orchestration, outcomes, memory are launching, and dreaming is launching to research preview. I took notes and uploaded them to https://example.com/notes/cma."

### 1b. Session B — ask about it → agent has no idea

#### Via CLI

```bash
SES_B=$(ant beta:sessions create --agent "$AGENT" --environment-id "$ENV" \
  --title "Recall test (no memory)" --format json | jq -r .id)

ant beta:sessions:events stream --session-id "$SES_B" --max-items -1 --format pretty

ant beta:sessions:events send --session-id "$SES_B" \
  --event '{"type":"user.message","content":[{"type":"text","text":"What features did they announce at the CMA talk? Give me the go link for my notes."}]}'
```

#### Via Console

1. Navigate to https://platform.claude.com/workspaces/\<workspace\>/sessions
2. Create a session using the agent and env the script created:
- Title: Recall test (no memory)
- Agent: cwc-agent
- Env: cwc-env
3. Ask it a question about the previous sessions e.g.: "What features did they announce at the CMA talk? Give me the go link for my notes."

**Talking point:** sessions are isolated by design — nothing persists. This is
the "goldfish" baseline.

---

## 2. CMA Memory — attach a memory store

**What this shows:** a *memory store* is a persistent filesystem-like store
the agent can read from and write to across sessions. Attaching the same
store to two sessions gives them shared memory.

### 2a. Create the memory store

#### Via CLI

```bash
MEM=$(ant beta:memory-stores create --name "cwc-memory" \
  --description "My CwC attendance and resources" --format json | jq -r .id)
echo "MEM=$MEM"
```

#### Via Console

1. Navigate to https://platform.claude.com/workspaces/\<workspace\>/memory-stores
2. Press **New Memory Store** and fill in:
- Name: cwc-memory
- Description: My CwC attendance and resources 
2. Search by `$MEM` (or the name "cwc-memory") to view

### 2b. Repeat §1 with the store attached to both sessions

**What this does:** the `--resource '{"type":"memory_store",...}'` flag mounts
the store into each session's container. Same `$AGENT` and `$ENV` as before —
only the session is new. The resource object also takes optional `prompt` and
`access` fields: `prompt` is injected into the system prompt to steer *how*
the agent uses the store (when to read, what to write, how to organize it).
**This is the lever you'll iterate on.**

#### Via CLI

```bash
MEM_RESOURCE='{"type":"memory_store","memory_store_id":"'"$MEM"'","prompt":"Track which CwC sessions I have attended, resource links I mention, and anything I flag to follow up on.","access":"read_write"}'

SES_C=$(ant beta:sessions create --agent "$AGENT" --environment-id "$ENV" \
  --title "Attended — CMA talk (with memory)" \
  --resource "$MEM_RESOURCE" --format json | jq -r .id)

ant beta:sessions:events send --session-id "$SES_C" \
  --event '{"type":"user.message","content":[{"type":"text","text":"I attended the CMA talk yesterday at noon — I learned that multi-agent orchestration, outcomes, memory are launching, and dreaming is launching to research preview. I took notes and uploaded them to https://example.com/notes/cma."}]}'
# wait for the reply (stream it, or open in Console)...

SES_D=$(ant beta:sessions create --agent "$AGENT" --environment-id "$ENV" \
  --title "Recall test (with memory)" \
  --resource "$MEM_RESOURCE" --format json | jq -r .id)

ant beta:sessions:events send --session-id "$SES_D" \
  --event '{"type":"user.message","content":[{"type":"text","text":"What features did they announce at the CMA talk? Give me the go link for my notes."}]}'
```

#### Via Console

1. Navigate to https://platform.claude.com/workspaces/\<workspace\>/sessions
2. Create sessions as before, but additionally attach a memory resource:
- Memory store: cwc-memory
- Access: Read & write
- Instructions: Track which CwC sessions I have attended, resource links I mention, and anything I flag to follow up on.

For Session 1, populate:
- Title: Write test (memory)
- Agent: cwc-agent
- Env: cwc-env
- Resource: Attach memory store as written above

Then tell it information about your CwC experience. For example: "I attended the CMA talk yesterday at noon — I learned that multi-agent orchestration, outcomes, memory are launching, and dreaming is launching to research preview. I took notes and uploaded them to https://example.com/notes/cma."

For Session 2, populate:
- Title: Recall test (no memory)
- Agent: cwc-agent
- Env: cwc-env
- Resource: Attach memory store as written above

Then ask it a question about the previous session e.g.: "What features did they announce at the CMA talk? Give me the go link for my notes."

### 2c. Debug — inspect the store

**What this does:** lists the files/entries the agent wrote, and their full
edit history — so you can see *what* the agent chose to remember and how it
organized it.

#### Via CLI

```bash
ant beta:memory-stores:memories list --memory-store-id "$MEM"
ant beta:memory-stores:memory-versions list --memory-store-id "$MEM"
```

Grab a `memory_id` / `memory_version_id` from the list output and fetch a single entry (retrieve defaults to `--view full`, so `content` is populated):

```bash
ant beta:memory-stores:memories retrieve \
  --memory-store-id "$MEM" --memory-id <mem_...>

ant beta:memory-stores:memory-versions retrieve \
  --memory-store-id "$MEM" --memory-version-id <memver_...>
```

To see everything the CLI can do with memory stores:

```bash
ant beta:memory-stores --help                   # store CRUD: create/retrieve/update/list/delete/archive
ant beta:memory-stores:memories --help          # individual memory entries
ant beta:memory-stores:memory-versions --help   # edit history
```

#### Via Console

Open **Memory Stores → `cwc-memory`** to browse the file tree and edit timeline.

> **Check-in:** Anything surprising about what Claude decided to write? Try
> changing the `prompt` in `MEM_RESOURCE` and rerunning §2b — does the file
> structure change?

---

## 3. Dreaming — consolidate past transcripts

**What this shows:** Dreaming is a batch job that reads an existing memory
store and past session transcripts, runs a model over them, and writes
distilled memories into a *new* memory store. It turns raw
conversation history into structured recall — the agent improves from its own
transcripts.

### 3a. Start a dream

**What this does:** `inputs` are what the dream reads from — here, the
existing memory store plus the historical and recent sessions. `instructions`
is the optional steering prompt — it shapes *how* the dream organizes what it
extracts. The dream runs asynchronously and produces a new memory store as
output.

#### Via CLI

```bash
DREAM=$(ant beta:dreams create \
  --model claude-opus-4-7 \
  --input "{\"type\":\"memory_store\",\"memory_store_id\":\"$MEM\"}" \
  --input "{\"type\":\"sessions\",\"session_ids\":[\"$HIST1\",\"$HIST2\",\"$HIST3\",\"$SES_C\",\"$SES_D\"]}" \
  --instructions "I am attending CwC, and I want to remember what I've learned." \
  --format json | jq -r .id)
echo "DREAM=$DREAM"
```

#### Via Console

1. Navigate to https://platform.claude.com/workspaces/\<workspace\>/dreams
2. Press **Dream** to create a dream. To get the session IDs as a comma-separated list to paste in:

```bash
echo "$HIST1,$HIST2,$HIST3,$SES_C,$SES_D"
```

or for only historical, if you've been using console to create other sessions:

```bash
echo "$HIST1,$HIST2,$HIST3"
```

3. Toggle **Use custom instructions** and enter a steering prompt, for example: "I am attending CwC, and I want to remember what I've learned."

### 3b. Watch it run

#### Via Console

1. Navigate to https://platform.claude.com/workspaces/\<workspace\>/dreams to see live progress.

### 3c. Get the output store and inspect it

**What this does:** the dream's `outputs` array contains the new memory store
it wrote. Pull its ID and list what was written — then open it in Console to
compare file organization against your live `$MEM`.

#### Via CLI

```bash
MEM_OUT=$(ant beta:dreams retrieve --dream-id "$DREAM" --format json \
  | jq -r '.outputs[] | select(.type=="memory_store") | .memory_store_id')
echo "MEM_OUT=$MEM_OUT"

ant beta:memory-stores:memories list --memory-store-id "$MEM_OUT"
```

#### Via Console

1. Follow the link in the dream detail to see the changes the dream made (snapshotted comparison).
2. In **Memory Stores**, compare different outputted memory stores against one another (live comparison).

> **Check-in:** How did Claude reorganize the files compared to the live
> store? Anything surprising?
> Try different `--instructions` and rerun.
> Try creating more sessions with the memory store attached and run dreaming
> over them - how does dreaming modify the memory? How does this change with
> instruction changes?

### 3d. Swap the new store into the next session

**What this does:** memory stores attach at session-create time — there's no
in-place swap on a running session. So "replace" means: create the next
session pointing at `$MEM_OUT` instead of `$MEM`.

#### Via CLI

```bash
SES_E=$(ant beta:sessions create --agent "$AGENT" --environment-id "$ENV" \
  --title "Post-dreaming recall" \
  --resource "{\"type\":\"memory_store\",\"memory_store_id\":\"$MEM_OUT\"}" \
  --format json | jq -r .id)

ant beta:sessions:events send --session-id "$SES_E" \
  --event '{"type":"user.message","content":[{"type":"text","text":"Give me a recap: which sessions have I attended, what resources do I have links for, and what follow-ups did I flag?"}]}'

ant beta:sessions:events stream --session-id "$SES_E" --max-items -1 --format pretty
```

#### Via Console

Create a session as in 2b and input the new memory store.

**Talking point:** the agent now recalls facts from sessions it never
participated in — Dreaming consolidated the historical transcripts into the
store it's reading from. Goldfish → colleague.

### 3e. (Optional) Retire the old store

#### Via CLI

```bash
ant beta:memory-stores archive --memory-store-id "$MEM"
```

#### Via Console

1. Go to **Memory Stores**.
2. Click on relevant memory store's three dots.
3. Archive.

---

## What you just built

```
        cheap, live  ◀────────────────────────────────▶  batch, distilled

        SESSION                MEMORY STORE            DREAMING
        isolated context,      persistent FS the        reads transcripts,
        nothing persists       agent reads/writes       writes a new store —
                               across sessions          consolidated recall
```

**Reach for a memory store** when the agent needs to carry state across
sessions right now. **Reach for Dreaming** when you want an agent
to reorganize its memory store to make it more effective, or you have
additional transcripts you want the agent to remember from.

## Take it home

Point this at your own domain tonight: create a memory store, attach it to
your CMA agent, run Dreaming over your last week of sessions. Docs:

- Memory stores — https://platform.claude.com/docs/en/managed-agents/memory
- Dreaming — https://platform.claude.com/docs/en/managed-agents/dreams
