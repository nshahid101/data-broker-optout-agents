import { useMemo } from "react";
import { BROKER_LABELS, type BrokerName, type QueueEvent } from "../types";

type StepStatus = "pending" | "running" | "done";

const STEP_TOOLS = {
  discover: "search_broker",
  optout: "submit_optout_for_listing",
  verify: "check_listing_removed",
} as const;

type StepKey = keyof typeof STEP_TOOLS;
const STEP_ORDER: StepKey[] = ["discover", "optout", "verify"];
const STEP_LABELS: Record<StepKey, string> = {
  discover: "Discover",
  optout: "Opt-out",
  verify: "Verify",
};

function brokerFromArgs(input: unknown): BrokerName | null {
  // pydantic-ai's ToolCallPart.args comes through as a JSON string (e.g.
  // '{"broker":"spokeo"}'), not a parsed object — parse it first.
  let parsed: unknown = input;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (parsed && typeof parsed === "object" && "broker" in parsed) {
    const value = (parsed as { broker?: unknown }).broker;
    if (typeof value === "string") return value as BrokerName;
  }
  return null;
}

/** Derives a per-broker, per-step status map from the raw event stream.
 * TOOL_RESULT events don't carry the broker directly, so each tool name
 * gets a FIFO queue of brokers awaiting a result — safe because the
 * orchestrator runs brokers sequentially, never concurrently. */
function computePipeline(events: QueueEvent[], brokers: BrokerName[]) {
  const status: Record<BrokerName, Record<StepKey, StepStatus>> = {} as never;
  for (const broker of brokers) {
    status[broker] = { discover: "pending", optout: "pending", verify: "pending" };
  }

  const pendingQueues: Record<string, BrokerName[]> = {};

  for (const event of events) {
    if (event.event_type === "tool_call" && event.tool_name) {
      const step = (Object.keys(STEP_TOOLS) as StepKey[]).find((k) => STEP_TOOLS[k] === event.tool_name);
      if (!step) continue;
      const broker = brokerFromArgs(event.input);
      if (!broker || !status[broker]) continue;
      status[broker][step] = "running";
      pendingQueues[event.tool_name] ??= [];
      pendingQueues[event.tool_name].push(broker);
    } else if (event.event_type === "tool_result" && event.tool_name) {
      const step = (Object.keys(STEP_TOOLS) as StepKey[]).find((k) => STEP_TOOLS[k] === event.tool_name);
      if (!step) continue;
      const queue = pendingQueues[event.tool_name];
      const broker = queue?.shift();
      if (broker && status[broker]) {
        status[broker][step] = "done";
      }
    }
  }

  return status;
}

interface Props {
  events: QueueEvent[];
  brokers: BrokerName[];
}

export function BrokerPipeline({ events, brokers }: Props) {
  const statusByBroker = useMemo(() => computePipeline(events, brokers), [events, brokers]);

  if (brokers.length === 0) return null;

  return (
    <div className="broker-pipeline">
      {brokers.map((broker) => (
        <div key={broker} className="broker-pipeline__row">
          <span className="broker-pipeline__name">{BROKER_LABELS[broker]}</span>
          <div className="broker-pipeline__steps">
            {STEP_ORDER.map((step, i) => (
              <div key={step} className="broker-pipeline__step-wrap">
                <div className={`broker-pipeline__step broker-pipeline__step--${statusByBroker[broker][step]}`}>
                  <span className="broker-pipeline__step-icon">
                    {statusByBroker[broker][step] === "done"
                      ? "✓"
                      : statusByBroker[broker][step] === "running"
                        ? "●"
                        : "○"}
                  </span>
                  {STEP_LABELS[step]}
                </div>
                {i < STEP_ORDER.length - 1 && <span className="broker-pipeline__connector" />}
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="broker-pipeline__note muted">
        Verify runs later, separately — removals take time to take effect.
      </p>
    </div>
  );
}
