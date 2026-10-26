"""Spokeo adapter — the one broker in this project that's automatable
end to end: name search has no bot wall (confirmed live), and the
opt-out page (spokeo.com/optout) is a simple URL + email form.

extract_listings() deliberately does NOT visit each candidate profile
page separately — the search results page already shows name, age,
city/state, and relatives for every match, so parsing the already-loaded
results page is both faster and lower-traffic (see backend/browser.py's
pacing). The downside: these cards are untrusted scraped text, so they
go through the structured-extraction boundary in backend/safety.py
(flag_possible_injection) before becoming a validated Listing — never
raw text an agent could "read as instructions".

Submitting the opt-out form only gets you to "submitted" — Spokeo then
emails a confirmation link the user must click themselves to finish the
removal (see the opt-out page copy: "To complete this process, we will
send you a confirmation email. Please click the link in the email.").
That's not something this project automates (no email-inbox access is
in scope), so OPTOUT_SUBMITTED here means "form submitted, pending the
user's own email click" — the verify agent's later re-check is what
actually proves removal happened.
"""

from __future__ import annotations

import re

from playwright.async_api import Page

from backend.models import BrokerName, Listing, ListingStatus
from backend.safety import assert_domain_allowed, flag_possible_injection

broker = BrokerName.SPOKEO

HOME_URL = "https://www.spokeo.com/"
OPTOUT_URL = "https://www.spokeo.com/optout"

_PROFILE_HREF_RE = re.compile(r"/p\d+")
_NAME_AGE_RE = re.compile(r"^(.+?),\s*Age\s*(\d+)", re.IGNORECASE)
_LOCATION_RE = re.compile(r"RESIDE[SD]? IN\s+([^,\n]+),\s*([A-Z]{2})\b")


async def search(page: Page, full_name: str, city: str, state: str) -> list[str]:
    await page.goto(HOME_URL, wait_until="domcontentloaded", timeout=30000)
    await page.wait_for_timeout(1500)
    await page.fill("input[name='name-search']", full_name)
    await page.keyboard.press("Enter")
    await page.wait_for_load_state("domcontentloaded", timeout=20000)
    await page.wait_for_timeout(2500)

    hrefs: list[str] = await page.eval_on_selector_all(
        "a[href]",
        "els => els.map(e => e.href).filter(h => /\\/p\\d+/.test(h))",
    )
    return list(dict.fromkeys(hrefs))


async def extract_listings(
    page: Page, listing_urls: list[str], full_name: str, city: str, state: str
) -> list[Listing]:
    # `page` is still sitting on the results page search() produced —
    # listing_urls is accepted for interface compatibility but the cards
    # are read straight from that page's DOM instead of re-fetching.
    cards: list[dict] = await page.evaluate(
        """
        () => {
          const anchors = Array.from(document.querySelectorAll('a[href]'))
            .filter(a => /\\/p\\d+/.test(a.href));
          const seen = new Set();
          const out = [];
          for (const a of anchors) {
            if (seen.has(a.href)) continue;
            seen.add(a.href);
            let el = a, card = null;
            for (let i = 0; i < 8 && el; i++) {
              const len = (el.innerText || '').length;
              if (len > 50 && len < 700) { card = el; break; }
              el = el.parentElement;
            }
            out.push({ href: a.href, text: card ? card.innerText : '' });
          }
          return out;
        }
        """
    )

    listings: list[Listing] = []
    for card in cards:
        text = card["text"]
        flag_possible_injection(text)  # defense-in-depth logging only; see safety.py

        name_match = _NAME_AGE_RE.match(text)
        loc_match = _LOCATION_RE.search(text)
        matched_name = name_match.group(1).strip() if name_match else full_name
        matched_city = loc_match.group(1).strip() if loc_match else None
        matched_state = loc_match.group(2).strip() if loc_match else None

        confidence = _score_match(full_name, city, state, matched_name, matched_city, matched_state)
        # Low bar here on purpose — this just excludes near-zero noise.
        # The real "is this actually me" judgment belongs to the human
        # reviewing candidates, not a hardcoded cutoff (see
        # discovery_agent.py's MIN_DISPLAYABLE_CONFIDENCE).
        if confidence < 0.15:
            continue

        listings.append(
            Listing(
                broker=broker,
                listing_url=card["href"],
                matched_name=matched_name,
                matched_city=matched_city,
                matched_state=matched_state,
                confidence=confidence,
            )
        )

    listings.sort(key=lambda listing: listing.confidence, reverse=True)
    return listings


def _score_match(
    full_name: str, city: str, state: str, m_name: str, m_city: str | None, m_state: str | None
) -> float:
    # Token-overlap name match, not substring: tolerates a card's middle
    # initial/suffix ("John F Smith Sr.") that would break a straight
    # substring check against "John Smith".
    query_tokens = set(full_name.strip().lower().split())
    card_tokens = set(m_name.lower().replace(",", "").split())
    name_overlap = len(query_tokens & card_tokens) / max(len(query_tokens), 1)

    score = 0.5 * name_overlap
    if m_state and m_state.upper() == state.strip().upper():
        score += 0.3
    if m_city and city.strip().lower() in m_city.lower():
        score += 0.2
    return min(score, 1.0)


async def submit_optout(page: Page, listing: Listing, contact_email: str) -> tuple[bool, str]:
    assert_domain_allowed(broker, listing.listing_url)

    await page.goto(OPTOUT_URL, wait_until="domcontentloaded", timeout=30000)
    await page.wait_for_timeout(1500)
    await page.fill("input[name='url']", listing.listing_url)
    await page.fill("input[name='email']", contact_email)
    await page.click("button:has-text('OPT OUT')")
    await page.wait_for_timeout(2500)

    body_text = await page.inner_text("body")
    if "confirmation email" in body_text.lower() or "check your email" in body_text.lower():
        return True, (
            f"Opt-out form submitted for {listing.listing_url}. Spokeo will email "
            f"{contact_email} a confirmation link — the user must click it themselves "
            "to finish the removal."
        )
    return False, f"Opt-out form submission did not confirm as expected. Page text: {body_text[:300]}"


async def check_removed(page: Page, listing: Listing) -> bool:
    assert_domain_allowed(broker, listing.listing_url)
    await page.goto(listing.listing_url, wait_until="domcontentloaded", timeout=30000)
    await page.wait_for_timeout(2000)
    body_text = (await page.inner_text("body")).lower()
    removed_markers = ("page not found", "no longer available", "this profile has been removed")
    return any(marker in body_text for marker in removed_markers)
