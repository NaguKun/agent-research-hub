# Deep Analyst — Agent-Transparent Chat Application

> A real-time research intelligence platform that gives users full transparency into multi-agent AI execution. Built as Domain A ("Deep Analyst") for the Agent-Transparent Chat capstone.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup Instructions](#setup-instructions)
- [Running the Application](#running-the-application)
- [Usage Guide](#usage-guide)
- [Agent Execution Flow](#agent-execution-flow)
- [Event Decoding & Routing](#event-decoding--routing)
- [Testing](#testing)
- [Known Limitations](#known-limitations)

---

## Overview

Deep Analyst is a full-stack chat application that streams and visualizes multi-agent AI execution events in real time. When a user submits a research query, the system:

1. **Orchestrates** a lead analyst agent that decomposes the query
2. **Pauses** to ask the user for clarification (ask_user flow)
3. **Fans out** 3 parallel web-researcher sub-agents
4. **Sequences** a data-analyst and report-writer after researchers complete
5. **Streams** every event (thinking, tool calls, sub-agent lifecycle) to the browser via SSE
6. **Builds** a nested trace tree in the UI showing exactly which agent did what

The application supports two execution modes:
- **Mock mode** — Pre-scripted simulation with realistic delays (no API key needed)
- **Real mode** — Actual Claude API calls via the Anthropic SDK

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Frontend                        │
│                                                             │
│  ┌──────────┐  ┌────────────────┐  ┌─────────────────────┐ │
│  │ Sidebar  │  │   ChatPanel    │  │    TracePanel        │ │
│  │          │  │                │  │                       │ │
│  │ Session  │  │ • Messages     │  │ • Nested trace tree  │ │
│  │ Manager  │  │ • ask_user UI  │  │ • Parallel detection │ │
│  │          │  │ • Status ticker│  │ • Status indicators  │ │
│  │          │  │ • Mode toggle  │  │ • Artifact browser   │ │
│  └──────────┘  └────────────────┘  └─────────────────────┘ │
│                         │                                    │
│              StreamConsumer (EventSource SSE)                │
│              Zustand Store (state management)                │
└─────────────────────────┬───────────────────────────────────┘
                          │ SSE text/event-stream
                          │ REST API (JSON)
┌─────────────────────────┴───────────────────────────────────┐
│                     FastAPI Backend                          │
│                                                             │
│  Routers:              Services:            Models:         │
│  • /api/sessions       • AgentSimulator     • AgentEvent    │
│  • /api/.../messages   • RealAgent          • 12 Payloads   │
│  • /api/.../stream     • TraceTreeBuilder   • AgentContext   │
│  • /api/.../answer     • EventEmitter       • AgentStatus   │
│  • /api/.../artifacts  • ArtifactStore      • Session/Run   │
│  • /api/.../trace      • AppStore           • Artifact      │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. User sends a message → `POST /api/sessions/{id}/messages`
2. Backend kicks off agent simulation as a background task
3. Agent emitter pushes `AgentEvent` dicts into an `asyncio.Queue`
4. SSE endpoint (`GET /api/sessions/{id}/stream`) drains the queue and yields events
5. Frontend `StreamConsumer` listens to all 12 event types on one `EventSource`
6. Each event is routed by `event_type` → state updates in Zustand store
7. `ChatPanel` and `TracePanel` re-render from the updated store

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend** | Python 3.11+, FastAPI | REST API + SSE streaming |
| **Frontend** | Next.js 15, React 19, TypeScript | UI framework |
| **State** | Zustand | Frontend state management |
| **Styling** | Tailwind CSS 4 | Utility-first CSS |
| **SSE** | sse-starlette | Server-Sent Events for FastAPI |
| **AI SDK** | anthropic (Python) | Claude API client (real mode) |
| **Validation** | Pydantic v2 | Typed event models |
| **Testing** | pytest, pytest-asyncio, httpx | Backend unit + integration tests |
| **Markdown** | react-markdown, remark-gfm | Artifact rendering |

---

## Project Structure

```
├── main.py                          # FastAPI app entry point
├── requirements.txt                 # Python dependencies
├── .env                             # ANTHROPIC_API_KEY (for real mode)
│
├── app/
│   ├── models/
│   │   ├── events.py                # 12 typed event payloads + AgentEvent envelope
│   │   └── sessions.py              # Session, ChatMessage, Artifact, TraceNode, AgentRun
│   │
│   ├── routers/
│   │   ├── sessions.py              # CRUD: create/list/get/delete sessions
│   │   ├── chat.py                  # POST message, POST answer
│   │   ├── stream.py                # SSE endpoint with reconnection replay
│   │   ├── artifacts.py             # List/get artifacts
│   │   └── trace.py                 # Get trace tree for a run
│   │
│   ├── services/
│   │   ├── agent_simulator.py       # Mock multi-agent simulation (no API key)
│   │   ├── real_agent.py            # Real Claude API agent orchestration
│   │   ├── trace_tree.py            # TraceTreeBuilder: flat events → nested tree
│   │   ├── event_emitter.py         # Pushes events to asyncio.Queue
│   │   └── artifact_store.py        # In-memory artifact collection
│   │
│   └── store.py                     # Global in-memory state (sessions, queues, prompts)
│
├── tests/
│   ├── test_event_models.py         # All 12 event types: creation + serialization
│   ├── test_decoder.py              # Event routing + status transitions
│   ├── test_trace_tree.py           # Tree construction: nesting, parallel, dedup
│   └── test_api.py                  # API integration: sessions, chat, artifacts
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx               # Root layout (Inter + JetBrains Mono fonts)
│   │   ├── page.tsx                 # Main page (Sidebar + Chat + Trace + Artifact modal)
│   │   └── globals.css              # Tailwind base + custom scrollbar + animations
│   │
│   ├── components/
│   │   ├── ChatPanel.tsx            # Chat messages, ask_user form, status ticker
│   │   ├── TracePanel.tsx           # Trace tree with parallel detection + artifact cards
│   │   ├── StreamConsumer.tsx       # SSE EventSource consumer (routes all 12 event types)
│   │   └── Sidebar.tsx              # Session list + create
│   │
│   ├── lib/
│   │   ├── store.ts                 # Zustand store (traceNodes, messages, artifacts)
│   │   ├── api.ts                   # REST + SSE API client
│   │   └── utils.ts                 # Utility (cn classname helper)
│   │
│   └── hooks/
│       └── use-mobile.ts            # Responsive breakpoint hook
│
├── DESIGN.md                        # 1-pager design document
└── README.md                        # This file
```

---

## Setup Instructions

### Prerequisites

- **Python 3.11+** (with `pip`)
- **Node.js 18+** (with `npm`)
- **Anthropic API Key** (optional — only needed for "Real API" mode)

### 1. Backend Setup

```bash
# Clone / navigate to the project root
cd "deep-analyst"

# Create a virtual environment (recommended)
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

# Install Python dependencies
pip install -r requirements.txt
```

### 2. Frontend Setup

```bash
cd frontend

# Install Node dependencies
npm install
```

### 3. Environment Configuration

Create a `.env` file in the project root:

```env
ANTHROPIC_API_KEY=your-api-key-here   # Optional: only for "Real API" mode
```

> **Note:** The application works fully in **Mock mode** without an API key. Mock mode simulates the complete multi-agent flow with realistic events and delays.

---

## Running the Application

### Start the Backend

```bash
# From the project root
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000` with interactive docs at `/docs`.

### Start the Frontend

```bash
# From the frontend/ directory
cd frontend
npm run dev
```

The UI will be available at `http://localhost:3000`.

### Quick Verification

1. Open `http://localhost:3000` in your browser
2. Create a new session in the sidebar (e.g., "AI Research")
3. Type a research query (e.g., "Research Anthropic's competitive position in the AI agent framework market")
4. Watch the trace tree build in real time on the right panel
5. Answer the clarification question when prompted
6. View the generated artifacts (research notes, analysis, final report) when the run completes

---

## Usage Guide

### Mock vs. Real Mode

The input bar includes a **MOCK/REAL_API** toggle button:

- **MOCK** (default) — Uses `agent_simulator.py` with pre-scripted events. No API key needed. Runs in ~15 seconds with realistic delays.
- **REAL_API** — Uses `real_agent.py` with actual Claude (`claude-sonnet-4-20250514`) API calls. Requires `ANTHROPIC_API_KEY` in `.env`. Produces genuinely researched content.

### ask_user Flow

When the lead-analyst needs clarification:
1. An amber "Awaiting Input" card appears in the chat
2. The trace tree shows the agent with a pulsing amber status
3. Type your answer and click "Confirm"
4. The agent resumes and continues execution

### Viewing Artifacts

Generated files appear in two places:
- **Trace Panel** → "Generated Deliverables" section at the bottom
- **Chat** → Inline artifact links on the final message

Click any artifact to open it in a full-screen modal with rendered Markdown.

---

## Agent Execution Flow

```
User submits research query
        │
        ▼
◆ lead-analyst (orchestrator)
│   ├── THINKING: "Analyzing the request..."
│   ├── ASK_USER: "What angle matters most?"
│   ├── ... (waiting for user input, stream stays open)
│   ├── ASK_USER_ANSWERED: user responds
│   ├── THINKING: "Decomposing into 3 parallel streams..."
│   │
│   ├──┬── PARALLEL ──────────────────────────────┐
│   │  ├── web-researcher #1: "Frameworks landscape"
│   │  │     THINKING → TOOL web_search → TOOL write_file → RESPONSE
│   │  ├── web-researcher #2: "Adoption metrics"
│   │  │     THINKING → TOOL web_search → TOOL write_file → RESPONSE
│   │  └── web-researcher #3: "Enterprise deployments"
│   │        THINKING → TOOL web_search → TOOL write_file → RESPONSE
│   │
│   ├── data-analyst (sequential, after researchers)
│   │     THINKING → TOOL glob → TOOL write_file → RESPONSE
│   │
│   ├── report-writer (sequential, after data-analyst)
│   │     THINKING → TOOL read → TOOL write_file → RESPONSE
│   │
│   ├── FINAL_MESSAGE: "Research complete! 5 artifacts produced."
│   └── DONE
```

---

## Event Decoding & Routing

### Backend: Typed Event Model

Every event uses the `AgentEvent` envelope defined in `app/models/events.py`:

- **12 event types** as a `str` enum: `session_start`, `thinking`, `tool_start`, `tool_end`, `sub_agent_start`, `sub_agent_end`, `agent_response`, `ask_user`, `ask_user_answered`, `final_message`, `error`, `done`
- **12 typed Pydantic payload models** — one per event type (e.g., `ThinkingPayload(text: str)`, `ToolStartPayload(tool_use_id, tool_name, input_data)`)
- **`PAYLOAD_TYPE_MAP`** — dictionary mapping `EventType → PayloadModel` for validation
- **`AgentContext`** on every event — `agent_id`, `agent_name`, `role`, `parent_agent_id`

### Backend: Trace Tree Builder

`TraceTreeBuilder` in `app/services/trace_tree.py`:

1. Maintains a `dict[str, node]` keyed by `agent_id`
2. On each event, ensures a node exists for the event's `agent_context.agent_id`
3. If `parent_agent_id` is set, attaches the node as a child of the parent (with dedup guard)
4. Updates node `status` based on event type (running → waiting_for_user → running → completed/failed)
5. Returns the full tree from root via `_serialize_node()` recursion

### Frontend: StreamConsumer

`StreamConsumer.tsx` creates one `EventSource` per active session and registers listeners for all 12 event types. Each listener:

1. Parses the JSON data
2. Calls `upsertNode()` to ensure the agent exists in the Zustand trace store
3. Dispatches to type-specific handlers (`addThinking`, `startTool`, `endTool`, etc.)
4. Updates global state (`isRunning`, `pendingQuestion`, `activeAgentName`)

### Frontend: Parallel Detection

`ChildrenGroup` in `TracePanel.tsx` detects parallel execution by checking:
- Multiple children with the same `agent_name` (e.g., 3× `web-researcher`)  
- Multiple siblings with `status: 'running'` simultaneously

Parallel children render inside a violet "Parallel Execution" container.

---

## Testing

### Test Suite

```
tests/
├── test_event_models.py    # 16 tests — All 12 event types, serialization round-trip
├── test_decoder.py         # 11 tests — Event routing, nested contexts, status transitions
├── test_trace_tree.py      # 9 tests  — Tree construction, parallel, nesting, dedup
└── test_api.py             # 9 tests  — API integration (sessions, chat, artifacts, answer)
```

### Running Tests

```bash
# From the project root (with venv activated)
python -m pytest tests/ -v
```

### What the Tests Prove

| Test File | What It Covers |
|-----------|---------------|
| `test_event_models.py` | Every event type can be instantiated with its typed payload. JSON round-trip serialization preserves all fields. Auto-generated `event_id` and `timestamp` are populated. |
| `test_decoder.py` | All 12 event types route to the correct node. Multi-level nesting (root → child → grandchild) places events correctly. Parallel siblings don't cross-contaminate. Status transitions: `running → waiting_for_user → running → completed`, `running → failed`. |
| `test_trace_tree.py` | Single root node creation. Parent-child nesting. 3 parallel children are all attached to the same parent. Events accumulate on the correct node (not siblings). No duplicate children when the same agent sends multiple events. Deep nesting (3 levels). `get_flat_nodes()` returns all nodes. |
| `test_api.py` | Session CRUD (create, list, get, delete, 404). Send message returns `run_id`. Get messages retrieves history. Answer prompt updates state. Unknown prompt returns 404. Empty artifact list. Artifact 404. |

---

## Known Limitations

| # | Limitation | Impact | Mitigation |
|---|-----------|--------|-----------|
| 1 | **In-memory storage only** | All sessions, runs, events, and artifacts are lost on server restart | Acceptable for capstone scope. A production system would use PostgreSQL + Redis. |
| 2 | **No stream reconnection replay** | If the browser disconnects mid-run, events are missed | The `Last-Event-ID` header and event log infrastructure exists but is not fully battle-tested. The `/trace` endpoint allows fetching the current tree state on reconnect. |
| 3 | **No multi-user support** | Single shared in-memory state | Single-user local dev tool by design. |
| 4 | **Trace panel shows only the latest run** | Previous runs in the same session are not visible in the trace tree | Users can review chat history, but trace details of older runs are not surfaced. |
| 5 | **Mock mode produces static content** | Research notes and reports are pre-written, not generated | Use "Real API" mode for genuine research output. Mock mode is for UI development and testing. |
| 6 | **No artifact persistence** | Artifacts exist only in memory during the session's lifetime | Artifacts could be written to disk or a blob store in production. |
| 7 | **Real mode requires Anthropic API key** | Cannot use real mode without a paid API key | Mock mode provides the full UI experience without cost. |
| 8 | **No retry/rerun on error** | If an agent fails, the user must send a new message | Stretch goal. The `ErrorPayload.recoverable` field exists but no retry logic is implemented. |
