import { useState } from "react";
import { BrokerPipeline } from "./BrokerPipeline";
import { ManualStepCard } from "./ManualStepCard";
import { AGENT_LABELS, type BrokerName, type QueueEvent, type TimingEstimate } from "../types";

interface Props {
  events: QueueEvent[];
  summary: string | null;
  brokers: BrokerName[];
  connected: boolean;
  running: boolean;
  elapsedSeconds: number;
  timing: TimingEstimate | null;
  /** BeenVerified's already-discovered listing URL, if discovery has run —
   * lets the opt-out manual step link straight to it instead of making the
   * user search for themselves a second time. */
  beenverifiedListingUrl?: string;
  /** The same listing's id, so the "I submitted" checkbox can actually
   * mark it done instead of being purely decorative. */
  beenverifiedListingId?: number;
  /** Refreshes listings/pending after that checkbox fires. */
  onBeenverifiedMarkedSubmitted?: () => void;
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function TimingLine({ running, elapsedSeconds, timing }: Pick<Props, "running" | "elapsedSeconds" | "timing">) {
  if (!running) return null;

  if (!timing || !timing.avg_duration_seconds || timing.sample_count === 0) {
    return (
      <p className="run-dashboard__timing">
        Running for {formatSeconds(elapsedSeconds)} — no past runs yet to estimate a total from.
      </p>
    );
  }

  const avg = Math.round(timing.avg_duration_seconds);
  const remaining = Math.max(avg - elapsedSeconds, 0);
  const overdue = elapsedSeconds > avg;

  return (
    <p className="run-dashboard__timing">
      Running for {formatSeconds(elapsedSeconds)} — typically takes about {formatSeconds(avg)} (based on{" "}
      {timing.sample_count} past run{timing.sample_count === 1 ? "" : "s"}){" "}
      {overdue ? "— finishing up..." : `— about ${formatSeconds(remaining)} left`}
    </p>
  );
}

function describeEvent(event: QueueEvent): string {
  switch (event.event_type) {
    case "agent_start":
      return `${AGENT_LABELS[event.agent]} started: ${String(event.input).slice(0, 120)}`;
    case "agent_output":
      return `${AGENT_LABELS[event.agent]} finished (${Math.round(event.duration_ms ?? 0)}ms)`;
    case "tool_call":
      return `${AGENT_LABELS[event.agent]} called tool "${event.tool_name}"`;
    case "tool_result":
      return `${AGENT_LABELS[event.agent]}'s tool "${event.tool_name}" returned a result`;
    case "delegation_start":
      return `${AGENT_LABELS[event.agent]} delegated to ${event.target_agent ? AGENT_LABELS[event.target_agent] : "?"}`;
    case "delegation_end":
      return `${event.target_agent ? AGENT_LABELS[event.target_agent] : "?"} reported back to ${AGENT_LABELS[event.agent]}`;
    case "error":
      return `Error in ${AGENT_LABELS[event.agent]}: ${String(event.output).slice(0, 160)}`;
    default:
      return event.event_type;
  }
}

export function RunDashboard({
  events,
  summary,
  brokers,
  connected,
  running,
  elapsedSeconds,
  timing,
  beenverifiedListingUrl,
  beenverifiedListingId,
  onBeenverifiedMarkedSubmitted,
}: Props) {
  const [showLog, setShowLog] = useState(false);

  return (
    <div className="run-dashboard">
      {/* Everything a user needs to see "where is this run right now" —
         connection status, elapsed/ETA timing, and the per-broker
         discover/opt-out/verify stage — stays pinned to the top of the
         dashboard column's own scroll area (see .run-dashboard__sticky-header
         in App.css). Only the summary/listing-review/log content below it
         scrolls away, since that's stuff you read once, not stuff you need
         to keep glancing back at. */}
      <div className="run-dashboard__sticky-header">
        <div className="run-dashboard__status">
          <span className={`dot ${connected ? "dot--live" : "dot--off"}`} />
          {connected ? "Live" : "Not connected"}
        </div>

        <TimingLine running={running} elapsedSeconds={elapsedSeconds} timing={timing} />

        {events.length === 0 && brokers.length === 0 ? (
          <div className="empty-state">
            <svg className="empty-state__icon" viewBox="0 0 64 40" aria-hidden="true">
              <path
                d="M4 20 Q20 4 32 20 Q20 32 4 20 Z M32 20 Q44 4 60 20 Q44 32 32 20 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              />
              <circle cx="20" cy="20" r="3.5" fill="currentColor" />
              <circle cx="44" cy="20" r="3.5" fill="currentColor" />
            </svg>
            <p className="muted">Nothing running yet — fill out the form and start a removal run.</p>
          </div>
        ) : (
          <BrokerPipeline events={events} brokers={brokers} />
        )}
      </div>

      {summary && (
        <div className="run-dashboard__summary">
          <h3>Run summary</h3>
          <p>{summary}</p>
        </div>
      )}

      {brokers.includes("beenverified") && (
        <ManualStepCard
          broker="beenverified"
          kind="optout"
          knownUrl={beenverifiedListingUrl}
          listingId={beenverifiedListingId}
          onMarkedSubmitted={onBeenverifiedMarkedSubmitted}
        />
      )}

      {events.length > 0 && (
        <button type="button" className="run-dashboard__log-toggle" onClick={() => setShowLog((v) => !v)}>
          {showLog ? "Hide" : "Show"} technical log ({events.length} events)
        </button>
      )}

      {showLog && (
        <div className="run-dashboard__log">
          {events.map((event) => (
            <div key={event.id} className={`run-dashboard__event run-dashboard__event--${event.event_type}`}>
              <span className="run-dashboard__event-time">
                {new Date(event.timestamp * 1000).toLocaleTimeString()}
              </span>
              {describeEvent(event)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
