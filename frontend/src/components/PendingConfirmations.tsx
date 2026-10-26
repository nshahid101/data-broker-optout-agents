import { useState } from "react";
import { ConfirmLinkBox } from "./ConfirmLinkBox";
import { dismissListing } from "../api";
import { BROKER_LABELS, type ListingRow } from "../types";

interface Props {
  listings: ListingRow[];
  onRefresh: () => void;
}

/** Always visible, independent of whatever search is currently on
 * screen — so starting a brand-new search never makes an older,
 * still-pending opt-out (waiting on a broker's confirmation email)
 * disappear or become unreachable. */
export function PendingConfirmations({ listings, onRefresh }: Props) {
  const [dismissingId, setDismissingId] = useState<number | null>(null);

  const handleDismiss = async (listingId: number, name: string) => {
    if (!window.confirm(`Remove ${name} from this list? This won't affect anything already sent to the broker.`)) {
      return;
    }
    setDismissingId(listingId);
    try {
      await dismissListing(listingId);
      onRefresh();
    } finally {
      setDismissingId(null);
    }
  };

  if (listings.length === 0) {
    return (
      <div className="empty-state">
        <p className="muted">
          Nothing pending right now. Opt-outs waiting on a broker's confirmation email will show up
          here.
        </p>
      </div>
    );
  }

  return (
    <div className="pending-confirmations">
      <p className="muted">
        These opt-outs were submitted and are waiting on a confirmation link from the broker's email.
        You can keep searching for other listings in the meantime — come back here whenever the email
        arrives.
      </p>
      <ul className="listing-picker__list">
        {listings.map((listing) => (
          <li key={listing.listing_id} className="listing-picker__item listing-picker__item--dismissable">
            <button
              type="button"
              className="listing-picker__dismiss"
              aria-label={`Remove ${listing.matched_name}'s ${BROKER_LABELS[listing.broker]} listing from pending`}
              disabled={dismissingId === listing.listing_id}
              onClick={() => handleDismiss(listing.listing_id, listing.matched_name)}
            >
              &times;
            </button>
            <div className="listing-picker__details">
              <div className="listing-picker__name-row">
                <strong>{listing.matched_name}</strong>
                <span className="listing-picker__confidence">{BROKER_LABELS[listing.broker]}</span>
              </div>
              <span className="muted">
                {[listing.matched_city, listing.matched_state].filter(Boolean).join(", ") || "No location found"}
              </span>
              <a href={listing.listing_url} target="_blank" rel="noreferrer" className="listing-picker__link">
                View listing &rarr;
              </a>
            </div>
            <ConfirmLinkBox listingId={listing.listing_id} status={listing.status} onChanged={onRefresh} />
          </li>
        ))}
      </ul>
    </div>
  );
}
