"""
Real agent service using the Anthropic Claude API.

Each "agent" is a Claude API call with a role-specific system prompt.
Execution flow:
  lead-analyst → ask_user → 3× web-researcher (parallel) → data-analyst → report-writer

Events are emitted through the same EventEmitter/SSE pipeline as the mock simulator.
"""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timezone

from anthropic import AsyncAnthropic

from app.models.events import (
    AgentContext,
    AgentEvent,
    AgentRole,
    AgentStatus,
    EventType,
)
from app.models.sessions import Artifact
from app.services.artifact_store import artifact_store
from app.services.event_emitter import EventEmitter
from app.store import store


def _uid() -> str:
    return str(uuid.uuid4())


def _get_client() -> AsyncAnthropic:
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key or api_key == "your-api-key-here":
        raise ValueError(
            "ANTHROPIC_API_KEY not set. Add it to your .env file."
        )
    return AsyncAnthropic(api_key=api_key)


# ── System Prompts ───────────────────────────────────────────────

LEAD_ANALYST_PROMPT = """You are a lead research analyst. Your job is to:
1. Analyze the user's research request
2. Decompose it into 2-4 specific subtopics for parallel research
3. Return ONLY a JSON object with this format:
{
  "clarification_question": "A question to ask the user about focus areas (or null if the request is clear enough)",
  "subtopics": ["subtopic 1", "subtopic 2", "subtopic 3"]
}
Keep subtopics focused and actionable. Return valid JSON only, no markdown."""

WEB_RESEARCHER_PROMPT = """You are a web research specialist. Given a specific subtopic, produce detailed research notes in markdown format.
Include:
- 3-5 key findings with specific data points, statistics, or facts
- Analysis of trends and implications
- 2-3 relevant source citations (use plausible URLs)

Write in a professional, analytical tone. Return ONLY the markdown content, starting with a heading."""

DATA_ANALYST_PROMPT = """You are a data analyst. Given multiple research notes, extract and synthesize key metrics into a structured summary.
Create:
- A comparison table in markdown with key metrics
- A "Key Insights" section with 3-5 bullet points
- A "Data Gaps" section noting what data is missing

Return ONLY markdown content starting with a heading."""

REPORT_WRITER_PROMPT = """You are a senior report writer. Given research notes and data analysis, produce a polished research brief.
Structure:
- Executive Summary (2-3 sentences)
- Key Findings (organized by theme, with specific data)
- Competitive Landscape or Market Analysis
- Recommendations (3-5 actionable items)
- Citations

Write in a professional, authoritative tone. Return ONLY markdown content starting with a heading."""


# ── Helper: call Claude ──────────────────────────────────────────

async def _call_claude(
    client: AsyncAnthropic,
    system_prompt: str,
    user_message: str,
    max_tokens: int = 2000,
) -> str:
    """Make a single Claude API call and return the text response."""
    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=max_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )
    return response.content[0].text


# ── Helper: emit events ─────────────────────────────────────────

async def _emit_thinking(emitter: EventEmitter, ctx: AgentContext, text: str) -> None:
    await emitter.emit(AgentEvent(
        event_type=EventType.THINKING,
        agent_context=ctx,
        payload={"text": text},
    ))


async def _emit_tool(
    emitter: EventEmitter,
    ctx: AgentContext,
    tool_name: str,
    input_data: dict,
    output_data: dict,
) -> str:
    tool_use_id = _uid()
    await emitter.emit(AgentEvent(
        event_type=EventType.TOOL_START,
        agent_context=ctx,
        payload={"tool_use_id": tool_use_id, "tool_name": tool_name, "input_data": input_data},
    ))
    await emitter.emit(AgentEvent(
        event_type=EventType.TOOL_END,
        agent_context=ctx,
        payload={"tool_use_id": tool_use_id, "tool_name": tool_name, "output_data": output_data, "is_error": False},
    ))
    return tool_use_id


async def _emit_response(emitter: EventEmitter, ctx: AgentContext, text: str) -> None:
    await emitter.emit(AgentEvent(
        event_type=EventType.AGENT_RESPONSE,
        agent_context=ctx,
        payload={"text": text},
    ))


# ── Sub-agent runners ───────────────────────────────────────────

