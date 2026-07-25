import type { RunRecord } from '@/lib/types';
import { verdictLateralSlides, LATERAL_SLIDE_MIN_CHAIN, type DropoutOutcome } from '@/lib/aggregate';

const OUTCOME_LABELS: Record<DropoutOutcome, string> = {
  recovered: '回復済み',
  droppedOut: '離脱',
  ongoing: '進行中',
};

const OUTCOME_COLORS: Record<DropoutOutcome, string> = {
  recovered: 'text-sky-300',
  droppedOut: 'text-rose-400',
  ongoing: 'text-amber-300',
};

export function VerdictLateralSlidePanel({ runs }: { runs: RunRecord[] }) {
  const slides = verdictLateralSlides(runs);

  if (slides.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Verdict横滑り検知（不通過の型が変わり続ける区間）</div>
        <p className="mt-4 text-sm opacity-50">
          データなし（不通過の型が変化する遷移がshiftedFailureとして{LATERAL_SLIDE_MIN_CHAIN}回以上連続した区間はありません）
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="verdict-lateral-slide-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Verdict横滑り検知（不通過の型が変わり続ける区間）</span>
        <span className="text-sm tabular-nums opacity-80">{slides.length}件</span>
      </div>

      <ul className="mt-4 space-y-2">
        {slides.map((s) => (
          <li
            key={s.startIteration}
            data-testid={`lateral-slide-row-${s.startIteration}`}
            data-outcome={s.outcome}
            className="rounded-lg border border-white/10 p-3 text-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="opacity-80">
                iteration {s.startIteration}〜{s.endIteration}（{s.length}反復）
              </span>
              <span
                data-testid={`lateral-slide-outcome-${s.startIteration}`}
                className={`font-medium tabular-nums ${OUTCOME_COLORS[s.outcome]}`}
              >
                {OUTCOME_LABELS[s.outcome]}
              </span>
            </div>
            <p className="mt-1 text-xs opacity-60">
              {s.verdicts.join(' → ')} ・ 型の振れ幅 {s.distinctVerdictCount} ・ 浪費コスト ${s.totalCostUsd.toFixed(2)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
