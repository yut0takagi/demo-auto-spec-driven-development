import type { RunRecord } from '@/lib/types';
import { adversaryOutcomeDivergence } from '@/lib/aggregate';

/**
 * ModelApprovalMergeComparisonPanel が builder モデル別に承認率とマージ率という
 * 2本の集計値のギャップ(pt)を見せるのに対し、こちらは adversary モデル別に
 * 「個々の反復で承認判断(adversary.approved)と実結果(verdict)が一致していたか」を
 * 件数ベースで突き合わせ、承認したのに非マージだった＝見落とし(falseApprove)を
 * 主指標として可視化する。
 */
export function AdversaryOutcomeDivergencePanel({ runs }: { runs: RunRecord[] }) {
  const summaries = adversaryOutcomeDivergence(runs);

  if (summaries.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">Adversary 承認⇔実結果 乖離</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5" data-testid="adversary-outcome-divergence-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">Adversary 承認⇔実結果 乖離</span>
        <span className="text-sm tabular-nums opacity-80">{summaries.length}モデル</span>
      </div>

      <ul className="mt-4 space-y-4">
        {summaries.map((s) => (
          <li
            key={s.model}
            data-testid={`adversary-outcome-divergence-row-${s.model}`}
            className="rounded-lg border border-white/10 p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="opacity-80">{s.model}</span>
              <span className="tabular-nums opacity-60">
                判定{s.decidedCount}件（承認{s.approvedCount} / 却下{s.rejectedCount}）
              </span>
            </div>

            <div className="mt-2">
              <div className="flex items-baseline justify-between text-[10px] opacity-60">
                <span>承認⇔実結果 乖離率（全判定に対する見落とし+誤却下の割合）</span>
                <span data-testid={`adversary-outcome-divergence-rate-${s.model}`} className="tabular-nums">
                  {s.divergenceRatePct.toFixed(1)}%
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  data-testid={`adversary-outcome-divergence-bar-${s.model}`}
                  className={`h-full ${s.divergenceRatePct > 0 ? 'bg-rose-400' : 'bg-emerald-400'}`}
                  style={{ width: `${Math.min(s.divergenceRatePct, 100).toFixed(2)}%` }}
                />
              </div>
            </div>

            <p
              data-testid={`adversary-outcome-divergence-false-approve-${s.model}`}
              className="mt-2 text-xs opacity-70"
            >
              {`見落とし（承認したのに非マージ）: ${s.falseApproveCount}件 / 承認${s.approvedCount}件中（${s.falseApproveRatePct.toFixed(1)}%）`}
            </p>
            <p
              data-testid={`adversary-outcome-divergence-false-reject-${s.model}`}
              className="mt-1 text-xs opacity-50"
            >
              {`誤却下（却下したのにマージ）: ${s.falseRejectCount}件 / 却下${s.rejectedCount}件中（${s.falseRejectRatePct.toFixed(1)}%）`}
            </p>

            {s.falseApproveIterations.length > 0 && (
              <p className="mt-1 text-xs text-rose-400/80">
                {`見落とし発生反復: ${s.falseApproveIterations.map((n) => `#${n}`).join(', ')}`}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
