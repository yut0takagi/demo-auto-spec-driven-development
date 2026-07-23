import type { RunRecord } from '@/lib/types';
import { e2eFailureReviseCorrelation } from '@/lib/aggregate';

export function E2eReviseCorrelationPanel({ runs }: { runs: RunRecord[] }) {
  const stats = e2eFailureReviseCorrelation(runs);

  if (stats.sampleSize === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">E2E失敗とrevise回数の相関</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const maxMean = Math.max(stats.passedMeanRevise, stats.failedMeanRevise, 1);

  const deltaText =
    stats.delta > 0
      ? `E2E失敗時は成功時より平均 ${stats.delta.toFixed(1)}回 revise が多い`
      : stats.delta < 0
        ? `E2E失敗時は成功時より平均 ${Math.abs(stats.delta).toFixed(1)}回 revise が少ない`
        : 'E2E成功/失敗で平均revise回数に差はない';

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="e2e-revise-correlation-panel"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">E2E失敗とrevise回数の相関</span>
        <span
          className="text-sm tabular-nums opacity-80"
          data-testid="e2e-revise-correlation-coefficient"
        >
          {stats.correlationCoefficient === null ? '算出不可' : `r = ${stats.correlationCoefficient.toFixed(2)}`}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] opacity-60">E2E成功 ({stats.passedCount}件)</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums" data-testid="e2e-revise-passed-mean">
            {stats.passedMeanRevise.toFixed(1)}回
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              data-testid="e2e-revise-passed-bar"
              className="h-full bg-sky-400"
              style={{ width: `${((stats.passedMeanRevise / maxMean) * 100).toFixed(2)}%` }}
            />
          </div>
        </div>
        <div>
          <div className="text-[10px] opacity-60">E2E失敗 ({stats.failedCount}件)</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums" data-testid="e2e-revise-failed-mean">
            {stats.failedMeanRevise.toFixed(1)}回
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              data-testid="e2e-revise-failed-bar"
              className="h-full bg-rose-400"
              style={{ width: `${((stats.failedMeanRevise / maxMean) * 100).toFixed(2)}%` }}
            />
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs opacity-60">{deltaText}</p>

      {stats.failedIterations.length > 0 && (
        <p className="mt-2 text-[10px] opacity-50" data-testid="e2e-revise-failed-iterations">
          E2E失敗した反復: {stats.failedIterations.join(', ')}
        </p>
      )}
    </div>
  );
}
