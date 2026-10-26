"""BeenVerified adapter — the "manual end to end, automated verify"
broker. Live-tested 2026-10-21:

- Main search (fn-input/ln-input on the homepage) doesn't show free
  results — it's a multi-step lead-gen funnel (search -> "which state?"
  -> "what's the age/middle name?" -> ...) that builds toward a paid
  report signup. There's no free listing page to scrape here the way
  Spokeo has one, so automated discovery isn't realistic without paying
  for a report (a financial transaction out of scope for this project).
- Their legitimate, free, no-payment opt-out tool
  (beenverified.com/f/optout/search) is exactly the right tool for this
  project's purpose, but it's gated behind a Cloudflare "security
  verification" challenge — never bypassed, per this project's hard
  rule against defeating bot/CAPTCHA detection.

So for this broker: the user finds their own listing URL and completes
the opt-out form themselves (both manual, surfaced in the frontend as a
guided walkthrough with a direct link — see ManualStepCard), and this
adapter's only job is check_removed(): automating the one step that
doesn't require fighting Cloudflare — reloading a known URL later to see
if it's gone. search()/submit_optout() are defined to satisfy the
BrokerAdapter protocol but are never called for this broker.
"""

from __future__ import annotations

from playwright.async_api import Page

from backend.models import BrokerName, Listing
from backend.safety import assert_domain_allowed

broker = BrokerName.BEENVERIFIED

OPTOUT_URL = "https://www.beenverified.com/f/optout/search"


async def search(page: Page, full_name: str, city: str, state: str) -> list[str]:
    raise NotImplementedError(
        "BeenVerified's search is a paid-report funnel, not free results — "
        "discovery for this broker is manual (Person.known_listing_urls). "
        "See this module's docstring."
    )


async def extract_listings(
    page: Page, listing_urls: list[str], full_name: str, city: str, state: str
) -> list[Listing]:
    raise NotImplementedError(
        "BeenVerified discovery is manual — extract_listings() is never "
        "called for this broker. See this module's docstring."
    )


async def submit_optout(page: Page, listing: Listing, contact_email: str) -> tuple[bool, str]:
    assert_domain_allowed(broker, listing.listing_url)
    return False, (
        "needs_manual_step: BeenVerified's opt-out tool is behind a Cloudflare "
        "bot-challenge. This is never bypassed — the user must complete the "
        f"opt-out themselves at {OPTOUT_URL}. This adapter only verifies the "
        "result afterward."
    )


async def check_removed(page: Page, listing: Listing) -> bool:
    assert_domain_allowed(broker, listing.listing_url)
    await page.goto(listing.listing_url, wait_until="domcontentloaded", timeout=30000)
    await page.wait_for_timeout(2000)
    body_text = (await page.inner_text("body")).lower()
    removed_markers = ("page not found", "no longer available", "record not found", "404")
    return any(marker in body_text for marker in removed_markers)
