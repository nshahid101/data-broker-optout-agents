"""The event bus — tracks every step in any agent's loop. Every
agent-start/output, tool call/result, and delegation gets published
here: forwarded live to the FastAPI SSE endpoint, and appended to
output/audit_trail.json for later review and for report evidence.
"""

from __future__ import annotations

import asyncio
from collections import deque

from backend.audit import append_audit_record
from backend.models import QueueEvent


class EventBus:
    def __init__(self, history_limit: int = 500) -> None:
        self._subscribers: set[asyncio.Queue[QueueEvent]] = set()
        self._history: deque[QueueEvent] = deque(maxlen=history_limit)

    def subscribe(self) -> asyncio.Queue[QueueEvent]:
        """New SSE client: get history so far, then live events."""
        q: asyncio.Queue[QueueEvent] = asyncio.Queue()
        for event in self._history:
            q.put_nowait(event)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[QueueEvent]) -> None:
        self._subscribers.discard(q)

    def recent(self, limit: int = 50) -> list[QueueEvent]:
        history = list(self._history)
        return history[-limit:]

    async def publish(self, event: QueueEvent) -> None:
        self._history.append(event)
        await append_audit_record(event)
        for q in list(self._subscribers):
            await q.put(event)


event_bus = EventBus()
