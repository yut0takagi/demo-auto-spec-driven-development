import type { RunRecord } from '@/lib/types';
import { reviseCyclesByModel } from '@/lib/aggregate';

export function ReviseCyclesByModelPanel({ runs }: { runs: RunRecord[] }) {
  const summaries = reviseCyclesByModel(runs);

  if (summaries.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Model別 revise回数の分布</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const maxMean = Math.max(...summaries.map((s) => s.mean)) || 1;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="revise-cycles-by-model-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Model別 revise回数の分布</span>
        <span className="text-sm tabular-nums opacity-80">{summaries.length}モデル</span>
      </div>

      <ul className="mt-4 space-y-3">
        {summaries.map((s) => {
          const barPct = (s.mean / maxMean) * 100;
          return (
            <li key={s.model} data-testid={`revise-model-row-${s.model}`}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="opacity-80">{s.model}</span>
                <span data-testid={`revise-model-stats-${s.model}`} className="tabular-nums opacity-60">
                  平均{s.mean.toFixed(1)} / 中央値{s.median.toFixed(1)} / {s.min}〜{s.max}回 ({s.count}件)
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  data-testid={`revise-model-bar-${s.model}`}
                  className="h-full bg-sky-400"
                  style={{ width: `${barPct.toFixed(2)}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] opacity-50">対象iteration: {s.iterations.join(', ')}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
