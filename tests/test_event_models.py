"""
Tests for event models — verifies serialization/deserialization of all 12 event types.
"""
import pytest
from datetime import datetime, timezone

from app.models.events import (
    AgentContext,
    AgentEvent,
    AgentRole,
    AgentStatus,
    EventType,
)


@pytest.fixture
def sample_context() -> AgentContext:
    return AgentContext(
        agent_id="agent-001",
        agent_name="lead-analyst",
        role=AgentRole.ORCHESTRATOR,
        parent_agent_id=None,
    )


@pytest.fixture
def sub_context() -> AgentContext:
    return AgentContext(
        agent_id="agent-002",
        agent_name="web-researcher",
        role=AgentRole.SUB_AGENT,
        parent_agent_id="agent-001",
    )


class TestAgentContext:
    def test_orchestrator_context(self, sample_context: AgentContext):
        assert sample_context.agent_name == "lead-analyst"
        assert sample_context.role == AgentRole.ORCHESTRATOR
        assert sample_context.parent_agent_id is None

    def test_sub_agent_context(self, sub_context: AgentContext):
        assert sub_context.role == AgentRole.SUB_AGENT
        assert sub_context.parent_agent_id == "agent-001"

    def test_serialization(self, sample_context: AgentContext):
        data = sample_context.model_dump()
        restored = AgentContext(**data)
        assert restored.agent_id == sample_context.agent_id


class TestEventTypes:
    """Test that all 12 event types can be created to validate models."""

    def test_session_start(self, sample_context):
        event = AgentEvent(
            event_type=EventType.SESSION_START,
            agent_context=sample_context,
            payload={"session_id": "sess-001", "message": "Research AI"},
        )
        assert event.event_type == EventType.SESSION_START
        data = event.model_dump(mode="json")
        assert data["event_type"] == "session_start"

    def test_thinking(self, sample_context):
        event = AgentEvent(
            event_type=EventType.THINKING,
            agent_context=sample_context,
            payload={"text": "Analyzing the request..."},
        )
        assert event.payload["text"] == "Analyzing the request..."

    def test_tool_start(self, sample_context):
        event = AgentEvent(
            event_type=EventType.TOOL_START,
            agent_context=sample_context,
            payload={
                "tool_use_id": "tool-001",
                "tool_name": "web_search",
                "input_data": {"query": "AI frameworks"},
            },
        )
        assert event.payload["tool_name"] == "web_search"

    def test_tool_end(self, sample_context):
        event = AgentEvent(
            event_type=EventType.TOOL_END,
            agent_context=sample_context,
            payload={
                "tool_use_id": "tool-001",
                "tool_name": "web_search",
                "output_data": {"results": []},
                "is_error": False,
            },
        )
        assert event.payload["is_error"] is False

    def test_sub_agent_start(self, sample_context):
        event = AgentEvent(
            event_type=EventType.SUB_AGENT_START,
            agent_context=sample_context,
            payload={
                "child_agent_id": "agent-002",
                "child_agent_name": "web-researcher",
                "task_description": "Research AI frameworks",
            },
        )
        assert event.payload["child_agent_name"] == "web-researcher"

    def test_sub_agent_end(self, sample_context):
        event = AgentEvent(
            event_type=EventType.SUB_AGENT_END,
            agent_context=sample_context,
            payload={
                "child_agent_id": "agent-002",
                "child_agent_name": "web-researcher",
                "status": AgentStatus.COMPLETED,
                "summary": "Done",
            },
        )
        assert event.event_type == EventType.SUB_AGENT_END

    def test_agent_response(self, sub_context):
        event = AgentEvent(
            event_type=EventType.AGENT_RESPONSE,
            agent_context=sub_context,
            payload={"text": "Here are the results..."},
        )
        assert event.agent_context.role == AgentRole.SUB_AGENT

    def test_ask_user(self, sample_context):
        event = AgentEvent(
            event_type=EventType.ASK_USER,
            agent_context=sample_context,
            payload={
                "question": "What angle matters most?",
                "prompt_id": "prompt-001",
            },
        )
        assert event.payload["prompt_id"] == "prompt-001"

    def test_ask_user_answered(self, sample_context):
        event = AgentEvent(
            event_type=EventType.ASK_USER_ANSWERED,
            agent_context=sample_context,
            payload={"prompt_id": "prompt-001", "answer": "Developer adoption"},
        )
        assert event.payload["answer"] == "Developer adoption"

    def test_final_message(self, sample_context):
        event = AgentEvent(
            event_type=EventType.FINAL_MESSAGE,
            agent_context=sample_context,
            payload={
                "text": "Research complete!",
                "artifact_ids": ["art-001", "art-002"],
            },
        )
        assert len(event.payload["artifact_ids"]) == 2

    def test_error(self, sample_context):
        event = AgentEvent(
            event_type=EventType.ERROR,
            agent_context=sample_context,
            payload={
                "message": "Something went wrong",
                "code": "SEARCH_FAILED",
                "recoverable": True,
            },
        )
        assert event.payload["recoverable"] is True

    def test_done(self, sample_context):
        event = AgentEvent(
            event_type=EventType.DONE,
            agent_context=sample_context,
            payload={"run_id": "run-001", "total_events": 42},
        )
        assert event.payload["total_events"] == 42


class TestEventSerialization:
    def test_json_round_trip(self, sample_context):
        event = AgentEvent(
            event_type=EventType.THINKING,
            agent_context=sample_context,
            payload={"text": "Processing..."},
            run_id="run-001",
        )
        json_str = event.model_dump_json()
        restored = AgentEvent.model_validate_json(json_str)
        assert restored.event_type == EventType.THINKING
        assert restored.payload["text"] == "Processing..."
        assert restored.run_id == "run-001"

    def test_event_has_auto_generated_fields(self, sample_context):
        event = AgentEvent(
            event_type=EventType.THINKING,
            agent_context=sample_context,
            payload={"text": "test"},
        )
        assert event.event_id  # auto-generated UUID
        assert event.timestamp  # auto-generated timestamp
