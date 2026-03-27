"""
Session, ChatMessage, Artifact, and TraceNode models.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    return str(uuid.uuid4())


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class ChatMessage(BaseModel):
    message_id: str = Field(default_factory=_uuid)
    role: MessageRole
    content: str
    timestamp: datetime = Field(default_factory=_now)
    run_id: Optional[str] = Field(default=None, description="Agent run triggered by this message")


class Artifact(BaseModel):
    artifact_id: str = Field(default_factory=_uuid)
    filename: str
    content: str
    content_type: str = "text/markdown"
    agent_name: str = Field(default="", description="Which agent produced this")
    created_at: datetime = Field(default_factory=_now)


class TraceNode(BaseModel):
    """A node in the agent execution trace tree."""
    node_id: str = Field(default_factory=_uuid)
    agent_id: str
    agent_name: str
    role: str = "sub_agent"
    status: str = "queued"
    parent_node_id: Optional[str] = None
    children: list[TraceNode] = Field(default_factory=list)
    events: list[dict[str, Any]] = Field(default_factory=list)
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    summary: str = ""

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}


class AgentRun(BaseModel):
    run_id: str = Field(default_factory=_uuid)
    session_id: str
    status: str = "running"
    trace_root: Optional[TraceNode] = None
    events: list[dict[str, Any]] = Field(default_factory=list)
    artifacts: list[Artifact] = Field(default_factory=list)
    started_at: datetime = Field(default_factory=_now)
    ended_at: Optional[datetime] = None


class Session(BaseModel):
    session_id: str = Field(default_factory=_uuid)
    title: str = "New Research Session"
    messages: list[ChatMessage] = Field(default_factory=list)
    runs: list[AgentRun] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}
