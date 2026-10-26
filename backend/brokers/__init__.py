"""One adapter module per broker (spokeo.py, whitepages.py, ...), each
implementing the BrokerAdapter protocol in base.py. Registered in
REGISTRY below once a given broker's adapter is actually implemented —
brokers not yet in REGISTRY are simply not runnable yet.
"""

from __future__ import annotations

from backend.brokers import beenverified, spokeo, whitepages
from backend.brokers.base import BrokerAdapter
from backend.models import BrokerName

REGISTRY: dict[BrokerName, BrokerAdapter] = {
    BrokerName.SPOKEO: spokeo,
    BrokerName.WHITEPAGES: whitepages,
    BrokerName.BEENVERIFIED: beenverified,
}

# Brokers whose discovery step can't be automated (see each adapter's
# docstring) — the orchestrator/discovery_agent must get a URL from
# Person.known_listing_urls for these instead of calling search().
MANUAL_DISCOVERY_BROKERS = {BrokerName.WHITEPAGES, BrokerName.BEENVERIFIED}

# Brokers whose opt-out submission can't be automated (bot/Cloudflare
# gated) — the orchestrator/optout_agent must direct the user to do this
# step themselves instead of calling submit_optout().
MANUAL_OPTOUT_BROKERS = {BrokerName.BEENVERIFIED}
