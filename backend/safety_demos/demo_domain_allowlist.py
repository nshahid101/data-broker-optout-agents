"""Safety demo 3/3: domain allowlist.

Every broker adapter's submit_optout()/check_removed() calls
assert_domain_allowed() before touching the page (see
backend/brokers/spokeo.py, whitepages.py, beenverified.py) and
POST /api/confirm-link does the same for a user-pasted confirmation link
(backend/main.py). This demo calls the real check function directly
against both a legitimate URL and a spoofed/wrong-domain one, proving an
agent (or a malicious pasted link) can never be steered into acting on an
unintended site.

Run with: python -m backend.safety_demos.demo_domain_allowlist
(from the Final Project/ directory — no API key or network needed, this
is pure local logic)
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.models import BrokerName  # noqa: E402
from backend.safety import DisallowedDomainError, assert_domain_allowed  # noqa: E402

CASES = [
    # (broker, url, expected_to_be_allowed)
    (BrokerName.SPOKEO, "https://www.spokeo.com/p123456789", True),
    (BrokerName.SPOKEO, "https://spokeo.com/p123456789", True),  # bare domain, no www
    (BrokerName.WHITEPAGES, "https://www.whitepages.com/name/Jane-Doe/Austin-TX/Pabc123", True),
    (BrokerName.BEENVERIFIED, "https://www.beenverified.com/f/optout/search", True),
    # Attacks: an agent (or a user pasting a malicious confirmation link)
    # being steered toward the wrong domain entirely.
    (BrokerName.SPOKEO, "https://www.evil-phishing-site.com/fake-spokeo-optout", False),
    (BrokerName.SPOKEO, "https://spokeo.com.evil-phishing-site.com/optout", False),  # lookalike subdomain trick
    (BrokerName.WHITEPAGES, "https://www.spokeo.com/p123456789", False),  # right broker family, wrong broker
    (BrokerName.BEENVERIFIED, "javascript:alert(1)", False),
]


def main() -> int:
    print("=" * 70)
    print("SAFETY DEMO: domain allowlist")
    print("=" * 70)

    all_passed = True
    for broker, url, expected_allowed in CASES:
        try:
            assert_domain_allowed(broker, url)
            actually_allowed = True
            detail = "allowed"
        except DisallowedDomainError as exc:
            actually_allowed = False
            detail = f"blocked: {exc}"

        ok = actually_allowed == expected_allowed
        all_passed = all_passed and ok
        status = "PASS" if ok else "FAIL"
        print(f"\n[{status}] broker={broker.value:<14} url={url!r}")
        print(f"       expected_allowed={expected_allowed}  actual_allowed={actually_allowed}")
        print(f"       {detail}")

    print("\n" + "=" * 70)
    print(f"RESULT: {'PASS' if all_passed else 'FAIL'} ({len(CASES)} cases)")
    print("=" * 70)
    return 0 if all_passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
