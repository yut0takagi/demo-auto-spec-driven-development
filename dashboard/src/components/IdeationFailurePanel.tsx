import type { RunRecord } from '@/lib/types';
import { ideationFailureSummary, ideationFailureRateTrend } from '@/lib/aggregate';

export function IdeationFailurePanel({ runs }: { runs: RunRecord[] }) {
  const summary = ideationFailureSummary(runs);

  if (summary.attempted === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Ideation 失敗率</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const trend = ideationFailureRateTrend(runs);
  const failurePct = summary.failureRate * 100;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="ideation-failure-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Ideation 失敗率</span>
        <span className="text-sm tabular-nums opacity-80" data-testid="ideation-failure-attempted">
          実行 {summary.attempted}件中 {summary.failed}件が提案0件
        </span>
      </div>

      <div className="mt-2 text-3xl font-semibold tabular-nums" data-testid="ideation-failure-value">
        {failurePct.toFixed(1)}%
      </div>

      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          data-testid="ideation-failure-bar"
          className="h-full bg-rose-400"
          style={{ width: `${failurePct.toFixed(2)}%` }}
        />
      </div>

      <div
        className="mt-4 flex h-10 items-end gap-1"
        data-testid="ideation-failure-trend"
        role="img"
        aria-label="Ideation失敗率推移"
      >
        {trend.map((p) => (
          <div
            key={p.iteration}
            data-testid={`ideation-failure-trend-bar-${p.iteration}`}
            className="flex-1 rounded-t bg-rose-400"
            style={{ height: `${p.value}%`, minHeight: '2px' }}
            title={`iteration ${p.iteration}: ${p.value.toFixed(1)}%`}
          />
        ))}
      </div>
      <p className="mt-1 text-[10px] opacity-50">
        ideation を実行した反復（cost.ideationUsd &gt; 0）だけを対象にした累積失敗率の推移
      </p>

      {summary.failedIterations.length > 0 && (
        <p className="mt-2 text-[10px] opacity-50" data-testid="ideation-failure-iterations">
          対象iteration: {summary.failedIterations.join(', ')}
        </p>
      )}
    </div>
  );
}
