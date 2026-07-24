import type { RunRecord } from '@/lib/types';
import { cycleTimeTrend, cycleTimeTrendSignal, type CycleTimeTrendDirection } from '@/lib/aggregate';

const DIRECTION_LABELS: Record<CycleTimeTrendDirection, string> = {
  increasing: '悪化傾向',
  decreasing: '改善傾向',
  flat: '横ばい',
};

const DIRECTION_STYLES: Record<CycleTimeTrendDirection, string> = {
  increasing: 'text-rose-400',
  decreasing: 'text-emerald-400',
  flat: 'text-sky-400',
};

const DIRECTION_DOT_STYLES: Record<CycleTimeTrendDirection, string> = {
  increasing: 'bg-rose-400',
  decreasing: 'bg-emerald-400',
  flat: 'bg-sky-400',
};

const toMinutes = (sec: number) => sec / 60;

export function CycleTimeTrendPanel({ runs }: { runs: RunRecord[] }) {
  const points = cycleTimeTrend(runs);

  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">
          CI/ゲート通過時間のトレンド観測
        </div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const width = 640;
  const height = 160;
  const pad = 24;
  const values = points.map((p) => toMinutes(p.value));
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const span = maxValue - minValue || 1;
  const stepX = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;

  const path = points
    .map((p, i) => {
      const x = pad + stepX * i;
      const y = height - pad - ((toMinutes(p.value) - minValue) / span) * (height - pad * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  // TrendChart と同様、単一点だと path が moveto 単独になり線が実質見えないため circle で補う。
  const singlePoint =
    points.length === 1
      ? { x: pad, y: height - pad - ((values[0] - minValue) / span) * (height - pad * 2) }
      : null;

  const signal = cycleTimeTrendSignal(runs);

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="cycle-time-trend-panel"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">
          CI/ゲート通過時間のトレンド観測
        </span>
        <span className="text-sm tabular-nums opacity-80">
          {values[values.length - 1].toFixed(1)}分
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-3 w-full"
        role="img"
        aria-label="CI/ゲート通過時間の推移"
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
        <div data-testid="cycle-time-trend-signal" data-direction={signal.direction}>
          <div className="mt-3 flex items-baseline justify-between">
            <span
              data-testid="cycle-time-trend-direction"
              className={`flex items-center gap-1.5 text-sm font-semibold ${DIRECTION_STYLES[signal.direction]}`}
            >
              <span className={`inline-block h-2 w-2 rounded-full ${DIRECTION_DOT_STYLES[signal.direction]}`} />
              {DIRECTION_LABELS[signal.direction]}
            </span>
            <span className="text-xs opacity-60">
              直近{signal.windowSize}反復 平均{' '}
              <span data-testid="cycle-time-trend-recent-avg" className="font-semibold tabular-nums">
                {toMinutes(signal.recentAvgSec).toFixed(1)}分
              </span>
              {' / '}直前{signal.windowSize}反復 平均{' '}
              <span data-testid="cycle-time-trend-previous-avg" className="font-semibold tabular-nums">
                {toMinutes(signal.previousAvgSec).toFixed(1)}分
              </span>
            </span>
          </div>
          <p className="mt-1 text-[10px] opacity-50">
            直近: {signal.recentIterations.join(', ')} / 直前: {signal.previousIterations.join(', ')}
            {signal.partial && '（データ不足のため window 未満の反復数で計算）'}
          </p>
        </div>
      )}
    </div>
  );
}
