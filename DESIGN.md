# Deep Analyst — Agent-Transparent Chat Application

## 1-Pager Design Document

---

## Title

**Deep Analyst: A Real-Time Agent-Transparent Research Intelligence Platform**

Build a chat application that decodes, routes, and visualizes multi-agent AI execution events in real time — giving users full transparency into orchestrator decomposition, parallel sub-agent research, interactive clarification flows, and artifact generation.

---

## Tenets (in priority order)

1. **Transparency over abstraction** — Every agent action (thinking, tool use, delegation) must be visible to the user. We never hide what the AI is doing.
2. **Correctness of event routing over rendering polish** — An event routed to the wrong agent node is a bug; a missing animation is a cosmetic gap. The trace tree must be structurally correct at all times.
3. **Incremental state over batch fetching** — The UI builds state from a live event stream, not from a single JSON response. The trace tree grows as events arrive.
4. **Resilience over speed** — The SSE connection must handle pauses (ask_user), keepalives, and reconnection with replay. Dropping events is unacceptable.

---

## Problem

Modern AI agent systems (Claude Agent SDK, LangGraph, CrewAI) orchestrate multiple sub-agents behind a single chat interface. Users see only the final output — they have no visibility into:

- Which sub-agent is currently active
- What tools are being invoked and with what inputs
- Whether agents are running in parallel or sequentially
- Why the system is paused (waiting for user input vs. processing)
- Which agent produced which artifact

This opacity makes it impossible to debug, trust, or meaningfully collaborate with multi-agent systems.

---

## Proposed Solution

A two-tier architecture — **FastAPI backend** + **Next.js frontend** — that streams agent execution events via Server-Sent Events (SSE) and renders them as an interactive trace tree alongside a chat panel.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js Frontend                     │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ Sidebar  │  │  ChatPanel   │  │   TracePanel      │ │
│  │ Sessions │  │  Messages    │  │   Nested Tree     │ │
│  │          │  │  ask_user UI │  │   Parallel Viz    │ │
│  │          │  │  Artifacts   │  │   Status Markers  │ │
│  └──────────┘  └──────────────┘  └───────────────────┘ │
│         │              │                   │            │
│         └──────────────┼───────────────────┘            │
│                  StreamConsumer (SSE)                    │
│                  Zustand State Store                     │
└────────────────────────┬────────────────────────────────┘
                         │ SSE (text/event-stream)
┌────────────────────────┴────────────────────────────────┐
│                   FastAPI Backend                        │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ Routers  │  │  Services    │  │   Models          │ │
│  │ sessions │  │  simulator   │  │   AgentEvent      │ │
│  │ chat     │  │  real_agent  │  │   12 typed        │ │
│  │ stream   │  │  trace_tree  │  │   payloads        │ │
│  │ artifacts│  │  emitter     │  │   AgentContext     │ │
│  │ trace    │  │  artifact_store│ │                   │ │
│  └──────────┘  └──────────────┘  └───────────────────┘ │
│                   AppStore (in-memory)                   │
│                   asyncio.Queue per session              │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

#### Single message stream, not multiple connections

Each session has **one SSE connection** (`/api/sessions/{id}/stream`). All event types flow through this single channel, discriminated by `event_type`. The frontend's `StreamConsumer` component listens to all 12 event types on one `EventSource`. This avoids connection multiplexing complexity and ensures strict event ordering.

#### How parallel agents appear

Parallel execution is **detected, not declared**. The frontend's `ChildrenGroup` component inspects sibling nodes under a parent and identifies parallelism by two heuristics:
1. **Multiple instances of the same agent name** (e.g., 3× `web-researcher`) under one parent
2. **Multiple siblings with `status: running`** simultaneously

When detected, children are rendered inside a **violet-bordered "Parallel Execution" container** with a dashed border and agent count badge, making concurrency visually explicit.

On the backend, parallelism is achieved via `asyncio.gather()` — the simulator dispatches 3 `web-researcher` coroutines concurrently, each emitting events independently through the shared `EventEmitter` → `asyncio.Queue`.

#### What happens during ask_user

1. Backend emits `ask_user` event with `prompt_id` and `question`
2. Backend registers an `asyncio.Event` keyed by `prompt_id` and **awaits** it — the coroutine suspends but the SSE stream stays open (keepalive pings every 30s)
3. Frontend surfaces the question in the `ChatPanel` with an amber input form
4. Frontend `TracePanel` shows the agent node with `waiting_for_user` status (pulsing amber dot)
5. User submits answer → `POST /api/sessions/{id}/answer` → backend calls `store.submit_answer()` which `.set()`s the `asyncio.Event`
6. Backend coroutine resumes, emits `ask_user_answered`, and continues execution
7. Frontend clears the question UI and resumes normal event consumption

**Critical: the SSE connection is never closed during ask_user.** The stream simply stops emitting domain events until the answer arrives.

#### How artifacts are surfaced

Artifacts are collected at three levels:
1. **Backend `ArtifactStore`** — each sub-agent's `write_file` tool call triggers `artifact_store.add_artifact()` with filename, content, and producing agent name
2. **`final_message` event** — the orchestrator's final event includes `artifact_ids[]`, linking the chat message to its deliverables
3. **Frontend** — artifacts appear in two places:
   - **TracePanel "Generated Deliverables" section** — clickable cards with color-coded icons (indigo for reports, amber for analysis, emerald for research notes)
   - **ChatPanel message** — inline artifact links attached to the final agent message
   - Both open a **full-screen modal** with rendered Markdown (via `react-markdown` + `remark-gfm`)

