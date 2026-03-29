# Deep Analyst — Agent-Transparent Chat API

A FastAPI backend for the **Agent-Transparent Chat Application** (Domain A: Deep Analyst Research Intelligence Platform). Streams multi-agent execution events in real time via SSE, with full trace tree building, ask_user pause/resume, and artifact collection.

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                    FastAPI Application                     │
├──────────────────────────────────────────────────────────┤
│  Routers                                                 │
│  ├── sessions.py   — Session CRUD                        │
│  ├── chat.py       — Send messages, answer ask_user      │
│  ├── stream.py     — SSE event streaming                 │
│  ├── artifacts.py  — Artifact retrieval                  │
│  └── trace.py      — Trace tree retrieval                │
├──────────────────────────────────────────────────────────┤
│  Services                                                │
│  ├── agent_simulator.py — Mock multi-agent execution     │
│  ├── event_emitter.py   — Async event queue              │
│  ├── trace_tree.py      — Flat events → nested tree      │
│  └── artifact_store.py  — In-memory artifact store       │
├──────────────────────────────────────────────────────────┤
│  Models                                                  │
│  ├── events.py    — 12 typed event models (Pydantic)     │
│  └── sessions.py  — Session, ChatMessage, Artifact       │
├──────────────────────────────────────────────────────────┤
│  store.py — In-memory state (sessions, queues, prompts)  │
└──────────────────────────────────────────────────────────┘
```

### Agent Execution Flow (Domain A)

```
User sends message
  └─ lead-analyst (orchestrator)
       ├─ Thinking → "Analyzing the request..."
       ├─ ask_user → "What angle matters most?"
       │    └─ (paused until user answers)
       ├─ web-researcher #1  ─┐
       ├─ web-researcher #2  ─┤  parallel
       ├─ web-researcher #3  ─┘
       ├─ data-analyst        (after researchers complete)
       └─ report-writer       (after data-analyst completes)
            └─ Final report artifact
```

## Setup

### Prerequisites
- Python 3.11+

### Installation

```bash
cd "New folder (4)"
pip install -r requirements.txt
```

### Run the Server

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Visit **http://localhost:8000/docs** for the interactive Swagger UI.

### Run Tests

```bash
pytest tests/ -v
```

## API Reference

### Sessions
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sessions` | Create a new session |
| `GET` | `/api/sessions` | List all sessions |
| `GET` | `/api/sessions/{id}` | Get session detail |
| `DELETE` | `/api/sessions/{id}` | Delete a session |

### Chat
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sessions/{id}/messages` | Send a message (triggers agent run) |
| `GET` | `/api/sessions/{id}/messages` | Get chat history |
| `POST` | `/api/sessions/{id}/answer` | Answer an ask_user prompt |

### Streaming
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/sessions/{id}/stream` | SSE event stream (supports `Last-Event-ID` for reconnection) |

### Trace
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/sessions/{id}/trace` | Get trace tree (optional `?run_id=`) |

### Artifacts
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/sessions/{id}/artifacts` | List artifacts |
| `GET` | `/api/sessions/{id}/artifacts/{artifact_id}` | Get artifact content |

## Event Types

All 12 event types streamed via SSE:

| Event | Description |
|-------|-------------|
| `session_start` | Agent run begins |
| `thinking` | Agent is reasoning |
| `tool_start` | Tool invocation begins |
| `tool_end` | Tool invocation completes |
| `sub_agent_start` | Sub-agent spawned |
| `sub_agent_end` | Sub-agent completed |
| `agent_response` | Agent emits a response |
| `ask_user` | Agent pauses to ask user a question |
| `ask_user_answered` | User's answer received, agent resumes |
| `final_message` | Final summary with artifact references |
| `error` | Error occurred |
| `done` | Agent run complete |

## Quick Start Example

```bash
# 1. Create a session
curl -X POST http://localhost:8000/api/sessions -H "Content-Type: application/json" -d '{"title": "AI Research"}'
# Returns: { "session_id": "abc-123", ... }

# 2. Send a message (triggers agent run)
curl -X POST http://localhost:8000/api/sessions/abc-123/messages -H "Content-Type: application/json" -d '{"content": "Research Anthropic competitive position"}'
# Returns: { "run_id": "run-456", ... }

# 3. Stream events (in another terminal)
curl -N http://localhost:8000/api/sessions/abc-123/stream

# 4. When ask_user event arrives, answer it
curl -X POST http://localhost:8000/api/sessions/abc-123/answer -H "Content-Type: application/json" -d '{"prompt_id": "prompt-id-from-event", "answer": "Developer adoption"}'

# 5. Check artifacts after completion
curl http://localhost:8000/api/sessions/abc-123/artifacts
```

## Known Limitations
- **In-memory storage** — State is lost on server restart
- **Mock simulation** — Not connected to real Claude Agent SDK (uses async simulation)
- **Single-worker** — The in-memory store doesn't support multi-process deployments
- **No auth** — No authentication or rate limiting
