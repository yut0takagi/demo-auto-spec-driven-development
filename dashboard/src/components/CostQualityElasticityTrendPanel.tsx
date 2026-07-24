import type { RunRecord } from '@/lib/types';
import {
  costQualityElasticityTrend,
  costQualityElasticityTrendSignal,
  type CostQualityElasticityDirection,
} from '@/lib/aggregate';

const DIRECTION_LABELS: Record<CostQualityElasticityDirection, string> = {
  strengthening: '強含み',
  weakening: '弱含み',
  flat: '横ばい',
};

function formatElasticity(value: number | null): string {
  return value === null ? '算出不可' : value.toFixed(2);
}
const MIN_BAR_HEIGHT_PCT = 8;

export function CostQualityElasticityTrendPanel({ runs }: { runs: RunRecord[] }) {
  const trend = costQualityElasticityTrend(runs);
  if (trend.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">コスト-品質弾性トレンド（Cost-Quality ROI）</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }
  const signal = costQualityElasticityTrendSignal(runs);
  const latest = trend[trend.length - 1];
  const maxAbs = Math.max(0, ...trend.map((p) => (p.elasticity === null ? 0 : Math.abs(p.elasticity))));
  const barHeightPct = (value: number | null) =>
    value === null || maxAbs <= 0 ? 0 : Math.max((Math.abs(value) / maxAbs) * 100, MIN_BAR_HEIGHT_PCT);
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="cost-quality-elasticity-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">コスト-品質弾性トレンド（Cost-Quality ROI）</span>
        {signal && (
          <span className="text-sm tabular-nums opacity-80" data-testid="cost-quality-elasticity-direction">
            {DIRECTION_LABELS[signal.direction]}
          </span>
        )}
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums" data-testid="cost-quality-elasticity-value">
        {formatElasticity(latest.elasticity)}
        <span className="ml-1 text-sm font-normal opacity-50">直近弾性（反復{latest.iteration}）</span>
      </div>
      <div className="mt-4 flex h-10 items-end gap-1" data-testid="cost-quality-elasticity-trend" role="img" aria-label="コスト-品質弾性の推移">
        {trend.map((p) => (
          <div
            key={p.iteration}
            data-testid={`cost-quality-elasticity-bar-${p.iteration}`}
            className="flex-1 rounded-t bg-emerald-400"
            style={{ height: `${barHeightPct(p.elasticity)}%` }}
            title={`iteration ${p.iteration}: ${formatElasticity(p.elasticity)}`}
          />
        ))}
      </div>
      <table className="mt-4 w-full text-left text-xs">
        <thead>
          <tr className="opacity-60">
            {['反復', '平均コスト(USD)', '品質(承認率)', '弾性値'].map((h) => (
              <th key={h} className="pb-1 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trend.map((p) => (
            <tr key={p.iteration} data-testid={`cost-quality-elasticity-row-${p.iteration}`}>
              <td className="py-0.5 tabular-nums">{p.iteration}</td>
              <td className="py-0.5 tabular-nums">${p.recentAvgCostUsd.toFixed(3)}</td>
              <td className="py-0.5 tabular-nums">{p.recentApprovalRate.toFixed(0)}%</td>
              <td className="py-0.5 tabular-nums">{formatElasticity(p.elasticity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] opacity-50">
        直前→直近ウィンドウのコスト変化率(%)に対する承認率変化率(%)の比。算出不能な場合は「算出不可」。
      </p>
    </div>
  );
}
