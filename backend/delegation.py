"""The tool the orchestrator uses to hand a broker's discovery, opt-out,
or verify step to the specialist agent for that step.
"""

from __future__ import annotations

import time

from pydantic_ai import Agent, RunContext

from backend.agent_runtime import MAX_DELEGATION_DEPTH, RunDeps, run_agent
from backend.models import AgentName, QueueEvent, QueueEventType
from backend.event_queue import event_bus

# Populated by backend/team.py once every agent is built, so this module
# never has to import the agent files itself (that would be circular:
# each agent file needs `delegate`, and `delegate` needs every agent).
TEAM: dict[AgentName, Agent] = {}


async def delegate(ctx: RunContext[RunDeps], to_agent: AgentName, task: str) -> str:
    """Delegate a step (discovery, optout, or verify) to the specialist
    agent for that step and return what they found."""

    source = ctx.deps.current_agent

    if to_agent == source:
        return f"Cannot delegate to self ({source.value}). Handle this directly instead."

    if ctx.deps.depth >= MAX_DELEGATION_DEPTH:
        return "Delegation depth limit reached — resolve this directly instead of delegating further."

    start = time.monotonic()
    await event_bus.publish(
        QueueEvent(
            event_type=QueueEventType.DELEGATION_START,
            agent=source,
            target_agent=to_agent,
            input=task,
        )
    )

    sub_deps = RunDeps(
        run_id=ctx.deps.run_id,
        current_agent=to_agent,
        person=ctx.deps.person,
        broker=ctx.deps.broker,
        usage=ctx.deps.usage,
        usage_limits=ctx.deps.usage_limits,
        depth=ctx.deps.depth + 1,
    )
    result = await run_agent(TEAM[to_agent], to_agent, task, sub_deps)

    duration_ms = (time.monotonic() - start) * 1000
    await event_bus.publish(
        QueueEvent(
            event_type=QueueEventType.DELEGATION_END,
            agent=source,
            target_agent=to_agent,
            output=result,
            duration_ms=duration_ms,
        )
    )
    return result
