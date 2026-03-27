"""
Global in-memory application state.
In production this would be backed by a database.
"""
from __future__ import annotations

import asyncio
from typing import Optional

from app.models.sessions import Session, AgentRun, Artifact


class AppStore:
    """Singleton-style in-memory store for all application state."""

    def __init__(self) -> None:
        # session_id -> Session
        self.sessions: dict[str, Session] = {}
        # session_id -> asyncio.Queue  (SSE event queues)
        self.event_queues: dict[str, asyncio.Queue] = {}
        # run_id -> list of raw event dicts (for replay on reconnect)
        self.event_logs: dict[str, list[dict]] = {}
        # prompt_id -> asyncio.Event (signals when user answers)
        self.pending_answers: dict[str, asyncio.Event] = {}
        # prompt_id -> answer string
        self.answer_values: dict[str, str] = {}
        # session_id -> current run_id
        self.active_runs: dict[str, str] = {}

    # ── Session helpers ──────────────────────────────────────────
    def create_session(self, title: str = "New Research Session") -> Session:
        session = Session(title=title)
        self.sessions[session.session_id] = session
        self.event_queues[session.session_id] = asyncio.Queue()
        return session

    def get_session(self, session_id: str) -> Optional[Session]:
        return self.sessions.get(session_id)

    def delete_session(self, session_id: str) -> bool:
        if session_id in self.sessions:
            del self.sessions[session_id]
            self.event_queues.pop(session_id, None)
            return True
        return False

    def list_sessions(self) -> list[Session]:
        return list(self.sessions.values())

    # ── Event queue helpers ──────────────────────────────────────
    def get_queue(self, session_id: str) -> asyncio.Queue:
        if session_id not in self.event_queues:
            self.event_queues[session_id] = asyncio.Queue()
        return self.event_queues[session_id]

    def log_event(self, run_id: str, event: dict) -> None:
        if run_id not in self.event_logs:
            self.event_logs[run_id] = []
        self.event_logs[run_id].append(event)

    def get_event_log(self, run_id: str) -> list[dict]:
        return self.event_logs.get(run_id, [])

    # ── Ask-user helpers ─────────────────────────────────────────
    def register_prompt(self, prompt_id: str) -> asyncio.Event:
        evt = asyncio.Event()
        self.pending_answers[prompt_id] = evt
        return evt

    def submit_answer(self, prompt_id: str, answer: str) -> bool:
        if prompt_id in self.pending_answers:
            self.answer_values[prompt_id] = answer
            self.pending_answers[prompt_id].set()
            return True
        return False

    def get_answer(self, prompt_id: str) -> Optional[str]:
        return self.answer_values.get(prompt_id)


# Module-level singleton
store = AppStore()
