import type { RunRecord } from '@/lib/types';
import { builderModelSwitchComparisons, type ComparisonVerdict } from '@/lib/aggregate';

const VERDICT_LABELS: Record<ComparisonVerdict, string> = {
  improved: '改善',
  regressed: '悪化',
  unchanged: '変化なし',
};

const VERDICT_STYLES: Record<ComparisonVerdict, string> = {
  improved: 'text-emerald-400',
  regressed: 'text-rose-400',
  unchanged: 'text-white/50',
};

function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatDeltaPt(delta: number): string {
  const pt = delta * 100;
  const sign = pt > 0 ? '+' : '';
  return `${sign}${pt.toFixed(1)}pt`;
}

/**
 * Builder に使われたモデルが切り替わった各タイミングを、切り替え直前(A)/直後(B)の
 * 承認率・マージ率のA/Bテストとして可視化する。ModelApprovalMergeComparisonPanel が
 * 期間全体でモデルごとに合算するのに対し、こちらは「発生順」を保った切り替え1回ごとの
 * before/after 差分に特化し、モデル変更が承認/マージにどう効いたかを直接判定できるようにする。
 */
export function BuilderModelSwitchAbPanel({ runs }: { runs: RunRecord[] }) {
  const comparisons = builderModelSwitchComparisons(runs);

  if (comparisons.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Builderモデル切り替えのA/B比較</div>
        <p className="mt-4 text-sm opacity-50">
          データなし（builder モデルの切り替えが記録されていません）
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="builder-model-switch-ab-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Builderモデル切り替えのA/B比較</span>
        <span className="text-sm tabular-nums opacity-80">{comparisons.length}回の切り替え</span>
      </div>

      <ul className="mt-4 space-y-4">
        {comparisons.map((c) => (
          <li
            key={c.switchIndex}
            data-testid={`builder-model-switch-row-${c.switchIndex}`}
            className="border-t border-white/10 pt-3 first:border-t-0 first:pt-0"
          >
            <div className="flex items-baseline justify-between text-sm">
              <span className="opacity-80">
                {c.before.model} (iteration {c.before.fromIteration}〜{c.before.toIteration}) →{' '}
                {c.after.model} (iteration {c.after.fromIteration}〜{c.after.toIteration})
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="opacity-60">承認率</span>
              <span data-testid={`builder-model-switch-approval-value-${c.switchIndex}`} className="tabular-nums opacity-80">
                {formatPct(c.before.approvalRate)} → {formatPct(c.after.approvalRate)}
              </span>
              <span
                data-testid={`builder-model-switch-approval-verdict-${c.switchIndex}`}
                className={`ml-3 w-32 shrink-0 text-right tabular-nums ${VERDICT_STYLES[c.approvalVerdict]}`}
              >
                {formatDeltaPt(c.approvalRateDelta)} ({VERDICT_LABELS[c.approvalVerdict]})
              </span>
            </div>

            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="opacity-60">マージ率</span>
              <span data-testid={`builder-model-switch-merge-value-${c.switchIndex}`} className="tabular-nums opacity-80">
                {formatPct(c.before.mergeRate)} → {formatPct(c.after.mergeRate)}
              </span>
              <span
                data-testid={`builder-model-switch-merge-verdict-${c.switchIndex}`}
                className={`ml-3 w-32 shrink-0 text-right tabular-nums ${VERDICT_STYLES[c.mergeVerdict]}`}
              >
                {formatDeltaPt(c.mergeRateDelta)} ({VERDICT_LABELS[c.mergeVerdict]})
              </span>
            </div>

            <p className="mt-1 text-[10px] opacity-50">
              対象反復数: {c.before.model} {c.before.count}件 / {c.after.model} {c.after.count}件
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
