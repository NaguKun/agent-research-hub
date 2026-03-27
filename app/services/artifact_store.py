"""
In-memory artifact store.
Artifacts are extracted from ToolEnd events (write_file tool).
"""
from __future__ import annotations

from typing import Optional

from app.models.sessions import Artifact


class ArtifactStore:
    """Collects and serves artifacts produced during agent runs."""

    def __init__(self) -> None:
        # session_id -> list of Artifact
        self._artifacts: dict[str, list[Artifact]] = {}

    def add_artifact(self, session_id: str, artifact: Artifact) -> None:
        if session_id not in self._artifacts:
            self._artifacts[session_id] = []
        self._artifacts[session_id].append(artifact)

    def list_artifacts(self, session_id: str) -> list[Artifact]:
        return self._artifacts.get(session_id, [])

    def get_artifact(self, session_id: str, artifact_id: str) -> Optional[Artifact]:
        for a in self._artifacts.get(session_id, []):
            if a.artifact_id == artifact_id:
                return a
        return None


# Module-level singleton
artifact_store = ArtifactStore()
