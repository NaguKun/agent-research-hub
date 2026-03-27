"""
Session management endpoints.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.store import store

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class CreateSessionRequest(BaseModel):
    title: Optional[str] = "New Research Session"


class SessionSummary(BaseModel):
    session_id: str
    title: str
    message_count: int
    run_count: int
    created_at: str
    updated_at: str


@router.post("", status_code=201)
async def create_session(body: CreateSessionRequest = CreateSessionRequest()):
    session = store.create_session(title=body.title or "New Research Session")
    return {
        "session_id": session.session_id,
        "title": session.title,
        "created_at": session.created_at.isoformat(),
    }


@router.get("")
async def list_sessions():
    sessions = store.list_sessions()
    return [
        SessionSummary(
            session_id=s.session_id,
            title=s.title,
            message_count=len(s.messages),
            run_count=len(s.runs),
            created_at=s.created_at.isoformat(),
            updated_at=s.updated_at.isoformat(),
        )
        for s in sessions
    ]


@router.get("/{session_id}")
async def get_session(session_id: str):
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.model_dump(mode="json")


@router.delete("/{session_id}", status_code=204)
async def delete_session(session_id: str):
    if not store.delete_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return None
