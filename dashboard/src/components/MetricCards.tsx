import type { Summary } from '@/lib/aggregate';

function Card({
  label,
  value,
  sub,
  valueTestId,
}: {
  label: string;
  value: string;
  sub?: string;
  valueTestId?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="text-xs uppercase tracking-wider opacity-60">{label}</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums" data-testid={valueTestId}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs opacity-50">{sub}</div>}
    </div>
  );
}

export function MetricCards({ summary }: { summary: Summary }) {
  // クラッシュした最新 iteration はカバレッジを測定していないため、summarize() は
  // それ以前の iteration の値を latestCoveragePct として返す（latestCoverageStale）。
  // その値を「最新反復」と表示すると、古い測定値を最新のものと誤解させてしまう
  // （過去に実際、クラッシュ run が 0% への急落と誤読された事故がある）。
  const coverageSub = summary.latestCoverageStale
    ? `iteration ${summary.latestCoverageIteration} 時点（最新は未計測）`
    : '最新反復';

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-8" data-testid="metric-cards">
      <Card label="反復数" value={String(summary.totalRuns)} sub={`${summary.mergedRuns} merged`} />
      <Card label="承認率" value={`${Math.round(summary.approvalRate * 100)}%`} sub="adversary approve" />
      <Card label="マージ率" value={`${Math.round(summary.mergeRate * 100)}%`} sub="develop 到達" />
      <Card
        label="サイクルタイム"
        value={`${(summary.avgCycleTimeSec / 60).toFixed(1)}分`}
        sub="平均"
        valueTestId="metric-value-cycle-time"
      />
      <Card
        label="直近の所要時間"
        value={`${(summary.latestDurationSec / 60).toFixed(1)}分`}
        sub={`iteration ${summary.latestDurationIteration}`}
        valueTestId="metric-value-latest-duration"
      />
      <Card
        label="累計コスト"
        value={`$${summary.totalCostUsd.toFixed(2)}`}
        sub={`平均 revise ${summary.avgReviseCycles.toFixed(1)}回`}
      />
      <Card label="カバレッジ" value={`${summary.latestCoveragePct.toFixed(1)}%`} sub={coverageSub} />
      <Card
        label="ブレーカー余力"
        value={`${summary.breakerRemaining}/${summary.breakerThreshold}`}
        sub={`連続非マージ ${summary.breakerStreak}回`}
      />
    </div>
  );
}
