"""
Chat message and ask_user answer endpoints.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app.models.sessions import AgentRun, ChatMessage, MessageRole
from app.services.agent_simulator import run_agent_simulation
from app.services.real_agent import run_real_agent
from app.store import store

router = APIRouter(prefix="/api/sessions/{session_id}", tags=["chat"])


class SendMessageRequest(BaseModel):
    content: str
    mode: str = "mock"  # "mock" or "real"


class AnswerRequest(BaseModel):
    prompt_id: str
    answer: str


@router.post("/messages", status_code=201)
async def send_message(
    session_id: str,
    body: SendMessageRequest,
    background_tasks: BackgroundTasks,
):
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Add user message
    user_msg = ChatMessage(
        role=MessageRole.USER,
        content=body.content,
    )
    session.messages.append(user_msg)
    session.updated_at = datetime.now(timezone.utc)

    # Create a new agent run
    run = AgentRun(session_id=session_id)
    user_msg.run_id = run.run_id
    session.runs.append(run)
    store.active_runs[session_id] = run.run_id

    # Kick off agent run in the background — mock or real
    if body.mode == "real":
        background_tasks.add_task(run_real_agent, session_id, run.run_id, body.content)
    else:
        background_tasks.add_task(run_agent_simulation, session_id, run.run_id, body.content)

    return {
        "message_id": user_msg.message_id,
        "run_id": run.run_id,
        "status": "Agent run started. Connect to the SSE stream to receive events.",
    }


@router.get("/messages")
async def get_messages(session_id: str):
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return [m.model_dump(mode="json") for m in session.messages]


@router.post("/answer")
async def answer_prompt(session_id: str, body: AnswerRequest):
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    success = store.submit_answer(body.prompt_id, body.answer)
    if not success:
        raise HTTPException(
            status_code=404,
            detail="Prompt not found or already answered"
        )

    # Also add the answer as a user message for chat history
    answer_msg = ChatMessage(
        role=MessageRole.USER,
        content=f"[Answer] {body.answer}",
    )
    session.messages.append(answer_msg)
    session.updated_at = datetime.now(timezone.utc)

    return {"status": "Answer submitted", "prompt_id": body.prompt_id}
