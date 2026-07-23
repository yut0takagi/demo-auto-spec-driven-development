import type { RunRecord } from '@/lib/types';
import {
  ideationStartSuccessSummary,
  ideationToStartLeadTimes,
  ideationToStartLeadTimeTrendSignal,
  type IdeationToStartLeadTimeTrendDirection,
} from '@/lib/aggregate';

const DIRECTION_LABELS: Record<IdeationToStartLeadTimeTrendDirection, string> = {
  increasing: '悪化傾向',
  decreasing: '改善傾向',
  flat: '横ばい',
};

const DIRECTION_STYLES: Record<IdeationToStartLeadTimeTrendDirection, string> = {
  increasing: 'text-rose-400',
  decreasing: 'text-emerald-400',
  flat: 'text-sky-400',
};

const DIRECTION_DOT_STYLES: Record<IdeationToStartLeadTimeTrendDirection, string> = {
  increasing: 'bg-rose-400',
  decreasing: 'bg-emerald-400',
  flat: 'bg-sky-400',
};

const toMinutes = (sec: number) => sec / 60;
const MAX_LISTED_NOT_STARTED = 10;

export function IdeationToStartLeadTimePanel({ runs }: { runs: RunRecord[] }) {
  const summary = ideationStartSuccessSummary(runs);

  if (summary.proposedTotal === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">
          Ideation→着手までのリードタイム・着手成功率観測
        </div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const startRatePct = (summary.startRate ?? 0) * 100;
  const points = ideationToStartLeadTimes(runs);
  const signal = ideationToStartLeadTimeTrendSignal(runs);

  const width = 640;
  const height = 160;
  const pad = 24;
  const values = points.map((p) => toMinutes(p.leadTimeSec));
  const maxValue = points.length > 0 ? Math.max(...values) : 0;
  const minValue = points.length > 0 ? Math.min(...values) : 0;
  const span = maxValue - minValue || 1;
  const stepX = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;

  const path = points
    .map((p, i) => {
      const x = pad + stepX * i;
      const y = height - pad - ((toMinutes(p.leadTimeSec) - minValue) / span) * (height - pad * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  // IssueResolutionTimeTrendPanel と同様、単一点だと path が moveto 単独になり線が実質見えないため circle で補う。
  const singlePoint =
    points.length === 1
      ? { x: pad, y: height - pad - ((values[0] - minValue) / span) * (height - pad * 2) }
      : null;

  const notStartedShown = summary.notStartedIssueNumbers.slice(0, MAX_LISTED_NOT_STARTED);
  const notStartedOverflow = summary.notStartedIssueNumbers.length - notStartedShown.length;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="ideation-to-start-lead-time-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">
          Ideation→着手までのリードタイム・着手成功率観測
        </span>
        <span className="text-sm tabular-nums opacity-80" data-testid="ideation-to-start-success-counts">
          提案 {summary.proposedTotal}件中 {summary.startedCount}件が着手済み
        </span>
      </div>

      <div className="mt-2 text-3xl font-semibold tabular-nums" data-testid="ideation-to-start-success-rate">
        {startRatePct.toFixed(1)}%
      </div>

      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          data-testid="ideation-to-start-success-bar"
          className="h-full bg-emerald-400"
          style={{ width: `${startRatePct.toFixed(2)}%` }}
        />
      </div>

      {notStartedShown.length > 0 && (
        <p className="mt-2 text-[10px] opacity-50" data-testid="ideation-to-start-not-started-issues">
          未着手のissue: {notStartedShown.map((n) => `#${n}`).join(', ')}
          {notStartedOverflow > 0 && ` 他${notStartedOverflow}件`}
        </p>
      )}

      {points.length === 0 ? (
        <p className="mt-4 text-xs opacity-50">
          着手済みissueがまだ無いため、リードタイムはまだ計測できません。
        </p>
      ) : (
        <>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wider opacity-60">着手リードタイム推移</span>
            <span className="text-sm tabular-nums opacity-80">{values[values.length - 1].toFixed(1)}分</span>
          </div>

          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="mt-2 w-full"
            role="img"
            aria-label="Ideation提案から着手までのリードタイムの推移"
          >
            <path d={path} fill="none" stroke="currentColor" strokeWidth={2} className="text-violet-400" />
            {singlePoint && (
              <circle
                cx={singlePoint.x.toFixed(1)}
                cy={singlePoint.y.toFixed(1)}
                r={3}
                fill="currentColor"
                className="text-violet-400"
              />
            )}
          </svg>

          <p data-testid="ideation-to-start-lead-time-latest" className="mt-1 text-[10px] opacity-50">
            直近着手: issue #{points[points.length - 1].issueNumber}（提案 iteration{' '}
            {points[points.length - 1].proposedIteration} → 着手 iteration{' '}
            {points[points.length - 1].startIteration}）
          </p>

          {signal === null ? (
            <p className="mt-3 text-xs opacity-50">
              着手済みissueが少なく、傾向（直近ウィンドウと直前ウィンドウの比較）はまだ判定できません。
            </p>
          ) : (
            <div data-testid="ideation-to-start-lead-time-signal" data-direction={signal.direction}>
              <div className="mt-3 flex items-baseline justify-between">
                <span
                  data-testid="ideation-to-start-lead-time-direction"
                  className={`flex items-center gap-1.5 text-sm font-semibold ${DIRECTION_STYLES[signal.direction]}`}
                >
                  <span className={`inline-block h-2 w-2 rounded-full ${DIRECTION_DOT_STYLES[signal.direction]}`} />
                  {DIRECTION_LABELS[signal.direction]}
                </span>
                <span className="text-xs opacity-60">
                  直近{signal.windowSize}件 平均{' '}
                  <span data-testid="ideation-to-start-lead-time-recent-avg" className="font-semibold tabular-nums">
                    {toMinutes(signal.recentAvgSec).toFixed(1)}分
                  </span>
                  {' / '}直前{signal.windowSize}件 平均{' '}
                  <span data-testid="ideation-to-start-lead-time-previous-avg" className="font-semibold tabular-nums">
                    {toMinutes(signal.previousAvgSec).toFixed(1)}分
                  </span>
                </span>
              </div>
              <p className="mt-1 text-[10px] opacity-50">
                直近: {signal.recentIterations.join(', ')} / 直前: {signal.previousIterations.join(', ')}
                {signal.partial && '（データ不足のため window 未満の件数で計算）'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
