"""
FastAPI application entry point.
Agent-Transparent Chat Application — Domain A: Deep Analyst
"""
import os
from dotenv import load_dotenv

load_dotenv()  # Load .env for ANTHROPIC_API_KEY

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import sessions, chat, stream, artifacts, trace

app = FastAPI(
    title="Deep Analyst — Agent-Transparent Chat API",
    description=(
        "A research intelligence platform that provides full transparency into "
        "multi-agent AI execution. Streams agent events (thinking, tool calls, "
        "sub-agent orchestration, ask_user prompts) in real time via SSE."
    ),
    version="1.0.0",
)

# ── CORS (allow frontend on any origin during development) ───────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register routers ────────────────────────────────────────────
app.include_router(sessions.router)
app.include_router(chat.router)
app.include_router(stream.router)
app.include_router(artifacts.router)
app.include_router(trace.router)


@app.get("/", tags=["health"])
async def root():
    return {
        "name": "Deep Analyst API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health", tags=["health"])
async def health():
    return {"status": "healthy"}
