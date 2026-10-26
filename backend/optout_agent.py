"""Opt-out — submits a removal request for one listing on one broker.

For brokers in MANUAL_OPTOUT_BROKERS (see backend/brokers/__init__.py),
submission is bot/Cloudflare-gated and is never attempted — the tool
returns the "needs a manual step" message straight from the adapter
without opening a browser at all.
"""

from __future__ import annotations

import os
import time
from pathlib import Path

from pydantic_ai import Agent, RunContext

from backend.agent_runtime import RunDeps
from backend.brokers import MANUAL_OPTOUT_BROKERS, REGISTRY
from backend.browser import browser_page
from backend.db import update_listing_status
from backend.delegation import delegate
from backend.models import BrokerName, Listing, ListingStatus
from backend.portkey_config import get_model

PROMPT = (Path(__file__).parent / "prompts" / "optout.md").read_text()

optout_agent = Agent(
    get_model(),
    deps_type=RunDeps,
    system_prompt=PROMPT,
    name="optout",
)
optout_agent.tool(delegate)


@optout_agent.tool
async def submit_optout_for_listing(ctx: RunContext[RunDeps], broker: BrokerName, listing_json: str) -> str:
    """Submit an opt-out for one listing (pass the exact JSON a discovery
    result gave you for this listing). Returns a plain-text outcome."""

    listing = Listing.model_validate_json(listing_json)
    person = ctx.deps.person
    contact_email = person.email or ""

    # Submitting an opt-out is a real action against a live third-party
    # site. Default to dry-run (no real submission) unless explicitly
    # opted in via DRY_RUN_OPTOUT=false — set that only for a real,
    # intentional opt-out run, never for routine pipeline testing.
    if os.getenv("DRY_RUN_OPTOUT", "true").lower() != "false":
        return (
            f"DRY RUN (DRY_RUN_OPTOUT is not 'false') — would have submitted an opt-out for "
            f"{listing.listing_url} on {broker.value} using contact email {contact_email}. "
            "No real request was sent."
        )

    adapter = REGISTRY[broker]

    if broker in MANUAL_OPTOUT_BROKERS:
        _submitted, detail = await adapter.submit_optout(None, listing, contact_email)
        if listing.listing_id is not None:
            await update_listing_status(listing.listing_id, ListingStatus.OPTOUT_NEEDS_MANUAL_STEP)
        return detail

    async with browser_page(headless=True) as page:
        submitted, detail = await adapter.submit_optout(page, listing, contact_email)

    if listing.listing_id is not None:
        new_status = ListingStatus.OPTOUT_SUBMITTED if submitted else ListingStatus.OPTOUT_FAILED
        await update_listing_status(
            listing.listing_id,
            new_status,
            optout_submitted_at=time.time() if submitted else None,
        )

    return ("Submitted. " if submitted else "Not submitted. ") + detail
