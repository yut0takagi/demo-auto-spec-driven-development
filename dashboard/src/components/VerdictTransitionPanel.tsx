import type { RunRecord } from '@/lib/types';
import {
  verdictTransitions,
  verdictTransitionSummary,
  dropoutStreaks,
  type VerdictTransitionKind,
  type DropoutOutcome,
} from '@/lib/aggregate';

const KIND_LABELS: Record<VerdictTransitionKind, string> = {
  sustainedSuccess: '連続成功',
  recovered: '回復',
  repeatedFailure: '同型で足踏み',
  shiftedFailure: '不通過の型が変化',
  regressed: '悪化',
};

const KIND_COLORS: Record<VerdictTransitionKind, string> = {
  sustainedSuccess: 'bg-emerald-400',
  recovered: 'bg-sky-400',
  repeatedFailure: 'bg-amber-400',
  shiftedFailure: 'bg-orange-400',
  regressed: 'bg-rose-500',
};

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

export function VerdictTransitionPanel({ runs }: { runs: RunRecord[] }) {
  const transitions = verdictTransitions(runs);
  const summary = verdictTransitionSummary(runs);
  const streaks = dropoutStreaks(runs);

  if (transitions.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Verdict遷移の自動分類・離脱パターン検知</div>
        <p className="mt-4 text-sm opacity-50">データなし（比較対象となる隣接反復が2件以上ありません）</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="verdict-transition-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Verdict遷移の自動分類・離脱パターン検知</span>
        <span className="text-sm tabular-nums opacity-80">{transitions.length}遷移</span>
      </div>

      <ul className="mt-4 space-y-2">
        {summary.map((s) => (
          <li key={s.kind} data-testid={`verdict-transition-kind-${s.kind}`} className="text-sm">
            <div className="flex items-baseline justify-between">
              <span className="flex items-center gap-2 opacity-80">
                <span className={`inline-block h-2 w-2 rounded-sm ${KIND_COLORS[s.kind]}`} />
                {KIND_LABELS[s.kind]}
              </span>
              <span data-testid={`verdict-transition-kind-count-${s.kind}`} className="tabular-nums opacity-60">
                {s.count}件 ({s.pct.toFixed(1)}%)
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div className={`h-full ${KIND_COLORS[s.kind]}`} style={{ width: `${s.pct.toFixed(2)}%` }} />
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex items-baseline justify-between border-t border-white/10 pt-4">
        <span className="text-xs uppercase tracking-wider opacity-60">離脱パターン（非マージの連続）</span>
        <span data-testid="dropout-streak-count" className="text-sm tabular-nums opacity-80">
          {streaks.length}件
        </span>
      </div>

      {streaks.length === 0 ? (
        <p className="mt-3 text-sm opacity-50">データなし（2回以上連続した非マージはありません）</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {streaks.map((s) => (
            <li
              key={s.startIteration}
              data-testid={`dropout-streak-row-${s.startIteration}`}
              data-outcome={s.outcome}
              className="rounded-lg border border-white/10 p-3 text-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="opacity-80">
                  iteration {s.startIteration}〜{s.endIteration}（{s.length}反復連続）
                </span>
                <span
                  data-testid={`dropout-streak-outcome-${s.startIteration}`}
                  className={`font-medium tabular-nums ${OUTCOME_COLORS[s.outcome]}`}
                >
                  {OUTCOME_LABELS[s.outcome]}
                </span>
              </div>
              <p className="mt-1 text-xs opacity-60">
                {s.verdicts.join(' → ')} ・ 浪費コスト ${s.totalCostUsd.toFixed(2)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
