import type { RunRecord } from '@/lib/types';
import { reviseCycleCostRecovery, type ReviseVerdictBucketLabel } from '@/lib/aggregate';

const BUCKET_LABELS: Record<ReviseVerdictBucketLabel, string> = {
  '0': 'revise 0回',
  '1': 'revise 1回',
  '2': 'revise 2回',
  '3+': 'revise 3回以上',
};

export function ReviseCycleCostRecoveryPanel({ runs }: { runs: RunRecord[] }) {
  const buckets = reviseCycleCostRecovery(runs);

  if (buckets.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">
          Reviseサイクル別 APIコスト分布と回収効率
        </div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const maxMeanCostUsd = Math.max(...buckets.map((b) => b.meanCostUsd)) || 1;

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="revise-cycle-cost-recovery-panel"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">
          Reviseサイクル別 APIコスト分布と回収効率
        </span>
        <span className="text-sm tabular-nums opacity-80">{buckets.length}区分</span>
      </div>

      <ul className="mt-4 space-y-4">
        {buckets.map((b) => {
          const costBarPct = (b.meanCostUsd / maxMeanCostUsd) * 100;
          const recoveryPct = b.recoveryRate * 100;
          const statsText = `平均$${b.meanCostUsd.toFixed(2)} / 中央値$${b.medianCostUsd.toFixed(2)} / p90 $${b.p90CostUsd.toFixed(2)}（${b.count}件）`;
          return (
            <li key={b.bucket} data-testid={`revise-cost-recovery-row-${b.bucket}`}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="opacity-80">{BUCKET_LABELS[b.bucket]}</span>
                <span
                  data-testid={`revise-cost-recovery-stats-${b.bucket}`}
                  className="tabular-nums opacity-60"
                >
                  {statsText}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  data-testid={`revise-cost-recovery-cost-bar-${b.bucket}`}
                  className="h-full bg-sky-400"
                  style={{ width: `${costBarPct.toFixed(2)}%` }}
                />
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    data-testid={`revise-cost-recovery-rate-bar-${b.bucket}`}
                    className="h-full bg-emerald-400"
                    style={{ width: `${recoveryPct.toFixed(2)}%` }}
                  />
                </div>
                <span
                  data-testid={`revise-cost-recovery-rate-${b.bucket}`}
                  className="shrink-0 text-[10px] tabular-nums opacity-50"
                >
                  回収{recoveryPct.toFixed(0)}%（{b.mergedCount}/{b.count}）
                </span>
              </div>
              <p
                className="mt-1 text-[10px] opacity-50"
                data-testid={`revise-cost-recovery-per-merge-${b.bucket}`}
              >
                merge到達1件あたり:{' '}
                {b.usdPerMergedIteration === null
                  ? '回収実績なし'
                  : `$${b.usdPerMergedIteration.toFixed(2)}`}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[10px] opacity-50">
        各区分は cost.totalUsd（Builder+Adversary+Ideation合算）の分布。回収 =
        マージに到達した割合（そのbucketで消費したコストのうちmergeで報われた比率）。
      </p>
    </div>
  );
}
