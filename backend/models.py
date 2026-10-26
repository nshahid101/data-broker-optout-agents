"""Shared data types for the data-broker opt-out agent team.

Keeping these in one place is what lets the queue, the agents, the
broker adapters, and the frontend all agree on the shape of a person,
a listing, and an event without importing from each other's modules.
"""

from __future__ import annotations

import time
import uuid
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class AgentName(str, Enum):
    ORCHESTRATOR = "orchestrator"
    DISCOVERY = "discovery"
    OPTOUT = "optout"
    VERIFY = "verify"


class BrokerName(str, Enum):
    """The 3 brokers this project actually targets, after live-testing 5
    candidates. MyLife and Radaris were dropped (MyLife fully blocks
    automated access; Radaris no longer exists — its domain was seized by
    NJ court order for Daniel's Law violations). Each broker here has a
    different automation profile — see each adapter module's docstring."""

    SPOKEO = "spokeo"
    WHITEPAGES = "whitepages"
    BEENVERIFIED = "beenverified"


class QueueEventType(str, Enum):
    AGENT_START = "agent_start"
    AGENT_OUTPUT = "agent_output"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    DELEGATION_START = "delegation_start"
    DELEGATION_END = "delegation_end"
    ERROR = "error"


class QueueEvent(BaseModel):
    """One step in any agent's loop. This is the unit the frontend streams."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    timestamp: float = Field(default_factory=time.time)
    event_type: QueueEventType
    agent: AgentName
    target_agent: AgentName | None = None
    tool_name: str | None = None
    input: Any = None
    output: Any = None
    duration_ms: float | None = None


class Person(BaseModel):
    """What a user submits about themself — self-service only, never a
    third party's info, per this project's input-data decision.

    known_listing_urls covers brokers whose search is bot-blocked (see
    BrokerName docstring): the user finds their own listing in their own
    regular browser (a real human session, not automation) and pastes it
    here. Brokers not listed here are discovered automatically instead.
    Each broker maps to a list, not a single URL — a user may find more
    than one candidate listing on a given manual-discovery broker, and
    every one gets its own Listing row for human review, same as an
    automated broker's multiple search results.

    email is optional here, not just on the frontend: it's only ever used
    as contact_email for an automated opt-out submission (see
    optout_agent.py) — a run that only targets brokers in
    MANUAL_OPTOUT_BROKERS never reads this field at all.
    """

    full_name: str
    city: str
    state: str
    phone: str | None = None
    email: str | None = None
    known_listing_urls: dict[BrokerName, list[str]] = Field(default_factory=dict)


class ListingStatus(str, Enum):
    FOUND = "found"
    OPTOUT_SUBMITTED = "optout_submitted"
    OPTOUT_NEEDS_MANUAL_STEP = "optout_needs_manual_step"  # CAPTCHA/Cloudflare-style
    OPTOUT_FAILED = "optout_failed"
    OPTOUT_CONFIRMED = "optout_confirmed"  # user pasted back the broker's emailed confirmation link
    VERIFIED_REMOVED = "verified_removed"
    VERIFIED_STILL_PRESENT = "verified_still_present"
    DISMISSED = "dismissed"  # user chose to stop tracking this from the Pending tab


class Listing(BaseModel):
    """A candidate match found on one broker site. Always produced by
    structured extraction — never raw page text — so scraped content is
    treated as data, not instructions (see Safety: prompt-injection guard).

    related_listing_urls covers e.g. AnyWho, a Spokeo-affiliated site (its
    Privacy Policy redirects to spokeo.com/privacy) — the verify agent
    re-checks these too after a Spokeo opt-out, as bonus impact evidence
    that one action cleared more than one surface, without them being a
    broker of their own with a separate search/optout flow.
    """

    listing_id: int | None = None  # set once saved to the db; None for a fresh, unsaved Listing
    broker: BrokerName
    listing_url: str
    matched_name: str
    matched_city: str | None = None
    matched_state: str | None = None
    matched_phone: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    status: ListingStatus = ListingStatus.FOUND
    related_listing_urls: list[str] = Field(default_factory=list)


class TokenUsageRecord(BaseModel):
    run_id: str
    agent: AgentName
    broker: BrokerName | None = None
    model: str
    input_tokens: int
    cached_input_tokens: int = 0
    output_tokens: int


class StartRunRequest(BaseModel):
    person: Person
    brokers: list[BrokerName] | None = None  # None => all configured brokers


class RunSummary(BaseModel):
    run_id: str
    person: Person
    brokers: list[BrokerName]
    started_at: float


class OptoutConfirmRequest(BaseModel):
    """A human has reviewed the candidate listings for a run and picked
    exactly which ones are really them — only these get a real opt-out
    attempt. Submitting an opt-out is a real-world action, so this
    project never lets an agent decide that on its own (see
    discovery_agent.md / optout_agent.md)."""

    run_id: str
    person: Person
    listing_ids: list[int]


class OptoutConfirmResult(BaseModel):
    listing_id: int
    broker: BrokerName
    listing_url: str
    submitted: bool
    detail: str


class OptoutConfirmResponse(BaseModel):
    results: list[OptoutConfirmResult]


class TimingEstimate(BaseModel):
    sample_count: int
    avg_duration_seconds: float | None


class ConfirmLinkRequest(BaseModel):
    """The user pasted back a broker's emailed opt-out confirmation link —
    we never read anyone's inbox for this; the human copies it over
    themselves. We still only ever visit it if it resolves to that exact
    broker's own domain (see backend/safety.py)."""

    listing_id: int
    confirmation_url: str


class ConfirmLinkResponse(BaseModel):
    success: bool
    detail: str
