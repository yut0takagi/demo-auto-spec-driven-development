import type { RunRecord } from '@/lib/types';
import {
  reviseCyclesTrend,
  reviseCyclesOutliers,
  reviseCyclesMedian,
  REVISE_CYCLES_OUTLIER_THRESHOLD,
} from '@/lib/aggregate';

export function ReviseCyclesChart({ runs }: { runs: RunRecord[] }) {
  const points = reviseCyclesTrend(runs);
  const width = 640;
  const height = 160;
  const pad = 24;

  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">revise 回数の分布</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const med = reviseCyclesMedian(runs);
  const outliers = reviseCyclesOutliers(runs);
  // 外れ値の閾値線が必ずグラフ内に収まるよう、閾値も max の候補に含める。
  const maxValue = Math.max(REVISE_CYCLES_OUTLIER_THRESHOLD, ...values) || 1;
  const plotHeight = height - pad * 2;
  const slotWidth = (width - pad * 2) / points.length;
  const barWidth = Math.min(32, slotWidth * 0.6);

  const yFor = (value: number) => height - pad - (value / maxValue) * plotHeight;
  const medianY = yFor(med);
  const thresholdY = yFor(REVISE_CYCLES_OUTLIER_THRESHOLD);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">revise 回数の分布</span>
        <span className="text-sm tabular-nums opacity-80">中央値 {med.toFixed(1)}回</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full" role="img" aria-label="revise 回数の分布">
        <line
          data-testid="threshold-line"
          x1={pad}
          x2={width - pad}
          y1={thresholdY.toFixed(1)}
          y2={thresholdY.toFixed(1)}
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="2 3"
          className="text-rose-400/70"
        />
        <line
          data-testid="median-line"
          x1={pad}
          x2={width - pad}
          y1={medianY.toFixed(1)}
          y2={medianY.toFixed(1)}
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          className="text-sky-400"
        />
        {points.map((p, i) => {
          const isOutlier = p.value > REVISE_CYCLES_OUTLIER_THRESHOLD;
          const x = pad + slotWidth * i + (slotWidth - barWidth) / 2;
          const y = yFor(p.value);
          const barHeight = height - pad - y;
          return (
            <rect
              key={p.iteration}
              data-testid={`revise-bar-${p.iteration}`}
              x={x.toFixed(1)}
              y={y.toFixed(1)}
              width={barWidth.toFixed(1)}
              height={Math.max(barHeight, 0).toFixed(1)}
              className={isOutlier ? 'fill-rose-400' : 'fill-sky-400'}
            />
          );
        })}
      </svg>
      <div className="mt-1 flex gap-4 text-[10px] opacity-60">
        <span>┄ 中央値 ({med.toFixed(1)}回)</span>
        <span>┈ 外れ値の閾値 (&gt;{REVISE_CYCLES_OUTLIER_THRESHOLD}回)</span>
      </div>
      <p className="mt-2 text-xs opacity-60">
        {outliers.length === 0
          ? `外れ値（>${REVISE_CYCLES_OUTLIER_THRESHOLD}回）なし`
          : `外れ値（>${REVISE_CYCLES_OUTLIER_THRESHOLD}回）: ${outliers
              .map((p) => `iteration ${p.iteration} (${p.value}回)`)
              .join(', ')}`}
      </p>
    </div>
  );
}
