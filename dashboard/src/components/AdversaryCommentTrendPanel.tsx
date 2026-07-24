import type { RunRecord } from '@/lib/types';
import {
  adversarySummaryLengthTrend,
  adversaryCommentTrendSignal,
  adversaryApprovalCommentStats,
  recentAdversaryComments,
  type AdversaryCommentTrendDirection,
} from '@/lib/aggregate';

const DIRECTION_LABELS: Record<AdversaryCommentTrendDirection, string> = {
  lengthening: '長文化傾向',
  shortening: '短文化傾向',
  flat: '横ばい',
};

const DIRECTION_STYLES: Record<AdversaryCommentTrendDirection, string> = {
  lengthening: 'text-amber-400',
  shortening: 'text-sky-400',
  flat: 'text-emerald-400',
};

const DIRECTION_DOT_STYLES: Record<AdversaryCommentTrendDirection, string> = {
  lengthening: 'bg-amber-400',
  shortening: 'bg-sky-400',
  flat: 'bg-emerald-400',
};

export function AdversaryCommentTrendPanel({ runs }: { runs: RunRecord[] }) {
  const points = adversarySummaryLengthTrend(runs);

  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">
          Adversary承認コメントの要約・トレンド
        </div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const width = 640;
  const height = 160;
  const pad = 24;
  const values = points.map((p) => p.value);
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const span = maxValue - minValue || 1;
  const stepX = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;

  const path = points
    .map((p, i) => {
      const x = pad + stepX * i;
      const y = height - pad - ((p.value - minValue) / span) * (height - pad * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  // TrendChart/CycleTimeTrendPanel と同様、単一点だと path が moveto 単独になり
  // 線が実質見えないため circle で補う。
  const singlePoint =
    points.length === 1
      ? { x: pad, y: height - pad - ((values[0] - minValue) / span) * (height - pad * 2) }
      : null;

  const signal = adversaryCommentTrendSignal(runs);
  const stats = adversaryApprovalCommentStats(runs);
  const digest = recentAdversaryComments(runs);

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="adversary-comment-trend-panel"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">
          Adversary承認コメントの要約・トレンド
        </span>
        <span
          data-testid="adversary-comment-trend-latest"
          className="text-sm tabular-nums opacity-80"
        >
          {values[values.length - 1].toFixed(1)}文字
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-3 w-full"
        role="img"
        aria-label="Adversary承認コメント文字数推移"
      >
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

      {signal === null ? (
        <p className="mt-3 text-xs opacity-50">
          反復数が少なく、傾向（直近ウィンドウと直前ウィンドウの比較）はまだ判定できません。
        </p>
      ) : (
        <div data-testid="adversary-comment-trend-signal" data-direction={signal.direction}>
          <div className="mt-3 flex items-baseline justify-between">
            <span
              data-testid="adversary-comment-trend-direction"
              className={`flex items-center gap-1.5 text-sm font-semibold ${DIRECTION_STYLES[signal.direction]}`}
            >
              <span className={`inline-block h-2 w-2 rounded-full ${DIRECTION_DOT_STYLES[signal.direction]}`} />
              {DIRECTION_LABELS[signal.direction]}
            </span>
            <span className="text-xs opacity-60">
              直近{signal.windowSize}反復 平均{' '}
              <span data-testid="adversary-comment-trend-recent-avg" className="font-semibold tabular-nums">
                {signal.recentAvgLength.toFixed(1)}文字
              </span>
              {' / '}直前{signal.windowSize}反復 平均{' '}
              <span data-testid="adversary-comment-trend-previous-avg" className="font-semibold tabular-nums">
                {signal.previousAvgLength.toFixed(1)}文字
              </span>
            </span>
          </div>
          <p className="mt-1 text-[10px] opacity-50">
            直近: {signal.recentIterations.join(', ')} / 直前: {signal.previousIterations.join(', ')}
            {signal.partial && '（データ不足のため window 未満の反復数で計算）'}
          </p>
        </div>
      )}

      <div
        data-testid="adversary-comment-approval-stats"
        className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-3 text-xs"
      >
        <div>
          <span className="opacity-60">承認時の平均文字数</span>
          <div data-testid="adversary-comment-approved-avg" className="tabular-nums font-semibold">
            {stats.approvedAvgLength.toFixed(1)}文字 ({stats.approvedCount}件)
          </div>
        </div>
        <div>
          <span className="opacity-60">却下時の平均文字数</span>
          <div data-testid="adversary-comment-rejected-avg" className="tabular-nums font-semibold">
            {stats.rejectedAvgLength.toFixed(1)}文字 ({stats.rejectedCount}件)
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-white/10 pt-3">
        <div className="text-[10px] uppercase tracking-wider opacity-50">直近コメントの要約ダイジェスト</div>
        <ul className="mt-2 space-y-2">
          {digest.map((entry) => (
            <li
              key={entry.iteration}
              data-testid={`adversary-comment-digest-${entry.iteration}`}
              data-approved={entry.approved}
              className="text-xs"
            >
              <div className="flex items-baseline gap-2 opacity-60">
                <span className="tabular-nums">#{entry.iteration}</span>
                <span>issue #{entry.issueNumber}</span>
                <span className={entry.approved ? 'text-emerald-400' : 'text-rose-400'}>
                  {entry.approved ? '承認' : '未承認'}
                </span>
                <span className="tabular-nums">{entry.length}文字</span>
              </div>
              <p className="mt-0.5 opacity-80">
                {entry.summary.length > 0 ? entry.summary : '（この反復にはサマリーが記録されていません）'}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
