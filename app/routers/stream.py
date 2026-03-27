"""
SSE streaming endpoint for consuming agent events in real time.
Supports Last-Event-ID header for reconnection replay.
"""
from __future__ import annotations

import asyncio
import json
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, Request
from sse_starlette.sse import EventSourceResponse

from app.store import store

router = APIRouter(prefix="/api/sessions/{session_id}", tags=["stream"])


async def _event_generator(
    session_id: str,
    request: Request,
    last_event_id: str | None = None,
) -> AsyncGenerator[dict, None]:
    """
    Yields SSE events from the session's event queue.
    If last_event_id is provided, replay missed events first.
    """
    queue = store.get_queue(session_id)

    # ── Replay missed events on reconnect ────────────────────────
    if last_event_id:
        run_id = store.active_runs.get(session_id, "")
        event_log = store.get_event_log(run_id)
        replaying = False
        for evt in event_log:
            if evt.get("event_id") == last_event_id:
                replaying = True
                continue
            if replaying:
                yield {
                    "event": evt.get("event_type", "message"),
                    "id": evt.get("event_id", ""),
                    "data": json.dumps(evt),
                }

    # ── Live stream ──────────────────────────────────────────────
    while True:
        if await request.is_disconnected():
            break

        try:
            event = await asyncio.wait_for(queue.get(), timeout=30.0)
        except asyncio.TimeoutError:
            # Send keepalive comment
            yield {"event": "keepalive", "data": ""}
            continue

        event_type = event.get("event_type", "message")
        event_id = event.get("event_id", "")

        yield {
            "event": event_type,
            "id": event_id,
            "data": json.dumps(event),
        }

        # Stop streaming after done or error
        if event_type in ("done", "error"):
            break


@router.get("/stream")
async def stream_events(session_id: str, request: Request):
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    last_event_id = request.headers.get("Last-Event-ID")

    return EventSourceResponse(
        _event_generator(session_id, request, last_event_id),
        media_type="text/event-stream",
    )
