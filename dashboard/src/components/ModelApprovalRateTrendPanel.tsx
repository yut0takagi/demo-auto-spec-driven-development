import type { RunRecord } from '@/lib/types';
import { approvalRateTrendByModel } from '@/lib/aggregate';

const LINE_TEXT_COLORS = [
  'text-sky-400',
  'text-emerald-400',
  'text-amber-400',
  'text-fuchsia-400',
  'text-rose-400',
  'text-lime-400',
];

const LINE_BG_COLORS = [
  'bg-sky-400',
  'bg-emerald-400',
  'bg-amber-400',
  'bg-fuchsia-400',
  'bg-rose-400',
  'bg-lime-400',
];

/**
 * ModelEffectivenessPanel / ModelApprovalMergeComparisonPanel が期間全体を1点に集約するのに
 * 対し、こちらは model ごとに独立した累積承認率推移を折れ線で並べ、「モデルを切り替えた後、
 * 承認率が実際に改善/悪化しているか」を時系列で見比べることに特化する。
 * 全 series は 0..100 の同一スケールなので、CycleTimeTrendPanel と異なり縦軸は
 * per-series 正規化せず固定範囲（y=0..100）を使う。横軸は各 series の点数ではなく
 * 実際の iteration 番号で揃える（model 切り替えのタイミングが実際の反復間隔通りに見えるように）。
 */
export function ModelApprovalRateTrendPanel({ runs }: { runs: RunRecord[] }) {
  const series = approvalRateTrendByModel(runs);
  const withPoints = series.filter((s) => s.points.length > 0);

  if (withPoints.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Model別 承認率トレンド観測</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const width = 640;
  const height = 160;
  const pad = 24;

  const allIterations = withPoints.flatMap((s) => s.points.map((p) => p.iteration));
  const minIteration = Math.min(...allIterations);
  const maxIteration = Math.max(...allIterations);
  const iterationSpan = maxIteration - minIteration || 1;

  const xFor = (iteration: number) => pad + ((iteration - minIteration) / iterationSpan) * (width - pad * 2);
  const yFor = (value: number) => height - pad - (value / 100) * (height - pad * 2);

  // 色は series（0件のモデルも含む全モデル）内の位置で固定する。svg 側は withPoints
  // （0件のモデルを除いたサブセット）を描画するため、withPoints のインデックスをそのまま
  // 色配列の添字に使うと legend（series 基準）と svg（withPoints 基準）で色がずれる。
  const colorIndex = new Map(series.map((s, idx): [string, number] => [s.model, idx]));

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="model-approval-rate-trend-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Model別 承認率トレンド観測</span>
        <span className="text-sm tabular-nums opacity-80">{series.length}モデル</span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-3 w-full"
        role="img"
        aria-label="Model別承認率トレンド"
      >
        {withPoints.map((s) => {
          const color = LINE_TEXT_COLORS[colorIndex.get(s.model)! % LINE_TEXT_COLORS.length];
          if (s.points.length === 1) {
            const p = s.points[0];
            return (
              <circle
                key={s.model}
                data-testid={`model-approval-rate-trend-point-${s.model}`}
                cx={xFor(p.iteration).toFixed(1)}
                cy={yFor(p.value).toFixed(1)}
                r={3}
                fill="currentColor"
                className={color}
              />
            );
          }
          const path = s.points
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.iteration).toFixed(1)},${yFor(p.value).toFixed(1)}`)
            .join(' ');
          return (
            <path
              key={s.model}
              data-testid={`model-approval-rate-trend-line-${s.model}`}
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className={color}
            />
          );
        })}
      </svg>

      <ul className="mt-4 space-y-1">
        {series.map((s) => (
          <li
            key={s.model}
            data-testid={`model-approval-rate-trend-legend-${s.model}`}
            className="flex items-baseline justify-between text-xs"
          >
            <span className="flex items-center gap-1.5 opacity-80">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  LINE_BG_COLORS[colorIndex.get(s.model)! % LINE_BG_COLORS.length]
                }`}
              />
              {s.model}
            </span>
            <span data-testid={`model-approval-rate-trend-latest-${s.model}`} className="tabular-nums opacity-60">
              {s.count === 0 ? 'データなし (0件)' : `最新${s.latestRate.toFixed(1)}% (${s.count}件)`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
