"""Safety demo 2/3: overspending / runaway-loop protection.

Every agent run in this project is bounded by a UsageLimits budget
(backend/agent_runtime.py's DEFAULT_USAGE_LIMITS: 60 requests / 200,000
tokens, enforced by pydantic-ai itself). This demo deliberately sets that
budget absurdly low for one real run and shows the agent halts cleanly
with a clear, logged error — instead of looping or spending unbounded —
exactly the behavior agent_runtime.run_agent()'s except UsageLimitExceeded
branch is there for.

Run with: python -m backend.safety_demos.demo_usage_limit
(from the Final Project/ directory, with PORTKEY_API_KEY set)
"""

from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import backend.team  # noqa: E402,F401 - builds and registers the 4 agents
from backend.agent_runtime import RunDeps, run_agent  # noqa: E402
from backend.delegation import TEAM  # noqa: E402
from backend.models import AgentName, Person  # noqa: E402
from pydantic_ai.usage import UsageLimits  # noqa: E402


async def main() -> int:
    print("=" * 70)
    print("SAFETY DEMO: overspending / runaway-loop protection")
    print("=" * 70)

    # Absurdly low on purpose — a single real request to the model almost
    # certainly exceeds this, forcing the limit to trip on the very first
    # call rather than letting the agent get anything done.
    tiny_limits = UsageLimits(request_limit=1, total_tokens_limit=50)
    print(f"\n[1] Running a real discovery task with a deliberately tiny budget: {tiny_limits}")

    person = Person(full_name="Jane Doe", city="Austin", state="TX", email="test@example.com")
    deps = RunDeps(
        run_id=f"usage-limit-demo-{int(time.time())}",
        current_agent=AgentName.ORCHESTRATOR,
        person=person,
        usage_limits=tiny_limits,
    )
    task = "Find candidate listings (discovery only — no opt-outs) for brokers: spokeo."

    output = await run_agent(TEAM[AgentName.ORCHESTRATOR], AgentName.ORCHESTRATOR, task, deps)

    print(f"\n[2] run_agent() returned (did not raise, did not hang):\n---\n{output}\n---")

    stopped_cleanly = output.startswith("Stopped:") and "budget" in output
    print(f"\n[3] Did it stop cleanly with the overspending message? {stopped_cleanly}")

    print("\n" + "=" * 70)
    print(f"RESULT: {'PASS' if stopped_cleanly else 'FAIL'}")
    print("=" * 70)
    return 0 if stopped_cleanly else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
