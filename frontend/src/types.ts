export type AgentName = "orchestrator" | "discovery" | "optout" | "verify";

export type BrokerName = "spokeo" | "whitepages" | "beenverified";

export type QueueEventType =
  | "agent_start"
  | "agent_output"
  | "tool_call"
  | "tool_result"
  | "delegation_start"
  | "delegation_end"
  | "error";

export interface QueueEvent {
  id: string;
  timestamp: number;
  event_type: QueueEventType;
  agent: AgentName;
  target_agent: AgentName | null;
  tool_name: string | null;
  input: unknown;
  output: unknown;
  duration_ms: number | null;
}

export const AGENT_LABELS: Record<AgentName, string> = {
  orchestrator: "Orchestrator",
  discovery: "Discovery",
  optout: "Opt-out",
  verify: "Verify",
};

export const BROKER_LABELS: Record<BrokerName, string> = {
  spokeo: "Spokeo",
  whitepages: "Whitepages",
  beenverified: "BeenVerified",
};

// Brokers whose discovery/opt-out steps need a manual step from the user
// (see backend/brokers/__init__.py — MANUAL_DISCOVERY_BROKERS /
// MANUAL_OPTOUT_BROKERS). Kept in sync by hand; small, stable list.
export const MANUAL_DISCOVERY_BROKERS: BrokerName[] = ["whitepages", "beenverified"];
export const MANUAL_OPTOUT_BROKERS: BrokerName[] = ["beenverified"];

export type AutomationLevel = "full" | "partial" | "manual";

export const BROKER_AUTOMATION: Record<BrokerName, { level: AutomationLevel; label: string; detail: string }> = {
  spokeo: {
    level: "full",
    label: "Full automation",
    detail: "Search, opt-out, and verify are all agent-driven.",
  },
  whitepages: {
    level: "partial",
    label: "Partial automation",
    detail: "You find your listing; the agent files and verifies the opt-out.",
  },
  beenverified: {
    level: "manual",
    label: "Manual + verify",
    detail: "You find your listing and opt out yourself; the agent verifies it later.",
  },
};

export const AUTOMATION_LEVEL_COLOR: Record<AutomationLevel, string> = {
  full: "var(--accent)",
  partial: "var(--amber)",
  manual: "var(--warn)",
};

export const BROKER_SEARCH_URLS: Record<BrokerName, string> = {
  spokeo: "https://www.spokeo.com/",
  whitepages: "https://www.whitepages.com/",
  // NOT beenverified.com's homepage search — that funnels toward a paid
  // report signup (an email + payment flow) and isn't needed for removal.
  // Their free opt-out tool below doubles as how you find your listing.
  beenverified: "https://www.beenverified.com/f/optout/search",
};

export const BROKER_OPTOUT_URLS: Record<BrokerName, string> = {
  spokeo: "https://www.spokeo.com/optout",
  whitepages: "https://www.whitepages.com/suppression-requests",
  beenverified: "https://www.beenverified.com/f/optout/search",
};

export interface Person {
  full_name: string;
  city: string;
  state: string;
  phone?: string;
  // Only required when at least one selected broker will actually use it
  // (an automated opt-out submission needs somewhere to send the
  // broker's confirmation link) — see PersonForm.tsx's needsEmail check.
  // A BeenVerified-only run never touches this field at all, since that
  // broker's opt-out is entirely manual on the user's own BeenVerified
  // session.
  email?: string;
  // Each manual-discovery broker can have more than one candidate URL —
  // if the user finds several listings that might be them, every one
  // gets saved and shown in the picker for review, same as an automated
  // broker's multiple search results.
  known_listing_urls: Partial<Record<BrokerName, string[]>>;
}

export interface StartRunRequest {
  person: Person;
  brokers?: BrokerName[];
}

export interface StartRunResponse {
  run_id: string;
  summary: string;
}

export interface RunHistoryEntry {
  run_id: string;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
}

export interface HistoryResponse {
  runs: RunHistoryEntry[];
}

export type ListingStatus =
  | "found"
  | "optout_submitted"
  | "optout_needs_manual_step"
  | "optout_failed"
  | "optout_confirmed"
  | "verified_removed"
  | "verified_still_present"
  | "dismissed";

// Raw row shape from GET /api/runs/{run_id}/listings (sqlite column names).
export interface ListingRow {
  listing_id: number;
  run_id: string;
  broker: BrokerName;
  listing_url: string;
  matched_name: string;
  matched_city: string | null;
  matched_state: string | null;
  matched_phone: string | null;
  confidence: number;
  status: ListingStatus;
  found_at: number;
}

export interface ListingsResponse {
  listings: ListingRow[];
}

export interface OptoutConfirmRequest {
  run_id: string;
  person: Person;
  listing_ids: number[];
}

export interface OptoutConfirmResult {
  listing_id: number;
  broker: BrokerName;
  listing_url: string;
  submitted: boolean;
  detail: string;
}

export interface OptoutConfirmResponse {
  results: OptoutConfirmResult[];
}

export interface TimingEstimate {
  sample_count: number;
  avg_duration_seconds: number | null;
}

export interface ConfirmLinkRequest {
  listing_id: number;
  confirmation_url: string;
}

export interface ConfirmLinkResponse {
  success: boolean;
  detail: string;
}
