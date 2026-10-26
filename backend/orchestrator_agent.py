"""Orchestrator — coordinates discovery and opt-out across brokers for
one run, by delegating to the discovery/optout agents. It never touches
a broker site directly; the `delegate` tool (see backend/delegation.py)
is its only tool.
"""

from __future__ import annotations

from pathlib import Path

from pydantic_ai import Agent

from backend.agent_runtime import RunDeps
from backend.delegation import delegate
from backend.portkey_config import get_model

PROMPT = (Path(__file__).parent / "prompts" / "orchestrator.md").read_text()

orchestrator_agent = Agent(
    get_model(),
    deps_type=RunDeps,
    system_prompt=PROMPT,
    name="orchestrator",
)
orchestrator_agent.tool(delegate)