async def _run_web_researcher(
    client: AsyncAnthropic,
    emitter: EventEmitter,
    session_id: str,
    parent_ctx: AgentContext,
    subtopic: str,
    index: int,
) -> str:
    agent_id = _uid()
    ctx = AgentContext(
        agent_id=agent_id,
        agent_name="web-researcher",
        role=AgentRole.SUB_AGENT,
        parent_agent_id=parent_ctx.agent_id,
    )

    await emitter.emit(AgentEvent(
        event_type=EventType.SUB_AGENT_START,
        agent_context=parent_ctx,
        payload={
            "child_agent_id": agent_id,
            "child_agent_name": "web-researcher",
            "task_description": f"Research: {subtopic}",
        },
    ))

    await _emit_thinking(emitter, ctx, f"Researching '{subtopic}'...")

    await _emit_tool(emitter, ctx, "web_search", {"query": subtopic}, {"status": "searching..."})

    # Real Claude call
    notes = await _call_claude(
        client, WEB_RESEARCHER_PROMPT,
        f"Research this subtopic thoroughly: {subtopic}"
    )

    filename = f"research_notes_{index}.md"
    await _emit_tool(emitter, ctx, "write_file", {"path": filename}, {"status": "written", "path": filename})

    artifact = Artifact(filename=filename, content=notes, agent_name="web-researcher")
    artifact_store.add_artifact(session_id, artifact)

    await _emit_response(emitter, ctx, f"Research on '{subtopic}' complete. Notes saved to {filename}.")

    await emitter.emit(AgentEvent(
        event_type=EventType.SUB_AGENT_END,
        agent_context=parent_ctx,
        payload={
            "child_agent_id": agent_id,
            "child_agent_name": "web-researcher",
            "status": AgentStatus.COMPLETED,
            "summary": f"Researched {subtopic}",
        },
    ))
    return notes


async def _run_data_analyst(
    client: AsyncAnthropic,
    emitter: EventEmitter,
    session_id: str,
    parent_ctx: AgentContext,
    all_notes: list[str],
) -> str:
    agent_id = _uid()
    ctx = AgentContext(
        agent_id=agent_id,
        agent_name="data-analyst",
        role=AgentRole.SUB_AGENT,
        parent_agent_id=parent_ctx.agent_id,
    )

    await emitter.emit(AgentEvent(
        event_type=EventType.SUB_AGENT_START,
        agent_context=parent_ctx,
        payload={
            "child_agent_id": agent_id,
            "child_agent_name": "data-analyst",
            "task_description": "Analyze research notes and extract key metrics",
        },
    ))

    await _emit_thinking(emitter, ctx, "Reading all research notes and extracting metrics...")

    combined = "\n\n---\n\n".join(all_notes)
    analysis = await _call_claude(
        client, DATA_ANALYST_PROMPT,
        f"Analyze these research notes and extract key metrics:\n\n{combined}"
    )

    await _emit_tool(emitter, ctx, "write_file", {"path": "data_analysis.md"}, {"status": "written"})

    artifact = Artifact(filename="data_analysis.md", content=analysis, agent_name="data-analyst")
    artifact_store.add_artifact(session_id, artifact)

    await _emit_response(emitter, ctx, "Data analysis complete.")

    await emitter.emit(AgentEvent(
        event_type=EventType.SUB_AGENT_END,
        agent_context=parent_ctx,
        payload={
            "child_agent_id": agent_id,
            "child_agent_name": "data-analyst",
            "status": AgentStatus.COMPLETED,
            "summary": "Extracted key metrics and produced comparison tables.",
        },
    ))
    return analysis


async def _run_report_writer(
    client: AsyncAnthropic,
    emitter: EventEmitter,
    session_id: str,
    parent_ctx: AgentContext,
    all_notes: list[str],
    analysis: str,
    topic: str,
) -> str:
    agent_id = _uid()
    ctx = AgentContext(
        agent_id=agent_id,
        agent_name="report-writer",
        role=AgentRole.SUB_AGENT,
        parent_agent_id=parent_ctx.agent_id,
    )

    await emitter.emit(AgentEvent(
        event_type=EventType.SUB_AGENT_START,
        agent_context=parent_ctx,
        payload={
            "child_agent_id": agent_id,
            "child_agent_name": "report-writer",
            "task_description": "Synthesize all research into final report",
        },
    ))

    await _emit_thinking(emitter, ctx, "Synthesizing research notes and data analysis into final brief...")

    combined_notes = "\n\n---\n\n".join(all_notes)
    report = await _call_claude(
        client, REPORT_WRITER_PROMPT,
        f"Topic: {topic}\n\nResearch Notes:\n{combined_notes}\n\nData Analysis:\n{analysis}\n\nProduce the final research brief."
    )

    await _emit_tool(emitter, ctx, "write_file", {"path": "final_report.md"}, {"status": "written"})

    artifact = Artifact(filename="final_report.md", content=report, agent_name="report-writer")
    artifact_store.add_artifact(session_id, artifact)

    await _emit_response(emitter, ctx, "Final research brief compiled.")

    await emitter.emit(AgentEvent(
        event_type=EventType.SUB_AGENT_END,
        agent_context=parent_ctx,
        payload={
            "child_agent_id": agent_id,
            "child_agent_name": "report-writer",
            "status": AgentStatus.COMPLETED,
            "summary": "Produced comprehensive research brief.",
        },
    ))
    return report


