import type { RunRecord, Verdict } from '@/lib/types';
import { gateFailureTypeBreakdown } from '@/lib/aggregate';

// `Record<Verdict, string>` は Verdict の全メンバーをキーとして要求するので、
// 契約に verdict が増えたときにここへの追加漏れを typecheck で防ぐ
// （IterationTimeline の VERDICT_STYLES / VerdictSummaryBubble の VERDICT_PRESENTATION と同じ狙い）。
const VERDICT_LABELS: Record<Verdict, string> = {
  merged: 'マージ成功',
  abandoned: '見送り（自動）',
  'needs-human': '人間対応が必要',
  paused: '一時停止',
  'dry-run': 'ドライラン',
  failed: '異常終了',
};

const VERDICT_COLORS: Record<Verdict, string> = {
  merged: 'bg-emerald-400',
  abandoned: 'bg-orange-400',
  'needs-human': 'bg-amber-400',
  paused: 'bg-sky-400',
  'dry-run': 'bg-fuchsia-400',
  failed: 'bg-rose-500',
};

export function GateFailureTypesPanel({ runs }: { runs: RunRecord[] }) {
  const breakdown = gateFailureTypeBreakdown(runs);
  const totalCount = breakdown.reduce((sum, b) => sum + b.count, 0);

  if (breakdown.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">ゲート不通過の類型別集計</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="gate-failure-types-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">ゲート不通過の類型別集計</span>
        <span className="text-sm tabular-nums opacity-80">{totalCount}件</span>
      </div>

      <ul className="mt-4 space-y-3">
        {breakdown.map((b) => {
          const pct = (b.count / totalCount) * 100;
          return (
            <li key={b.verdict} data-testid={`gate-failure-type-row-${b.verdict}`}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="opacity-80">{VERDICT_LABELS[b.verdict]}</span>
                <span data-testid={`gate-failure-type-count-${b.verdict}`} className="tabular-nums opacity-60">
                  {b.count}件 ({pct.toFixed(1)}%)
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  data-testid={`gate-failure-type-bar-${b.verdict}`}
                  className={`h-full ${VERDICT_COLORS[b.verdict]}`}
                  style={{ width: `${pct.toFixed(2)}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] opacity-50">対象iteration: {b.iterations.join(', ')}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
