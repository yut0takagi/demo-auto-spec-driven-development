import type { RunRecord } from '@/lib/types';
import { issueLabelQualityRecoveryMatrix } from '@/lib/aggregate';

export function IssueLabelQualityRecoveryMatrixPanel({ runs }: { runs: RunRecord[] }) {
  const rows = issueLabelQualityRecoveryMatrix(runs);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Issue課題型別 提案品質・回収効率マトリクス</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="issue-label-quality-recovery-matrix-panel"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Issue課題型別 提案品質・回収効率マトリクス</span>
        <span className="text-sm tabular-nums opacity-80">{rows.length}ラベル</span>
      </div>

      <ul className="mt-4 space-y-3">
        {rows.map((row) => (
          <li key={row.label} data-testid={`issue-label-quality-recovery-row-${row.label}`}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="opacity-80">{row.label}</span>
              <span
                data-testid={`issue-label-quality-recovery-quality-${row.label}`}
                className="tabular-nums opacity-80"
              >
                {row.approvalRate === null
                  ? '提案品質 測定不可'
                  : `提案品質(承認率) ${(row.approvalRate * 100).toFixed(1)}%`}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                data-testid={`issue-label-quality-recovery-bar-${row.label}`}
                className="h-full bg-emerald-400"
                style={{ width: `${(row.recoveryRate * 100).toFixed(2)}%` }}
              />
            </div>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs opacity-60">
              <span data-testid={`issue-label-quality-recovery-rate-${row.label}`} className="tabular-nums">
                回収効率{(row.recoveryRate * 100).toFixed(1)}% ({row.mergedCount}/{row.count}件)
              </span>
              <span data-testid={`issue-label-quality-recovery-cost-${row.label}`} className="tabular-nums">
                {row.usdPerMergedIteration === null
                  ? '回収実績なし'
                  : `merge1件あたり $${row.usdPerMergedIteration.toFixed(2)}`}
              </span>
            </div>
            <p className="mt-1 text-[10px] opacity-50">対象iteration: {row.iterations.join(', ')}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
