import type { RunRecord } from '@/lib/types';
import { reviseStopPatternByModel } from '@/lib/aggregate';

export function ReviseStopPatternByModelPanel({ runs }: { runs: RunRecord[] }) {
  const summaries = reviseStopPatternByModel(runs);

  if (summaries.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">
          Model別 revise 打ち止めパターン：early-exit vs 枯渇
        </div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="revise-stop-pattern-by-model-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">
          Model別 revise 打ち止めパターン：early-exit vs 枯渇
        </span>
        <span className="text-sm tabular-nums opacity-80">{summaries.length}モデル</span>
      </div>

      <ul className="mt-4 space-y-3">
        {summaries.map((s) => {
          const earlyPct = s.count === 0 ? 0 : (s.earlyExitCount / s.count) * 100;
          const exhaustedPct = s.count === 0 ? 0 : (s.exhaustedCount / s.count) * 100;
          return (
            <li key={s.model} data-testid={`revise-stop-pattern-row-${s.model}`}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="opacity-80">{s.model}</span>
                <span data-testid={`revise-stop-pattern-stats-${s.model}`} className="tabular-nums opacity-60">
                  early-exit {s.earlyExitCount}件 / 枯渇 {s.exhaustedCount}件 (枯渇率{(s.exhaustionRate * 100).toFixed(1)}%, {s.count}件中)
                </span>
              </div>
              <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  data-testid={`revise-stop-pattern-early-bar-${s.model}`}
                  className="h-full bg-emerald-400"
                  style={{ width: `${earlyPct.toFixed(2)}%` }}
                />
                <div
                  data-testid={`revise-stop-pattern-exhausted-bar-${s.model}`}
                  className="h-full bg-rose-500"
                  style={{ width: `${exhaustedPct.toFixed(2)}%` }}
                />
              </div>
              <p data-testid={`revise-stop-pattern-mean-${s.model}`} className="mt-1 text-[10px] opacity-50">
                平均revise回数: early-exit {s.earlyExitMeanReviseCycles.toFixed(1)}回 / 枯渇 {s.exhaustedMeanReviseCycles.toFixed(1)}回
              </p>
              <p className="mt-1 text-[10px] opacity-50">対象iteration: {s.iterations.join(', ')}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
