"""Discovery — finds a person's listing(s) on one broker.

The real work (searching, scraping, matching) happens in the broker
adapters under backend/brokers/; this agent's job is just to call the
one tool below and summarize what came back. For brokers in
MANUAL_DISCOVERY_BROKERS (see backend/brokers/__init__.py), there's
nothing to search — the tool returns a Listing built straight from
Person.known_listing_urls if the user already supplied one, or a message
explaining they need to.
"""

from __future__ import annotations

import time
from pathlib import Path

from pydantic_ai import Agent, RunContext

from backend.agent_runtime import RunDeps
from backend.brokers import MANUAL_DISCOVERY_BROKERS, REGISTRY
from backend.browser import browser_page
from backend.db import save_listing
from backend.delegation import delegate
from backend.models import BrokerName, Listing, ListingStatus, Person
from backend.portkey_config import get_model

# Display names for the plain-English summary text below — matches
# frontend/src/types.ts's BROKER_LABELS. Kept in sync by hand; small,
# stable list.
_BROKER_DISPLAY_NAMES: dict[BrokerName, str] = {
    BrokerName.SPOKEO: "Spokeo",
    BrokerName.WHITEPAGES: "Whitepages",
    BrokerName.BEENVERIFIED: "BeenVerified",
}


async def discover_manual_listing(run_id: str, person: Person, broker: BrokerName) -> str:
    """Builds a Listing straight from Person.known_listing_urls for a
    manual-discovery broker — there's no searching/matching/judgment call
    here at all, so this is called directly by POST /api/run (bypassing
    the discovery agent and its LLM call entirely) instead of being routed
    through an agent tool call that would just echo this same result back.
    Kept importable so discovery_agent's own search_broker tool can reuse
    it too, as a defensive fallback.

    Returns a short, plain-English line — no embedded JSON/URLs — since
    this goes straight into the run summary a non-technical user reads,
    with no LLM pass to clean it up first. The actual listing details
    (URL, matched name, etc.) are already shown properly in the
    ListingPicker below; repeating them here as raw JSON was just clutter."""

    display_name = _BROKER_DISPLAY_NAMES.get(broker, broker.value)
    known_urls = person.known_listing_urls.get(broker) or []
    if not known_urls:
        return (
            f"{display_name}: discovery is manual here — search your own name in your own "
            "browser and paste the listing URL above before this can proceed."
        )

    listings: list[Listing] = []
    for url in known_urls:
        listing = Listing(
            broker=broker,
            listing_url=url,
            matched_name=person.full_name,
            matched_city=person.city,
            matched_state=person.state,
            confidence=1.0,
            status=ListingStatus.FOUND,
        )
        listing.listing_id = await save_listing(run_id, listing, time.time())
        listings.append(listing)

    count = len(listings)
    noun = "listing" if count == 1 else "listings"
    pronoun = "it" if count == 1 else "them"
    return (
        f"{display_name}: found {count} {noun} you already identified — review {pronoun} below "
        "before anything is submitted."
    )

# Below this, a "match" is almost certainly just name-collision noise, not
# worth showing a human. Above it, EVERY candidate is surfaced — this
# project never lets the agent decide which one is "really you"; only a
# human reviewing the actual listings does (see AI_prompts.md / memory
# note on this decision).
MIN_DISPLAYABLE_CONFIDENCE = 0.15
MAX_CANDIDATES_PER_BROKER = 8

PROMPT = (Path(__file__).parent / "prompts" / "discovery.md").read_text()

discovery_agent = Agent(
    get_model(),
    deps_type=RunDeps,
    system_prompt=PROMPT,
    name="discovery",
)
discovery_agent.tool(delegate)


@discovery_agent.tool
async def search_broker(ctx: RunContext[RunDeps], broker: BrokerName) -> str:
    """Find this run's person on the given broker. Returns a plain-text
    summary of matching listings found, or an explanation of what the
    user needs to do if this broker's discovery is manual."""

    person = ctx.deps.person

    if broker in MANUAL_DISCOVERY_BROKERS:
        # Normally never reached — POST /api/run resolves manual-discovery
        # brokers directly (see main.py) before the agent even starts, so
        # it's never asked to search one. Kept as a defensive fallback.
        return await discover_manual_listing(ctx.deps.run_id, person, broker)

    adapter = REGISTRY[broker]
    async with browser_page(headless=True) as page:
        urls = await adapter.search(page, person.full_name, person.city, person.state)
        listings = await adapter.extract_listings(page, urls, person.full_name, person.city, person.state)

    # Surface every plausible candidate, not just the ones the agent would
    # consider "confident" — the human reviewing them decides which (if
    # any) is really them. See MIN_DISPLAYABLE_CONFIDENCE above.
    candidates = [listing for listing in listings if listing.confidence >= MIN_DISPLAYABLE_CONFIDENCE]
    candidates = candidates[:MAX_CANDIDATES_PER_BROKER]
    if not candidates:
        return f"No plausible matches found for {person.full_name} on {broker.value}."

    for listing in candidates:
        listing.listing_id = await save_listing(ctx.deps.run_id, listing, time.time())

    lines = [listing.model_dump_json() for listing in candidates]
    return (
        f"Found {len(candidates)} candidate listing(s) on {broker.value} (saved for human review, "
        "ids included): \n" + "\n".join(lines)
    )
