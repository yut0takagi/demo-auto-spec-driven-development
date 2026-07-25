import type { RunRecord } from '@/lib/types';
import {
  retryCostEfficiencyTrend,
  retryCostEfficiencyTrendSignal,
  type RetryCostEfficiencyDirection,
} from '@/lib/aggregate';

const DIRECTION_LABELS: Record<RetryCostEfficiencyDirection, string> = {
  worsening: '悪化',
  improving: '改善',
  flat: '横ばい',
};

function formatUsdPerCycle(value: number | null): string {
  return value === null ? '算出不可' : `$${value.toFixed(3)}`;
}
function formatEfficiency(value: number | null): string {
  return value === null ? '算出不可' : value.toFixed(1);
}
const MIN_BAR_HEIGHT_PCT = 8;

export function RetryCostEfficiencyTrendPanel({ runs }: { runs: RunRecord[] }) {
  const trend = retryCostEfficiencyTrend(runs);
  if (trend.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">再試行コスト効率トレンド（品質低下局面のrevise単価）</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }
  const signal = retryCostEfficiencyTrendSignal(runs);
  const latest = trend[trend.length - 1];
  const maxCost = Math.max(0, ...trend.map((p) => p.recentCostPerReviseCycleUsd ?? 0));
  const barHeightPct = (value: number | null) =>
    value === null || maxCost <= 0 ? 0 : Math.max((value / maxCost) * 100, MIN_BAR_HEIGHT_PCT);
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="retry-cost-efficiency-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">再試行コスト効率トレンド（品質低下局面のrevise単価）</span>
        {signal && (
          <span className="text-sm tabular-nums opacity-80" data-testid="retry-cost-efficiency-direction">
            {DIRECTION_LABELS[signal.direction]}
          </span>
        )}
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums" data-testid="retry-cost-efficiency-value">
        {formatUsdPerCycle(latest.recentCostPerReviseCycleUsd)}
        <span className="ml-1 text-sm font-normal opacity-50">直近revise単価（反復{latest.iteration}）</span>
      </div>
      <div
        className="mt-4 flex h-10 items-end gap-1"
        data-testid="retry-cost-efficiency-trend"
        role="img"
        aria-label="revise単価の推移"
      >
        {trend.map((p) => (
          <div
            key={p.iteration}
            data-testid={`retry-cost-efficiency-bar-${p.iteration}`}
            className="flex-1 rounded-t bg-amber-400"
            style={{ height: `${barHeightPct(p.recentCostPerReviseCycleUsd)}%` }}
            title={`iteration ${p.iteration}: ${formatUsdPerCycle(p.recentCostPerReviseCycleUsd)}`}
          />
        ))}
      </div>
      <table className="mt-4 w-full text-left text-xs">
        <thead>
          <tr className="opacity-60">
            {['反復', '品質(カバレッジ)', 'revise単価(USD)', '効率'].map((h) => (
              <th key={h} className="pb-1 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trend.map((p) => (
            <tr key={p.iteration} data-testid={`retry-cost-efficiency-row-${p.iteration}`}>
              <td className="py-0.5 tabular-nums">{p.iteration}</td>
              <td className="py-0.5 tabular-nums">{p.recentQualityPct.toFixed(0)}%</td>
              <td className="py-0.5 tabular-nums">{formatUsdPerCycle(p.recentCostPerReviseCycleUsd)}</td>
              <td className="py-0.5 tabular-nums">{formatEfficiency(p.efficiency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] opacity-50">
        revise単価 = 直近ウィンドウでreviseが発生した反復のcost.totalUsd合計 ÷ reviseCycles合計。
        品質(カバレッジ)が下がっている局面で単価が上昇しているかを見る。算出不能な場合は「算出不可」。
      </p>
    </div>
  );
}
