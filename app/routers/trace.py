"""
Trace tree endpoint — returns the current trace tree for a session's active (or specified) run.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.services.trace_tree import TraceTreeBuilder
from app.store import store

router = APIRouter(prefix="/api/sessions/{session_id}", tags=["trace"])

# run_id -> TraceTreeBuilder instances
_builders: dict[str, TraceTreeBuilder] = {}


def get_or_create_builder(run_id: str) -> TraceTreeBuilder:
    if run_id not in _builders:
        _builders[run_id] = TraceTreeBuilder()
    return _builders[run_id]


def build_tree_from_log(run_id: str) -> dict:
    """Rebuild a trace tree from the event log (lazy construction)."""
    builder = get_or_create_builder(run_id)
    if not builder.nodes:
        events = store.get_event_log(run_id)
        for evt in events:
            builder.process_event(evt)
    return builder.get_tree()


@router.get("/trace")
async def get_trace(session_id: str, run_id: str | None = None):
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    target_run_id = run_id or store.active_runs.get(session_id)
    if not target_run_id:
        raise HTTPException(status_code=404, detail="No active run for this session")

    tree = build_tree_from_log(target_run_id)
    if not tree:
        return {"status": "no_events_yet", "tree": {}}

    return {"run_id": target_run_id, "tree": tree}
