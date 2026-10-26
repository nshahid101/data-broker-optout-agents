import { useState } from "react";
import { confirmLink, markConfirmed, undoConfirm } from "../api";
import type { ListingStatus } from "../types";

interface Props {
  listingId: number;
  status: ListingStatus;
  onChanged: () => void;
}

/** Paste-the-confirmation-link UI, shared by the current run's
 * ListingPicker and the persistent cross-run PendingConfirmations panel.
 * We never read anyone's email for this — the human copies the link
 * over themselves (see backend/main.py's /api/confirm-link docstring).
 *
 * Once a listing is confirmed (by link or by the manual button below),
 * this renders an "Undo" state IN THE SAME PLACE rather than having the
 * item disappear from its list — a mis-click used to make the whole list
 * reflow immediately, which made it hard to tell what had just happened
 * or fix it. Now nothing moves; confirming/undoing just swaps this one
 * box's contents. */
export function ConfirmLinkBox({ listingId, status, onChanged }: Props) {
  const [linkDraft, setLinkDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const submitLink = async () => {
    if (!linkDraft.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await confirmLink({ listing_id: listingId, confirmation_url: linkDraft.trim() });
      setResult(response.detail);
      if (response.success) onChanged();
    } catch (err) {
      setResult(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleMarkConfirmed = async () => {
    setBusy(true);
    setResult(null);
    try {
      const response = await markConfirmed(listingId);
      setResult(response.detail);
      if (response.success) onChanged();
    } catch (err) {
      setResult(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleUndo = async () => {
    setBusy(true);
    setResult(null);
    try {
      const response = await undoConfirm(listingId);
      if (response.success) onChanged();
      else setResult(response.detail);
    } catch (err) {
      setResult(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (status === "optout_confirmed") {
    return (
      <div className="listing-picker__confirm-link listing-picker__confirm-link--done">
        <span className="listing-picker__status">Confirmed ✓</span>
        <button type="button" className="btn btn--navy" disabled={busy} onClick={handleUndo}>
          {busy ? "Undoing..." : "Undo"}
        </button>
      </div>
    );
  }

  return (
    <div className="listing-picker__confirm-link">
      <p className="muted">
        Got a confirmation email from this broker? Paste the link here instead of clicking it in your
        inbox — the agent will open it and record that it's done.
      </p>
      <div className="manual-step-card__input-row">
        <input
          type="url"
          placeholder="Paste the confirmation link here"
          value={linkDraft}
          onChange={(e) => setLinkDraft(e.target.value)}
        />
        <button type="button" className="btn btn--navy" disabled={!linkDraft || busy} onClick={submitLink}>
          {busy ? "Opening..." : "Confirm"}
        </button>
      </div>

      <button type="button" className="listing-picker__mark-confirmed" disabled={busy} onClick={handleMarkConfirmed}>
        I already clicked it myself — mark as confirmed instead
      </button>

      {result && <p className="muted">{result}</p>}
    </div>
  );
}
