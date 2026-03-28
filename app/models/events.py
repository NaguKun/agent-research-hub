"""
Pydantic models for all agent event types.
Each event carries agent context (who emitted it) and a typed payload.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Annotated, Optional, Union

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    return str(uuid.uuid4())


# ── Agent Context ────────────────────────────────────────────────
class AgentRole(str, Enum):
    ORCHESTRATOR = "orchestrator"
    SUB_AGENT = "sub_agent"


class AgentContext(BaseModel):
    """Identifies which agent emitted an event."""
    agent_id: str = Field(description="Unique ID for this agent instance")
    agent_name: str = Field(description="Human-readable name, e.g. 'lead-analyst'")
    role: AgentRole = Field(description="orchestrator or sub_agent")
    parent_agent_id: Optional[str] = Field(
        default=None,
        description="ID of the parent agent (None for root)"
    )


# ── Event Types ──────────────────────────────────────────────────
class EventType(str, Enum):
    SESSION_START = "session_start"
    THINKING = "thinking"
    TOOL_START = "tool_start"
    TOOL_END = "tool_end"
    SUB_AGENT_START = "sub_agent_start"
    SUB_AGENT_END = "sub_agent_end"
    AGENT_RESPONSE = "agent_response"
    ASK_USER = "ask_user"
    ASK_USER_ANSWERED = "ask_user_answered"
    FINAL_MESSAGE = "final_message"
    ERROR = "error"
    DONE = "done"


# ── Agent Status ─────────────────────────────────────────────────
class AgentStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    WAITING_FOR_USER = "waiting_for_user"
    COMPLETED = "completed"
    FAILED = "failed"


# ── Typed Payloads ───────────────────────────────────────────────
class SessionStartPayload(BaseModel):
    session_id: str
    message: str = ""


class ThinkingPayload(BaseModel):
    text: str


class ToolStartPayload(BaseModel):
    tool_use_id: str = Field(default_factory=_uuid)
    tool_name: str
    input_data: dict[str, Any] = Field(default_factory=dict)


class ToolEndPayload(BaseModel):
    tool_use_id: str
    tool_name: str
    output_data: dict[str, Any] = Field(default_factory=dict)
    is_error: bool = False


class SubAgentStartPayload(BaseModel):
    child_agent_id: str
    child_agent_name: str
    task_description: str = ""


class SubAgentEndPayload(BaseModel):
    child_agent_id: str
    child_agent_name: str
    status: AgentStatus = AgentStatus.COMPLETED
    summary: str = ""


class AgentResponsePayload(BaseModel):
    text: str


class AskUserPayload(BaseModel):
    question: str
    prompt_id: str = Field(default_factory=_uuid)


class AskUserAnsweredPayload(BaseModel):
    prompt_id: str
    answer: str


class FinalMessagePayload(BaseModel):
    text: str
    artifact_ids: list[str] = Field(default_factory=list)


class ErrorPayload(BaseModel):
    message: str
    code: Optional[str] = None
    recoverable: bool = False


class DonePayload(BaseModel):
    run_id: str
    total_events: int = 0


# ── Payload Union (typed discriminated payloads) ─────────────────
EventPayload = Union[
    SessionStartPayload,
    ThinkingPayload,
    ToolStartPayload,
    ToolEndPayload,
    SubAgentStartPayload,
    SubAgentEndPayload,
    AgentResponsePayload,
    AskUserPayload,
    AskUserAnsweredPayload,
    FinalMessagePayload,
    ErrorPayload,
    DonePayload,
]

# Map event_type → payload class for validation
PAYLOAD_TYPE_MAP: dict[str, type[BaseModel]] = {
    EventType.SESSION_START: SessionStartPayload,
    EventType.THINKING: ThinkingPayload,
    EventType.TOOL_START: ToolStartPayload,
    EventType.TOOL_END: ToolEndPayload,
    EventType.SUB_AGENT_START: SubAgentStartPayload,
    EventType.SUB_AGENT_END: SubAgentEndPayload,
    EventType.AGENT_RESPONSE: AgentResponsePayload,
    EventType.ASK_USER: AskUserPayload,
    EventType.ASK_USER_ANSWERED: AskUserAnsweredPayload,
    EventType.FINAL_MESSAGE: FinalMessagePayload,
    EventType.ERROR: ErrorPayload,
    EventType.DONE: DonePayload,
}


# ── Unified Event Envelope ───────────────────────────────────────
class AgentEvent(BaseModel):
    """
    Single envelope for every event in the agent stream.
    The `event_type` discriminator tells the consumer which payload shape to expect.
    Payload is typed: each event_type maps to a specific payload model.
    """
    event_id: str = Field(default_factory=_uuid)
    event_type: EventType
    timestamp: datetime = Field(default_factory=_now)
    agent_context: AgentContext
    payload: EventPayload
    run_id: str = Field(default="", description="Groups events belonging to the same agent run")

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}

    def payload_dict(self) -> dict[str, Any]:
        """Return the payload as a plain dict (for SSE serialization)."""
        if isinstance(self.payload, BaseModel):
            return self.payload.model_dump()
        return self.payload  # type: ignore

