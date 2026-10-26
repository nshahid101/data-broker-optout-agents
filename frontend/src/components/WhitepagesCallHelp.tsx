/** Whitepages' suppression wizard verifies by an automated phone call, not
 * a text — a step that's reportedly flaky/slow independent of anything
 * this app does. Surfaced only after the user has actually submitted an
 * opt-out (not just during discovery/review), since the call step only
 * becomes relevant once they're sent toward the wizard. */
export function WhitepagesCallHelp() {
  return (
    <div className="broker-help-box">
      <h3>Didn't get the verification call?</h3>
      <p className="muted">
        Whitepages confirms your opt-out with an automated phone call, not a text — this step is known to
        be slow or flaky on their end, independent of anything this app does. A few things to try:
      </p>
      <ul>
        <li>Check your blocked/unknown-caller list — spam-screening often catches automated calls like this one.</li>
        <li>Use a number you can answer live; it won't leave a voicemail reliably, and a missed call can reset the step.</li>
        <li>No good number on hand? A free number from a service like Google Voice works fine for just receiving this call.</li>
        <li>Still nothing after a few minutes? Use the wizard's own "I didn't receive a call — please call again" link rather than restarting from scratch.</li>
        <li>
          Even after the call succeeds, Whitepages' own removal can take 24-72 hours (sometimes longer) to
          actually clear the listing — check back rather than assuming it failed right away.
        </li>
      </ul>
    </div>
  );
}