---

## Goals

| # | Goal |
|---|------|
| G1 | Consume and decode all 12 agent event types from the SSE stream |
| G2 | Build a nested trace tree from flat events using `agent_context.parent_agent_id` routing |
| G3 | Visualize parallel sub-agent execution distinctly from sequential |
| G4 | Implement end-to-end `ask_user` pause/resume without dropping the SSE connection |
| G5 | Collect and present artifacts (research notes, analysis, final report) in a browsable UI |
| G6 | Support both mock simulation (no API key needed) and real Claude API execution |
| G7 | Maintain live status indicators — the UI never appears idle during a run |
| G8 | Provide typed event payloads (Pydantic models) — no untyped `dict` payloads in the decoder |

---

## Non-Goals

| # | Non-Goal | Rationale |
|---|----------|-----------|
| N1 | Persistent storage (database) | In-memory store is sufficient for the capstone scope. Sessions are lost on server restart. |
| N2 | Authentication / multi-user | Single-user local development tool. No auth layer needed. |
| N3 | Real dbt execution (Domain B) | We chose Domain A (Deep Analyst). No dbt integration. |
| N4 | Production deployment | The app runs locally via `uvicorn` + `next dev`. No Docker, no CI/CD. |
| N5 | Custom agent plugin development | We use the pre-defined Domain A agents (lead-analyst, web-researcher, data-analyst, report-writer). Agent design is not the evaluation target. |
| N6 | Stream reconnection with full replay | Stretch goal. The `Last-Event-ID` header is partially supported but not fully tested for mid-run reconnection. |

---

## Open Questions

| # | Question | Current Decision | Risk |
|---|----------|-----------------|------|
| Q1 | Should the trace tree auto-collapse completed nodes? | Currently all nodes stay expanded. Auto-collapse is a stretch goal. | Tree becomes unwieldy for runs with many sub-agents. |
| Q2 | How to handle multiple runs in the same session? | Each `POST /messages` creates a new `AgentRun`. The trace panel shows the most recent run. Older runs are not displayed. | Users lose visibility into previous runs in the same session. |
| Q3 | Should artifacts be editable? | No — artifacts are read-only. The agent produces them; the user views them. | Users cannot annotate or modify research outputs. |
| Q4 | What happens if the real Claude API call fails mid-run? | An `error` event is emitted. The agent node is marked `failed`. The SSE stream closes. | No retry mechanism — the user must send a new message to restart. |

---

## Event Schema Summary

All events share a common envelope:

```json
{
  "event_id": "uuid",
  "event_type": "thinking | tool_start | tool_end | ...",
  "timestamp": "ISO-8601",
  "agent_context": {
    "agent_id": "uuid",
    "agent_name": "lead-analyst",
    "role": "orchestrator | sub_agent",
    "parent_agent_id": "uuid | null"
  },
  "payload": { /* typed per event_type */ },
  "run_id": "uuid"
}
```

### 12 Event Types and Their Typed Payloads

| Event Type | Payload Model | Key Fields |
|------------|--------------|------------|
| `session_start` | `SessionStartPayload` | `session_id`, `message` |
| `thinking` | `ThinkingPayload` | `text` |
| `tool_start` | `ToolStartPayload` | `tool_use_id`, `tool_name`, `input_data` |
| `tool_end` | `ToolEndPayload` | `tool_use_id`, `tool_name`, `output_data`, `is_error` |
| `sub_agent_start` | `SubAgentStartPayload` | `child_agent_id`, `child_agent_name`, `task_description` |
| `sub_agent_end` | `SubAgentEndPayload` | `child_agent_id`, `child_agent_name`, `status`, `summary` |
| `agent_response` | `AgentResponsePayload` | `text` |
| `ask_user` | `AskUserPayload` | `question`, `prompt_id` |
| `ask_user_answered` | `AskUserAnsweredPayload` | `prompt_id`, `answer` |
| `final_message` | `FinalMessagePayload` | `text`, `artifact_ids[]` |
| `error` | `ErrorPayload` | `message`, `code`, `recoverable` |
| `done` | `DonePayload` | `run_id`, `total_events` |

---

## Agent Execution Flow

```
User: "Research Anthropic's competitive position in the AI agent framework market"

  ◆ lead-analyst (orchestrator, running)
    [THINKING] "Analyzing the research request... need to clarify focus areas"
    [ASK_USER] "What angle matters most — technical capabilities, developer adoption, enterprise readiness, or funding?"
    ... (waiting_for_user) — SSE stream stays open, keepalive pings sent

  [User answers: "developer adoption and enterprise readiness"]

    [ASK_USER_ANSWERED] — agent resumes
    [THINKING] "User wants developer adoption + enterprise readiness. Decomposing into 3 streams."

    ┌─── PARALLEL EXECUTION ─────────────────────────────────┐
    │ > web-researcher #1: "AI agent frameworks landscape"   │
    │ > web-researcher #2: "Developer adoption metrics"      │
    │ > web-researcher #3: "Enterprise AI deployments"       │
    └────────────────────────────────────────────────────────┘
    (each: THINKING → TOOL web_search → TOOL write_file → RESPONSE → SUB_AGENT_END)

    > data-analyst (sequential, after all researchers complete)
      THINKING → TOOL glob → TOOL write_file → RESPONSE → SUB_AGENT_END

    > report-writer (sequential, after data-analyst)
      THINKING → TOOL read → TOOL write_file → RESPONSE → SUB_AGENT_END

    [FINAL_MESSAGE] "Research complete! 5 artifacts produced."
    [DONE]
```
