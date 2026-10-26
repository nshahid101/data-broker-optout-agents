"""Runs any agent while logging every step of its loop to the event
queue, and the token delta it personally used to the token_usage table
(the raw data behind the tokenomics report section).
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

from pydantic_ai import Agent
from pydantic_ai.exceptions import UsageLimitExceeded
from pydantic_ai.messages import ToolCallPart, ToolReturnPart
from pydantic_ai.usage import RunUsage, UsageLimits

from backend.db import log_token_usage
from backend.models import AgentName, BrokerName, Person, QueueEvent, QueueEventType
from backend.event_queue import event_bus
from backend.portkey_config import MODEL_NAME

MAX_DELEGATION_DEPTH = 4

# Shared across one whole run (orchestrator plus every delegated
# sub-agent call) — a token/request budget for the entire person's run,
# not a loophole that resets every time someone delegates. This is also
# the overspending safety control (see output/safety tests: lowering
# this deliberately and showing the agent halt cleanly).
DEFAULT_USAGE_LIMITS = UsageLimits(request_limit=60, total_tokens_limit=200_000)


@dataclass
class RunDeps:
    """Per-run state threaded through every agent and delegate call.

    person/contact_email live here (not as tool arguments) so the LLM
    never has to re-type a person's details into a tool call — tools read
    ctx.deps.person directly, which is both cheaper (fewer tokens) and
    more reliable (no chance of the model mangling a name/phone number).
    """

    run_id: str
    current_agent: AgentName
    person: Person
    broker: BrokerName | None = None
    usage: RunUsage = field(default_factory=RunUsage)
    usage_limits: UsageLimits = field(default_factory=lambda: DEFAULT_USAGE_LIMITS)
    depth: int = 0


async def run_agent(agent: Agent, agent_name: AgentName, prompt: str, deps: RunDeps) -> str:
    start = time.monotonic()
    tokens_before_in = deps.usage.input_tokens
    tokens_before_cached = getattr(deps.usage, "cache_read_tokens", 0)
    tokens_before_out = deps.usage.output_tokens

    await event_bus.publish(
        QueueEvent(event_type=QueueEventType.AGENT_START, agent=agent_name, input=prompt)
    )

    try:
        async with agent.iter(
            prompt, deps=deps, usage=deps.usage, usage_limits=deps.usage_limits
        ) as run:
            async for node in run:
                if Agent.is_call_tools_node(node):
                    for part in node.model_response.parts:
                        if isinstance(part, ToolCallPart):
                            await event_bus.publish(
                                QueueEvent(
                                    event_type=QueueEventType.TOOL_CALL,
                                    agent=agent_name,
                                    tool_name=part.tool_name,
                                    input=part.args,
                                )
                            )
                elif Agent.is_model_request_node(node):
                    for part in node.request.parts:
                        if isinstance(part, ToolReturnPart):
                            await event_bus.publish(
                                QueueEvent(
                                    event_type=QueueEventType.TOOL_RESULT,
                                    agent=agent_name,
                                    tool_name=part.tool_name,
                                    output=part.content,
                                )
                            )
            output = run.result.output
    except UsageLimitExceeded as e:
        output = (
            f"Stopped: this run hit its token/request budget ({e}). This is "
            "the overspending safety control — escalate to a human instead "
            "of continuing to retry."
        )
        duration_ms = (time.monotonic() - start) * 1000
        await event_bus.publish(
            QueueEvent(
                event_type=QueueEventType.ERROR,
                agent=agent_name,
                input=prompt,
                output=output,
                duration_ms=duration_ms,
            )
        )
        return output

    duration_ms = (time.monotonic() - start) * 1000

    await log_token_usage(
        run_id=deps.run_id,
        agent=agent_name,
        broker=deps.broker,
        model=MODEL_NAME,
        input_tokens=deps.usage.input_tokens - tokens_before_in,
        cached_input_tokens=getattr(deps.usage, "cache_read_tokens", 0) - tokens_before_cached,
        output_tokens=deps.usage.output_tokens - tokens_before_out,
    )

    await event_bus.publish(
        QueueEvent(
            event_type=QueueEventType.AGENT_OUTPUT,
            agent=agent_name,
            input=prompt,
            output=output,
            duration_ms=duration_ms,
        )
    )
    return output
