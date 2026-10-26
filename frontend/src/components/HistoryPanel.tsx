import type { RunHistoryEntry } from "../types";

interface Props {
  runs: RunHistoryEntry[];
}

export function HistoryPanel({ runs }: Props) {
  if (runs.length === 0) {
    return (
      <div className="empty-state">
        <svg className="empty-state__icon" viewBox="0 0 48 48" aria-hidden="true">
          <rect x="6" y="10" width="36" height="28" rx="3" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <path d="M6 18h36" stroke="currentColor" strokeWidth="2.5" />
          <path d="M14 26h8M14 32h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <p className="muted">No runs yet — your token usage and cost history will show up here.</p>
      </div>
    );
  }

  return (
    <table className="history-table">
      <thead>
        <tr>
          <th>Run</th>
          <th>Input tokens</th>
          <th>Cached</th>
          <th>Output tokens</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => (
          <tr key={run.run_id}>
            <td className="history-table__run-id">{run.run_id.slice(0, 8)}</td>
            <td>{run.input_tokens.toLocaleString()}</td>
            <td>{run.cached_input_tokens.toLocaleString()}</td>
            <td>{run.output_tokens.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
