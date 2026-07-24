import type { RunRecord } from '@/lib/types';
import { gateReasonBreakdown, type GateReasonCategory } from '@/lib/aggregate';

const CATEGORY_LABELS: Record<GateReasonCategory, string> = {
  verifyFailed: 'verify失敗',
  e2eFailed: 'e2e失敗',
  adversaryNotApproved: 'adversary未承認',
  adversaryUnparseable: 'adversary出力解析不能',
  changedLinesExceeded: '変更行数超過',
  protectedPathViolation: '保護パス変更',
  noChanges: '変更なし',
  crashed: '例外クラッシュ',
  other: 'その他',
};

const CATEGORY_COLORS: Record<GateReasonCategory, string> = {
  verifyFailed: 'bg-rose-400',
  e2eFailed: 'bg-orange-400',
  adversaryNotApproved: 'bg-amber-400',
  adversaryUnparseable: 'bg-yellow-400',
  changedLinesExceeded: 'bg-sky-400',
  protectedPathViolation: 'bg-violet-400',
  noChanges: 'bg-slate-400',
  crashed: 'bg-red-500',
  other: 'bg-emerald-400',
};

export function GateReasonsPanel({ runs }: { runs: RunRecord[] }) {
  const breakdown = gateReasonBreakdown(runs);
  const totalCount = breakdown.reduce((sum, b) => sum + b.count, 0);

  if (breakdown.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">ゲート不通過理由の分類</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="gate-reasons-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">ゲート不通過理由の分類</span>
        <span className="text-sm tabular-nums opacity-80">{totalCount}件</span>
      </div>

      <ul className="mt-4 space-y-3">
        {breakdown.map((b) => {
          const pct = (b.count / totalCount) * 100;
          return (
            <li key={b.category} data-testid={`gate-reason-row-${b.category}`}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="opacity-80">{CATEGORY_LABELS[b.category]}</span>
                <span data-testid={`gate-reason-count-${b.category}`} className="tabular-nums opacity-60">
                  {b.count}件 ({pct.toFixed(1)}%)
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  data-testid={`gate-reason-bar-${b.category}`}
                  className={`h-full ${CATEGORY_COLORS[b.category]}`}
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
