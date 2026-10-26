"""FastAPI app for the data-broker opt-out agent team.

Run with: uvicorn main:app --port 8010 (from the backend/ folder).
Do NOT add --reload: on Windows, uvicorn's reload supervisor runs the
worker under SelectorEventLoop instead of ProactorEventLoop, and only
ProactorEventLoop can spawn subprocesses on Windows — which is exactly
what Playwright needs to launch a browser. With --reload, every
discovery/opt-out call fails with a NotImplementedError.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# On Windows, uvicorn's --reload supervisor can leave the actual worker
# process running on SelectorEventLoop instead of ProactorEventLoop.
# Playwright needs to spawn a browser subprocess, which only
# ProactorEventLoop supports on Windows — under SelectorEventLoop it fails
# with "NotImplementedError" deep inside asyncio.create_subprocess_exec.
# Force the right policy explicitly so this holds regardless of how the
# process was started (plain `uvicorn main:app` or `--reload`).
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

# backend/main.py is meant to be run two ways: `uvicorn backend.main:app`
# from the project root, or `uvicorn main:app` from inside backend/ itself.
# The second form needs the project root on sys.path before any `from
# backend...` import below runs, since Python then loads this file as the
# top-level module "main", not as part of the "backend" package.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

import json  # noqa: E402
import time  # noqa: E402
import uuid  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import StreamingResponse  # noqa: E402
from contextlib import asynccontextmanager  # noqa: E402

from backend.agent_runtime import RunDeps, run_agent  # noqa: E402
from backend.browser import browser_page  # noqa: E402
from backend.brokers import MANUAL_DISCOVERY_BROKERS, MANUAL_OPTOUT_BROKERS, REGISTRY  # noqa: E402
from backend.db import (  # noqa: E402
    average_run_duration_seconds,
    create_run,
    finish_run,
    get_listing,
    get_listings_for_run,
    get_pending_confirmations,
    init_db,
    token_usage_summary,
    update_listing_status,
)
from backend.delegation import TEAM  # noqa: E402
from backend.discovery_agent import discover_manual_listing  # noqa: E402
from backend.event_queue import event_bus  # noqa: E402
from backend.models import (  # noqa: E402
    AgentName,
    BrokerName,
    ConfirmLinkRequest,
    ConfirmLinkResponse,
    Listing,
    ListingStatus,
    OptoutConfirmRequest,
    OptoutConfirmResponse,
    OptoutConfirmResult,
    StartRunRequest,
    TimingEstimate,
)
from backend.safety import DisallowedDomainError, assert_domain_allowed  # noqa: E402
import backend.team  # noqa: E402,F401 - builds and registers the 4 agents


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Data Broker Opt-Out Agents", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/healthz")
async def healthz() -> dict:
    return {"ok": True}


@app.get("/api/history")
async def history() -> dict:
    return {"runs": await token_usage_summary()}


@app.get("/api/brokers")
async def brokers() -> dict:
    return {"brokers": [broker.value for broker in REGISTRY]}


@app.post("/api/run")
async def start_run(request: StartRunRequest) -> dict:
    """Discovery only. This never submits an opt-out — it finds and saves
    candidate listings for a human to review via GET
    /api/runs/{run_id}/listings, then POST /api/optout-confirm with
    exactly the ones they confirm are really them."""

    run_id = uuid.uuid4().hex
    brokers_to_run = request.brokers or list(REGISTRY.keys())

    await create_run(run_id, request.person, brokers_to_run, time.time())

    # Manual-discovery brokers (Whitepages, BeenVerified) have nothing for
    # an LLM to decide — the "listing" is just whatever URL the user
    # already pasted in. Resolving these directly, before the agent ever
    # starts, saves a full tool-call round-trip (and its tokens) per
    # manual broker for zero loss of capability — see
    # discover_manual_listing()'s docstring.
    manual_brokers = [b for b in brokers_to_run if b in MANUAL_DISCOVERY_BROKERS]
    automated_brokers = [b for b in brokers_to_run if b not in MANUAL_DISCOVERY_BROKERS]

    summary_lines = [await discover_manual_listing(run_id, request.person, broker) for broker in manual_brokers]

    if automated_brokers:
        deps = RunDeps(run_id=run_id, current_agent=AgentName.ORCHESTRATOR, person=request.person)
        task = (
            "Find candidate listings (discovery only — no opt-outs) for brokers: "
            f"{', '.join(broker.value for broker in automated_brokers)}."
        )
        summary_lines.append(await run_agent(TEAM[AgentName.ORCHESTRATOR], AgentName.ORCHESTRATOR, task, deps))

    summary = "\n".join(summary_lines) if summary_lines else "No brokers selected."

    await finish_run(run_id, time.time())
    return {"run_id": run_id, "summary": summary}


@app.get("/api/runs/{run_id}/listings")
async def run_listings(run_id: str) -> dict:
    return {"listings": await get_listings_for_run(run_id)}


@app.get("/api/listings/pending")
async def pending_listings() -> dict:
    """Every listing still awaiting its broker's emailed confirmation
    link, across all past runs — so this stays visible and actionable
    even while the user starts a brand-new search in the meantime."""
    return {"listings": await get_pending_confirmations()}


@app.get("/api/timing")
async def timing() -> TimingEstimate:
    count, avg = await average_run_duration_seconds()
    return TimingEstimate(sample_count=count, avg_duration_seconds=avg)


@app.post("/api/optout-confirm")
async def optout_confirm(request: OptoutConfirmRequest) -> OptoutConfirmResponse:
    """The human has reviewed candidate listings and picked exactly which
    ones are really them — this is the only path that ever submits a real
    opt-out. Each confirmed listing gets its own direct optout-agent run
    (not routed through the orchestrator — there's no decision left for
    an LLM to make once the human has already named the exact listing)."""

    results: list[OptoutConfirmResult] = []
    for listing_id in request.listing_ids:
        row = await get_listing(listing_id)
        if row is None or row["run_id"] != request.run_id:
            continue
        listing = Listing(
            listing_id=row["listing_id"],
            broker=row["broker"],
            listing_url=row["listing_url"],
            matched_name=row["matched_name"],
            matched_city=row["matched_city"],
            matched_state=row["matched_state"],
            matched_phone=row["matched_phone"],
            confidence=row["confidence"],
        )

        if listing.broker in MANUAL_OPTOUT_BROKERS:
            # No automation happens here at all (see this broker's adapter
            # docstring) — spending an LLM call just to have it echo back
            # "do this yourself" wastes real tokens for zero work. Set the
            # status directly instead. The user should have already found
            # AND submitted the opt-out in one sitting during discovery
            # (see ManualStepCard's combined instructions); this just
            # reflects that back and hands off to the "I submitted" step
            # in the run dashboard for the final self-attestation.
            await update_listing_status(listing_id, ListingStatus.OPTOUT_NEEDS_MANUAL_STEP)
            detail = (
                "No automation runs for this broker — if you haven't already, submit the removal "
                "request yourself on the same listing, then check it off below."
            )
            submitted = False
        else:
            deps = RunDeps(run_id=request.run_id, current_agent=AgentName.OPTOUT, person=request.person)
            task = f"Submit an opt-out for this listing on {listing.broker.value}: {listing.model_dump_json()}"
            detail = await run_agent(TEAM[AgentName.OPTOUT], AgentName.OPTOUT, task, deps)

            updated = await get_listing(listing_id)
            submitted = bool(updated and updated["status"] == "optout_submitted")
        results.append(
            OptoutConfirmResult(
                listing_id=listing_id,
                broker=listing.broker,
                listing_url=listing.listing_url,
                submitted=submitted,
                detail=detail,
            )
        )

    return OptoutConfirmResponse(results=results)


@app.post("/api/confirm-link")
async def confirm_link(request: ConfirmLinkRequest) -> ConfirmLinkResponse:
    """The user pasted back a broker's emailed opt-out confirmation link
    so they never have to leave the app to finish it. We never read
    anyone's email for this — the human copies the link over themselves.
    We still refuse to visit it unless it actually resolves to that
    listing's own broker domain (see backend/safety.py) — a pasted link
    is still untrusted input."""

    row = await get_listing(request.listing_id)
    if row is None:
        return ConfirmLinkResponse(success=False, detail="No such listing.")

    broker = BrokerName(row["broker"])
    try:
        assert_domain_allowed(broker, request.confirmation_url)
    except DisallowedDomainError as exc:
        return ConfirmLinkResponse(
            success=False,
            detail=f"Refused to open this link — {exc} Paste the link exactly as it appeared in the email.",
        )

    async with browser_page(headless=True) as page:
        await page.goto(request.confirmation_url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(1500)
        page_title = await page.title()
        # The main heading is a far more reliable signal than scanning the
        # whole page body for words like "success" — marketing boilerplate
        # (testimonials, nav links) says that constantly and produced a
        # false positive in testing. A real confirmation page's own <h1>
        # saying "Confirmed" is much harder to trigger by accident.
        heading = ""
        for selector in ("h1", "h2"):
            locator = page.locator(selector).first
            if await locator.count() > 0:
                heading = (await locator.inner_text()).strip()
                if heading:
                    break

    confirmed_markers = ("confirm", "thank you", "removed", "complete", "success")
    looks_confirmed = any(marker in heading.lower() for marker in confirmed_markers)

    await update_listing_status(
        request.listing_id,
        ListingStatus.OPTOUT_CONFIRMED if looks_confirmed else ListingStatus.OPTOUT_SUBMITTED,
    )

    shown_heading = heading or page_title or "(no heading found on the page)"
    if looks_confirmed:
        return ConfirmLinkResponse(
            success=True,
            detail=f'Opened the link — the page\'s heading says "{shown_heading}", which looks like a confirmation.',
        )
    return ConfirmLinkResponse(
        success=False,
        detail=(
            f'Opened the link — the page\'s heading says "{shown_heading}". '
            "That doesn't clearly look like a confirmation; take a look yourself before assuming it worked."
        ),
    )


@app.post("/api/listings/{listing_id}/mark-confirmed")
async def mark_confirmed(listing_id: int) -> ConfirmLinkResponse:
    """The user says they already clicked the broker's confirmation email
    themselves and would rather just check it off than paste the link
    back in. We take their word for it — this is a self-attestation, not
    something we verify, which is exactly the point of offering it as a
    lighter-weight alternative to /api/confirm-link."""

    row = await get_listing(listing_id)
    if row is None:
        return ConfirmLinkResponse(success=False, detail="No such listing.")

    await update_listing_status(listing_id, ListingStatus.OPTOUT_CONFIRMED)
    return ConfirmLinkResponse(success=True, detail="Marked as confirmed.")


@app.post("/api/listings/{listing_id}/dismiss")
async def dismiss_listing(listing_id: int) -> ConfirmLinkResponse:
    """The user wants this listing off the Pending confirmations tab for
    good — e.g. they gave up on it or decided not to follow through. This
    only stops the app from tracking/showing it; it never undoes a real
    opt-out already filed with the broker."""

    row = await get_listing(listing_id)
    if row is None:
        return ConfirmLinkResponse(success=False, detail="No such listing.")

    await update_listing_status(listing_id, ListingStatus.DISMISSED)
    return ConfirmLinkResponse(success=True, detail="Dismissed.")


@app.post("/api/listings/{listing_id}/mark-optout-submitted")
async def mark_optout_submitted(listing_id: int) -> ConfirmLinkResponse:
    """Self-attestation for brokers with no automated opt-out (see
    MANUAL_OPTOUT_BROKERS) — the user already submitted the removal
    request themselves (ideally in the same sitting they found the
    listing, per the combined manual-step instructions) and is now
    checking it off. Moves the listing into the same "submitted,
    awaiting outcome" state an automated submission would, so it shows
    up in Pending confirmations and can later take a pasted confirmation
    link just like any other broker."""

    row = await get_listing(listing_id)
    if row is None:
        return ConfirmLinkResponse(success=False, detail="No such listing.")

    await update_listing_status(listing_id, ListingStatus.OPTOUT_SUBMITTED, optout_submitted_at=time.time())
    return ConfirmLinkResponse(success=True, detail="Marked as submitted.")


@app.post("/api/listings/{listing_id}/undo-confirm")
async def undo_confirm(listing_id: int) -> ConfirmLinkResponse:
    """Reverts a mistaken confirmation (link-based or manual) back to
    "submitted, awaiting confirmation" — the whole reason confirmed
    listings stay visible in the pending list instead of disappearing."""

    row = await get_listing(listing_id)
    if row is None:
        return ConfirmLinkResponse(success=False, detail="No such listing.")

    await update_listing_status(listing_id, ListingStatus.OPTOUT_SUBMITTED)
    return ConfirmLinkResponse(success=True, detail="Undone — back to awaiting confirmation.")


@app.get("/api/events")
async def events():
    """Server-Sent Events stream of every agent-loop step, live."""

    async def stream():
        queue = event_bus.subscribe()
        try:
            while True:
                event = await queue.get()
                yield f"data: {json.dumps(event.model_dump(mode='json'))}\n\n"
        finally:
            event_bus.unsubscribe(queue)

    return StreamingResponse(stream(), media_type="text/event-stream")
