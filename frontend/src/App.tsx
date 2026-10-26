import { useEffect, useRef, useState } from "react";
import "./App.css";
import {
  confirmOptout,
  fetchHistory,
  fetchPendingConfirmations,
  fetchRunListings,
  fetchTiming,
  startRun,
} from "./api";
import { CopyButton } from "./components/CopyButton";
import { CostPanel } from "./components/CostPanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { ListingPicker } from "./components/ListingPicker";
import { PendingConfirmations } from "./components/PendingConfirmations";
import { PersonForm } from "./components/PersonForm";
import { RunDashboard } from "./components/RunDashboard";
import { SpokeoEmailHelp } from "./components/SpokeoEmailHelp";
import { WelcomeEyes } from "./components/WelcomeEyes";
import { WhitepagesCallHelp } from "./components/WhitepagesCallHelp";
import { useEventStream } from "./useEventStream";
import { BROKER_LABELS, BROKER_OPTOUT_URLS } from "./types";
import type {
  BrokerName,
  ListingRow,
  OptoutConfirmResult,
  Person,
  QueueEvent,
  RunHistoryEntry,
  TimingEstimate,
} from "./types";

interface OptoutResultItem {
  name: string;
  url: string;
}

interface OptoutResultGroup {
  broker: BrokerName;
  detail: string;
  items: OptoutResultItem[];
  submitted: boolean;
}

/** Strips any raw URL out of agent-written text. The listing's own URL
 * (and any broker wizard URL) is always shown separately in its own
 * copyable box right below — an LLM's prose can't be trusted to leave
 * URLs out on its own (confirmed live: it kept re-embedding one despite
 * being told not to), so this makes it a hard guarantee instead of a
 * suggestion. */
function stripUrls(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,:;])/g, "$1")
    .trim()
    .replace(/[:,;-]+$/, "")
    .trim();
}

/** Collapses identical outcomes into one line (naming every listing it
 * applies to) and keeps differing outcomes as separate lines, each
 * naming exactly which listing it's about — so picking several
 * candidates never produces repeated, undifferentiated text. Each
 * listing's URL travels with its name so it can be called out as its own
 * copyable line instead of being buried inside the detail prose. */
function groupOptoutResults(results: OptoutConfirmResult[], listings: ListingRow[]): OptoutResultGroup[] {
  const nameById = new Map(listings.map((l) => [l.listing_id, l.matched_name]));
  const order: string[] = [];
  const groups = new Map<string, OptoutResultGroup>();

  for (const r of results) {
    const key = `${r.broker}::${r.detail}`;
    const name = nameById.get(r.listing_id) ?? `listing #${r.listing_id}`;
    if (!groups.has(key)) {
      groups.set(key, { broker: r.broker, detail: stripUrls(r.detail), items: [], submitted: r.submitted });
      order.push(key);
    }
    groups.get(key)!.items.push({ name, url: r.listing_url });
  }

  return order.map((key) => groups.get(key)!);
}

