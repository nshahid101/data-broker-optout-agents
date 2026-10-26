"""Append-only audit log of every agent-loop step.

output/audit_trail.json is never wiped at startup - each event is
loaded, appended to, and written back, so a later run's history sits
on top of earlier runs instead of replacing them.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from backend.models import QueueEvent

AUDIT_PATH = Path(__file__).resolve().parent.parent / "output" / "audit_trail.json"
_lock = asyncio.Lock()


def _load_existing() -> list[dict]:
    if not AUDIT_PATH.exists() or AUDIT_PATH.stat().st_size == 0:
        return []
    try:
        return json.loads(AUDIT_PATH.read_text())
    except json.JSONDecodeError:
        return []


async def append_audit_record(event: QueueEvent) -> None:
    record = event.model_dump(mode="json")
    async with _lock:
        records = _load_existing()
        records.append(record)
        AUDIT_PATH.parent.mkdir(parents=True, exist_ok=True)
        AUDIT_PATH.write_text(json.dumps(records, indent=2))
