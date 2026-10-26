# Data Broker Opt-Out Agents — Final Project

A multi-agent Pydantic AI system that finds a person's own listings on real
data-broker (people-search) sites, reviews them with a human before
anything happens, files real opt-out requests, and later verifies the
listing is actually gone — built to be transparent about what it did and
why, unlike black-box commercial removal services (DeleteMe, Incogni,
Optery).

**Brokers covered:** Spokeo (fully automated: search, opt-out, verify),
Whitepages (you paste your own profile URL; the agent files and verifies
the opt-out), BeenVerified (fully manual find-and-opt-out; the agent only
verifies removal later). This asymmetry is deliberate and documented —
see `report.html`'s "Limits" section for why.

## Project layout

```
Final Project/
├── AI_prompts.md              # log of prompts used while building this, per phase
├── requirements.txt            # backend Python dependencies
├── .env.example                  # copy to .env and fill in your real PORTKEY_API_KEY
├── README.md
├── data/                          # app.db (sqlite) — created automatically on first run
├── output/
│   ├── audit_trail.json           # append-only log of every agent step from every run
│   └── safety_tests/                # saved PASS/FAIL output from the 3 safety demos below
├── backend/
│   ├── main.py                       # FastAPI app — all HTTP/SSE endpoints
│   ├── portkey_config.py              # get_model(): PORTKEY_API_KEY + gpt-6-luna only
│   ├── models.py                       # shared Pydantic models (Person, Listing, events, ...)
│   ├── db.py                            # sqlite schema: runs, listings, token_usage
│   ├── safety.py                         # domain allowlist + prompt-injection marker guard
│   ├── browser.py                         # shared Playwright page helper + rate limiting
│   ├── agent_runtime.py                    # shared RunDeps + run_agent() (usage limits, token logging)
│   ├── event_queue.py                       # SSE event bus
│   ├── audit.py                              # append-only output/audit_trail.json writer
│   ├── delegation.py                          # the `delegate` tool agents use to hand off steps
│   ├── discovery_agent.py, optout_agent.py,
│   │   orchestrator (via team.py)              # the 3 non-verify agents
│   ├── prompts/                                 # one system-prompt .md file per agent
│   ├── safety_demos/                             # standalone, runnable safety-defense demos (see below)
│   └── brokers/
│       ├── base.py                                 # BrokerAdapter protocol every broker implements
│       └── spokeo.py, whitepages.py, beenverified.py
└── frontend/                   # Vite + React + TypeScript dashboard
    └── src/components/           # PersonForm, RunDashboard, ListingPicker, PendingConfirmations, ...
```

## Prerequisites

- Python 3.11+
- Node.js 18+ and npm
- A Portkey API key with access to `gpt-6-luna` (the only model this project uses)

## 1. Set up the Python backend

From this folder (`Final Project/`):

```bash
python -m venv .venv
.venv\Scripts\activate       # Windows
# source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
playwright install chromium
```

## 2. Set up the frontend

```bash
cd frontend
npm install
cd ..
```

If `npm run dev` later fails with something like "An Application Control
policy has blocked this file" (a native binary load error), it's almost
certainly unrelated to this project — reinstall cleanly
(`rm -rf node_modules package-lock.json && npm install`); `vite` is
already pinned in `package.json` to a version that avoids this on Windows.

## 3. Configure your API key

```bash
cp .env.example .env
```

Edit `.env` and set `PORTKEY_API_KEY` to your real Portkey API key.

**Note for graders/teaching staff:** if this repo was cloned into a shared
`submissions/` folder alongside other students' projects, you can instead
place one `.env` file in `submissions/` itself (one level above this
repo) with your own `PORTKEY_API_KEY` — `backend/portkey_config.py` checks
this project's own folder first, then falls back to the parent folder, so
either location works without editing any code.

`DRY_RUN_OPTOUT` in `.env.example` defaults to `true` — leave it that way
for routine testing. The opt-out agent will report exactly what it *would*
submit without actually sending anything to the live broker site. Only set
it to `false` for an intentional, real opt-out run against your own real
information.

## 4. Run the backend

```bash
cd backend
uvicorn main:app --port 8010
```

