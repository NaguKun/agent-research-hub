"""
API integration tests — session CRUD, chat message, ask_user answer, artifact retrieval.
"""
import pytest
import asyncio
from httpx import AsyncClient, ASGITransport

from main import app
from app.store import store, AppStore
from app.services.artifact_store import artifact_store, ArtifactStore


@pytest.fixture(autouse=True)
def reset_state():
    """Reset in-memory state before each test."""
    store.__init__()
    artifact_store.__init__()
    yield


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_root(client: AsyncClient):
    resp = await client.get("/")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Deep Analyst API"


# ── Session CRUD ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_session(client: AsyncClient):
    resp = await client.post("/api/sessions", json={"title": "Test Session"})
    assert resp.status_code == 201
    data = resp.json()
    assert "session_id" in data
    assert data["title"] == "Test Session"


@pytest.mark.asyncio
async def test_list_sessions(client: AsyncClient):
    await client.post("/api/sessions", json={"title": "S1"})
    await client.post("/api/sessions", json={"title": "S2"})
    resp = await client.get("/api/sessions")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


@pytest.mark.asyncio
async def test_get_session(client: AsyncClient):
    create_resp = await client.post("/api/sessions", json={"title": "My Session"})
    sid = create_resp.json()["session_id"]
    resp = await client.get(f"/api/sessions/{sid}")
    assert resp.status_code == 200
    assert resp.json()["title"] == "My Session"


@pytest.mark.asyncio
async def test_get_session_not_found(client: AsyncClient):
    resp = await client.get("/api/sessions/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_session(client: AsyncClient):
    create_resp = await client.post("/api/sessions", json={"title": "To Delete"})
    sid = create_resp.json()["session_id"]
    resp = await client.delete(f"/api/sessions/{sid}")
    assert resp.status_code == 204
    # Verify it's gone
    resp2 = await client.get(f"/api/sessions/{sid}")
    assert resp2.status_code == 404


# ── Chat Messages ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_send_message(client: AsyncClient):
    create_resp = await client.post("/api/sessions", json={"title": "Chat Test"})
    sid = create_resp.json()["session_id"]

    resp = await client.post(
        f"/api/sessions/{sid}/messages",
        json={"content": "Research AI agents"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "run_id" in data
    assert "message_id" in data


@pytest.mark.asyncio
async def test_get_messages(client: AsyncClient):
    create_resp = await client.post("/api/sessions", json={"title": "Msg Test"})
    sid = create_resp.json()["session_id"]

    await client.post(f"/api/sessions/{sid}/messages", json={"content": "Hello"})

    resp = await client.get(f"/api/sessions/{sid}/messages")
    assert resp.status_code == 200
    msgs = resp.json()
    assert len(msgs) >= 1
    assert msgs[0]["content"] == "Hello"


# ── Ask-User Answer ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_answer_prompt(client: AsyncClient):
    create_resp = await client.post("/api/sessions", json={"title": "Answer Test"})
    sid = create_resp.json()["session_id"]

    # Register a prompt manually
    prompt_id = "test-prompt-001"
    store.register_prompt(prompt_id)

    resp = await client.post(
        f"/api/sessions/{sid}/answer",
        json={"prompt_id": prompt_id, "answer": "Developer adoption"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "Answer submitted"

    # Verify the answer was stored
    assert store.get_answer(prompt_id) == "Developer adoption"


@pytest.mark.asyncio
async def test_answer_unknown_prompt(client: AsyncClient):
    create_resp = await client.post("/api/sessions", json={"title": "Bad Answer"})
    sid = create_resp.json()["session_id"]

    resp = await client.post(
        f"/api/sessions/{sid}/answer",
        json={"prompt_id": "does-not-exist", "answer": "anything"},
    )
    assert resp.status_code == 404


# ── Artifacts ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_empty_artifacts(client: AsyncClient):
    create_resp = await client.post("/api/sessions", json={"title": "Art Test"})
    sid = create_resp.json()["session_id"]

    resp = await client.get(f"/api/sessions/{sid}/artifacts")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_get_artifact_not_found(client: AsyncClient):
    create_resp = await client.post("/api/sessions", json={"title": "Art 404"})
    sid = create_resp.json()["session_id"]

    resp = await client.get(f"/api/sessions/{sid}/artifacts/nope")
    assert resp.status_code == 404
