import type { RunRecord } from '@/lib/types';
import { ideationConfidenceTrend, type IdeationConfidenceTrendPoint } from '@/lib/aggregate';

const TITLE = 'Ideation提案消費成功率の信頼度トレンド';

/**
 * modelConfidenceWeightedScores(builderモデル別マージ率のベイズ縮約)と同じ考え方を、
 * Ideationの提案消費成功率(提案issueが着手されmergedに至ったか)に適用し、サンプル数が
 * 積み上がるにつれ confidence が1に漸近する様子と weightedScore の推移を折れ線で追う。
 * ModelApprovalRateTrendPanel と同じく縦軸は 0..100 固定、横軸は実際の iteration 番号。
 */
export function IdeationConfidenceTrendPanel({ runs }: { runs: RunRecord[] }) {
  const trend = ideationConfidenceTrend(runs);

  if (trend.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">{TITLE}</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const width = 640;
  const height = 160;
  const pad = 24;
  const minIteration = trend[0].iteration;
  const iterationSpan = trend[trend.length - 1].iteration - minIteration || 1;
  const xFor = (iteration: number) => pad + ((iteration - minIteration) / iterationSpan) * (width - pad * 2);
  const yFor = (valuePct: number) => height - pad - (valuePct / 100) * (height - pad * 2);
  const pathFor = (pick: (p: IdeationConfidenceTrendPoint) => number) =>
    trend.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.iteration).toFixed(1)},${yFor(pick(p) * 100).toFixed(1)}`).join(' ');

  const latest = trend[trend.length - 1];

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="ideation-confidence-trend-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">{TITLE}</span>
        <span className="text-sm tabular-nums opacity-80">{trend.length}件</span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full" role="img" aria-label={TITLE}>
        {trend.length === 1 ? (
          <>
            <circle
              data-testid="ideation-confidence-trend-point-confidence"
              cx={xFor(trend[0].iteration).toFixed(1)}
              cy={yFor(trend[0].confidence * 100).toFixed(1)}
              r={3}
              fill="currentColor"
              className="text-sky-400"
            />
            <circle
              data-testid="ideation-confidence-trend-point-weighted"
              cx={xFor(trend[0].iteration).toFixed(1)}
              cy={yFor(trend[0].weightedScore * 100).toFixed(1)}
              r={3}
              fill="currentColor"
              className="text-emerald-400"
            />
          </>
        ) : (
          <>
            <path
              data-testid="ideation-confidence-trend-line-confidence"
              d={pathFor((p) => p.confidence)}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="text-sky-400"
            />
            <path
              data-testid="ideation-confidence-trend-line-weighted"
              d={pathFor((p) => p.weightedScore)}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="text-emerald-400"
            />
          </>
        )}
      </svg>

      <ul className="mt-4 space-y-1 text-xs">
        <li data-testid="ideation-confidence-trend-legend-confidence" className="flex items-baseline justify-between">
          <span className="flex items-center gap-1.5 opacity-80">
            <span className="inline-block h-2 w-2 rounded-full bg-sky-400" />
            信頼度
          </span>
          <span data-testid="ideation-confidence-trend-latest-confidence" className="tabular-nums opacity-60">
            最新{(latest.confidence * 100).toFixed(1)}% (サンプル{latest.totalCount}件)
          </span>
        </li>
        <li data-testid="ideation-confidence-trend-legend-weighted" className="flex items-baseline justify-between">
          <span className="flex items-center gap-1.5 opacity-80">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
            重み付き成功率
          </span>
          <span data-testid="ideation-confidence-trend-latest-weighted" className="tabular-nums opacity-60">
            最新{(latest.weightedScore * 100).toFixed(1)}%
          </span>
        </li>
      </ul>

      <p className="mt-3 text-[10px] opacity-50">
        信頼度 = count / (count + 事前重み)。着手issueが積み上がるほど1に近づく。重み付き成功率は生の成功率を
        全体平均側にベイズ平均で縮約した値。
      </p>
    </div>
  );
}