**Do not add `--reload`.** On Windows, uvicorn's `--reload` supervisor runs
the worker under a different asyncio event loop policy that can't spawn
subprocesses — which breaks every Playwright browser automation call in
this project. See `backend/main.py`'s top docstring for the full
explanation.

Confirm it's up: `GET http://localhost:8010/api/healthz` should return
`{"ok": true}`.

## 5. Run the frontend

In a second terminal:

```bash
cd frontend
npm run dev
```

Open the URL it prints (typically `http://localhost:5173`).

## Using the app

1. Enter your own name, city, and state (self-service only — this tool
   never looks up anyone but you). Email is only required if you've
   selected Spokeo and/or Whitepages (their opt-out confirmation emails
   need somewhere to go); BeenVerified-only runs don't need it.
2. Pick which brokers to run. For Whitepages/BeenVerified, follow the
   "Quick manual step" card's instructions to find your own listing in
   your own browser (their search pages are bot-walled) and paste the
   URL back in — every candidate you save shows up for review, exactly
   like an automated broker's search results would.
3. Click **Find my listings**. Nothing is submitted yet — this step only
   discovers and saves candidates for you to review.
4. Under "Review what was found," check the listing(s) that are actually
   you, then click **Submit opt-out for selected**. This is the only
   action that ever files a real opt-out, and only for exactly the
   listings you checked.
5. Some brokers need one more manual step from you afterward (Whitepages'
   phone-verification call, BeenVerified's own opt-out form, Spokeo's
   confirmation email) — the dashboard surfaces what to do next, including
   known broker-side friction points (e.g. "Didn't get the verification
   call?").
6. The **Pending confirmations** tab tracks anything still waiting on a
   broker's confirmation link, independent of whatever search is
   currently on screen — you can paste a confirmation link back into the
   app once it arrives, or self-attest that you already clicked it.

## Running the safety demos

Three standalone scripts back up the report's safety section with real,
re-runnable evidence (not just description) — each prints a clear
PASS/FAIL and explains what it checked. Run from `Final Project/` with the
venv active and `PORTKEY_API_KEY` set (the domain-allowlist demo needs
neither):

```bash
python -m backend.safety_demos.demo_prompt_injection
python -m backend.safety_demos.demo_usage_limit
python -m backend.safety_demos.demo_domain_allowlist
```

Saved output from the last run of each lives in `output/safety_tests/`.

## Safety controls actually enforced in code

1. **Domain allowlist** (`backend/safety.py`) — every broker adapter
   checks the exact URL it's about to act on resolves to that broker's
   own allowlisted domain before doing anything, so an agent (or a
   user-pasted confirmation link) can never be steered into acting on an
   unintended site.
2. **Structural prompt-injection defense** — the discovery agent never
   sees raw scraped page text; broker adapters parse it into a validated
   `Listing` Pydantic model first, so there's nothing free-form for a
   model to "read as instructions." A secondary marker-based detector
   (`flag_possible_injection`) flags suspicious phrases for logging.
3. **Overspending / runaway-loop protection** — every agent run is capped
   by a `UsageLimits` budget (`backend/agent_runtime.py`), enforced by
   pydantic-ai itself; exceeding it halts the run cleanly instead of
   looping or spending unbounded.
4. **Human-in-the-loop for every real-world action** — discovery only
   ever finds and saves candidates; submitting an opt-out requires an
   explicit, separate confirmation naming the exact listing. No agent
   ever decides on its own which listing "is" the user.

## Known limits

- Whitepages and BeenVerified's own search pages are bot-walled (confirmed
  live) — this project never attempts to defeat bot/CAPTCHA detection, so
  discovery for those two is manual by design, not an oversight.
- Whitepages' automated opt-out wizard's generic fill-and-click steps
  (steps 2-5) haven't been verified against every real listing's exact
  flow — it may report "unrecognized state" and hand off to a manual
  finish, which the dashboard surfaces with a direct link.
- BeenVerified's opt-out tool is Cloudflare-gated; this is never bypassed.
- Two other broker candidates (TruePeopleSearch, FastPeopleSearch) were
  investigated and are not included — see `AI_prompts.md` for findings.
