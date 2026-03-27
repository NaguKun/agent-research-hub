"""
Decoder tests — verifies that each event type routes to the correct handler
and that nested contexts build the right tree shape.
"""
import pytest

from app.models.events import EventType
from app.services.trace_tree import TraceTreeBuilder


EVENT_TYPES_TO_TEST = [
    EventType.SESSION_START,
    EventType.THINKING,
    EventType.TOOL_START,
    EventType.TOOL_END,
    EventType.SUB_AGENT_START,
    EventType.SUB_AGENT_END,
    EventType.AGENT_RESPONSE,
    EventType.ASK_USER,
    EventType.ASK_USER_ANSWERED,
    EventType.FINAL_MESSAGE,
    EventType.ERROR,
    EventType.DONE,
]


def _make_event(event_type: str, agent_id: str = "agent-1", **kwargs) -> dict:
    return {
        "event_id": f"evt-{event_type}",
        "event_type": event_type,
        "timestamp": "2025-01-01T00:00:00Z",
        "agent_context": {
            "agent_id": agent_id,
            "agent_name": kwargs.get("agent_name", "test-agent"),
            "role": kwargs.get("role", "orchestrator"),
            "parent_agent_id": kwargs.get("parent_agent_id"),
        },
        "payload": kwargs.get("payload", {}),
    }


class TestEventRouting:
    """Every event type is accepted by the decoder and recorded on the correct node."""

    @pytest.mark.parametrize("event_type", EVENT_TYPES_TO_TEST)
    def test_event_type_is_recorded(self, event_type: str):
        builder = TraceTreeBuilder()
        event = _make_event(event_type)
        tree = builder.process_event(event)

        assert tree  # non-empty tree
        assert tree["events"][-1]["event_type"] == event_type

    def test_all_event_types_on_same_agent(self):
        """Feed all event types for one agent and verify they all land on the same node."""
        builder = TraceTreeBuilder()
        for et in EVENT_TYPES_TO_TEST:
            builder.process_event(_make_event(et, agent_id="agent-x"))

        tree = builder.get_tree()
        assert len(tree["events"]) == len(EVENT_TYPES_TO_TEST)


class TestNestedContextRouting:
    """Events route to the correct agent in a multi-level tree."""

    def test_two_level_routing(self):
        builder = TraceTreeBuilder()

        # Root
        builder.process_event(_make_event(
            EventType.SESSION_START, "root",
            role="orchestrator",
        ))
        # Sub-agent
        builder.process_event(_make_event(
            EventType.THINKING, "sub-1",
            agent_name="researcher",
            role="sub_agent",
            parent_agent_id="root",
        ))

        tree = builder.get_tree()
        root_event_types = [e["event_type"] for e in tree["events"]]
        child_event_types = [e["event_type"] for e in tree["children"][0]["events"]]

        assert EventType.SESSION_START in root_event_types
        assert EventType.THINKING in child_event_types
        assert EventType.THINKING not in root_event_types

    def test_three_level_routing(self):
        builder = TraceTreeBuilder()

        builder.process_event(_make_event(EventType.SESSION_START, "L0", role="orchestrator"))
        builder.process_event(_make_event(EventType.THINKING, "L1", parent_agent_id="L0", role="sub_agent"))
        builder.process_event(_make_event(EventType.TOOL_START, "L2", parent_agent_id="L1", role="sub_agent"))

        tree = builder.get_tree()
        assert tree["agent_id"] == "L0"
        assert tree["children"][0]["agent_id"] == "L1"
        assert tree["children"][0]["children"][0]["agent_id"] == "L2"

    def test_parallel_sibling_routing(self):
        """Events for parallel siblings don't mix up."""
        builder = TraceTreeBuilder()

        builder.process_event(_make_event(EventType.SESSION_START, "root", role="orchestrator"))

        # Two parallel agents
        builder.process_event(_make_event(
            EventType.THINKING, "par-A", agent_name="researcher-A",
            parent_agent_id="root", role="sub_agent",
            payload={"text": "A"},
        ))
        builder.process_event(_make_event(
            EventType.THINKING, "par-B", agent_name="researcher-B",
            parent_agent_id="root", role="sub_agent",
            payload={"text": "B"},
        ))

        tree = builder.get_tree()
        children = {c["agent_id"]: c for c in tree["children"]}
        assert "par-A" in children
        assert "par-B" in children
        assert children["par-A"]["events"][0]["payload"]["text"] == "A"
        assert children["par-B"]["events"][0]["payload"]["text"] == "B"


class TestStatusTransitions:
    def test_ask_user_pause_resume(self):
        builder = TraceTreeBuilder()
        builder.process_event(_make_event(EventType.SESSION_START, "root", role="orchestrator"))
        assert builder.nodes["root"]["status"] == "running"

        builder.process_event(_make_event(EventType.ASK_USER, "root", role="orchestrator"))
        assert builder.nodes["root"]["status"] == "waiting_for_user"

        builder.process_event(_make_event(EventType.ASK_USER_ANSWERED, "root", role="orchestrator"))
        assert builder.nodes["root"]["status"] == "running"

    def test_error_marks_failed(self):
        builder = TraceTreeBuilder()
        builder.process_event(_make_event(EventType.SESSION_START, "root", role="orchestrator"))
        builder.process_event(_make_event(EventType.ERROR, "root", role="orchestrator"))
        assert builder.nodes["root"]["status"] == "failed"

    def test_done_marks_completed(self):
        builder = TraceTreeBuilder()
        builder.process_event(_make_event(EventType.SESSION_START, "root", role="orchestrator"))
        builder.process_event(_make_event(EventType.DONE, "root", role="orchestrator"))
        assert builder.nodes["root"]["status"] == "completed"
