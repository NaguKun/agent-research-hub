"""
Mock agent simulator for Domain A: "Deep Analyst" Research Intelligence Platform.

Simulates the full multi-agent execution flow:
  lead-analyst → ask_user → 3× web-researcher (parallel) → data-analyst → report-writer

Each agent emits realistic events (thinking, tool calls, responses) with appropriate delays.
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

from app.models.events import (
    AgentContext,
    AgentEvent,
    AgentRole,
    AgentStatus,
    EventType,
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
    DonePayload,
    ErrorPayload,
)
from app.models.sessions import Artifact
from app.services.artifact_store import artifact_store
from app.services.event_emitter import EventEmitter
from app.store import store


def _uid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _delay(seconds: float = 0.5) -> None:
    await asyncio.sleep(seconds)


# ── Helper: emit common event patterns ───────────────────────────

async def _emit_thinking(emitter: EventEmitter, ctx: AgentContext, text: str) -> None:
    await emitter.emit(AgentEvent(
        event_type=EventType.THINKING,
        agent_context=ctx,
        payload=ThinkingPayload(text=text),
    ))
    await _delay(0.4)


async def _emit_tool(
    emitter: EventEmitter,
    ctx: AgentContext,
    tool_name: str,
    input_data: dict,
    output_data: dict,
    delay: float = 0.6,
) -> str:
    tool_use_id = _uid()
    await emitter.emit(AgentEvent(
        event_type=EventType.TOOL_START,
        agent_context=ctx,
        payload=ToolStartPayload(tool_use_id=tool_use_id, tool_name=tool_name, input_data=input_data),
    ))
    await _delay(delay)
    await emitter.emit(AgentEvent(
        event_type=EventType.TOOL_END,
        agent_context=ctx,
        payload=ToolEndPayload(tool_use_id=tool_use_id, tool_name=tool_name, output_data=output_data, is_error=False),
    ))
    return tool_use_id


async def _emit_response(emitter: EventEmitter, ctx: AgentContext, text: str) -> None:
    await emitter.emit(AgentEvent(
        event_type=EventType.AGENT_RESPONSE,
        agent_context=ctx,
        payload=AgentResponsePayload(text=text),
    ))
    await _delay(0.2)


# ── Sub-agent simulators ────────────────────────────────────────

async def _simulate_web_researcher(
    emitter: EventEmitter,
    session_id: str,
    parent_ctx: AgentContext,
    subtopic: str,
    index: int,
) -> None:
    agent_id = _uid()
    ctx = AgentContext(
        agent_id=agent_id,
        agent_name="web-researcher",
        role=AgentRole.SUB_AGENT,
        parent_agent_id=parent_ctx.agent_id,
    )

    # Sub-agent start (emitted under parent context)
    await emitter.emit(AgentEvent(
        event_type=EventType.SUB_AGENT_START,
        agent_context=parent_ctx,
        payload=SubAgentStartPayload(
            child_agent_id=agent_id,
            child_agent_name="web-researcher",
            task_description=f"Research: {subtopic}",
        ),
    ))

    # Thinking
    await _emit_thinking(emitter, ctx, f"Researching '{subtopic}'... Let me search for relevant information.")

    # Tool: web_search
    await _emit_tool(emitter, ctx, "web_search", {"query": subtopic}, {
        "results": [
            {"title": f"Key findings on {subtopic}", "url": f"https://example.com/{index}"},
            {"title": f"Analysis: {subtopic} trends 2025", "url": f"https://research.example.com/{index}"},
        ]
    }, delay=0.8)

    # More thinking
    await _emit_thinking(emitter, ctx, f"Found relevant information. Compiling structured notes on {subtopic}.")

    # Tool: write_file (produces artifact)
    notes_content = (
        f"# Research Notes: {subtopic}\n\n"
        f"## Key Findings\n"
        f"- Finding 1: {subtopic} shows significant growth in 2025\n"
        f"- Finding 2: Market leaders are investing heavily in {subtopic}\n"
        f"- Finding 3: Developer adoption metrics indicate strong momentum\n\n"
        f"## Sources\n"
        f"- https://example.com/{index}\n"
        f"- https://research.example.com/{index}\n"
    )
    filename = f"research_notes_{index}.md"
    await _emit_tool(emitter, ctx, "write_file", {"path": filename, "content": notes_content}, {
        "status": "written",
        "path": filename,
    }, delay=0.5)

    # Save artifact
    artifact = Artifact(
        filename=filename,
        content=notes_content,
        agent_name="web-researcher",
    )
    artifact_store.add_artifact(session_id, artifact)

    # Response
    await _emit_response(emitter, ctx, f"Completed research on '{subtopic}'. Notes saved to {filename}.")

    # Sub-agent end
    await emitter.emit(AgentEvent(
        event_type=EventType.SUB_AGENT_END,
        agent_context=parent_ctx,
        payload=SubAgentEndPayload(
            child_agent_id=agent_id,
            child_agent_name="web-researcher",
            status=AgentStatus.COMPLETED,
            summary=f"Researched {subtopic} and produced structured notes.",
        ),
    ))


async def _simulate_data_analyst(
    emitter: EventEmitter,
    session_id: str,
    parent_ctx: AgentContext,
) -> None:
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
        payload=SubAgentStartPayload(
            child_agent_id=agent_id,
            child_agent_name="data-analyst",
            task_description="Analyze research notes and extract key metrics",
        ),
    ))

    await _emit_thinking(emitter, ctx, "Reading all research notes... Extracting key metrics and comparisons.")

    # Tool: read files
    await _emit_tool(emitter, ctx, "glob", {"pattern": "research_notes_*.md"}, {
        "files": ["research_notes_1.md", "research_notes_2.md", "research_notes_3.md"]
    }, delay=0.4)

    await _emit_thinking(emitter, ctx, "Cross-referencing data points across all research streams...")

    # Tool: generate summary
    summary_content = (
        "# Data Analysis Summary\n\n"
        "## Key Metrics Comparison\n\n"
        "| Metric | Value | Trend |\n"
        "|--------|-------|-------|\n"
        "| Developer Adoption Rate | 67% | ↑ 23% YoY |\n"
        "| Enterprise Deployments | 1,200+ | ↑ 45% YoY |\n"
        "| Community Contributors | 5,400 | ↑ 89% YoY |\n"
        "| SDK Downloads (monthly) | 2.1M | ↑ 156% YoY |\n\n"
        "## Competitive Landscape\n"
        "- Strong position in agent framework market\n"
        "- Leading in enterprise readiness\n"
        "- Growing developer community\n"
    )
    await _emit_tool(emitter, ctx, "write_file", {"path": "data_analysis.md", "content": summary_content}, {
        "status": "written",
        "path": "data_analysis.md",
    }, delay=0.6)

    artifact = Artifact(
        filename="data_analysis.md",
        content=summary_content,
        agent_name="data-analyst",
    )
    artifact_store.add_artifact(session_id, artifact)

    await _emit_response(emitter, ctx, "Data analysis complete. Key metrics extracted and comparison table generated.")

    await emitter.emit(AgentEvent(
        event_type=EventType.SUB_AGENT_END,
        agent_context=parent_ctx,
        payload=SubAgentEndPayload(
            child_agent_id=agent_id,
            child_agent_name="data-analyst",
            status=AgentStatus.COMPLETED,
            summary="Analyzed research notes and produced metrics summary with comparison tables.",
        ),
    ))


async def _simulate_report_writer(
    emitter: EventEmitter,
    session_id: str,
    parent_ctx: AgentContext,
    topic: str,
) -> None:
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
        payload=SubAgentStartPayload(
            child_agent_id=agent_id,
            child_agent_name="report-writer",
            task_description="Synthesize all research and data into final report",
        ),
    ))

    await _emit_thinking(emitter, ctx, "Reading all research notes and data analysis... Synthesizing into a comprehensive report.")

    await _emit_tool(emitter, ctx, "read", {"path": "data_analysis.md"}, {
        "content": "(data analysis content)"
    }, delay=0.4)

    await _emit_thinking(emitter, ctx, "Structuring the final research brief with executive summary, key findings, and recommendations...")

    report_content = (
        f"# Research Brief: {topic}\n\n"
        f"## Executive Summary\n"
        f"This report presents a comprehensive analysis of {topic}. "
        f"Based on extensive research across multiple dimensions, the findings indicate "
        f"strong growth trajectory with significant opportunities.\n\n"
        f"## Key Findings\n\n"
        f"### 1. Developer Adoption\n"
        f"- Adoption rate of 67%, up 23% year-over-year\n"
        f"- 2.1M monthly SDK downloads, growing 156% YoY\n"
        f"- 5,400 active community contributors\n\n"
        f"### 2. Enterprise Readiness\n"
        f"- 1,200+ enterprise deployments across Fortune 500 companies\n"
        f"- SOC 2 Type II compliance achieved\n"
        f"- 99.9% uptime SLA for enterprise tier\n\n"
        f"### 3. Competitive Position\n"
        f"- Leading position in the AI agent framework market\n"
        f"- Strongest developer experience ratings (4.7/5.0)\n"
        f"- Most comprehensive SDK feature set\n\n"
        f"## Recommendations\n"
        f"1. Continue investing in developer tooling and documentation\n"
        f"2. Expand enterprise integration partnerships\n"
        f"3. Focus on open-source community engagement\n\n"
        f"## Citations\n"
        f"- Source 1: https://example.com/1\n"
        f"- Source 2: https://research.example.com/2\n"
        f"- Source 3: https://example.com/3\n"
    )
    await _emit_tool(emitter, ctx, "write_file", {"path": "final_report.md", "content": report_content}, {
        "status": "written",
        "path": "final_report.md",
    }, delay=0.8)

    artifact = Artifact(
        filename="final_report.md",
        content=report_content,
        agent_name="report-writer",
    )
    artifact_store.add_artifact(session_id, artifact)

    await _emit_response(emitter, ctx, "Final research brief has been compiled and saved to final_report.md.")

    await emitter.emit(AgentEvent(
        event_type=EventType.SUB_AGENT_END,
        agent_context=parent_ctx,
        payload=SubAgentEndPayload(
            child_agent_id=agent_id,
            child_agent_name="report-writer",
            status=AgentStatus.COMPLETED,
            summary="Synthesized all research into a comprehensive research brief with citations.",
        ),
    ))


# ── Main orchestrator ────────────────────────────────────────────

async def run_agent_simulation(
    session_id: str,
    run_id: str,
    user_message: str,
) -> None:
    """
    Run the full Domain A agent simulation.
    This is kicked off as a background task when the user sends a message.
    """
    emitter = EventEmitter(session_id=session_id, run_id=run_id)

    # ── Lead Analyst context ─────────────────────────────────────
    lead_id = _uid()
    lead_ctx = AgentContext(
        agent_id=lead_id,
        agent_name="lead-analyst",
        role=AgentRole.ORCHESTRATOR,
        parent_agent_id=None,
    )

    total_events = 0

    try:
        # 1. Session start
        await emitter.emit(AgentEvent(
            event_type=EventType.SESSION_START,
            agent_context=lead_ctx,
            payload=SessionStartPayload(session_id=session_id, message=user_message),
        ))
        total_events += 1

        # 2. Lead analyst thinking
        await _emit_thinking(emitter, lead_ctx,
            f"Analyzing the research request: '{user_message}'. "
            "I need to decompose this into parallel research streams. "
            "But first, I should clarify the user's specific focus areas."
        )
        total_events += 1

        # 3. Ask user for clarification
        prompt_id = _uid()
        wait_event = store.register_prompt(prompt_id)

        await emitter.emit(AgentEvent(
            event_type=EventType.ASK_USER,
            agent_context=lead_ctx,
            payload=AskUserPayload(
                question=(
                    "What angle matters most for this research?\n"
                    "- Technical capabilities\n"
                    "- Developer adoption\n"
                    "- Enterprise readiness\n"
                    "- Funding and market position"
                ),
                prompt_id=prompt_id,
            ),
        ))
        total_events += 1

        # 4. Wait for user answer (stream stays open, no events emitted)
        await wait_event.wait()
        user_answer = store.get_answer(prompt_id) or "developer adoption and enterprise readiness"

        # 5. Acknowledge answer
        await emitter.emit(AgentEvent(
            event_type=EventType.ASK_USER_ANSWERED,
            agent_context=lead_ctx,
            payload=AskUserAnsweredPayload(prompt_id=prompt_id, answer=user_answer),
        ))
        total_events += 1

        await _emit_thinking(emitter, lead_ctx,
            f"User wants to focus on: {user_answer}. "
            "I'll decompose this into three parallel research streams."
        )
        total_events += 1

        # 6. Spawn parallel web researchers
        subtopics = [
            "AI agent frameworks landscape and comparison",
            f"{user_answer.split(' and ')[0] if ' and ' in user_answer else user_answer} metrics and trends",
            f"Enterprise AI agent deployments and {user_answer.split(' and ')[-1] if ' and ' in user_answer else 'readiness'}",
        ]

        await _emit_thinking(emitter, lead_ctx,
            f"Dispatching {len(subtopics)} web researchers in parallel to investigate: "
            + ", ".join(f"'{s}'" for s in subtopics)
        )
        total_events += 1

        # Run researchers in parallel
        researcher_tasks = [
            _simulate_web_researcher(emitter, session_id, lead_ctx, subtopic, i + 1)
            for i, subtopic in enumerate(subtopics)
        ]
        await asyncio.gather(*researcher_tasks)
        total_events += len(subtopics) * 8  # approx events per researcher

        # 7. Sequential: data analyst (after all researchers complete)
        await _emit_thinking(emitter, lead_ctx,
            "All web researchers have completed. Dispatching data analyst to extract key metrics."
        )
        total_events += 1

        await _simulate_data_analyst(emitter, session_id, lead_ctx)
        total_events += 7

        # 8. Sequential: report writer (after data analyst)
        await _emit_thinking(emitter, lead_ctx,
            "Data analysis complete. Dispatching report writer to compile the final brief."
        )
        total_events += 1

        await _simulate_report_writer(emitter, session_id, lead_ctx, user_message)
        total_events += 8

        # 9. Final message
        artifact_list = artifact_store.list_artifacts(session_id)
        artifact_ids = [a.artifact_id for a in artifact_list]

        await emitter.emit(AgentEvent(
            event_type=EventType.FINAL_MESSAGE,
            agent_context=lead_ctx,
            payload=FinalMessagePayload(
                text=(
                    f"Research complete! I've compiled a comprehensive brief on '{user_message}'.\n\n"
                    f"**Artifacts produced:**\n"
                    + "\n".join(f"- {a.filename} (by {a.agent_name})" for a in artifact_list)
                    + "\n\nYou can view the full report in the artifacts panel."
                ),
                artifact_ids=artifact_ids,
            ),
        ))
        total_events += 1

        # 10. Done
        await emitter.emit(AgentEvent(
            event_type=EventType.DONE,
            agent_context=lead_ctx,
            payload=DonePayload(run_id=run_id, total_events=total_events),
        ))

    except Exception as e:
        # Emit error event
        await emitter.emit(AgentEvent(
            event_type=EventType.ERROR,
            agent_context=lead_ctx,
            payload=ErrorPayload(message=str(e), code="SIMULATION_ERROR", recoverable=False),
        ))
