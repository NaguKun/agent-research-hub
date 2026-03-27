"""
Artifact retrieval endpoints.
"""
from fastapi import APIRouter, HTTPException

from app.services.artifact_store import artifact_store

router = APIRouter(prefix="/api/sessions/{session_id}/artifacts", tags=["artifacts"])


@router.get("")
async def list_artifacts(session_id: str):
    artifacts = artifact_store.list_artifacts(session_id)
    return [
        {
            "artifact_id": a.artifact_id,
            "filename": a.filename,
            "content_type": a.content_type,
            "agent_name": a.agent_name,
            "created_at": a.created_at.isoformat(),
        }
        for a in artifacts
    ]


@router.get("/{artifact_id}")
async def get_artifact(session_id: str, artifact_id: str):
    artifact = artifact_store.get_artifact(session_id, artifact_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return artifact.model_dump(mode="json")
