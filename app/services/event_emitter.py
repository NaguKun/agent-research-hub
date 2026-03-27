"""
Event emitter: pushes events to an async queue for SSE consumption.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from app.models.events import AgentEvent
from app.store import store


class EventEmitter:
    """Pushes AgentEvent instances into a session's SSE queue."""

    def __init__(self, session_id: str, run_id: str) -> None:
        self.session_id = session_id
        self.run_id = run_id

    async def emit(self, event: AgentEvent) -> None:
        """Serialize the event and push it to the session queue + event log."""
        event.run_id = self.run_id
        event_dict = json.loads(event.model_dump_json())
        # Log for replay on reconnect
        store.log_event(self.run_id, event_dict)
        # Push to the live SSE queue
        queue = store.get_queue(self.session_id)
        await queue.put(event_dict)
