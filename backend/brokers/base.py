"""The common interface every broker adapter implements, so the
discovery/optout/verify agents can drive any broker the same way. Each
concrete adapter (spokeo.py, whitepages.py, ...) wraps that specific
site's actual search UI, listing page layout, and opt-out form behind
this one shape — the per-site differences (selectors, number of steps,
CAPTCHA presence) live entirely inside the adapter, never in the agents.
"""

from __future__ import annotations

from typing import Protocol

from playwright.async_api import Page

from backend.models import BrokerName, Listing


class BrokerAdapter(Protocol):
    broker: BrokerName

    async def search(self, page: Page, full_name: str, city: str, state: str) -> list[str]:
        """Search the broker's own site for this person. Returns candidate
        listing URLs — not parsed data yet."""
        ...

    async def extract_listings(
        self, page: Page, listing_urls: list[str], full_name: str, city: str, state: str
    ) -> list[Listing]:
        """Visit each candidate URL and extract a structured Listing for
        ones that actually match. This is the only place raw page text is
        read — it must be turned into validated Listing models before
        anything else (including any agent) sees it, per the
        prompt-injection defense in backend/safety.py."""
        ...

    async def submit_optout(self, page: Page, listing: Listing, contact_email: str) -> tuple[bool, str]:
        """Drive this broker's opt-out form for one listing (contact_email
        is where the broker will send its confirmation link, if any).
        Returns (submitted, detail) — detail explains what happened,
        including when a CAPTCHA/bot-challenge stopped automated
        submission (never attempt to solve/bypass one — see
        backend/safety.py and the project's safety notes)."""
        ...

    async def check_removed(self, page: Page, listing: Listing) -> bool:
        """Re-visit the listing URL and report whether it's gone. This is
        the verification step — proof the opt-out actually worked, not
        just that a form was submitted."""
        ...
