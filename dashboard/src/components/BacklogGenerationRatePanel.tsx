import type { RunRecord } from '@/lib/types';
import { backlogGenerationRateSignal, GENERATION_RATE_SUSTAINABLE } from '@/lib/aggregate';

const TITLE = 'バックログ生成レート監視';

export function BacklogGenerationRatePanel({ runs }: { runs: RunRecord[] }) {
  const signal = backlogGenerationRateSignal(runs);

  if (signal === null) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">{TITLE}</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const statusLabel = signal.triggered ? '発報（生成不足が連続）' : signal.belowSustainableRate ? '注意（生成不足）' : '平常';
  const statusStyle = signal.triggered ? 'text-rose-400' : signal.belowSustainableRate ? 'text-amber-400' : 'text-emerald-400';
  const dotStyle = signal.triggered ? 'bg-rose-400' : signal.belowSustainableRate ? 'bg-amber-400' : 'bg-emerald-400';

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 p-5"
      data-testid="backlog-generation-rate-panel"
      data-triggered={signal.triggered}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">{TITLE}</span>
        <span
          data-testid="backlog-generation-rate-status"
          className={`flex items-center gap-1.5 text-sm font-semibold ${statusStyle}`}
        >
          <span className={`inline-block h-2 w-2 rounded-full ${dotStyle}`} />
          {statusLabel}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <div className="text-xs opacity-60">直近{signal.windowSize}反復の平均生成数</div>
          <div
            data-testid="backlog-generation-rate-recent"
            className={`mt-1 text-xl font-semibold tabular-nums ${signal.belowSustainableRate ? 'text-rose-400' : ''}`}
          >
            {signal.recentAverageRate.toFixed(2)}/反復
          </div>
        </div>
        <div>
          <div className="text-xs opacity-60">全反復の平均生成数</div>
          <div data-testid="backlog-generation-rate-overall" className="mt-1 text-xl font-semibold tabular-nums">
            {signal.overallAverageRate.toFixed(2)}/反復
          </div>
        </div>
        <div>
          <div className="text-xs opacity-60">生成不足の連続反復数</div>
          <div
            data-testid="backlog-generation-rate-streak"
            className={`mt-1 text-xl font-semibold tabular-nums ${signal.triggered ? 'text-rose-400' : ''}`}
          >
            {signal.lowRateStreak}
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs opacity-60">
        1反復は必ずissueを1件消費するため、生成数（ideationのnextIssues件数）の平均が
        {GENERATION_RATE_SUSTAINABLE}件/反復を下回ると持続不可能。生成不足が連続すると発報する。
      </p>
      <p className="mt-1 text-[10px] opacity-50" data-testid="backlog-generation-rate-iterations">
        対象iteration: {signal.iterations.join(', ')}
      </p>
    </div>
  );
}
