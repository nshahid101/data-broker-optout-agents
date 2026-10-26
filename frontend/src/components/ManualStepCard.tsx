import { useState } from "react";
import { markOptoutSubmitted } from "../api";
import {
  BROKER_LABELS,
  BROKER_OPTOUT_URLS,
  BROKER_SEARCH_URLS,
  type BrokerName,
} from "../types";

interface Props {
  broker: BrokerName;
  kind: "discovery" | "optout";
  /** Only used for kind="discovery" — lets the user paste back a listing
   * URL they found, so it flows straight into the person form. Can be
   * called more than once: if they find several listings that might be
   * them, each Save adds another candidate rather than replacing the
   * last one. */
  onUrlSaved?: (url: string) => void;
  /** Every URL saved so far for this broker, shown as a running list so
   * it's clear multiple candidates were kept, not just the most recent. */
  savedUrls?: string[];
  /** Disables Save while a run triggered by this (or another) manual step
   * is already in flight, so a second click can't kick off an overlapping
   * run. */
  saving?: boolean;
  /** For kind="optout" on a broker whose discovery step already found the
   * user's exact listing URL (e.g. BeenVerified) — lets the opt-out step
   * link straight to that listing instead of a generic search tool, so
   * the user never has to search for themselves twice. */
  knownUrl?: string;
  /** For kind="optout" — the listing this manual step applies to. Checking
   * "I submitted" calls mark-optout-submitted for this id, which is what
   * actually moves it into Pending confirmations; without it the checkbox
   * would just be decorative. */
  listingId?: number;
  /** Called after a successful mark-optout-submitted, so the parent can
   * refresh listings/pending state. */
  onMarkedSubmitted?: () => void;
}

const DISCOVERY_STEPS: Record<BrokerName, string[]> = {
  spokeo: [],
  whitepages: [
    "Click the button below — it opens Whitepages' People Search in a new tab.",
    "Search your own name and city/state, then click into an individual result — not the search results list itself.",
    "Check the address bar: a real profile URL ends with a unique ID, like .../City-ST/Pbcd12345ef — not a search query like ?fs=1&searchedName=.... Copy that profile URL, not the search page's.",
    "Not sure which one is really you? Save every candidate profile you find, one at a time, and you'll get to pick the right one (or none) later.",
  ],
  beenverified: [
    "Click the button below — it opens BeenVerified's free opt-out search tool directly (not their homepage search, which pushes you toward a paid report and an email signup — you don't need either).",
    "Search your own name. No account, payment, or email required for this tool.",
    "Find your listing in the results, and right there in the same visit, submit the removal request — do it now rather than coming back later, since these results links can expire.",
    "Copy that listing's URL and paste it in the box below so this app can track it and verify removal later.",
  ],
};

const OPTOUT_STEPS_FOUND_LISTING: Record<BrokerName, string[]> = {
  spokeo: [],
  whitepages: [],
  beenverified: [
    "You should have already submitted this opt-out in the same visit you found your listing above.",
    "If you haven't yet, open your listing below and submit it now — do it before the link goes stale.",
    "Once it's done, check the box below to confirm.",
  ],
};

const OPTOUT_STEPS_NO_LISTING: Record<BrokerName, string[]> = {
  spokeo: [],
  whitepages: [],
  beenverified: [
    "Find your listing first in the discovery step above — once you've saved its URL there, this step will link straight to it.",
    "Click the button below, pass the quick security check if asked, and submit the removal request.",
    "Once it's done, check the box below to confirm.",
  ],
};

