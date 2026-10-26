"""Verify — re-checks a listing later to confirm an opt-out actually
worked, rather than just that a form was submitted. Run separately from
the opt-out step (removals take time — Spokeo says 24-48 hours,
Whitepages similar), not as part of the same pipeline call.

For Spokeo, also re-checks any related_listing_urls (e.g. AnyWho, a
Spokeo-affiliated site) as bonus evidence that one opt-out cleared more
than one surface.
"""

from __future__ import annotations

from pathlib import Path

from pydantic_ai import Agent, RunContext

from backend.agent_runtime import RunDeps
from backend.brokers import REGISTRY
from backend.browser import browser_page
from backend.delegation import delegate
from backend.models import BrokerName, Listing
from backend.portkey_config import get_model

PROMPT = (Path(__file__).parent / "prompts" / "verify.md").read_text()

verify_agent = Agent(
    get_model(),
    deps_type=RunDeps,
    system_prompt=PROMPT,
    name="verify",
)
verify_agent.tool(delegate)


@verify_agent.tool
async def check_listing_removed(ctx: RunContext[RunDeps], broker: BrokerName, listing_json: str) -> str:
    """Check whether a listing (and, for Spokeo, any related listings
    like AnyWho) has actually been removed. Pass the exact listing JSON
    from when it was found/opted out."""

    listing = Listing.model_validate_json(listing_json)
    adapter = REGISTRY[broker]

    async with browser_page(headless=True) as page:
        removed = await adapter.check_removed(page, listing)

        related_results = {}
        for related_url in listing.related_listing_urls:
            related_listing = listing.model_copy(update={"listing_url": related_url})
            related_results[related_url] = await adapter.check_removed(page, related_listing)

    summary = f"{listing.listing_url}: {'REMOVED' if removed else 'STILL PRESENT'}"
    for url, was_removed in related_results.items():
        summary += f"\n{url} (related): {'REMOVED' if was_removed else 'STILL PRESENT'}"
    return summary
