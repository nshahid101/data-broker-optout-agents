"""Safety controls that are actually enforced in code (not just
described), to back the report's safety section with real evidence.

1. Domain allowlist — an opt-out action can never execute against a
   site other than the exact broker it was intended for.
2. Prompt-injection guard — flags scraped text that looks like it's
   trying to issue instructions, so it can be logged/blocked rather
   than silently trusted. The primary defense is structural (the
   discovery agent's tools return validated `Listing` models, never
   raw page text, so there's nothing for an agent to "follow" in the
   first place) — this is a secondary, defense-in-depth check on the
   raw text before it's even handed to extraction.
3. Overspending / runaway loops — see backend/agent_runtime.py's
   DEFAULT_USAGE_LIMITS, enforced by pydantic-ai itself.
"""

from __future__ import annotations

from urllib.parse import urlparse

from backend.models import BrokerName

# The only domain each broker's opt-out tool is allowed to act against.
ALLOWED_DOMAINS: dict[BrokerName, str] = {
    BrokerName.SPOKEO: "spokeo.com",
    BrokerName.WHITEPAGES: "whitepages.com",
    BrokerName.BEENVERIFIED: "beenverified.com",
}

# AnyWho (anywho.com) is Spokeo-affiliated (its Privacy Policy redirects to
# spokeo.com/privacy) and is only ever used as a secondary verification
# target after a Spokeo opt-out — never a submit_optout() target itself,
# so it has no entry above.


class DisallowedDomainError(Exception):
    """Raised when a broker adapter is about to act on a URL outside its
    allowlisted domain — the agent cannot be steered into submitting a
    form on an unintended site."""


def assert_domain_allowed(broker: BrokerName, url: str) -> None:
    expected = ALLOWED_DOMAINS[broker]
    host = urlparse(url).netloc.lower()
    if not (host == expected or host.endswith(f".{expected}")):
        raise DisallowedDomainError(
            f"Refusing to act on {url!r} for broker {broker.value}: "
            f"host {host!r} is not under the allowlisted domain {expected!r}."
        )


# Phrases that indicate scraped page text is trying to issue instructions
# to the model, rather than just being a person's listing data.
_INJECTION_MARKERS = (
    "ignore previous instructions",
    "ignore all previous instructions",
    "disregard the above",
    "system prompt",
    "you are now",
    "new instructions:",
)


def flag_possible_injection(raw_text: str) -> list[str]:
    """Return which injection markers were found in raw scraped text, if
    any. An empty list means nothing suspicious was found. This never
    blocks extraction by itself — the structural defense (schema-only
    output) is what actually prevents the agent from acting on it — but
    a non-empty result should be logged for the safety audit trail."""

    lowered = raw_text.lower()
    return [marker for marker in _INJECTION_MARKERS if marker in lowered]
