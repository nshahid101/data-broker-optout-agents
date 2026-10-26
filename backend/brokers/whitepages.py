"""Whitepages adapter — the mirror image of Spokeo's problem: People
Search is bot-walled (confirmed live: a generic test search immediately
triggered "Access is temporarily restricted... Automated (bot) activity"),
but the opt-out wizard itself (whitepages.com/suppression-requests) loads
fine. So for this broker, discovery is manual — the user finds their own
profile URL in their own regular browser and supplies it via
Person.known_listing_urls (see backend/models.py) — and this adapter only
drives the opt-out wizard from a known URL onward.

search()/extract_listings() are intentionally unreachable: the
orchestrator/discovery_agent short-circuits discovery entirely for any
broker present in Person.known_listing_urls, building a Listing directly
from the user-supplied URL (confidence=1.0, a human found it) instead of
calling search(). They're still defined here (so WhitepagesAdapter keeps
satisfying the BrokerAdapter protocol) but raise if ever called.

Step 1 of the wizard (paste the profile URL) is live-verified: submitting
a URL that doesn't resolve to a real listing produces the exact error
"Sorry, we're not able to locate the listing associated with the URL
provided." Steps 2-5 could not be explored without a real listing (the
site validates the URL server-side before letting you past step 1), so
submit_optout() handles them generically — fill any visible email field,
check any visible consent checkbox, click the primary continue button,
repeat — and bails out to OPTOUT_NEEDS_MANUAL_STEP rather than guessing
if a step doesn't look like a normal form (e.g. a CAPTCHA/bot-challenge).
This needs to be re-verified against a real profile URL before trusting
it end to end — flagged here rather than silently assumed correct.
"""

from __future__ import annotations

from playwright.async_api import Page

from backend.models import BrokerName, Listing
from backend.safety import assert_domain_allowed

broker = BrokerName.WHITEPAGES

SUPPRESSION_URL = "https://www.whitepages.com/suppression-requests"
URL_INPUT_SELECTOR = "#suppression-requests-person-url"
NOT_FOUND_TEXT = "not able to locate the listing"
MAX_WIZARD_STEPS = 5


async def search(page: Page, full_name: str, city: str, state: str) -> list[str]:
    raise NotImplementedError(
        "Whitepages search is bot-walled — discovery for this broker comes "
        "from Person.known_listing_urls, not an automated search. See this "
        "module's docstring."
    )


async def extract_listings(
    page: Page, listing_urls: list[str], full_name: str, city: str, state: str
) -> list[Listing]:
    raise NotImplementedError(
        "Whitepages discovery is manual (Person.known_listing_urls) — "
        "extract_listings() is never called for this broker. See this "
        "module's docstring."
    )


async def submit_optout(page: Page, listing: Listing, contact_email: str) -> tuple[bool, str]:
    assert_domain_allowed(broker, listing.listing_url)

    await page.goto(SUPPRESSION_URL, wait_until="domcontentloaded", timeout=30000)
    await page.wait_for_timeout(1500)
    await page.fill(URL_INPUT_SELECTOR, listing.listing_url)
    await page.click("button:has-text('Next')")
    await page.wait_for_timeout(2500)

    body_text = await page.inner_text("body")
    if NOT_FOUND_TEXT in body_text:
        return False, (
            "Whitepages couldn't match the supplied URL to a real listing — it's likely a search-results "
            "link rather than an individual profile page (one that ends in a unique ID, e.g. "
            ".../City-ST/Pbcd12345ef). Find the profile page itself and try again."
        )

    for step in range(2, MAX_WIZARD_STEPS + 1):
        body_text = await page.inner_text("body")
        lowered = body_text.lower()
        if "verifying" in lowered and "bot" in lowered:
            return False, "needs_manual_step: a bot-challenge appeared mid-wizard; never bypassed."

        email_input = page.locator("input[type='email']")
        if await email_input.count() > 0:
            await email_input.first.fill(contact_email)

        consent_checkbox = page.locator("input[type='checkbox']")
        for i in range(await consent_checkbox.count()):
            box = consent_checkbox.nth(i)
            if not await box.is_checked():
                await box.check()

        next_button = page.locator("button:has-text('Next'), button:has-text('Submit'), button:has-text('Confirm')")
        if await next_button.count() == 0:
            # No further obvious step — assume this was the last one.
            break
        await next_button.first.click()
        await page.wait_for_timeout(2500)

    final_text = (await page.inner_text("body")).lower()
    if "thank you" in final_text or "request" in final_text and "submitted" in final_text:
        return True, "Opt-out wizard completed. Whitepages typically takes 24-48 hours to process the request."
    return False, (
        f"The automated wizard didn't recognize the page after {MAX_WIZARD_STEPS} steps — this is a "
        "known gap (the generic fill-and-click steps haven't been verified against every real "
        "listing's exact flow yet). Finish it yourself using the link and listing URL below."
    )


async def check_removed(page: Page, listing: Listing) -> bool:
    assert_domain_allowed(broker, listing.listing_url)
    await page.goto(listing.listing_url, wait_until="domcontentloaded", timeout=30000)
    await page.wait_for_timeout(2000)
    body_text = (await page.inner_text("body")).lower()
    removed_markers = ("page not found", "no longer available", "we couldn't find")
    return any(marker in body_text for marker in removed_markers)
