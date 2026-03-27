"""
Tests for the trace tree builder — verifies correct nesting, parallel nodes,
and event routing from flat events to a nested tree structure.
"""
import pytest

from app.models.events import EventType
from app.services.trace_tree import TraceTreeBuilder


def _make_event(
    event_type: str,
    agent_id: str,
    agent_name: str,
    role: str = "sub_agent",
    parent_agent_id: str | None = None,
    payload: dict | None = None,
    event_id: str = "",
) -> dict:
    return {
        "event_id": event_id or f"evt-{agent_id}-{event_type}",
        "event_type": event_type,
        "timestamp": "2025-01-01T00:00:00Z",
        "agent_context": {
            "agent_id": agent_id,
            "agent_name": agent_name,
            "role": role,
            "parent_agent_id": parent_agent_id,
        },
        "payload": payload or {},
    }


class TestTraceTreeBuilder:
    def test_single_root_node(self):
        builder = TraceTreeBuilder()
        event = _make_event(
            EventType.SESSION_START, "root-1", "lead-analyst",
            role="orchestrator", parent_agent_id=None,
        )
        tree = builder.process_event(event)

        assert tree["agent_id"] == "root-1"
        assert tree["agent_name"] == "lead-analyst"
        assert tree["children"] == []
        assert len(tree["events"]) == 1

    def test_parent_child_nesting(self):
        builder = TraceTreeBuilder()

        # Root agent
        builder.process_event(_make_event(
            EventType.SESSION_START, "root-1", "lead-analyst",
            role="orchestrator",
        ))

        # Child agent
        builder.process_event(_make_event(
            EventType.THINKING, "child-1", "web-researcher",
            parent_agent_id="root-1",
        ))

        tree = builder.get_tree()
        assert tree["agent_id"] == "root-1"
        assert len(tree["children"]) == 1
        assert tree["children"][0]["agent_id"] == "child-1"
        assert tree["children"][0]["agent_name"] == "web-researcher"

    def test_parallel_children(self):
        """Multiple children of the same parent represent parallel execution."""
        builder = TraceTreeBuilder()

        builder.process_event(_make_event(
            EventType.SESSION_START, "root-1", "lead-analyst",
            role="orchestrator",
        ))

        # Three parallel web-researchers
        for i in range(3):
            builder.process_event(_make_event(
                EventType.THINKING, f"researcher-{i}", "web-researcher",
                parent_agent_id="root-1",
            ))

        tree = builder.get_tree()
        assert len(tree["children"]) == 3
        child_ids = {c["agent_id"] for c in tree["children"]}
        assert child_ids == {"researcher-0", "researcher-1", "researcher-2"}

    def test_events_accumulate_on_correct_node(self):
        builder = TraceTreeBuilder()

        builder.process_event(_make_event(
            EventType.SESSION_START, "root-1", "lead-analyst",
            role="orchestrator",
        ))
        builder.process_event(_make_event(
            EventType.THINKING, "root-1", "lead-analyst",
            role="orchestrator",
            payload={"text": "Thinking..."},
        ))
        builder.process_event(_make_event(
            EventType.THINKING, "child-1", "web-researcher",
            parent_agent_id="root-1",
            payload={"text": "Researching..."},
        ))

        tree = builder.get_tree()
        # Root has 2 events (session_start + thinking)
        assert len(tree["events"]) == 2
        # Child has 1 event
        assert len(tree["children"][0]["events"]) == 1

    def test_status_updates(self):
        builder = TraceTreeBuilder()

        builder.process_event(_make_event(
            EventType.SESSION_START, "root-1", "lead-analyst",
            role="orchestrator",
        ))
        assert builder.nodes["root-1"]["status"] == "running"

        builder.process_event(_make_event(
            EventType.ASK_USER, "root-1", "lead-analyst",
            role="orchestrator",
            payload={"question": "What focus?", "prompt_id": "p1"},
        ))
        assert builder.nodes["root-1"]["status"] == "waiting_for_user"

        builder.process_event(_make_event(
            EventType.ASK_USER_ANSWERED, "root-1", "lead-analyst",
            role="orchestrator",
            payload={"prompt_id": "p1", "answer": "adoption"},
        ))
        assert builder.nodes["root-1"]["status"] == "running"

        builder.process_event(_make_event(
            EventType.DONE, "root-1", "lead-analyst",
            role="orchestrator",
        ))
        assert builder.nodes["root-1"]["status"] == "completed"

    def test_error_status(self):
        builder = TraceTreeBuilder()

        builder.process_event(_make_event(
            EventType.SESSION_START, "root-1", "lead-analyst",
            role="orchestrator",
        ))
        builder.process_event(_make_event(
            EventType.ERROR, "root-1", "lead-analyst",
            role="orchestrator",
            payload={"message": "oops"},
        ))
        assert builder.nodes["root-1"]["status"] == "failed"

    def test_deep_nesting(self):
        """Test grandchild nesting: root -> child -> grandchild."""
        builder = TraceTreeBuilder()

        builder.process_event(_make_event(
            EventType.SESSION_START, "root", "orchestrator",
            role="orchestrator",
        ))
        builder.process_event(_make_event(
            EventType.THINKING, "child", "analyst",
            parent_agent_id="root",
        ))
        builder.process_event(_make_event(
            EventType.THINKING, "grandchild", "helper",
            parent_agent_id="child",
        ))

        tree = builder.get_tree()
        assert tree["agent_id"] == "root"
        assert len(tree["children"]) == 1
        child = tree["children"][0]
        assert child["agent_id"] == "child"
        assert len(child["children"]) == 1
        assert child["children"][0]["agent_id"] == "grandchild"

    def test_no_duplicate_children(self):
        builder = TraceTreeBuilder()

        builder.process_event(_make_event(
            EventType.SESSION_START, "root", "lead",
            role="orchestrator",
        ))
        # Same child sends multiple events
        builder.process_event(_make_event(
            EventType.THINKING, "child-1", "researcher",
            parent_agent_id="root",
        ))
        builder.process_event(_make_event(
            EventType.TOOL_START, "child-1", "researcher",
            parent_agent_id="root",
        ))
        builder.process_event(_make_event(
            EventType.TOOL_END, "child-1", "researcher",
            parent_agent_id="root",
        ))

        tree = builder.get_tree()
        assert len(tree["children"]) == 1
        assert len(tree["children"][0]["events"]) == 3

    def test_flat_nodes(self):
        builder = TraceTreeBuilder()
        builder.process_event(_make_event(
            EventType.SESSION_START, "root", "lead",
            role="orchestrator",
        ))
        builder.process_event(_make_event(
            EventType.THINKING, "child", "researcher",
            parent_agent_id="root",
        ))

        flat = builder.get_flat_nodes()
        assert len(flat) == 2
