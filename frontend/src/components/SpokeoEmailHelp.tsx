/** Spokeo confirms opt-outs via an emailed link, not a phone call — unlike
 * Whitepages' call, this is normally fast (minutes), so a long wait
 * usually means a delivery problem rather than "it's just slow." Surfaced
 * only after the user has actually submitted an opt-out, same as
 * WhitepagesCallHelp. */
export function SpokeoEmailHelp() {
  return (
    <div className="broker-help-box">
      <h3>Didn't get the confirmation email?</h3>
      <p className="muted">
        Spokeo's confirmation email usually arrives within minutes — if it's been longer than that, it's
        more likely a delivery problem than Spokeo just being slow. A few things to try:
      </p>
      <ul>
        <li>Check spam/junk first, then any other filters (promotions tab, etc.) — this is the most common reason it goes "missing."</li>
        <li>Still nothing after about 10 minutes? The address may have been filtered by your email provider — try resubmitting, ideally with a different provider if you have one.</li>
        <li>The confirmation link itself expires (reports range from 24 to 72 hours) — if you wait too long to click it, you'll likely need to resubmit the opt-out.</li>
        <li>
          Clicking the link isn't instant either: Spokeo's own confirmation screen says to allow 2-3 days
          for the removal to actually show up on the site.
        </li>
        <li>Listing still there after a couple of days post-confirmation? Contact Spokeo support directly with your submission details.</li>
      </ul>
    </div>
  );
}
