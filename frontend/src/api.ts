import type {
  ConfirmLinkRequest,
  ConfirmLinkResponse,
  HistoryResponse,
  ListingsResponse,
  OptoutConfirmRequest,
  OptoutConfirmResponse,
  StartRunRequest,
  StartRunResponse,
  TimingEstimate,
} from "./types";

const API_BASE = "http://localhost:8010";

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export function fetchBrokers(): Promise<{ brokers: string[] }> {
  return fetch(`${API_BASE}/api/brokers`).then(asJson<{ brokers: string[] }>);
}

export function startRun(payload: StartRunRequest): Promise<StartRunResponse> {
  return fetch(`${API_BASE}/api/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(asJson<StartRunResponse>);
}

export function fetchHistory(): Promise<HistoryResponse> {
  return fetch(`${API_BASE}/api/history`).then(asJson<HistoryResponse>);
}

export function fetchRunListings(runId: string): Promise<ListingsResponse> {
  return fetch(`${API_BASE}/api/runs/${runId}/listings`).then(asJson<ListingsResponse>);
}

export function confirmOptout(payload: OptoutConfirmRequest): Promise<OptoutConfirmResponse> {
  return fetch(`${API_BASE}/api/optout-confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(asJson<OptoutConfirmResponse>);
}

export function fetchTiming(): Promise<TimingEstimate> {
  return fetch(`${API_BASE}/api/timing`).then(asJson<TimingEstimate>);
}

export function fetchPendingConfirmations(): Promise<ListingsResponse> {
  return fetch(`${API_BASE}/api/listings/pending`).then(asJson<ListingsResponse>);
}

export function confirmLink(payload: ConfirmLinkRequest): Promise<ConfirmLinkResponse> {
  return fetch(`${API_BASE}/api/confirm-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(asJson<ConfirmLinkResponse>);
}

export function markConfirmed(listingId: number): Promise<ConfirmLinkResponse> {
  return fetch(`${API_BASE}/api/listings/${listingId}/mark-confirmed`, { method: "POST" }).then(
    asJson<ConfirmLinkResponse>
  );
}

export function undoConfirm(listingId: number): Promise<ConfirmLinkResponse> {
  return fetch(`${API_BASE}/api/listings/${listingId}/undo-confirm`, { method: "POST" }).then(
    asJson<ConfirmLinkResponse>
  );
}

export function dismissListing(listingId: number): Promise<ConfirmLinkResponse> {
  return fetch(`${API_BASE}/api/listings/${listingId}/dismiss`, { method: "POST" }).then(
    asJson<ConfirmLinkResponse>
  );
}

export function markOptoutSubmitted(listingId: number): Promise<ConfirmLinkResponse> {
  return fetch(`${API_BASE}/api/listings/${listingId}/mark-optout-submitted`, { method: "POST" }).then(
    asJson<ConfirmLinkResponse>
  );
}

export const EVENTS_URL = `${API_BASE}/api/events`;
