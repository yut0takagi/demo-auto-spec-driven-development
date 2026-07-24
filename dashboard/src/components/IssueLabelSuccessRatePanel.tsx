import type { RunRecord } from '@/lib/types';
import { issueLabelSuccessRates } from '@/lib/aggregate';

export function IssueLabelSuccessRatePanel({ runs }: { runs: RunRecord[] }) {
  const rates = issueLabelSuccessRates(runs);

  if (rates.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Issueラベル別 成功率</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const maxRate = Math.max(...rates.map((r) => r.successRate)) || 1;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="issue-label-success-rate-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Issueラベル別 成功率</span>
        <span className="text-sm tabular-nums opacity-80">{rates.length}ラベル</span>
      </div>

      <ul className="mt-4 space-y-3">
        {rates.map((r) => {
          const barPct = (r.successRate / maxRate) * 100;
          return (
            <li key={r.label} data-testid={`issue-label-success-rate-row-${r.label}`}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="opacity-80">{r.label}</span>
                <span
                  data-testid={`issue-label-success-rate-value-${r.label}`}
                  className="tabular-nums opacity-80"
                >
                  成功率{(r.successRate * 100).toFixed(1)}% ({r.mergedCount}/{r.count}件)
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  data-testid={`issue-label-success-rate-bar-${r.label}`}
                  className="h-full bg-emerald-400"
                  style={{ width: `${barPct.toFixed(2)}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] opacity-50">対象iteration: {r.iterations.join(', ')}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
