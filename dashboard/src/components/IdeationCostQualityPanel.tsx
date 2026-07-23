import type { RunRecord } from '@/lib/types';
import { ideationCostQualityCorrelation } from '@/lib/aggregate';

function formatCorrelation(value: number | null): string {
  return value === null ? '算出不可' : `r = ${value.toFixed(2)}`;
}

function formatRate(value: number | null): string {
  return value === null ? '未着手' : `${(value * 100).toFixed(0)}%`;
}

export function IdeationCostQualityPanel({ runs }: { runs: RunRecord[] }) {
  const stats = ideationCostQualityCorrelation(runs);

  if (stats.batches.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">
          Ideationコスト効率と生成品質の関連性
        </div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="ideation-cost-quality-panel">
      <div className="text-xs uppercase tracking-wider opacity-60">Ideationコスト効率と生成品質の関連性</div>

      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] opacity-60">単価 vs 承認率 (n={stats.approvalRateSampleSize})</div>
          <div
            className="mt-1 text-xl font-semibold tabular-nums"
            data-testid="ideation-cost-quality-correlation-approval"
          >
            {formatCorrelation(stats.costVsApprovalRateCorrelation)}
          </div>
        </div>
        <div>
          <div className="text-[10px] opacity-60">単価 vs マージ率 (n={stats.mergeRateSampleSize})</div>
          <div
            className="mt-1 text-xl font-semibold tabular-nums"
            data-testid="ideation-cost-quality-correlation-merge"
          >
            {formatCorrelation(stats.costVsMergeRateCorrelation)}
          </div>
        </div>
      </div>

      <table className="mt-4 w-full text-left text-xs">
        <thead>
          <tr className="opacity-60">
            <th className="pb-1 font-normal">反復</th>
            <th className="pb-1 font-normal">提案件数</th>
            <th className="pb-1 font-normal">単価(USD)</th>
            <th className="pb-1 font-normal">着手数</th>
            <th className="pb-1 font-normal">承認率</th>
            <th className="pb-1 font-normal">マージ率</th>
          </tr>
        </thead>
        <tbody>
          {stats.batches.map((b) => (
            <tr key={b.iteration} data-testid={`ideation-cost-quality-row-${b.iteration}`}>
              <td className="py-0.5 tabular-nums">{b.iteration}</td>
              <td className="py-0.5 tabular-nums">{b.proposedCount}</td>
              <td className="py-0.5 tabular-nums">${b.costPerIssueUsd.toFixed(3)}</td>
              <td className="py-0.5 tabular-nums">{b.attemptedCount}</td>
              <td className="py-0.5 tabular-nums">{formatRate(b.childApprovalRate)}</td>
              <td className="py-0.5 tabular-nums">{formatRate(b.childMergeRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-2 text-[10px] opacity-50">
        提案issue1件あたりのideationコスト(単価)と、実際に着手された提案の承認率・マージ率の相関。相関係数が正なら「高コストな提案ほど品質が高い」傾向、負なら「安価な提案の方が品質が高い」傾向を示す（算出には2件以上の着手済みbatchが必要）。
      </p>
    </div>
  );
}
