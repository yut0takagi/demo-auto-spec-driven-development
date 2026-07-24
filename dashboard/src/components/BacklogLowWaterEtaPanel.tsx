import type { RunRecord } from '@/lib/types';
import { backlogLowWaterEta } from '@/lib/aggregate';

const TITLE = 'バックログ枯渇予測（low_water 到達 ETA）';

/** ETA がこの反復数以下なら注意喚起の amber にする（境界値の目安）。 */
const ETA_WATCH_THRESHOLD = 3;

export function BacklogLowWaterEtaPanel({ runs }: { runs: RunRecord[] }) {
  const eta = backlogLowWaterEta(runs);

  if (eta === null) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">{TITLE}</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const watch = eta.etaIterations !== null && eta.etaIterations <= ETA_WATCH_THRESHOLD;
  const statusLabel = eta.belowLowWater ? '低水位に到達済み' : watch ? '接近中' : eta.etaIterations === null ? '減少傾向なし' : '平常';
  const statusStyle = eta.belowLowWater ? 'text-rose-400' : watch ? 'text-amber-400' : 'text-emerald-400';
  const statusDotStyle = eta.belowLowWater ? 'bg-rose-400' : watch ? 'bg-amber-400' : 'bg-emerald-400';

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="backlog-low-water-eta-panel"
      data-below-low-water={eta.belowLowWater}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">{TITLE}</span>
        <span
          data-testid="backlog-low-water-eta-status"
          className={`flex items-center gap-1.5 text-sm font-semibold ${statusStyle}`}
        >
          <span className={`inline-block h-2 w-2 rounded-full ${statusDotStyle}`} />
          {statusLabel}
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span
          data-testid="backlog-low-water-eta-value"
          className={`text-3xl font-semibold tabular-nums ${eta.belowLowWater ? 'text-rose-400' : ''}`}
        >
          {eta.etaIterations === null ? '—' : `${eta.etaIterations}`}
        </span>
        <span className="text-sm opacity-50">
          {eta.etaIterations === null ? '反復での到達見込みなし' : '反復で low_water 到達見込み'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs opacity-60">推定バックログ残量</div>
          <div data-testid="backlog-low-water-eta-balance" className="mt-1 text-xl font-semibold tabular-nums">
            {eta.currentBalance}
          </div>
          <div className="text-[10px] opacity-50">low_water 基準 {eta.lowWater}</div>
        </div>
        <div>
          <div className="text-xs opacity-60">直近{eta.windowSize}反復の消費速度</div>
          <div
            data-testid="backlog-low-water-eta-velocity"
            className={`mt-1 text-xl font-semibold tabular-nums ${eta.velocity < 0 ? 'text-rose-400' : ''}`}
          >
            {eta.velocity > 0 ? '+' : ''}
            {eta.velocity.toFixed(2)}/反復
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs opacity-60">
        {eta.belowLowWater
          ? '推定残量が low_water 基準を既に下回っている。次反復の自動給油(ideation)を確認する。'
          : eta.etaIterations === null
            ? '直近の消費速度は減少していないため、このままでは low_water に到達しない見込み。'
            : `このままの消費速度が続くと、あと約${eta.etaIterations}反復で low_water に到達する見込み。`}
      </p>

      <p className="mt-1 text-[10px] opacity-50">対象iteration: {eta.iterations.join(', ')}</p>
    </div>
  );
}
