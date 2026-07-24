import type { RunRecord } from '@/lib/types';
import { pausedDryRunResumeSummary, pausedDryRunResumeSuccessTrend } from '@/lib/aggregate';

export function PausedDryRunResumeTrendPanel({ runs }: { runs: RunRecord[] }) {
  const summary = pausedDryRunResumeSummary(runs);

  if (summary.totalCount === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">
          ドライラン・一時停止の再開成功率トレンド
        </div>
        <p className="mt-4 text-sm opacity-50">データなし（pausedまたはdry-runになった反復はありません）</p>
      </div>
    );
  }

  const trend = pausedDryRunResumeSuccessTrend(runs);

  const width = 640;
  const height = 120;
  const pad = 24;
  const stepX = trend.length > 1 ? (width - pad * 2) / (trend.length - 1) : 0;
  const path = trend
    .map((p, i) => {
      const x = pad + stepX * i;
      const y = height - pad - (p.value / 100) * (height - pad * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  // TrendChart/CycleTimeTrendPanel と同様、単一点だと線が実質見えないため circle で補う。
  const singlePoint =
    trend.length === 1 ? { x: pad, y: height - pad - (trend[0].value / 100) * (height - pad * 2) } : null;

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="paused-dryrun-resume-trend-panel"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">
          ドライラン・一時停止の再開成功率トレンド
        </span>
        <span data-testid="paused-dryrun-resume-summary" className="text-sm tabular-nums opacity-80">
          {summary.totalCount}件中{summary.resumedCount}件再開・成功{summary.resumeSucceededCount}件
        </span>
      </div>

      {trend.length === 0 ? (
        <p data-testid="paused-dryrun-resume-no-trend" className="mt-4 text-sm opacity-50">
          まだ再開（同じissueの再実行）された反復がありません（未再開{summary.notResumedCount}件）
        </p>
      ) : (
        <>
          <div className="mt-2 flex items-baseline justify-between text-xs opacity-60">
            <span>再開成功率</span>
            <span data-testid="paused-dryrun-resume-rate" className="tabular-nums opacity-80">
              {summary.resumeSuccessRatePct.toFixed(1)}%
            </span>
          </div>
          <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full" role="img" aria-label="再開成功率の推移">
            <path d={path} fill="none" stroke="currentColor" strokeWidth={2} className="text-sky-400" />
            {singlePoint && (
              <circle
                cx={singlePoint.x.toFixed(1)}
                cy={singlePoint.y.toFixed(1)}
                r={3}
                fill="currentColor"
                className="text-sky-400"
              />
            )}
          </svg>
        </>
      )}
    </div>
  );
}
