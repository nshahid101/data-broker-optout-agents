import type { RunHistoryEntry } from "../types";

// Placeholder per-1K-token rates — replace with gpt-6-luna's actual
// Portkey/provider pricing once known for the report's tokenomics
// section (real measured tokens below are already accurate; only the
// $ conversion here is an estimate until then).
const INPUT_RATE_PER_1K = 0.003;
const OUTPUT_RATE_PER_1K = 0.015;

function estimateCost(entry: RunHistoryEntry): number {
  return (
    (entry.input_tokens / 1000) * INPUT_RATE_PER_1K +
    (entry.output_tokens / 1000) * OUTPUT_RATE_PER_1K
  );
}

interface Props {
  runs: RunHistoryEntry[];
}

export function CostPanel({ runs }: Props) {
  const totalInput = runs.reduce((sum, r) => sum + r.input_tokens, 0);
  const totalOutput = runs.reduce((sum, r) => sum + r.output_tokens, 0);
  const totalCost = runs.reduce((sum, r) => sum + estimateCost(r), 0);
  const avgCostPerRun = runs.length > 0 ? totalCost / runs.length : 0;

  return (
    <div className="cost-panel">
      <h3>Tokenomics</h3>
      <div className="cost-panel__stats">
        <div>
          <span className="cost-panel__stat-value">{runs.length}</span>
          <span className="cost-panel__stat-label">runs measured</span>
        </div>
        <div>
          <span className="cost-panel__stat-value">{(totalInput + totalOutput).toLocaleString()}</span>
          <span className="cost-panel__stat-label">total tokens</span>
        </div>
        <div>
          <span className="cost-panel__stat-value">${avgCostPerRun.toFixed(4)}</span>
          <span className="cost-panel__stat-label">avg cost / run</span>
        </div>
        <div>
          <span className="cost-panel__stat-value">${(avgCostPerRun * 100).toFixed(2)}</span>
          <span className="cost-panel__stat-label">est. / 100 users</span>
        </div>
        <div>
          <span className="cost-panel__stat-value">${(avgCostPerRun * 10000).toFixed(2)}</span>
          <span className="cost-panel__stat-label">est. / 10,000 users</span>
        </div>
      </div>
      <p className="muted cost-panel__note">
        Token counts are real, measured per run. $ figures use placeholder per-1K rates — swap in
        gpt-6-luna's actual Portkey pricing before finalizing the report.
      </p>
    </div>
  );
}
