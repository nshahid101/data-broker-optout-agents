import { useState } from "react";
import { ConfirmLinkBox } from "./ConfirmLinkBox";
import { BROKER_LABELS, type BrokerName, type ListingRow } from "../types";

interface Props {
  listings: ListingRow[];
  brokers: BrokerName[];
  onConfirm: (listingIds: number[]) => void;
  confirming: boolean;
  onLinkConfirmed: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  found: "",
  optout_submitted: "Opt-out submitted",
  optout_needs_manual_step: "Needs your manual step",
  optout_failed: "Opt-out failed",
  optout_confirmed: "Confirmed ✓",
  verified_removed: "Verified removed",
  verified_still_present: "Still present",
};

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.75) return "Likely you";
  if (confidence >= 0.4) return "Possible match";
  return "Weak match";
}

interface ItemProps {
  listing: ListingRow;
  selected: boolean;
  onToggle: () => void;
  onLinkConfirmed: () => void;
}

function ListingItem({ listing, selected, onToggle, onLinkConfirmed }: ItemProps) {
  const alreadyHandled = listing.status !== "found";

  return (
    <li className="listing-picker__item">
      <label>
        <input type="checkbox" disabled={alreadyHandled} checked={selected} onChange={onToggle} />
        <div className="listing-picker__details">
          <div className="listing-picker__name-row">
            <strong>{listing.matched_name}</strong>
            <span className="listing-picker__confidence">
              {confidenceLabel(listing.confidence)} ({Math.round(listing.confidence * 100)}%)
            </span>
          </div>
          <span className="muted">
            {[listing.matched_city, listing.matched_state].filter(Boolean).join(", ") || "No location found"}
          </span>
          <a href={listing.listing_url} target="_blank" rel="noreferrer" className="listing-picker__link">
            View listing &rarr;
          </a>
          {alreadyHandled && listing.status !== "optout_submitted" && listing.status !== "optout_confirmed" && (
            <span className="listing-picker__status">{STATUS_LABELS[listing.status]}</span>
          )}
        </div>
      </label>

      {(listing.status === "optout_submitted" || listing.status === "optout_confirmed") && (
        <ConfirmLinkBox listingId={listing.listing_id} status={listing.status} onChanged={onLinkConfirmed} />
      )}
    </li>
  );
}

export function ListingPicker({ listings, brokers, onConfirm, confirming, onLinkConfirmed }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const byBroker = new Map<BrokerName, ListingRow[]>();
  for (const broker of brokers) byBroker.set(broker, []);
  for (const listing of listings) {
    byBroker.get(listing.broker)?.push(listing);
  }

  return (
    <div className="listing-picker">
      <h3>Review what was found</h3>
      <p className="muted listing-picker__intro">
        The agent doesn't decide which of these is really you — you do. Check the ones that are
        you before anything gets submitted.
      </p>

      {Array.from(byBroker.entries()).map(([broker, brokerListings]) => (
        <div key={broker} className="listing-picker__broker">
          <h4>{BROKER_LABELS[broker]}</h4>
          {brokerListings.length === 0 ? (
            <p className="muted">No candidates found (or discovery for this broker is manual).</p>
          ) : (
            <ul className="listing-picker__list">
              {brokerListings.map((listing) => (
                <ListingItem
                  key={listing.listing_id}
                  listing={listing}
                  selected={selected.has(listing.listing_id)}
                  onToggle={() => toggle(listing.listing_id)}
                  onLinkConfirmed={onLinkConfirmed}
                />
              ))}
            </ul>
          )}
        </div>
      ))}

      <button
        type="button"
        className="btn btn--red"
        disabled={selected.size === 0 || confirming}
        onClick={() => onConfirm(Array.from(selected))}
      >
        {confirming ? "Submitting..." : `Submit opt-out for ${selected.size || ""} selected`.trim()}
      </button>
    </div>
  );
}