# ── Main orchestrator ────────────────────────────────────────────

async def run_real_agent(
    session_id: str,
    run_id: str,
    user_message: str,
) -> None:
    """
    Run the full Domain A agent flow using REAL Claude API calls.
    Same event shape as the mock simulator so the frontend works identically.
    """
    client = _get_client()
    emitter = EventEmitter(session_id=session_id, run_id=run_id)

    lead_id = _uid()
    lead_ctx = AgentContext(
        agent_id=lead_id,
        agent_name="lead-analyst",
        role=AgentRole.ORCHESTRATOR,
        parent_agent_id=None,
    )

    try:
        # 1. Session start
        await emitter.emit(AgentEvent(
            event_type=EventType.SESSION_START,
            agent_context=lead_ctx,
            payload={"session_id": session_id, "message": user_message},
        ))

        # 2. Lead analyst: decompose the query via Claude
        await _emit_thinking(emitter, lead_ctx, f"Analyzing research request: '{user_message}'...")

        import json
        decomposition_raw = await _call_claude(
            client, LEAD_ANALYST_PROMPT,
            f"Research request: {user_message}"
        )

        # Parse JSON response
        try:
            decomposition = json.loads(decomposition_raw)
        except json.JSONDecodeError:
            decomposition = {
                "clarification_question": None,
                "subtopics": [
                    f"{user_message} - market overview",
                    f"{user_message} - key players and trends",
                    f"{user_message} - future outlook",
                ]
            }

        # 3. ask_user if lead-analyst wants clarification
        question = decomposition.get("clarification_question")
        user_answer = ""
        if question:
            prompt_id = _uid()
            wait_event = store.register_prompt(prompt_id)

            await emitter.emit(AgentEvent(
                event_type=EventType.ASK_USER,
                agent_context=lead_ctx,
                payload={"question": question, "prompt_id": prompt_id},
            ))

            await wait_event.wait()
            user_answer = store.get_answer(prompt_id) or ""

            await emitter.emit(AgentEvent(
                event_type=EventType.ASK_USER_ANSWERED,
                agent_context=lead_ctx,
                payload={"prompt_id": prompt_id, "answer": user_answer},
            ))

        # Refine subtopics if user answered
        subtopics: list[str] = decomposition.get("subtopics") or []
        if not subtopics or (user_answer and len(subtopics) < 2):
            subtopics = [
                f"{user_message} - {user_answer} overview",
                f"{user_message} - {user_answer} trends",
                f"{user_message} - {user_answer} competitive landscape",
            ]

        await _emit_thinking(
            emitter, lead_ctx,
            f"Dispatching {len(subtopics)} web researchers in parallel: "
            + ", ".join(f"'{s}'" for s in subtopics)
        )

        # 4. Parallel web researchers (real Claude calls)
        tasks = [
            _run_web_researcher(client, emitter, session_id, lead_ctx, sub, i + 1)
            for i, sub in enumerate(subtopics)
        ]
        all_notes = await asyncio.gather(*tasks)

        # 5. Sequential: data analyst
        await _emit_thinking(emitter, lead_ctx, "All researchers complete. Running data analysis...")
        analysis = await _run_data_analyst(client, emitter, session_id, lead_ctx, list(all_notes))

        # 6. Sequential: report writer
        await _emit_thinking(emitter, lead_ctx, "Data analysis done. Compiling final report...")
        await _run_report_writer(client, emitter, session_id, lead_ctx, list(all_notes), analysis, user_message)

        # 7. Final message
        artifacts = artifact_store.list_artifacts(session_id)
        artifact_ids = [a.artifact_id for a in artifacts]

        await emitter.emit(AgentEvent(
            event_type=EventType.FINAL_MESSAGE,
            agent_context=lead_ctx,
            payload={
                "text": (
                    f"Research complete! Comprehensive brief on '{user_message}' is ready.\n\n"
                    f"**Artifacts produced:**\n"
                    + "\n".join(f"- {a.filename} (by {a.agent_name})" for a in artifacts)
                ),
                "artifact_ids": artifact_ids,
            },
        ))

        # 8. Done
        await emitter.emit(AgentEvent(
            event_type=EventType.DONE,
            agent_context=lead_ctx,
            payload={"run_id": run_id, "total_events": 0},
        ))

    except Exception as e:
        await emitter.emit(AgentEvent(
            event_type=EventType.ERROR,
            agent_context=lead_ctx,
            payload={"message": str(e), "code": "AGENT_ERROR", "recoverable": False},
        ))