// Allowlist, not a blacklist: a real Whitepages profile URL has one
// specific shape — .../name/First-Last/City-ST/Pxxxxxxxxx — ending in a
// unique ID starting with "P". Checking for that shape directly (instead
// of trying to list every WRONG kind of URL one at a time) catches every
// variant users have actually hit: the search-results page
// (?fs=1&searchedName=...) and, confirmed live, Whitepages' own paid-report
// checkout page (/checkout/summary?wpId=...) that some searches funnel
// into instead of a free profile page. Any of these will make the
// automated wizard reject the request the same way — it's not a listing-
// specific fluke, it's the URL shape.
const WHITEPAGES_PROFILE_URL_RE = /\/name\/[^/?#]+\/[^/?#]+\/P[A-Za-z0-9]+(?:[/?#]|$)/i;

export function ManualStepCard({
  broker,
  kind,
  onUrlSaved,
  savedUrls,
  saving,
  knownUrl,
  listingId,
  onMarkedSubmitted,
}: Props) {
  const [draftUrl, setDraftUrl] = useState("");
  const [done, setDone] = useState(false);
  const [marking, setMarking] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [urlWarning, setUrlWarning] = useState<string | null>(null);

  const saveUrl = (url: string) => {
    setUrlWarning(null);
    onUrlSaved?.(url);
    setDraftUrl("");
  };

  const handleSaveClick = () => {
    if (broker === "whitepages" && draftUrl && !WHITEPAGES_PROFILE_URL_RE.test(draftUrl)) {
      setUrlWarning(
        "That doesn't look like an individual profile page — Whitepages needs the exact page for one " +
          "person (its URL ends with a unique ID, e.g. .../City-ST/Pbcd12345ef). This usually means " +
          "either a search-results link got pasted instead of a specific result, or Whitepages put this " +
          "listing behind a paid-report checkout page instead of showing it for free — in that second " +
          "case there's no free profile URL to use at all. Double-check what you clicked into, or paste " +
          "a different listing."
      );
      return;
    }
    saveUrl(draftUrl);
  };

  const handleMarkDone = async (checked: boolean) => {
    setDone(checked);
    if (!checked || !listingId) return;
    setMarking(true);
    try {
      await markOptoutSubmitted(listingId);
      onMarkedSubmitted?.();
    } finally {
      setMarking(false);
    }
  };
  const steps =
    kind === "discovery"
      ? DISCOVERY_STEPS[broker]
      : knownUrl
        ? OPTOUT_STEPS_FOUND_LISTING[broker]
        : OPTOUT_STEPS_NO_LISTING[broker];
  const targetUrl = kind === "discovery" ? BROKER_SEARCH_URLS[broker] : knownUrl || BROKER_OPTOUT_URLS[broker];

  return (
    <div className="manual-step-card">
      <button
        type="button"
        className="manual-step-card__header manual-step-card__header--toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="manual-step-card__badge">Quick manual step</span>
        <h4>
          {kind === "discovery" ? "Find your listing on" : "Submit your opt-out on"}{" "}
          {BROKER_LABELS[broker]}
        </h4>
        <span className="manual-step-card__chevron">{expanded ? "▴" : "▾"}</span>
      </button>

      {!expanded && (
        <p className="manual-step-card__collapsed-hint muted">
          {steps.length} steps — click to expand
        </p>
      )}

      {expanded && (
        <>
          <ol className="manual-step-card__steps">
            {steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <a className="btn btn--amber" href={targetUrl} target="_blank" rel="noreferrer">
            {kind === "optout" && knownUrl ? "Open your listing" : `Open ${BROKER_LABELS[broker]}`} &rarr;
          </a>
          <p className="manual-step-card__direct-link">
            Direct link: <a href={targetUrl} target="_blank" rel="noreferrer">{targetUrl}</a>
          </p>
          {kind === "optout" && knownUrl && (
            <p className="manual-step-card__direct-link">
              Link gone stale?{" "}
              <a href={BROKER_SEARCH_URLS[broker]} target="_blank" rel="noreferrer">
                Search again
              </a>{" "}
              to find it fresh — these results pages don't stay valid forever.
            </p>
          )}
        </>
      )}

      {kind === "discovery" && onUrlSaved && (
        <>
          {savedUrls && savedUrls.length > 0 && (
            <ul className="manual-step-card__saved-urls">
              {savedUrls.map((url, i) => (
                <li key={i}>
                  <a href={url} target="_blank" rel="noreferrer">
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <div className="manual-step-card__input-row">
            <input
              type="url"
              placeholder={
                savedUrls && savedUrls.length > 0 ? "Found another one? Paste it here" : "Paste your listing URL here"
              }
              value={draftUrl}
              onChange={(e) => {
                setDraftUrl(e.target.value);
                if (urlWarning) setUrlWarning(null);
              }}
            />
            <button type="button" className="btn btn--navy" disabled={!draftUrl || saving} onClick={handleSaveClick}>
              {saving ? "Starting..." : "Save"}
            </button>
          </div>
          {urlWarning && (
            <p className="manual-step-card__url-warning">
              {urlWarning}{" "}
              <button type="button" className="manual-step-card__save-anyway" onClick={() => saveUrl(draftUrl)}>
                Save anyway
              </button>
            </p>
          )}
        </>
      )}

      {kind === "optout" && (
        <label className="manual-step-card__checkbox">
          <input
            type="checkbox"
            checked={done}
            disabled={marking || !listingId}
            onChange={(e) => handleMarkDone(e.target.checked)}
          />
          {marking ? "Marking..." : "I submitted the opt-out request"}
        </label>
      )}
    </div>
  );
}
