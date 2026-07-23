import type { RunRecord } from '@/lib/types';
import { modelEffectiveness } from '@/lib/aggregate';

export function ModelEffectivenessPanel({ runs }: { runs: RunRecord[] }) {
  const summaries = modelEffectiveness(runs);

  if (summaries.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">モデル選択の効果測定</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const maxMergeRate = Math.max(...summaries.map((s) => s.mergeRate)) || 1;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="model-effectiveness-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">モデル選択の効果測定</span>
        <span className="text-sm tabular-nums opacity-80">{summaries.length}モデル</span>
      </div>

      <ul className="mt-4 space-y-3">
        {summaries.map((s) => {
          const barPct = (s.mergeRate / maxMergeRate) * 100;
          return (
            <li key={s.model} data-testid={`model-effectiveness-row-${s.model}`}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="opacity-80">{s.model}</span>
                <span
                  data-testid={`model-effectiveness-merge-${s.model}`}
                  className="tabular-nums opacity-80"
                >
                  マージ率{(s.mergeRate * 100).toFixed(1)}% ({s.count}件)
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  data-testid={`model-effectiveness-bar-${s.model}`}
                  className="h-full bg-sky-400"
                  style={{ width: `${barPct.toFixed(2)}%` }}
                />
              </div>
              <p
                data-testid={`model-effectiveness-stats-${s.model}`}
                className="mt-1 text-[10px] opacity-50"
              >
                承認率{(s.approvalRate * 100).toFixed(1)}% / e2e失敗率{(s.e2eFailureRate * 100).toFixed(1)}% /
                平均revise{s.avgReviseCycles.toFixed(1)}回 / 平均カバレッジ{s.avgCoveragePct.toFixed(1)}% /
                平均コスト${s.avgCostUsd.toFixed(2)}
              </p>
              <p className="mt-1 text-[10px] opacity-50">対象iteration: {s.iterations.join(', ')}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
