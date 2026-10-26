"""Shared Playwright setup for broker adapters: one browser per process,
a fresh context per run, a polite default pace so we're not hammering
any broker site, and a human-visible (non-headless) mode for development
so selector work and CAPTCHA detection can be watched directly.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from playwright.async_api import Browser, BrowserContext, Page, async_playwright

# Minimum delay between actions against any single broker site. Keeps
# this project's traffic well under anything that looks like scraping
# abuse, independent of the per-run token/request budget in
# agent_runtime.py (that caps LLM usage; this caps page-hit rate).
MIN_ACTION_DELAY_SECONDS = 2.0

_last_action_at: dict[str, float] = {}


async def pace(domain: str) -> None:
    now = asyncio.get_event_loop().time()
    last = _last_action_at.get(domain, 0.0)
    wait = MIN_ACTION_DELAY_SECONDS - (now - last)
    if wait > 0:
        await asyncio.sleep(wait)
    _last_action_at[domain] = asyncio.get_event_loop().time()


@asynccontextmanager
async def browser_page(*, headless: bool = True):
    """One Playwright page, ready to use, cleaned up automatically."""
    async with async_playwright() as pw:
        browser: Browser = await pw.chromium.launch(headless=headless)
        context: BrowserContext = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
            )
        )
        page: Page = await context.new_page()
        try:
            yield page
        finally:
            await context.close()
            await browser.close()
