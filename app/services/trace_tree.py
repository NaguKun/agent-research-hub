"""
Trace tree builder: converts a flat list of events into a nested tree.
"""
from __future__ import annotations

from typing import Any, Optional

from app.models.events import EventType


class TraceTreeBuilder:
    """
    Builds a nested trace tree from flat agent events.
    Each agent_id maps to a node; sub-agent events nest under their parent.
    """

    def __init__(self) -> None:
        # agent_id -> node dict
        self.nodes: dict[str, dict[str, Any]] = {}
        # The root node id
        self.root_id: Optional[str] = None

    def process_event(self, event: dict[str, Any]) -> dict[str, Any]:
        """Process a single event and update the trace tree. Returns the current tree."""
        ctx = event.get("agent_context", {})
        agent_id = ctx.get("agent_id", "")
        agent_name = ctx.get("agent_name", "unknown")
        role = ctx.get("role", "sub_agent")
        parent_agent_id = ctx.get("parent_agent_id")
        event_type = event.get("event_type", "")

        # Ensure a node exists for this agent
        if agent_id not in self.nodes:
            node = {
                "node_id": agent_id,
                "agent_id": agent_id,
                "agent_name": agent_name,
                "role": role,
                "status": "running",
                "parent_node_id": parent_agent_id,
                "children": [],
                "events": [],
                "started_at": event.get("timestamp"),
                "ended_at": None,
                "summary": "",
            }
            self.nodes[agent_id] = node

            # Track root
            if parent_agent_id is None or parent_agent_id == "":
                self.root_id = agent_id
            else:
                # Attach to parent
                parent_node = self.nodes.get(parent_agent_id)
                if parent_node is not None:
                    # Avoid duplicate children
                    child_ids = [c["agent_id"] for c in parent_node["children"]]
                    if agent_id not in child_ids:
                        parent_node["children"].append(node)

        node = self.nodes[agent_id]

        # Append the event to this node's event list
        node["events"].append({
            "event_id": event.get("event_id"),
            "event_type": event_type,
            "timestamp": event.get("timestamp"),
            "payload": event.get("payload", {}),
        })

        # Update node status based on event type
        if event_type == EventType.SUB_AGENT_START:
            node["status"] = "running"
        elif event_type == EventType.SUB_AGENT_END:
            payload = event.get("payload", {})
            node["status"] = payload.get("status", "completed")
            node["summary"] = payload.get("summary", "")
            node["ended_at"] = event.get("timestamp")
        elif event_type == EventType.ASK_USER:
            node["status"] = "waiting_for_user"
        elif event_type == EventType.ASK_USER_ANSWERED:
            node["status"] = "running"
        elif event_type == EventType.ERROR:
            node["status"] = "failed"
        elif event_type == EventType.DONE:
            node["status"] = "completed"
            node["ended_at"] = event.get("timestamp")

        return self.get_tree()

    def get_tree(self) -> dict[str, Any]:
        """Return the full tree starting from root."""
        if self.root_id and self.root_id in self.nodes:
            return self._serialize_node(self.nodes[self.root_id])
        return {}

    def _serialize_node(self, node: dict[str, Any]) -> dict[str, Any]:
        """Deep copy a node for serialization (avoid circular refs)."""
        return {
            "node_id": node["node_id"],
            "agent_id": node["agent_id"],
            "agent_name": node["agent_name"],
            "role": node["role"],
            "status": node["status"],
            "parent_node_id": node["parent_node_id"],
            "children": [self._serialize_node(c) for c in node["children"]],
            "events": node["events"],
            "started_at": node["started_at"],
            "ended_at": node["ended_at"],
            "summary": node["summary"],
        }

    def get_flat_nodes(self) -> list[dict[str, Any]]:
        """Return all nodes as a flat list (useful for debugging)."""
        return [
            {k: v for k, v in n.items() if k != "children"}
            for n in self.nodes.values()
        ]
