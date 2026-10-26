"""SQLite storage for runs, listings, and token usage — the raw
evidence behind the report's tokenomics/impact sections (real measured
numbers, not estimates).
"""

from __future__ import annotations

from pathlib import Path

import aiosqlite

from backend.models import AgentName, BrokerName, Listing, ListingStatus, Person

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "app.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    brokers TEXT NOT NULL,          -- JSON list of BrokerName values run this time
    started_at REAL NOT NULL,
    finished_at REAL
);

CREATE TABLE IF NOT EXISTS listings (
    listing_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    broker TEXT NOT NULL,
    listing_url TEXT NOT NULL,
    matched_name TEXT NOT NULL,
    matched_city TEXT,
    matched_state TEXT,
    matched_phone TEXT,
    confidence REAL NOT NULL,
    status TEXT NOT NULL,
    found_at REAL NOT NULL,
    optout_submitted_at REAL,
    last_verified_at REAL,
    screenshot_path TEXT
);

CREATE TABLE IF NOT EXISTS token_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    agent TEXT NOT NULL,
    broker TEXT,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    cached_input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL,
    recorded_at REAL NOT NULL DEFAULT (strftime('%s','now'))
);
"""


async def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(SCHEMA)
        await db.commit()


async def create_run(run_id: str, person: Person, brokers: list[BrokerName], started_at: float) -> None:
    import json

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO runs (run_id, full_name, city, state, phone, email, brokers, started_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                run_id,
                person.full_name,
                person.city,
                person.state,
                person.phone,
                person.email,
                json.dumps([b.value for b in brokers]),
                started_at,
            ),
        )
        await db.commit()


async def finish_run(run_id: str, finished_at: float) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE runs SET finished_at = ? WHERE run_id = ?", (finished_at, run_id))
        await db.commit()


async def save_listing(run_id: str, listing: Listing, found_at: float) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO listings
               (run_id, broker, listing_url, matched_name, matched_city, matched_state,
                matched_phone, confidence, status, found_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                run_id,
                listing.broker.value,
                listing.listing_url,
                listing.matched_name,
                listing.matched_city,
                listing.matched_state,
                listing.matched_phone,
                listing.confidence,
                listing.status.value,
                found_at,
            ),
        )
        await db.commit()
        return cursor.lastrowid


async def update_listing_status(
    listing_id: int,
    status: ListingStatus,
    *,
    optout_submitted_at: float | None = None,
    last_verified_at: float | None = None,
    screenshot_path: str | None = None,
) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """UPDATE listings
               SET status = ?,
                   optout_submitted_at = COALESCE(?, optout_submitted_at),
                   last_verified_at = COALESCE(?, last_verified_at),
                   screenshot_path = COALESCE(?, screenshot_path)
               WHERE listing_id = ?""",
            (status.value, optout_submitted_at, last_verified_at, screenshot_path, listing_id),
        )
        await db.commit()


async def get_listings_for_run(run_id: str) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM listings WHERE run_id = ? ORDER BY confidence DESC", (run_id,)
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def get_pending_confirmations() -> list[dict]:
    """Every listing in the post-opt-out follow-up stage, across ALL runs
    — not scoped to whichever run is currently on screen, so a user can
    start a brand-new search while an older one is still waiting on an
    email, and come back to confirm it later.

    Deliberately includes already-confirmed listings too, not just ones
    still waiting: if a confirmed item vanished from this list the
    instant it was confirmed, the list would reflow/reorder right as the
    user clicks something, which is exactly what made a mis-click hard to
    notice and undo. Confirmed items stay in place, shown with an Undo
    action instead, so the list never jumps around underneath the user."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM listings WHERE status IN ('optout_submitted', 'optout_confirmed') "
            "ORDER BY optout_submitted_at DESC"
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def get_listing(listing_id: int) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM listings WHERE listing_id = ?", (listing_id,))
        row = await cursor.fetchone()
        return dict(row) if row else None


async def average_run_duration_seconds() -> tuple[int, float | None]:
    """(sample_count, avg_seconds) over completed runs — the basis for the
    frontend's "about N seconds" estimate while a new run is in progress."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT COUNT(*), AVG(finished_at - started_at) FROM runs WHERE finished_at IS NOT NULL"
        )
        row = await cursor.fetchone()
        count = row[0] if row and row[0] else 0
        avg = row[1] if row and row[1] is not None else None
        return count, avg


async def log_token_usage(
    run_id: str,
    agent: AgentName,
    broker: BrokerName | None,
    model: str,
    input_tokens: int,
    output_tokens: int,
    cached_input_tokens: int = 0,
) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO token_usage
               (run_id, agent, broker, model, input_tokens, cached_input_tokens, output_tokens)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                run_id,
                agent.value,
                broker.value if broker else None,
                model,
                max(input_tokens, 0),
                max(cached_input_tokens, 0),
                max(output_tokens, 0),
            ),
        )
        await db.commit()


async def token_usage_summary() -> list[dict]:
    """Per-run token/cost totals, newest first — what CostPanel.tsx reads."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """SELECT run_id,
                      SUM(input_tokens) AS input_tokens,
                      SUM(cached_input_tokens) AS cached_input_tokens,
                      SUM(output_tokens) AS output_tokens
               FROM token_usage
               GROUP BY run_id
               ORDER BY MIN(recorded_at) DESC"""
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
