import type { RunRecord } from '@/lib/types';
import { ideationRefuelForecastSignal, REFUEL_SUCCESS_RATE_RISK_THRESHOLD } from '@/lib/aggregate';

const TITLE = 'Ideation給油成功率と次反復への繰り越し予測';

export function IdeationRefuelForecastPanel({ runs }: { runs: RunRecord[] }) {
  const signal = ideationRefuelForecastSignal(runs);

  if (signal === null) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">{TITLE}</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const statusLabel = signal.atRisk ? '警戒（給油不足または繰り越し予測が低水位以下）' : '平常';
  const statusStyle = signal.atRisk ? 'text-rose-400' : 'text-emerald-400';
  const dotStyle = signal.atRisk ? 'bg-rose-400' : 'bg-emerald-400';

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="ideation-refuel-forecast-panel"
      data-at-risk={signal.atRisk}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">{TITLE}</span>
        <span
          data-testid="ideation-refuel-forecast-status"
          className={`flex items-center gap-1.5 text-sm font-semibold ${statusStyle}`}
        >
          <span className={`inline-block h-2 w-2 rounded-full ${dotStyle}`} />
          {statusLabel}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <div className="text-xs opacity-60">直近{signal.windowSize}反復の給油成功率</div>
          <div
            data-testid="ideation-refuel-forecast-success-rate"
            className={`mt-1 text-xl font-semibold tabular-nums ${signal.recentSuccessRate < REFUEL_SUCCESS_RATE_RISK_THRESHOLD ? 'text-rose-400' : ''}`}
          >
            {(signal.recentSuccessRate * 100).toFixed(0)}%
          </div>
        </div>
        <div>
          <div className="text-xs opacity-60">全反復の給油成功率</div>
          <div data-testid="ideation-refuel-forecast-overall-rate" className="mt-1 text-xl font-semibold tabular-nums">
            {(signal.overallSuccessRate * 100).toFixed(0)}%
          </div>
        </div>
        <div>
          <div className="text-xs opacity-60">現在の相対残量</div>
          <div data-testid="ideation-refuel-forecast-current-balance" className="mt-1 text-xl font-semibold tabular-nums">
            {signal.currentBalance}
          </div>
        </div>
        <div>
          <div className="text-xs opacity-60">次反復への繰り越し予測</div>
          <div
            data-testid="ideation-refuel-forecast-carryover"
            className={`mt-1 text-xl font-semibold tabular-nums ${signal.atRisk ? 'text-rose-400' : ''}`}
          >
            {signal.carryoverForecast.toFixed(1)}
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs opacity-60">
        給油成功とは、その反復自身が消費する1件を、同じ反復のideationが生成した提案（nextIssues）だけで
        賄えたこと（生成数1件以上）を指す。直近{signal.windowSize}反復の平均増減を現在の相対残量に足した値を
        次反復の繰り越し予測残量とし、給油成功率が{(REFUEL_SUCCESS_RATE_RISK_THRESHOLD * 100).toFixed(0)}%を
        下回るか、繰り越し予測がlow_water基準以下になると警戒を発報する。
      </p>

      <p className="mt-1 text-[10px] opacity-50" data-testid="ideation-refuel-forecast-iterations">
        対象iteration: {signal.iterations.join(', ')}
      </p>
    </div>
  );
}
