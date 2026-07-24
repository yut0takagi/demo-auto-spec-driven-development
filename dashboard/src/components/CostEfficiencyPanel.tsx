import type { RunRecord } from '@/lib/types';
import { costEfficiency, costPerApprovedPrTrend } from '@/lib/aggregate';

export function CostEfficiencyPanel({ runs }: { runs: RunRecord[] }) {
  const efficiency = costEfficiency(runs);

  if (efficiency.approvedPrCount === 0 || efficiency.usdPerApprovedPr === null) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Cost効率（USD per 承認PR）</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const trend = costPerApprovedPrTrend(runs);
  const finiteValues = trend.map((p) => p.value).filter((v) => Number.isFinite(v));
  const maxValue = finiteValues.length > 0 ? Math.max(...finiteValues) : 0;
  // 正の値のバーは必ず視認できる最小高さを確保する。窓内に早期の大コスト点があると
  // running average が急減し (value/max)*100 がサブピクセルまで潰れて不可視になり、
  // Playwright の toBeVisible が落ちる（CI で実際に発生）。非有限値は 0 に倒す。
  const MIN_BAR_HEIGHT_PCT = 8;
  const barHeightPct = (value: number) => {
    if (!Number.isFinite(value) || value <= 0 || maxValue <= 0) return 0;
    return Math.max((value / maxValue) * 100, MIN_BAR_HEIGHT_PCT);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="cost-efficiency-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Cost効率（USD per 承認PR）</span>
        <span className="text-sm tabular-nums opacity-80" data-testid="cost-efficiency-total">
          総コスト ${efficiency.totalCostUsd.toFixed(2)} / 承認PR {efficiency.approvedPrCount}件
        </span>
      </div>

      <div className="mt-2 text-3xl font-semibold tabular-nums" data-testid="cost-efficiency-value">
        ${efficiency.usdPerApprovedPr.toFixed(2)}
        <span className="ml-1 text-sm font-normal opacity-50">/ 承認PR</span>
      </div>

      <div
        className="mt-4 flex h-10 items-end gap-1"
        data-testid="cost-efficiency-trend"
        role="img"
        aria-label="承認PRあたりコストの推移"
      >
        {trend.map((p) => (
          <div
            key={p.iteration}
            data-testid={`cost-efficiency-bar-${p.iteration}`}
            className="flex-1 rounded-t bg-sky-400"
            style={{ height: `${barHeightPct(p.value)}%` }}
            title={`iteration ${p.iteration}: $${p.value.toFixed(2)}`}
          />
        ))}
      </div>
      <p className="mt-1 text-[10px] opacity-50">
        最初の承認PR以降、各反復までの累計コスト÷累計承認PR数の推移
      </p>
    </div>
  );
}
