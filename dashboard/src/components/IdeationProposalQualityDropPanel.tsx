import type { RunRecord } from '@/lib/types';
import { ideationProposalQualityDropCorrelation } from '@/lib/aggregate';

function formatCorrelation(value: number | null): string {
  return value === null ? '算出不可' : `r = ${value.toFixed(2)}`;
}

function formatDropRate(value: number | null): string {
  return value === null ? '未判定' : `${(value * 100).toFixed(0)}%`;
}

export function IdeationProposalQualityDropPanel({ runs }: { runs: RunRecord[] }) {
  const stats = ideationProposalQualityDropCorrelation(runs);

  if (stats.batches.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">
          Ideation提案品質（規模・単価）とドロップ率の関連分析
        </div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="ideation-proposal-quality-drop-panel">
      <div className="text-xs uppercase tracking-wider opacity-60">
        Ideation提案品質（規模・単価）とドロップ率の関連分析
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] opacity-60">提案件数 vs ドロップ率 (n={stats.sampleSize})</div>
          <div
            className="mt-1 text-xl font-semibold tabular-nums"
            data-testid="ideation-proposal-quality-drop-correlation-batchsize"
          >
            {formatCorrelation(stats.batchSizeVsDropRateCorrelation)}
          </div>
        </div>
        <div>
          <div className="text-[10px] opacity-60">単価 vs ドロップ率 (n={stats.sampleSize})</div>
          <div
            className="mt-1 text-xl font-semibold tabular-nums"
            data-testid="ideation-proposal-quality-drop-correlation-cost"
          >
            {formatCorrelation(stats.costPerIssueVsDropRateCorrelation)}
          </div>
        </div>
      </div>

      <table className="mt-4 w-full text-left text-xs">
        <thead>
          <tr className="opacity-60">
            <th className="pb-1 font-normal">反復</th>
            <th className="pb-1 font-normal">提案件数</th>
            <th className="pb-1 font-normal">単価(USD)</th>
            <th className="pb-1 font-normal">判定済み</th>
            <th className="pb-1 font-normal">ドロップ率</th>
          </tr>
        </thead>
        <tbody>
          {stats.batches.map((b) => (
            <tr key={b.iteration} data-testid={`ideation-proposal-quality-drop-row-${b.iteration}`}>
              <td className="py-0.5 tabular-nums">{b.iteration}</td>
              <td className="py-0.5 tabular-nums">{b.proposedCount}</td>
              <td className="py-0.5 tabular-nums">${b.costPerIssueUsd.toFixed(3)}</td>
              <td className="py-0.5 tabular-nums">{b.judgedCount}</td>
              <td className="py-0.5 tabular-nums">{formatDropRate(b.dropRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-2 text-[10px] opacity-50">
        1回のideationでまとめて提案したissue件数（規模）と提案issue1件あたりのコスト(単価)が、
        その提案がのちに着手されず見送られる(ドロップする)割合とどれだけ関連しているかの
        Pearson相関係数。規模の相関が正なら「まとめて大量に提案するほどドロップされやすい」、
        単価の相関が負なら「安価な提案ほどドロップされやすい」傾向を示す
        （算出には猶予期間経過後に判定確定したbatchが2件以上必要）。
      </p>
    </div>
  );
}