export default function App() {
  const [events, setEvents] = useState<QueueEvent[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [activeBrokers, setActiveBrokers] = useState<BrokerName[]>([]);
  const [history, setHistory] = useState<RunHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [introDone, setIntroDone] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [lastPerson, setLastPerson] = useState<Person | null>(null);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [optoutResults, setOptoutResults] = useState<OptoutConfirmResult[] | null>(null);
  const [timing, setTiming] = useState<TimingEstimate | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [pendingListings, setPendingListings] = useState<ListingRow[]>([]);
  const [activeTab, setActiveTab] = useState<"run" | "pending">("run");
  const [formResetKey, setFormResetKey] = useState(0);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const { connected } = useEventStream((event) => {
    setEvents((prev) => [...prev, event]);
  });

  const loadHistory = () => {
    fetchHistory()
      .then((res) => setHistory(res.runs))
      .catch(() => {
        /* history is best-effort; ignore if backend isn't up yet */
      });
  };

  const refreshPending = () => {
    fetchPendingConfirmations()
      .then((res) => setPendingListings(res.listings))
      .catch(() => {
        /* best-effort; ignore if backend isn't up yet */
      });
  };

  useEffect(() => {
    loadHistory();
    refreshPending();
    fetchTiming()
      .then(setTiming)
      .catch(() => {
        /* timing estimate is best-effort too */
      });
  }, []);

  const runningNow = submitting || confirming;

  useEffect(() => {
    if (runningNow) {
      setElapsedSeconds(0);
      elapsedTimer.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    } else if (elapsedTimer.current) {
      clearInterval(elapsedTimer.current);
      elapsedTimer.current = null;
    }
    return () => {
      if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningNow]);

  const handleSubmit = async (person: Person, brokers: BrokerName[]) => {
    setSubmitting(true);
    setError(null);
    setSummary(null);
    setEvents([]);
    setListings([]);
    setOptoutResults(null);
    setActiveBrokers(brokers);
    setLastPerson(person);
    try {
      const result = await startRun({ person, brokers });
      setRunId(result.run_id);
      setSummary(result.summary);
      const { listings: found } = await fetchRunListings(result.run_id);
      setListings(found);
      loadHistory();
      fetchTiming().then(setTiming).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const refreshListings = async () => {
    if (!runId) return;
    const { listings: refreshed } = await fetchRunListings(runId);
    setListings(refreshed);
    refreshPending();
  };

  /** Clears everything about the current search (form fields, saved manual
   * URLs, live run log, discovered listings, opt-out results) so the user
   * can start completely fresh — this never touches already-submitted
   * opt-outs or the Pending confirmations tab, only the in-progress "Run a
   * removal" workspace. Bumping formResetKey remounts PersonForm, which
   * is the simplest way to clear its own internal field/URL/broker-pick
   * state without lifting all of that up into App. */
  const handleResetSearch = () => {
    setSubmitting(false);
    setConfirming(false);
    setEvents([]);
    setSummary(null);
    setActiveBrokers([]);
    setError(null);
    setRunId(null);
    setLastPerson(null);
    setListings([]);
    setOptoutResults(null);
    setFormResetKey((k) => k + 1);
  };

  const handleConfirmOptout = async (listingIds: number[]) => {
    if (!runId || !lastPerson) return;
    setConfirming(true);
    setError(null);
    try {
      const result = await confirmOptout({ run_id: runId, person: lastPerson, listing_ids: listingIds });
      setOptoutResults(result.results);
      await refreshListings();
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="app">
      <div className={`intro-overlay ${introDone ? "intro-overlay--hidden" : ""}`}>
        <div className="intro-overlay__stage">
          <WelcomeEyes onDone={() => setIntroDone(true)} />
        </div>
        <button className="intro-overlay__skip" onClick={() => setIntroDone(true)}>
          Skip
        </button>
      </div>

      <section className="band band--hero">
        <header className="app__header">
          <svg className="app__logo" viewBox="0 0 320 140" aria-hidden="true">
            <g>
              <path
                d="M 20 70 Q 80 30 148 68 Q 80 85 20 70 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="7"
                strokeLinejoin="round"
              />
              <circle cx="95" cy="63" r="13" fill="currentColor" />
              <rect className="app__logo-lid" x="14" y="28" width="140" height="46" />
            </g>
            <path d="M160 50 L166 64 L180 70 L166 76 L160 90 L154 76 L140 70 L154 64 Z" fill="var(--accent)" />
            <g>
              <path
                d="M 300 70 Q 240 30 172 68 Q 240 85 300 70 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="7"
                strokeLinejoin="round"
              />
              <circle cx="225" cy="63" r="13" fill="currentColor" />
              <rect className="app__logo-lid" x="166" y="28" width="140" height="46" />
            </g>
          </svg>
          <h1>Data Broker Opt-Out Agents</h1>
          <p>Find, opt out of, and verify removal from people-search sites — transparently.</p>
        </header>
      </section>

      <div className="marquee">
        <div className="marquee__track">
          <span>DISCOVER&nbsp;·&nbsp;OPT-OUT&nbsp;·&nbsp;VERIFY&nbsp;·&nbsp;REPEAT&nbsp;·&nbsp;</span>
          <span>DISCOVER&nbsp;·&nbsp;OPT-OUT&nbsp;·&nbsp;VERIFY&nbsp;·&nbsp;REPEAT&nbsp;·&nbsp;</span>
        </div>
      </div>

      <section className="band band--vision">
        <div className="band__inner band__inner--narrow">
          <span className="mono-label">Vision</span>
          <p className="band__statement">
            Data brokers turn your name, number, and address into a product sold to anyone who'll
            pay — and scam calls are just the part you notice. This tool exists to make removal a
            solved problem, not a part-time job: it searches where it legally can, surfaces what it
            finds for you to confirm, and files opt-outs only once you say so.
          </p>
        </div>
      </section>

      <section className="band band--tool">
        <div className="band__inner">
          <span className="mono-label">Get started</span>
          <div className="tool-tabs">
            <button
              type="button"
              className={`tool-tabs__tab ${activeTab === "run" ? "tool-tabs__tab--active" : ""}`}
              onClick={() => setActiveTab("run")}
            >
              Run a removal
            </button>
            <button
              type="button"
              className={`tool-tabs__tab ${activeTab === "pending" ? "tool-tabs__tab--active" : ""}`}
              onClick={() => setActiveTab("pending")}
            >
              Pending confirmations{pendingListings.length > 0 ? ` (${pendingListings.length})` : ""}
            </button>
          </div>

          {activeTab === "pending" && (
            <PendingConfirmations listings={pendingListings} onRefresh={refreshPending} />
          )}

          {activeTab === "run" && (
          <>
            {(runId || listings.length > 0 || optoutResults || runningNow) && (
              <div className="run-reset-row">
                <button
                  type="button"
                  className="run-reset-row__btn"
                  disabled={runningNow}
                  onClick={handleResetSearch}
                >
                  Reset search
                </button>
              </div>
            )}
          <main className="app__main">
            <section className="app__column">
              <PersonForm key={formResetKey} onSubmit={handleSubmit} submitting={submitting} />
            </section>

            <section className="app__column app__column--dashboard">
              {error && <div className="alert">{error}</div>}
              <RunDashboard
                events={events}
                summary={summary}
                brokers={activeBrokers}
                connected={connected}
                running={runningNow}
                elapsedSeconds={elapsedSeconds}
                timing={timing}
                beenverifiedListingUrl={listings.find((l) => l.broker === "beenverified")?.listing_url}
                beenverifiedListingId={listings.find((l) => l.broker === "beenverified")?.listing_id}
                onBeenverifiedMarkedSubmitted={refreshListings}
              />
              {listings.length > 0 && (
                <ListingPicker
                  listings={listings}
                  brokers={activeBrokers}
                  onConfirm={handleConfirmOptout}
                  confirming={confirming}
                  onLinkConfirmed={refreshListings}
                />
              )}
              {optoutResults && (
                <div className="run-dashboard__summary">
                  <h3>Opt-out results</h3>
                  {groupOptoutResults(optoutResults, listings).map((g, i) => (
                    <div key={i} className="optout-result">
                      <p>
                        <strong>
                          {BROKER_LABELS[g.broker]} — {g.items.map((it) => it.name).join(", ")}:
                        </strong>{" "}
                        {g.detail}
                        {!g.submitted && (
                          <>
                            {" "}
                            <a href={BROKER_OPTOUT_URLS[g.broker]} target="_blank" rel="noreferrer">
                              Finish it here &rarr;
                            </a>
                          </>
                        )}
                      </p>
                      <ul className="optout-result__listings">
                        {g.items.map((it, j) => (
                          <li key={j} className="optout-result__listing">
                            <span className="optout-result__listing-label">
                              {g.items.length > 1 ? it.name : "Listing"}
                            </span>
                            <code className="optout-result__listing-url">{it.url}</code>
                            <CopyButton text={it.url} label="Copy listing URL" />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              {optoutResults && activeBrokers.includes("spokeo") && <SpokeoEmailHelp />}
              {optoutResults && activeBrokers.includes("whitepages") && <WhitepagesCallHelp />}
            </section>
          </main>
          </>
          )}
        </div>
      </section>

      <div className="marquee marquee--reverse">
        <div className="marquee__track">
          <span>FULL AUTOMATION&nbsp;·&nbsp;PARTIAL AUTOMATION&nbsp;·&nbsp;MANUAL + VERIFY&nbsp;·&nbsp;</span>
          <span>FULL AUTOMATION&nbsp;·&nbsp;PARTIAL AUTOMATION&nbsp;·&nbsp;MANUAL + VERIFY&nbsp;·&nbsp;</span>
        </div>
      </div>

      <section className="band band--data">
        <div className="band__inner">
          <span className="mono-label">Tokenomics &amp; history</span>
          <h2 className="band__title">What it costs, in the open</h2>
          <div className="app__footer">
            <CostPanel runs={history} />
            <HistoryPanel runs={history} />
          </div>
        </div>
      </section>

      <footer className="app__bottom-footer">
        <p className="mono-label">Built for AI Foundations — Final Project</p>
      </footer>
    </div>
  );
}
